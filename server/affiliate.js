'use strict';

const express = require('express');
const bcrypt = require('bcrypt');
const jwt = require('jsonwebtoken');
const Affiliate = require('./models/Affiliate');
const Referral = require('./models/Referral');
const ReferralLinkClick = require('./models/ReferralLinkClick');
const AffiliateRecurringLedger = require('./models/AffiliateRecurringLedger');
const Student = require('./models/Student');
const { verifyToken } = require('./authMiddleware');
const { getJwtSecret } = require('./config/jwtSecret');
const { enrollLinkForSlug } = require('./utils/affiliateReferralSlug');
const { studentLooksPaid, ensureAffiliateRecurringLedger } = require('./utils/awardReferralCommission');
const { phYyyymm } = require('./utils/affiliateRecurring');

const router = express.Router();
const JWT_SECRET = getJwtSecret();
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

function requireAffiliate(req, res, next) {
  const role = String(req.user && (req.user.role || req.user.userType) || '')
    .trim()
    .toLowerCase();
  if (role !== 'affiliate' || !req.user.affiliateId) {
    return res.status(403).json({
      success: false,
      error: 'Affiliate token required.',
      code: 'WRONG_PORTAL_TOKEN',
    });
  }
  return next();
}

function studentInitials(name, username) {
  const n = String(name || '').trim();
  if (n) {
    const parts = n.split(/\s+/).filter(Boolean);
    if (parts.length >= 2) {
      return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    return n.slice(0, 2).toUpperCase();
  }
  return String(username || 'ST').slice(0, 2).toUpperCase();
}

router.post('/login', async (req, res) => {
  try {
    const username = String((req.body && req.body.username) || '').trim().toLowerCase();
    const password = String((req.body && req.body.password) || '');
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const affiliate = await Affiliate.findOne({
      $or: [{ username }, { email: username }],
    });
    if (!affiliate || !affiliate.passwordHash) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    if (affiliate.status !== 'active') {
      return res.status(403).json({
        success: false,
        message:
          affiliate.status === 'pending'
            ? 'Your affiliate account is pending activation.'
            : 'Your affiliate account is inactive.',
      });
    }

    const ok = await bcrypt.compare(password, affiliate.passwordHash);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = jwt.sign(
      {
        username: affiliate.username,
        affiliateId: String(affiliate._id),
        role: 'affiliate',
        userType: 'affiliate',
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    res.json({
      success: true,
      token,
      affiliateId: String(affiliate._id),
      name: affiliate.name,
      referralSlug: affiliate.referralSlug,
    });
  } catch (err) {
    console.error('Affiliate login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.get('/me', verifyToken, requireAffiliate, async (req, res) => {
  try {
    const affiliate = await Affiliate.findById(req.user.affiliateId)
      .select('name email phone username referralSlug status christianValuesBackground')
      .lean();
    if (!affiliate) {
      return res.status(404).json({ success: false, message: 'Affiliate not found' });
    }
    const origin = `${req.protocol}://${req.get('host')}` || 'https://remoedph.com';
    res.json({
      success: true,
      affiliate,
      enrollLink: enrollLinkForSlug(affiliate.referralSlug, 'https://remoedph.com'),
      enrollLinkLocal: enrollLinkForSlug(affiliate.referralSlug, origin),
    });
  } catch (err) {
    console.error('Affiliate me error:', err);
    res.status(500).json({ success: false, message: 'Failed to load profile' });
  }
});

/** Affiliate changes their own password (current password required). */
router.post('/change-password', verifyToken, requireAffiliate, async (req, res) => {
  try {
    const currentPassword = String((req.body && req.body.currentPassword) || '');
    const newPassword = String((req.body && req.body.newPassword) || '');
    if (!currentPassword || !newPassword) {
      return res.status(400).json({
        success: false,
        message: 'Current password and new password are required',
      });
    }
    if (newPassword.length < 8) {
      return res.status(400).json({
        success: false,
        message: 'New password must be at least 8 characters',
      });
    }
    const affiliate = await Affiliate.findById(req.user.affiliateId);
    if (!affiliate || !affiliate.passwordHash) {
      return res.status(404).json({ success: false, message: 'Affiliate not found' });
    }
    const ok = await bcrypt.compare(currentPassword, affiliate.passwordHash);
    if (!ok) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }
    if (await bcrypt.compare(newPassword, affiliate.passwordHash)) {
      return res.status(400).json({
        success: false,
        message: 'New password must be different from the current password',
      });
    }
    affiliate.passwordHash = await bcrypt.hash(newPassword, 12);
    await affiliate.save();
    res.json({ success: true, message: 'Password updated. Use the new password next time you sign in.' });
  } catch (err) {
    console.error('Affiliate change-password error:', err);
    res.status(500).json({ success: false, message: 'Could not update password' });
  }
});

router.get('/dashboard', verifyToken, requireAffiliate, async (req, res) => {
  try {
    const affiliateId = String(req.user.affiliateId);
    const affiliate = await Affiliate.findById(affiliateId).lean();
    if (!affiliate || affiliate.status !== 'active') {
      return res.status(403).json({ success: false, message: 'Affiliate account not active' });
    }

    const slug = String(affiliate.referralSlug || '');
    const [referrals, clickRow, ledgerRows] = await Promise.all([
      Referral.find({ ownerType: 'affiliate', ownerId: affiliateId })
        .sort({ updatedAt: -1 })
        .lean(),
      slug
        ? ReferralLinkClick.findOne({ referralCode: slug }).select('clickCount').lean()
        : null,
      AffiliateRecurringLedger.find({ affiliateId }).sort({ yyyymm: -1, createdAt: -1 }).lean(),
    ]);

    // Best-effort: refresh current-month recurring for still-active successful referrals
    const thisMonth = phYyyymm();
    for (const ref of referrals) {
      if (ref.status !== 'successful' || !ref.recurringActive) continue;
      try {
        const student = await Student.findById(ref.studentId)
          .select('subscriptionPlan isSubscribed paymentStatus subscriptionStatus accountStatus creditHistory')
          .lean();
        if (!student || !studentLooksPaid(student)) {
          if (ref.recurringActive) {
            await Referral.updateOne({ _id: ref._id }, { $set: { recurringActive: false } });
            ref.recurringActive = false;
          }
          continue;
        }
        await ensureAffiliateRecurringLedger(student, {
          ownerType: 'affiliate',
          ownerId: affiliateId,
        }, {
          amountPaid: Number(ref.amountPaid) || 0,
          plan: ref.subscriptionPlan || student.subscriptionPlan || '',
        });
      } catch (_e) {
        /* non-fatal */
      }
    }

    const freshLedger = await AffiliateRecurringLedger.find({ affiliateId })
      .sort({ yyyymm: -1, createdAt: -1 })
      .lean();

    const activeRefs = referrals.filter(
      (r) => r.status === 'successful' && r.recurringActive === true
    );

    const activeStudents = activeRefs.map((r) => ({
      studentId: r.studentId,
      initials: studentInitials(r.studentName, r.studentId),
      plan: r.subscriptionPlan || '',
      enrolledAt: r.createdAt || r.updatedAt,
      upfrontBonus: Number(r.commissionAmount) || 0,
      recurringStatus: 'Active',
    }));

    const payoutHistory = [];
    for (const r of referrals) {
      if (r.status !== 'successful' || !(Number(r.commissionAmount) > 0)) continue;
      const when = r.updatedAt || r.createdAt || new Date();
      payoutHistory.push({
        date: when,
        yyyymm: phYyyymm(new Date(when)),
        type: 'upfront',
        label: 'Upfront referral bonus',
        amountPhp: Number(r.commissionAmount) || 0,
        studentId: r.studentId,
        initials: studentInitials(r.studentName, r.studentId),
        plan: r.subscriptionPlan || '',
      });
    }
    for (const row of freshLedger) {
      const planLabel = String(row.planType || '').trim();
      payoutHistory.push({
        date: row.createdAt || new Date(),
        yyyymm: row.yyyymm,
        type: 'recurring',
        label: planLabel
          ? `5% monthly recurring (${planLabel})`
          : '5% monthly recurring',
        amountPhp: Number(row.amountPhp) || 0,
        studentId: row.studentId,
        initials: studentInitials('', row.studentId),
        plan: row.planType || '',
      });
    }
    payoutHistory.sort((a, b) => new Date(b.date) - new Date(a.date));

    const monthUpfront = payoutHistory
      .filter((p) => p.type === 'upfront' && p.yyyymm === thisMonth)
      .reduce((s, p) => s + (Number(p.amountPhp) || 0), 0);
    const monthRecurring = freshLedger
      .filter((p) => p.yyyymm === thisMonth)
      .reduce((s, p) => s + (Number(p.amountPhp) || 0), 0);

    res.json({
      success: true,
      affiliate: {
        name: affiliate.name,
        email: affiliate.email,
        referralSlug: slug,
      },
      enrollLink: enrollLinkForSlug(slug, 'https://remoedph.com'),
      metrics: {
        linkClicks: Number(clickRow && clickRow.clickCount) || 0,
        activeEnrolledStudents: activeStudents.length,
        estimatedMonthlyEarnings: Math.round((monthUpfront + monthRecurring) * 100) / 100,
        thisMonthUpfront: monthUpfront,
        thisMonthRecurring: monthRecurring,
      },
      activeStudents,
      payoutHistory,
    });
  } catch (err) {
    console.error('Affiliate dashboard error:', err);
    res.status(500).json({ success: false, message: 'Failed to load dashboard' });
  }
});

module.exports = router;
