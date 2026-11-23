/**
 * Public: record a referral link click when a visitor lands with ?ref=.
 * Auth: none (rate limited). Only increments when the code belongs to a real owner.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const { recordReferralClick, resolveReferralCodeOwner } = require('../services/referralLinkClicks');

const router = express.Router();

const clickLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_REFERRAL_CLICK_MAX_PER_15M || 120),
  standardHeaders: true,
  legacyHeaders: false,
  message: { success: false, error: 'Too many requests. Try again later.' },
});

function publicReferralKind(owner) {
  if (!owner) return '';
  if (owner.ownerType === 'student') return 'parent';
  if (owner.ownerType === 'teacher' || owner.ownerType === 'admin' || owner.ownerType === 'affiliate') {
    return owner.ownerType;
  }
  return '';
}

router.get('/referral-kind', clickLimiter, async (req, res) => {
  try {
    const code = req.query && req.query.code;
    const owner = await resolveReferralCodeOwner(code);
    return res.json({ success: true, kind: publicReferralKind(owner) });
  } catch (err) {
    console.error('GET /api/public/referral-kind:', err);
    return res.status(500).json({ success: false, error: 'Could not read referral' });
  }
});

router.post('/referral-click', clickLimiter, async (req, res) => {
  try {
    const code = req.body && (req.body.code || req.body.ref || req.body.referralCode);
    const result = await recordReferralClick(code);
    if (!result.ok) {
      // Do not leak whether a code exists beyond a generic ack (anti-enumeration soft).
      return res.json({ success: true, recorded: false });
    }
    return res.json({ success: true, recorded: true });
  } catch (err) {
    console.error('POST /api/public/referral-click:', err);
    return res.status(500).json({ success: false, error: 'Could not record click' });
  }
});

module.exports = router;
