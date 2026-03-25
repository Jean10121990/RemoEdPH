const express = require('express');
const crypto = require('crypto');
const rateLimit = require('express-rate-limit');
const { body, param, validationResult } = require('express-validator');
const AssessmentPrefill = require('./models/AssessmentPrefill');

const router = express.Router();

const prefillPostLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.ASSESSMENT_PREFILL_RATE_MAX || 40),
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: 'Too many assessment starts from this IP. Try again later.' },
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

router.post('/assessment-prefill', prefillPostLimiter, createValidators, async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ error: 'Invalid input', details: errors.array() });
    }

    const { childName, parentEmail, contactNumber } = req.body;
    const token = crypto.randomBytes(24).toString('hex');
    const expiresAt = new Date(Date.now() + 60 * 60 * 1000);

    await AssessmentPrefill.create({
      token,
      childName,
      parentEmail,
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
