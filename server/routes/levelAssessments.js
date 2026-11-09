const express = require('express');
const mongoose = require('mongoose');
const AssessmentTrial = require('../models/AssessmentTrial');
const { verifyAdminApiAuth, requireAdmin, requirePermission } = require('../authMiddleware');
const { sendRawEmail } = require('../emailService');

const router = express.Router();

router.use(verifyAdminApiAuth, requireAdmin, requirePermission('hr:level_assessments'));

router.get('/', async (req, res) => {
  try {
    const rows = await AssessmentTrial.find({})
      .sort({ createdAt: -1 })
      .limit(500)
      .select('childName parentEmail contactNumber cefrLevel score createdAt redeemedByStudentId')
      .lean();
    res.json({
      success: true,
      leads: rows.map((row) => ({
        id: String(row._id),
        childName: row.childName || '',
        parentEmail: row.parentEmail || '',
        phone: row.contactNumber || '',
        level: row.cefrLevel || '',
        score: row.score != null ? Number(row.score) : null,
        createdAt: row.createdAt || null,
        registered: !!row.redeemedByStudentId,
      })),
    });
  } catch (err) {
    console.error('level-assessments list:', err);
    res.status(500).json({ success: false, error: 'Could not load level assessments.' });
  }
});

router.post('/invite', async (req, res) => {
  try {
    const ids = Array.isArray(req.body && req.body.ids) ? req.body.ids : [];
    const valid = ids.filter((id) => mongoose.isValidObjectId(id)).slice(0, 50);
    if (!valid.length) return res.status(400).json({ success: false, error: 'Choose at least one lead.' });
    const leads = await AssessmentTrial.find({
      _id: { $in: valid },
      $or: [{ redeemedByStudentId: null }, { redeemedByStudentId: { $exists: false } }],
    }).select('parentEmail childName');
    const base = String(process.env.FRONTEND_URL || 'https://remoedph.com').replace(/\/$/, '');
    const plansUrl = base + '/index.html#plans';
    let sent = 0;
    for (const lead of leads) {
      const to = String(lead.parentEmail || '').trim();
      if (!to) continue;
      const child = String(lead.childName || 'your child');
      const subject = 'RemoEdPH — keep learning with a plan';
      const text =
        'Hello,\n\n' +
        child + ' finished the RemoEdPH level assessment. Choose a plan to book live lessons with a teacher:\n\n' +
        plansUrl + '\n\n— RemoEdPH';
      const html =
        '<p>Hello,</p><p><strong>' + child.replace(/[&<>]/g, '') +
        '</strong> finished the RemoEdPH level assessment. Choose a plan to book live lessons with a teacher.</p>' +
        '<p><a href="' + plansUrl + '">Choose a plan</a></p><p>— RemoEdPH</p>';
      const result = await sendRawEmail(to, subject, html, text);
      if (result && result.success) sent += 1;
    }
    res.json({ success: true, sent });
  } catch (err) {
    console.error('level-assessments invite:', err);
    res.status(500).json({ success: false, error: 'Could not send invites.' });
  }
});

function cleanEmail(value) {
  const email = String(value || '').trim().toLowerCase().slice(0, 120);
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return '';
  return email;
}

function proficiencyInvite() {
  const base = String(process.env.FRONTEND_URL || 'https://remoedph.com').replace(/\/$/, '');
  const assessmentUrl = base + '/index.html#assessment';
  const subject = "Find your child's English level";
  const shareText =
    "Take the free RemoEdPH level assessment and learn your child's English proficiency level: " + assessmentUrl;
  const text =
    'Hello,\n\n' +
    "Take the free RemoEdPH level assessment to learn your child's English proficiency level. It is short and costs nothing.\n\n" +
    assessmentUrl + '\n\n— RemoEdPH';
  const html =
    '<p>Hello,</p>' +
    "<p>Take the free RemoEdPH level assessment to learn your child's <strong>English proficiency level</strong>. It is short and costs nothing.</p>" +
    '<p><a href="' + esc(assessmentUrl) + '">Start the level assessment</a></p>' +
    '<p>— RemoEdPH</p>';
  return { subject, text, shareText, html, assessmentUrl };
}

router.get('/proficiency-invite', (req, res) => {
  const invite = proficiencyInvite();
  res.json({
    success: true,
    subject: invite.subject,
    text: invite.text,
    shareText: invite.shareText,
    assessmentUrl: invite.assessmentUrl,
  });
});

router.post('/proficiency-invite', async (req, res) => {
  try {
    const to = cleanEmail(req.body && req.body.email);
    if (!to) return res.status(400).json({ success: false, error: 'Enter an email address.' });
    const invite = proficiencyInvite();
    const result = await sendRawEmail(to, invite.subject, invite.html, invite.text);
    if (!result || !result.success) {
      return res.status(502).json({ success: false, error: 'Could not send the invitation.' });
    }
    res.json({ success: true, sent: 1 });
  } catch (err) {
    console.error('level-assessments proficiency invite:', err);
    res.status(500).json({ success: false, error: 'Could not send the invitation.' });
  }
});

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

function scoreOutOf100(score) {
  const n = Number(score);
  if (!Number.isFinite(n)) return '—/100';
  return Math.round(n) + '/100';
}

function recommendedLearningLevel(cefrLevel, score) {
  const c = String(cefrLevel || '').trim().toUpperCase();
  if (c === 'PRE-A1' || c === 'PRE A1') return 'Pre-Beginner';
  if (c === 'A2') return 'Elementary';
  if (c === 'B1') return 'Intermediate';
  if (c === 'B2') return 'Upper Intermediate';
  if (c === 'A1') {
    const s = Number(score);
    if (Number.isFinite(s) && s < 50) return 'Pre-Beginner';
    return 'Beginner';
  }
  if (!c) return 'Beginner';
  return 'Beginner';
}

function displayCefrLevel(cefrLevel, score) {
  const c = String(cefrLevel || '').trim();
  if (c) return c;
  const s = Number(score);
  if (Number.isFinite(s) && s < 50) return 'Pre-A1';
  return 'A1';
}

function trialInviteFor(lead) {
  const to = String(lead.parentEmail || '').trim();
  const base = String(process.env.FRONTEND_URL || 'https://remoedph.com').replace(/\/$/, '');
  const registerUrl =
    base +
    '/student-register.html?trial=' +
    encodeURIComponent(lead.token) +
    '&email=' +
    encodeURIComponent(to);
  const homeUrl = base + '/';
  const child = String(lead.childName || '').trim();
  const scoreLine = scoreOutOf100(lead.score);
  const cefr = displayCefrLevel(lead.cefrLevel, lead.score);
  const recommended = recommendedLearningLevel(lead.cefrLevel, lead.score);
  const subject = "RemoEdPH — Your child's level assessment results and free registration";
  const thanksChild = child
    ? 'Thank you for letting ' + child + ' complete the RemoEdPH Free English Level Assessment!'
  : 'Thank you for letting your child complete the RemoEdPH Free English Level Assessment!';
  const text =
    'Dear Parent/Guardian,\n\n' +
    thanksChild +
    " We're excited to be part of your child's English-learning journey.\n\n" +
    "🌟 Your Child's Assessment Results\n\n" +
    '- Assessment Score: ' + scoreLine + '\n' +
    '- CEFR Level: ' + cefr + '\n' +
    '- Recommended Learning Level: ' + recommended + '\n\n' +
    "These results help us understand your child's current English abilities and recommend suitable learning activities.\n\n" +
    "🎉 What's Next?\n\n" +
    'Your child can continue learning English with RemoEdPH by creating a FREE parent account!\n\n' +
    'With free registration, you can:\n\n' +
    "- Access your child's learning dashboard.\n" +
    '- Explore age-appropriate English learning activities.\n' +
    '- Try our FREE Interactive Lesson.\n' +
    '- Discover a fun, encouraging English-learning environment.\n\n' +
    '👉 Register for FREE:\n' +
    registerUrl + '\n\n' +
    '✅ No registration fee\n' +
    '✅ No payment required to get started\n' +
    '✅ Free interactive lesson\n\n' +
    'We look forward to welcoming your family to RemoEdPH, where children can develop English confidence, curiosity, and good character!\n\n' +
    'Warm regards,\n' +
    'RemoEdPH Team\n' +
    'Learning English with Confidence and Character\n' +
    homeUrl;
  const shareText = text;
  const html =
    '<p>Dear Parent/Guardian,</p>' +
    '<p>' + esc(thanksChild) + " We're excited to be part of your child's English-learning journey.</p>" +
    '<p><strong>🌟 Your Child\'s Assessment Results</strong></p>' +
    '<ul>' +
    '<li><strong>Assessment Score:</strong> ' + esc(scoreLine) + '</li>' +
    '<li><strong>CEFR Level:</strong> ' + esc(cefr) + '</li>' +
    '<li><strong>Recommended Learning Level:</strong> ' + esc(recommended) + '</li>' +
    '</ul>' +
    "<p>These results help us understand your child's current English abilities and recommend suitable learning activities.</p>" +
    "<p><strong>🎉 What's Next?</strong></p>" +
    '<p>Your child can continue learning English with RemoEdPH by creating a <strong>FREE parent account</strong>!</p>' +
    '<p>With free registration, you can:</p>' +
    '<ul>' +
    "<li>Access your child's learning dashboard.</li>" +
    '<li>Explore age-appropriate English learning activities.</li>' +
    '<li>Try our <strong>FREE Interactive Lesson</strong>.</li>' +
    '<li>Discover a fun, encouraging English-learning environment.</li>' +
    '</ul>' +
    '<p><strong>👉 Register for FREE:</strong><br><a href="' + esc(registerUrl) + '">' + esc(registerUrl) + '</a></p>' +
    '<p>✅ No registration fee<br>✅ No payment required to get started<br>✅ Free interactive lesson</p>' +
    '<p>We look forward to welcoming your family to RemoEdPH, where children can develop English confidence, curiosity, and good character!</p>' +
    '<p>Warm regards,<br><strong>RemoEdPH Team</strong><br><em>Learning English with Confidence and Character</em><br><a href="' +
    esc(homeUrl) +
    '">' +
    esc(homeUrl) +
    '</a></p>';
  return { to, child: child || 'your child', subject, text, shareText, html, registerUrl };
}

async function loadUnregisteredLead(id) {
  if (!mongoose.isValidObjectId(id)) return { error: 'Invalid lead.', status: 400 };
  const lead = await AssessmentTrial.findById(id).select(
    'parentEmail childName token redeemedByStudentId cefrLevel score'
  );
  if (!lead || lead.redeemedByStudentId) return { error: 'This lead is already registered.', status: 404 };
  if (!String(lead.parentEmail || '').trim()) return { error: 'This lead has no email.', status: 400 };
  return { lead };
}

router.get('/:id/trial-invite', async (req, res) => {
  try {
    const loaded = await loadUnregisteredLead(req.params.id);
    if (!loaded.lead) return res.status(loaded.status).json({ success: false, error: loaded.error });
    const invite = trialInviteFor(loaded.lead);
    res.json({
      success: true,
      to: invite.to,
      childName: invite.child,
      subject: invite.subject,
      text: invite.text,
      shareText: invite.shareText,
      registerUrl: invite.registerUrl,
    });
  } catch (err) {
    console.error('level-assessments trial preview:', err);
    res.status(500).json({ success: false, error: 'Could not load the invitation.' });
  }
});

router.post('/:id/trial-invite', async (req, res) => {
  try {
    const loaded = await loadUnregisteredLead(req.params.id);
    if (!loaded.lead) return res.status(loaded.status).json({ success: false, error: loaded.error });
    const invite = trialInviteFor(loaded.lead);
    const result = await sendRawEmail(invite.to, invite.subject, invite.html, invite.text);
    if (!result || !result.success) {
      return res.status(502).json({ success: false, error: 'Could not send the invitation.' });
    }
    res.json({ success: true, sent: 1 });
  } catch (err) {
    console.error('level-assessments trial invite:', err);
    res.status(500).json({ success: false, error: 'Could not send the invitation.' });
  }
});

module.exports = router;
