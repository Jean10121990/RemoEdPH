'use strict';

const express = require('express');
const rateLimit = require('express-rate-limit');
const Lead = require('../models/Lead');
const AssessmentTrial = require('../models/AssessmentTrial');
const TrialBooking = require('../models/TrialBooking');
const Student = require('../models/Student');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Admin = require('../models/Admin');
const { verifyToken } = require('../authMiddleware');
const {
  facebookConfigured,
    exchangeCode,
    choosePage,
    saveConnectedPage,
    readState,
    facebookPageAuth,
    graph,
} = require('./metaConnect');

const router = express.Router();
const STAGES = Lead.STAGES || [];

function requireGrowth(key) {
  return function (req, res, next) {
    const role = String((req.user && (req.user.role || req.user.userType)) || '').toLowerCase();
    if (role !== 'admin') {
      return res.status(403).json({ success: false, error: 'Admin token required' });
    }
    const perms = (req.user && req.user.permissions) || [];
    const slug = String((req.user && req.user.adminRole) || '').toLowerCase();
    if (slug === 'super_admin' || slug === 'admin_marketing' || perms.includes(key) || perms.includes('*')) {
      return next();
    }
    if (slug === 'admin_assistant' && (key === 'growth.leads' || key === 'growth.inbox')) return next();
    return res.status(403).json({ success: false, error: 'Missing ' + key });
  };
}

const metaCallbackLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 30,
  standardHeaders: true,
  legacyHeaders: false,
});

function metaDonePage(ok, message) {
  const safe = String(message || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const next = ok
    ? `<script>try{sessionStorage.setItem('remoed_meta_connect',${JSON.stringify(message || 'Connected')});}catch(e){}if(window.top){window.top.location='/admin/admin-marketing-hub.html#posts';}</script>`
    : '<p><a href="/admin/admin-marketing-hub.html#posts">Back to Marketing Hub</a></p>';
  return `<!DOCTYPE html><html><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#1a365d;"><h1>${ok ? 'Connected' : 'Not connected'}</h1><p>${safe}</p>${next}</body></html>`;
}

/** Public. Facebook redirects the browser here. The admin id is in the signed state, not the query. */
router.get('/social/meta/callback', metaCallbackLimiter, async (req, res) => {
  try {
    if (!facebookConfigured()) {
      return res.status(503).type('html').send(metaDonePage(false, 'Facebook app id and secret are not set on the server.'));
    }
    const denied = String(req.query.error_reason || req.query.error || '');
    if (denied) {
      return res.status(400).type('html').send(metaDonePage(false, 'Facebook did not grant access.'));
    }
    const state = readState(req.query.state);
    if (!state) {
      return res.status(400).type('html').send(metaDonePage(false, 'This connect link expired. Start again from Posts.'));
    }
    const admin = await Admin.findById(state.adminId).select('_id').lean();
    if (!admin) {
      return res.status(403).type('html').send(metaDonePage(false, 'That admin account was not found.'));
    }
    const code = String(req.query.code || '');
    if (!code) {
      return res.status(400).type('html').send(metaDonePage(false, 'Facebook did not return a code.'));
    }
    const userToken = await exchangeCode(code);
    const page = await choosePage(userToken);
    const saved = await saveConnectedPage(page);
    let inboxNote = '';
    try {
      await graph('/' + page.id + '/subscribed_apps', page.access_token, {
        method: 'POST',
        body: { subscribed_fields: 'messages' },
      });
    } catch (subErr) {
      inboxNote = ' Page messages were not subscribed: ' + (subErr.message || 'Facebook refused.');
    }
    const line = (saved.instagram
      ? `Connected ${saved.facebook} and Instagram ${saved.instagram}.`
      : `Connected ${saved.facebook}. Instagram is not linked to that Page yet.`) + inboxNote;
    return res.type('html').send(metaDonePage(true, line));
  } catch (err) {
    console.error('Meta connect callback:', err.message || err);
    return res.status(400).type('html').send(metaDonePage(false, err.message || 'Could not connect the Page.'));
  }
});

router.use(verifyToken);

router.get('/leads', requireGrowth('growth.leads'), async (req, res) => {
  const leads = await Lead.find({}).sort({ updatedAt: -1 }).limit(300).lean();
  res.json({ success: true, stages: STAGES, leads });
});

router.patch('/leads/:id', requireGrowth('growth.leads'), async (req, res) => {
  const lead = await Lead.findById(req.params.id);
  if (!lead) return res.status(404).json({ success: false, error: 'Lead not found' });
  if (req.body.stage) {
    if (!STAGES.includes(req.body.stage)) {
      return res.status(400).json({ success: false, error: 'Unknown stage' });
    }
    lead.stage = req.body.stage;
  }
  if (req.body.note) lead.notes.push({ text: String(req.body.note), by: req.user.username || '' });
  await lead.save();
  res.json({ success: true, lead });
});

router.get('/inbox', requireGrowth('growth.inbox'), async (req, res) => {
  const rows = await Conversation.find({}).sort({ lastMessageAt: -1 }).limit(100).lean();
  res.json({ success: true, conversations: rows });
});

router.get('/inbox/:id/messages', requireGrowth('growth.inbox'), async (req, res) => {
  const messages = await Message.find({ conversationId: req.params.id }).sort({ createdAt: 1 }).lean();
  res.json({ success: true, messages });
});

router.post('/inbox/:id/reply', requireGrowth('growth.inbox'), async (req, res) => {
  const convo = await Conversation.findById(req.params.id);
  if (!convo) return res.status(404).json({ success: false, error: 'Thread not found' });
  const text = String((req.body && req.body.text) || '').trim();
  if (!text) return res.status(400).json({ success: false, error: 'Reply required' });
  await Message.create({ conversationId: convo._id, direction: 'out', text, sender: 'human' });
  if (convo.channel === 'messenger' && convo.externalThreadId) {
    const page = await facebookPageAuth();
    if (page && page.token) {
      const target = page.pageId ? page.pageId : 'me';
      await fetch('https://graph.facebook.com/v21.0/' + target + '/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          recipient: { id: convo.externalThreadId },
          message: { text },
          access_token: page.token,
        }),
      }).catch(() => {});
    }
  }
  convo.status = 'open';
  convo.lastMessageAt = new Date();
  await convo.save();
  res.json({ success: true });
});

router.get('/gmail', requireGrowth('growth.inbox'), (_req, res) => {
  res.json({ success: true, connected: false, note: 'Gmail is not connected yet.' });
});

router.get('/reports', requireGrowth('growth.reports'), async (req, res) => {
  const [chatLeads, trials, interactiveLessonsCompleted] = await Promise.all([
    Lead.find({}).select('stage source createdAt').lean(),
    AssessmentTrial.find({}).select('redeemedByStudentId createdAt').lean(),
    TrialBooking.countDocuments({ status: 'completed' }),
  ]);
  const studentIds = trials.map((t) => t.redeemedByStudentId).filter(Boolean);
  const students = studentIds.length
    ? await Student.find({ _id: { $in: studentIds } })
      .select('isSubscribed paymentStatus subscriptionStatus subscriptionEndDate creditBalance freeLessonCompletedCount accountStatus')
      .lean()
    : [];
  const byId = {};
  students.forEach((s) => { byId[String(s._id)] = s; });

  const now = Date.now();
  const day = 24 * 60 * 60 * 1000;
  let registered = 0;
  let trial = 0;
  let paid = 0;
  let renewal = 0;
  let atRisk = 0;
  let lost = 0;
  trials.forEach((row) => {
    const student = row.redeemedByStudentId ? byId[String(row.redeemedByStudentId)] : null;
    if (!student) return;
    registered += 1;
    const payment = String(student.paymentStatus || '').toLowerCase();
    const sub = String(student.subscriptionStatus || '').toLowerCase();
    const isPaid = student.isSubscribed === true || payment === 'paid' || sub === 'active';
    const end = student.subscriptionEndDate ? new Date(student.subscriptionEndDate).getTime() : 0;
    const startedTrial = Number(student.freeLessonCompletedCount) > 0
      || String(student.accountStatus || '').indexOf('trial') === 0;
    if (startedTrial) trial += 1;
    if (!isPaid) return;
    paid += 1;
    if (sub === 'expired' || (end && end < now)) lost += 1;
    else if (end && end - now <= 30 * day) renewal += 1;
    else if (Number(student.creditBalance) <= 3) atRisk += 1;
  });

  const funnel = {
    Inquiry: chatLeads.filter((l) => l.stage === 'Inquiry' || !l.stage).length,
    'Assessment done': trials.length,
    Trial: trial,
    Registered: registered,
    'Paid plan': paid,
    'Renewal due': renewal,
    'At-risk': atRisk,
    Lost: lost,
  };
  const stages = STAGES.map((name) => ({ name, count: funnel[name] || 0 }));
  const sourceMap = { 'level assessment': trials.length };
  chatLeads.forEach((l) => {
    const source = l.source || 'manual';
    if (source === 'level assessment') return;
    sourceMap[source] = (sourceMap[source] || 0) + 1;
  });
  const sources = Object.keys(sourceMap)
    .filter((name) => sourceMap[name] > 0)
    .map((name) => ({ name, count: sourceMap[name] }))
    .sort((a, b) => b.count - a.count);
  const weeks = [];
  for (let i = 7; i >= 0; i -= 1) {
    const start = new Date();
    start.setDate(start.getDate() - (i * 7) - start.getDay());
    start.setHours(0, 0, 0, 0);
    const end = new Date(start);
    end.setDate(end.getDate() + 7);
    const count = trials.filter((row) => {
      const t = new Date(row.createdAt || 0).getTime();
      return t >= start.getTime() && t < end.getTime();
    }).length;
    weeks.push({
      label: start.toLocaleDateString('en-PH', { month: 'short', day: 'numeric' }),
      count,
    });
  }
  const { monthlySplit } = require('./moneySplit');
  const grossPhp = Number(req.query.gross) || 0;
  const teachersPhp = Number(req.query.teachers) || 0;
  const affiliatesPhp = Number(req.query.affiliates) || 0;
  res.json({
    success: true,
    funnel,
    stages,
    sources,
    weeks,
    count: trials.length,
    interactiveLessonsCompleted: Number(interactiveLessonsCompleted) || 0,
    note: 'Assessment done is the same list as HR Hub → Level Assessment. Registered means they created a student account. Paid plan means that account has a paid subscription. Free interactive lessons completed counts families who finished the free interactive lesson, not a live class.',
    readOnlyAskAi: true,
    split: monthlySplit({ grossPhp, teachersPhp, affiliatesPhp }),
  });
});

router.use(require('./contentRoutes'));

module.exports = router;
