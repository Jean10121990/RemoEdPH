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

module.exports = router;
