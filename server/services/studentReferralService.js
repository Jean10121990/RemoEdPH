const crypto = require('crypto');
const mongoose = require('mongoose');
const Student = require('../models/Student');
const { buildCreditLot } = require('./creditLots');
const StudentReferralReward = require('../models/StudentReferralReward');
const StudentReferralBadge = require('../models/StudentReferralBadge');
const {
  REFERRAL_REWARD_CREDITS,
  REFERRAL_BADGES,
  PAID_PLAN_IDS,
} = require('../config/studentReferral');

const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function appOrigin() {
  const raw = String(process.env.FRONTEND_URL || process.env.OAUTH_PUBLIC_BASE_URL || 'https://remoedph.com').trim();
  return raw.replace(/\/$/, '');
}

function generateShareCode() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

function emailsOf(doc) {
  return [doc && doc.email, doc && doc.parentEmail]
    .map((v) => String(v || '').trim().toLowerCase())
    .filter(Boolean);
}

function maskEmail(email) {
  const raw = String(email || '').trim();
  const at = raw.indexOf('@');
  if (at < 1) return '***';
  return raw.slice(0, 1) + '***' + raw.slice(at);
}

function maskName(student) {
  const name = [student && student.firstName, student && student.lastName].filter(Boolean).join(' ').trim();
  if (!name) return maskEmail(student && (student.email || student.parentEmail));
  return name.slice(0, 1) + '***';
}

function badgeDef(key) {
  return REFERRAL_BADGES.find((b) => b.key === key) || null;
}

function publicBadgePayload(row, student) {
  const def = badgeDef(row.badgeKey) || { name: row.badgeKey, color: '#1CA7E7' };
  const who = maskName(student);
  return {
    id: String(row._id),
    key: row.badgeKey,
    name: def.name,
    color: def.color,
    earnedAt: row.earnedAt,
    image: '/images/referral-badges/' + row.badgeKey + '.svg',
    title: def.name + ' — RemoEdPH',
    description: who + ' earned the ' + def.name + ' badge on RemoEdPH.',
  };
}

async function attachReferrer(studentDoc, rawCode) {
  if (!studentDoc || studentDoc.referredByStudentId || studentDoc.referredByOwnerId) return false;
  const code = String(rawCode || '').trim();
  if (!code || code.length > 64) return false;
  const referrer = await Student.findOne({ shareCode: code })
    .select('_id email parentEmail')
    .lean();
  if (!referrer) return false;
  if (studentDoc._id && String(studentDoc._id) === String(referrer._id)) return false;
  const mine = new Set(emailsOf(studentDoc));
  if (emailsOf(referrer).some((e) => mine.has(e))) return false;
  studentDoc.referredByStudentId = referrer._id;
  return true;
}

async function ensureShareCode(studentId) {
  const student = await Student.findById(studentId).select('shareCode');
  if (!student) return '';
  if (student.shareCode) return student.shareCode;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateShareCode();
    try {
      student.shareCode = code;
      await student.save();
      return code;
    } catch (err) {
      if (err && err.code === 11000) continue;
      throw err;
    }
  }
  throw new Error('Could not assign a referral code');
}

function isPaidPlanPurchase({ amountPaid, planId }) {
  const amount = Number(amountPaid);
  if (!Number.isFinite(amount) || amount <= 0) return false;
  const plan = String(planId || '').trim().toLowerCase();
  return PAID_PLAN_IDS.has(plan);
}

async function applyRewardInSession(session, referred, paymentId) {
  const existing = await StudentReferralReward.findOne({ referredUserId: referred._id }).session(session);
  if (existing) return existing;
  if (!referred.referredByStudentId) return null;
  const referrer = await Student.findById(referred.referredByStudentId).session(session);
  if (!referrer) return null;
  if (String(referrer._id) === String(referred._id)) return null;
  const mine = new Set(emailsOf(referred));
  if (emailsOf(referrer).some((e) => mine.has(e))) return null;

  const creditsAwarded = REFERRAL_REWARD_CREDITS;
  const [reward] = await StudentReferralReward.create(
    [
      {
        referrerId: referrer._id,
        referredUserId: referred._id,
        paymentId: String(paymentId || ''),
        creditsAwarded,
      },
    ],
    { session }
  );

  const expiresAt = new Date();
  expiresAt.setFullYear(expiresAt.getFullYear() + 10);
  const balanceAfter = Number(referrer.creditBalance || 0) + creditsAwarded;
  const lot = buildCreditLot({
    planId: 'referral',
    planLabel: 'Referral reward',
    credits: creditsAwarded,
    purchasedAt: new Date(),
    expiresAt,
    paymentId: 'referral:' + String(reward._id),
  });
  await Student.updateOne(
    { _id: referrer._id },
    {
      $inc: { creditBalance: creditsAwarded },
      $push: {
        pendingReferralWins: creditsAwarded,
        creditLots: lot,
        creditHistory: {
          date: new Date(),
          plan: 'Referral reward',
          credits: creditsAwarded,
          amountPaid: 0,
          paymentId: String(paymentId || ''),
          entryType: 'adjustment',
          balanceAfter,
        },
      },
    },
    { session }
  );

  const purchaseCount = await StudentReferralReward.countDocuments({ referrerId: referrer._id }).session(session);
  const earned = await StudentReferralBadge.find({ studentId: referrer._id }).session(session).select('badgeKey').lean();
  const have = new Set(earned.map((row) => row.badgeKey));
  const toAward = REFERRAL_BADGES.filter((b) => purchaseCount >= b.threshold && !have.has(b.key));
  if (toAward.length) {
    await StudentReferralBadge.insertMany(
      toAward.map((b) => ({ studentId: referrer._id, badgeKey: b.key, earnedAt: new Date() })),
      { session }
    );
  }
  return reward;
}

async function awardOnFirstPaidPlan({ student, paymentId, amountPaid, planId }) {
  if (!student || !student._id || !student.referredByStudentId) return null;
  if (!isPaidPlanPurchase({ amountPaid, planId })) return null;
  const pid = String(paymentId || '').trim();
  if (!pid) return null;

  const prior = await StudentReferralReward.findOne({ referredUserId: student._id }).lean();
  if (prior) return prior;

  const session = await mongoose.startSession();
  try {
    let reward = null;
    await session.withTransaction(async () => {
      const fresh = await Student.findById(student._id).session(session);
      reward = await applyRewardInSession(session, fresh, pid);
    });
    return reward;
  } catch (err) {
    if (err && err.code === 11000) {
      return StudentReferralReward.findOne({ referredUserId: student._id }).lean();
    }
    throw err;
  } finally {
    session.endSession();
  }
}

async function reverseStudentReferralReward(paymentId) {
  const pid = String(paymentId || '').trim();
  if (!pid) return null;
  const reward = await StudentReferralReward.findOne({ paymentId: pid, reversedAt: null });
  if (!reward) return null;
  const session = await mongoose.startSession();
  try {
    await session.withTransaction(async () => {
      const locked = await StudentReferralReward.findOne({ _id: reward._id, reversedAt: null }).session(session);
      if (!locked) return;
      const referrer = await Student.findById(locked.referrerId).session(session);
      if (!referrer) return;
      const next = Math.max(0, Number(referrer && referrer.creditBalance) - locked.creditsAwarded);
      const lotPaymentId = 'referral:' + String(locked._id);
      if (referrer && Array.isArray(referrer.creditLots)) {
        const lot = referrer.creditLots.find((row) => row && row.paymentId === lotPaymentId);
        if (lot) {
          lot.creditsRemaining = Math.max(0, Number(lot.creditsRemaining || 0) - locked.creditsAwarded);
        }
        referrer.creditBalance = next;
        referrer.creditHistory = referrer.creditHistory || [];
        referrer.creditHistory.push({
          date: new Date(),
          plan: 'Referral reward reversed',
          credits: -locked.creditsAwarded,
          amountPaid: 0,
          paymentId: locked.paymentId,
          entryType: 'adjustment',
          balanceAfter: next,
        });
        await referrer.save({ session });
      } else {
        await Student.updateOne(
          { _id: locked.referrerId },
          {
            $set: { creditBalance: next },
            $push: {
              creditHistory: {
                date: new Date(),
                plan: 'Referral reward reversed',
                credits: -locked.creditsAwarded,
                amountPaid: 0,
                paymentId: locked.paymentId,
                entryType: 'adjustment',
                balanceAfter: next,
              },
            },
          },
          { session }
        );
      }
      locked.reversedAt = new Date();
      await locked.save({ session });
    });
  } finally {
    session.endSession();
  }
  return reward;
}

async function getDashboard(studentId) {
  const code = await ensureShareCode(studentId);
  const me = await Student.findById(studentId).select('showBadgesOnProfile').lean();
  const signups = await Student.find({ referredByStudentId: studentId })
    .select('firstName lastName email parentEmail createdAt')
    .sort({ createdAt: -1 })
    .lean();
  const rewards = await StudentReferralReward.find({ referrerId: studentId, reversedAt: null }).lean();
  const byUser = new Map(rewards.map((r) => [String(r.referredUserId), r]));
  const badges = await StudentReferralBadge.find({ studentId }).sort({ earnedAt: 1 }).lean();
  const earnedKeys = new Set(badges.map((b) => b.badgeKey));
  const purchaseCount = rewards.length;
  let linkClicks = 0;
  try {
    const { getReferralClickCount } = require('./referralLinkClicks');
    linkClicks = await getReferralClickCount(code);
  } catch (clickErr) {
    console.warn('student referral click count:', clickErr && clickErr.message);
  }
  const list = signups.map((s) => {
    const reward = byUser.get(String(s._id));
    return {
      name: maskName(s),
      email: maskEmail(s.email || s.parentEmail),
      status: reward ? 'Purchased' : 'Signed up',
      creditsWon: reward ? reward.creditsAwarded : null,
      createdAt: s.createdAt,
    };
  });
  return {
    code,
    link: appOrigin() + '/signup?ref=' + encodeURIComponent(code),
    shareText: 'Join me on RemoEdPH for live one-on-one English classes. Each successful referral earns ' + REFERRAL_REWARD_CREDITS + ' free lessons.',
    stats: {
      linkClicks,
      signups: signups.length,
      purchases: purchaseCount,
      successfulSubscriptions: purchaseCount,
      freeLessons: rewards.reduce((sum, r) => sum + Number(r.creditsAwarded || 0), 0),
    },
    referrals: list,
    showBadgesOnProfile: me ? me.showBadgesOnProfile !== false : true,
    badges: REFERRAL_BADGES.map((def) => {
      const row = badges.find((b) => b.badgeKey === def.key);
      return {
        id: row ? String(row._id) : null,
        key: def.key,
        name: def.name,
        threshold: def.threshold,
        earned: earnedKeys.has(def.key),
        earnedAt: row ? row.earnedAt : null,
        progress: Math.min(purchaseCount, def.threshold),
        image: '/images/referral-badges/' + def.key + '.svg',
        shareUrl: row ? appOrigin() + '/badges/' + String(row._id) : null,
      };
    }),
  };
}

async function takePendingWins(studentId) {
  const student = await Student.findById(studentId).select('pendingReferralWins');
  if (!student || !student.pendingReferralWins || !student.pendingReferralWins.length) return [];
  const wins = student.pendingReferralWins.slice();
  student.pendingReferralWins = [];
  await student.save();
  return wins;
}

async function setBadgePrivacy(studentId, show) {
  await Student.updateOne({ _id: studentId }, { $set: { showBadgesOnProfile: !!show } });
  return !!show;
}

async function publicBadgeById(id) {
  if (!mongoose.Types.ObjectId.isValid(id)) return null;
  const row = await StudentReferralBadge.findById(id).lean();
  if (!row) return null;
  const student = await Student.findById(row.studentId).select('firstName lastName email parentEmail showBadgesOnProfile').lean();
  if (!student) return null;
  return publicBadgePayload(row, student);
}

async function publicProfileBadges(username) {
  const student = await Student.findOne({ username: String(username || '').trim() })
    .select('firstName username showBadgesOnProfile')
    .lean();
  if (!student || student.showBadgesOnProfile === false) return null;
  const rows = await StudentReferralBadge.find({ studentId: student._id }).sort({ earnedAt: 1 }).lean();
  return {
    name: student.firstName || student.username,
    badges: rows.map((row) => publicBadgePayload(row, student)),
  };
}

function escapeHtml(value) {
  return String(value || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function renderBadgePage(badge) {
  const origin = appOrigin();
  const url = origin + '/badges/' + badge.id;
  const image = origin + badge.image;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>${escapeHtml(badge.title)}</title>
<meta name="description" content="${escapeHtml(badge.description)}">
<meta property="og:type" content="website">
<meta property="og:title" content="${escapeHtml(badge.title)}">
<meta property="og:description" content="${escapeHtml(badge.description)}">
<meta property="og:image" content="${escapeHtml(image)}">
<meta property="og:url" content="${escapeHtml(url)}">
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(badge.title)}">
<meta name="twitter:description" content="${escapeHtml(badge.description)}">
<meta name="twitter:image" content="${escapeHtml(image)}">
<link rel="stylesheet" href="/css/remoed-layers.css">
</head>
<body style="font-family:Nunito,system-ui,sans-serif;background:#f4f7fb;margin:0;display:flex;min-height:100vh;align-items:center;justify-content:center;">
<main style="background:#fff;border-radius:16px;padding:32px;max-width:420px;text-align:center;box-shadow:0 8px 30px rgba(15,23,42,.08);">
<img src="${escapeHtml(badge.image)}" alt="" width="160" height="160">
<h1 style="color:#0f172a;font-size:1.5rem;">${escapeHtml(badge.name)}</h1>
<p style="color:#475569;">${escapeHtml(badge.description)}</p>
<p style="color:#64748b;font-size:.9rem;">Earned ${escapeHtml(new Date(badge.earnedAt).toLocaleDateString())}</p>
</main>
</body>
</html>`;
}

function renderPublicProfile(profile) {
  const cards = (profile.badges || [])
    .map(
      (b) =>
        `<a href="/badges/${escapeHtml(b.id)}" style="text-decoration:none;color:inherit;"><img src="${escapeHtml(b.image)}" alt="" width="96" height="96"><div>${escapeHtml(b.name)}</div></a>`
    )
    .join('');
  return `<!DOCTYPE html><html lang="en"><head><meta charset="utf-8"><title>${escapeHtml(profile.name)} — Badges</title></head>
<body style="font-family:Nunito,system-ui,sans-serif;background:#f4f7fb;margin:0;padding:32px;">
<h1>${escapeHtml(profile.name)}</h1>
<h2>Badges</h2>
<div style="display:flex;flex-wrap:wrap;gap:16px;">${cards || '<p>No badges yet.</p>'}</div>
</body></html>`;
}

module.exports = {
  attachReferrer,
  ensureShareCode,
  awardOnFirstPaidPlan,
  reverseStudentReferralReward,
  getDashboard,
  takePendingWins,
  setBadgePrivacy,
  publicBadgeById,
  publicProfileBadges,
  renderBadgePage,
  renderPublicProfile,
};
