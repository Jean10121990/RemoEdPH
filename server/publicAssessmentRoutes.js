const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, param, query, validationResult } = require('express-validator');
const AssessmentPrefill = require('./models/AssessmentPrefill');
const AssessmentTrial = require('./models/AssessmentTrial');

const router = express.Router();

const prefillPostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ASSESSMENT_PREFILL_RATE_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many assessment starts from this IP. Try again later.' },
});

const statusLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ASSESSMENT_STATUS_RATE_MAX || 60),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many requests. Try again later.' },
});

const createValidators = [
  body('childName')
    .trim()
    .notEmpty()
    .withMessage('Child name is required')
    .isLength({ max: 200 })
    .escape(),
  body('parentEmail')
    .trim()
    .notEmpty()
    .withMessage('Email is required')
    .isEmail()
    .normalizeEmail()
    .isLength({ max: 320 }),
  body('contactNumber')
    .optional({ values: 'null' })
    .trim()
    .isLength({ max: 40 })
    .escape(),
];

/**
 * GET /api/public/assessment-status?email=
 * Returns whether this email already completed the free level assessment.
 */
router.get(
  '/assessment-status',
  statusLimiter,
  query('email').trim().notEmpty().isEmail().normalizeEmail().isLength({ max: 320 }),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ taken: false, error: 'Valid email is required' });
      }
      const email = String(req.query.email || '')
        .trim()
        .toLowerCase();
      const trial = await AssessmentTrial.findOne({ parentEmail: email })
        .sort({ createdAt: -1 })
        .select('cefrLevel score redeemedByStudentId token createdAt')
        .lean();

      if (!trial) {
        return res.json({ taken: false });
      }

      const redeemed = !!(trial.redeemedByStudentId);
      return res.json({
        taken: true,
        redeemed,
        cefrLevel: trial.cefrLevel || '',
        score: trial.score != null ? Number(trial.score) : null,
        message: redeemed
          ? 'Assessment already taken. Please log in with your student account.'
          : 'Assessment already taken. Please check your email for your results and registration link.',
      });
    } catch (err) {
      console.error('assessment-status error:', err);
      return res.status(500).json({ taken: false, error: 'Could not check assessment status' });
    }
  }
);

/**
 * GET /api/public/assessment-trial/:token
 * Prefill register page from assessment email link (email + child name).
 * Trial links do not expire; redeemed tokens report already-registered.
 */
router.get(
  '/assessment-trial/:token',
  statusLimiter,
  param('token').isLength({ min: 32, max: 128 }).matches(/^[a-f0-9]+$/i),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ success: false, error: 'Invalid link' });
      }
      const token = String(req.params.token || '').trim();
      const trial = await AssessmentTrial.findOne({ token })
        .select('parentEmail childName cefrLevel score redeemedByStudentId')
        .lean();
      if (!trial) {
        // Stale token: do not block registration UX — empty success so form stays usable
        return res.json({ success: false, stale: true });
      }
      if (trial.redeemedByStudentId) {
        return res.json({
          success: false,
          redeemed: true,
          email: trial.parentEmail || '',
          message: 'This email is already registered. Please log in instead.',
        });
      }
      return res.json({
        success: true,
        email: trial.parentEmail || '',
        childName: trial.childName || '',
        cefrLevel: trial.cefrLevel || '',
        score: trial.score != null ? Number(trial.score) : null,
      });
    } catch (err) {
      console.error('assessment-trial fetch error:', err);
      return res.status(500).json({ success: false, error: 'Could not load assessment link' });
    }
  }
);

router.post('/assessment-prefill', prefillPostLimiter, createValidators, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { childName, parentEmail, contactNumber } = req.body;
    const email = String(parentEmail || '')
      .trim()
      .toLowerCase();

    const existing = await AssessmentTrial.findOne({ parentEmail: email })
      .sort({ createdAt: -1 })
      .select('redeemedByStudentId')
      .lean();
    if (existing) {
      const redeemed = !!existing.redeemedByStudentId;
      return res.status(409).json({
        success: false,
        code: 'ASSESSMENT_ALREADY_TAKEN',
        message: redeemed
          ? 'Assessment already taken. Please log in with your student account.'
          : 'Assessment already taken. Please check your email for your results and registration link.',
      });
    }

    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await AssessmentPrefill.create({
      token,
      childName,
      parentEmail: email,
      contactNumber: contactNumber || '',
      expiresAt,
    });

    return res.json({ success: true, token });
  } catch (err) {
    console.error('assessment-prefill create error:', err);
    return res.status(500).json({ error: 'Could not create assessment session' });
  }
});

router.get(
  '/assessment-prefill/:token',
  param('token').isLength({ min: 32, max: 128 }).matches(/^[a-f0-9]+$/i),
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Invalid link' });
      }

      const { token } = req.params;
      const now = new Date();
      const doc = await AssessmentPrefill.findOneAndDelete({
        token,
        expiresAt: { $gt: now },
      });

      if (!doc) {
        return res.status(404).json({ error: 'Invalid or expired assessment link' });
      }

      return res.json({
        success: true,
        prefill: {
          childName: doc.childName,
          parentEmail: doc.parentEmail,
          contactNumber: doc.contactNumber || '',
        },
      });
    } catch (err) {
      console.error('assessment-prefill fetch error:', err);
      return res.status(500).json({ error: 'Could not load assessment' });
    }
  }
);

module.exports = router;
