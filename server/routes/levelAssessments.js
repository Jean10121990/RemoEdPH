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

function esc(value) {
  return String(value == null ? '' : value).replace(/[&<>"']/g, (c) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  }[c]));
}

router.post('/:id/trial-invite', async (req, res) => {
  try {
    const id = req.params.id;
    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ success: false, error: 'Invalid lead.' });
    }
    const lead = await AssessmentTrial.findById(id).select('parentEmail childName token redeemedByStudentId');
    if (!lead || lead.redeemedByStudentId) {
      return res.status(404).json({ success: false, error: 'This lead is already registered.' });
    }
    const to = String(lead.parentEmail || '').trim();
    if (!to) return res.status(400).json({ success: false, error: 'This lead has no email.' });
    const base = String(process.env.FRONTEND_URL || 'https://remoedph.com').replace(/\/$/, '');
    const registerUrl =
      base +
      '/student-register.html?trial=' +
      encodeURIComponent(lead.token) +
      '&email=' +
      encodeURIComponent(to);
    const child = String(lead.childName || 'your child').trim() || 'your child';
    const subject = 'Sign up to claim your free trial lessons';
    const text =
      'Hello,\n\n' +
      'Sign up to claim free trial lessons for ' + child + ' at no cost. Use the same email you used for the level assessment:\n\n' +
      registerUrl + '\n\n— RemoEdPH';
    const html =
      '<p>Hello,</p>' +
      '<p>Sign up to claim <strong>free trial lessons</strong> for <strong>' + esc(child) + '</strong> at no cost. Use the same email you used for the level assessment.</p>' +
      '<p><a href="' + esc(registerUrl) + '">Sign up and claim free trial lessons</a></p>' +
      '<p>— RemoEdPH</p>';
    const result = await sendRawEmail(to, subject, html, text);
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
