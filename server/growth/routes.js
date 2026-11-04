'use strict';

const express = require('express');
const Lead = require('../models/Lead');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { verifyToken } = require('../authMiddleware');

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
  if (convo.channel === 'messenger' && process.env.META_PAGE_ACCESS_TOKEN && convo.externalThreadId) {
    await fetch('https://graph.facebook.com/v21.0/me/messages?access_token=' + encodeURIComponent(process.env.META_PAGE_ACCESS_TOKEN), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ recipient: { id: convo.externalThreadId }, message: { text } }),
    }).catch(() => {});
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
  const leads = await Lead.find({}).select('stage source utm').lean();
  const funnel = {};
  leads.forEach((l) => {
    funnel[l.stage] = (funnel[l.stage] || 0) + 1;
  });
  res.json({ success: true, funnel, count: leads.length });
});

router.use(require('./contentRoutes'));

module.exports = router;
