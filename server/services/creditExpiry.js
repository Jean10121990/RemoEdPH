/**
 * Subscription validity: unused lesson credits return to 0 after subscriptionEndDate.
 * Notices at 10 / 5 / 2 calendar days (Asia/Manila). Already-booked classes are untouched
 * (those credits were already deducted on book).
 */
const { DateTime } = require('luxon');
const Student = require('../models/Student');
const { getPlanDurationMonths } = require('../config/planCredits');
const {
  ensureCreditLotsBackfilled,
  expireDueLotsInMemory,
  syncSubscriptionFieldsFromLots,
  sumLotRemaining,
  isLotActive,
  sortLotsFifo,
} = require('./creditLots');

const MANILA = 'Asia/Manila';
const NOTICE_MILESTONES = [10, 5, 2];
const NOTICE_FIELD = {
  10: 'creditExpiryNotices.d10',
  5: 'creditExpiryNotices.d5',
  2: 'creditExpiryNotices.d2',
};

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function manilaStartOfDay(d) {
  return DateTime.fromJSDate(d, { zone: 'utc' }).setZone(MANILA).startOf('day');
}

/** Whole Manila calendar days from today to the expiry date (0 = expires today). */
function manilaCalendarDaysUntil(endDate, now = new Date()) {
  const end = toDate(endDate);
  if (!end) return null;
  const days = Math.round(manilaStartOfDay(end).diff(manilaStartOfDay(now), 'days').days);
  return days;
}

/** Nearest active lot expiry (countdown); falls back to subscriptionEndDate. */
function resolveCreditExpiryDate(student, now = new Date()) {
  if (!student) return null;
  ensureCreditLotsBackfilled(student, now);
  const active = sortLotsFifo(
    (student.creditLots || []).filter((l) => isLotActive(l, now))
  );
  if (active.length) {
    return toDate(active[0].expiresAt);
  }
  const stored = toDate(student.subscriptionEndDate);
  if (stored) return stored;
  const start = toDate(student.subscriptionStartDate);
  if (!start) return null;
  const months = getPlanDurationMonths(student.subscriptionPlan);
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  return end;
}

function resolveFarthestExpiryDate(student, now = new Date()) {
  if (!student) return null;
  ensureCreditLotsBackfilled(student, now);
  let far = null;
  for (const l of student.creditLots || []) {
    if (!isLotActive(l, now)) continue;
    const e = toDate(l.expiresAt);
    if (!e) continue;
    if (!far || e.getTime() > far.getTime()) far = e;
  }
  return far || toDate(student.subscriptionEndDate);
}

function shouldTrackValidity(student) {
  if (!student) return false;
  if (Array.isArray(student.creditLots) && student.creditLots.some((l) => isLotActive(l))) {
    return true;
  }
  if (student.subscriptionEndDate) return true;
  if (!student.subscriptionStartDate) return false;
  return (
    student.isSubscribed === true ||
    student.subscriptionStatus === 'active' ||
    student.paymentStatus === 'paid'
  );
}

function buildExpiryPayload(student, now = new Date()) {
  if (!shouldTrackValidity(student)) {
    return {
      creditsExpireAt: null,
      daysUntilExpiry: null,
      expiryCountdownLabel: null,
      creditsExpired: false,
    };
  }
  const nearest = resolveCreditExpiryDate(student, now);
  const farthest = resolveFarthestExpiryDate(student, now);
  if (!nearest && !farthest) {
    return {
      creditsExpireAt: null,
      daysUntilExpiry: null,
      expiryCountdownLabel: null,
      creditsExpired: false,
    };
  }
  const end = nearest || farthest;
  const lotSum = sumLotRemaining(student.creditLots);
  const expired = lotSum <= 0 && now.getTime() >= end.getTime();
  const days = manilaCalendarDaysUntil(end, now);
  const endLabel = DateTime.fromJSDate(end, { zone: 'utc' }).setZone(MANILA).toFormat('LLL d, yyyy');
  let expiryCountdownLabel;
  if (expired) {
    expiryCountdownLabel = 'Expired';
  } else if (days === 0) {
    expiryCountdownLabel = 'Expires today';
  } else if (days === 1) {
    expiryCountdownLabel = '1 day left';
  } else {
    expiryCountdownLabel = `${days} days left`;
  }
  return {
    creditsExpireAt: end.toISOString(),
    daysUntilExpiry: expired ? 0 : days,
    expiryCountdownLabel,
    creditsExpired: expired,
    creditsExpireOnLabel: endLabel,
    creditsExpireAtLatest: farthest ? farthest.toISOString() : null,
  };
}

function emptyNoticeFlags() {
  return { d10: null, d5: null, d2: null, expired: null };
}

function pickNoticeMilestone(daysLeft, expired) {
  if (expired || daysLeft == null || daysLeft < 0) return null;
  if (daysLeft <= 2) return 2;
  if (daysLeft <= 5) return 5;
  if (daysLeft <= 10) return 10;
  return null;
}

function noticeAlreadySent(student, milestone) {
  const n = student.creditExpiryNotices || {};
  if (milestone === 10) return !!n.d10;
  if (milestone === 5) return !!n.d5;
  if (milestone === 2) return !!n.d2;
  if (milestone === 'expired') return !!n.expired;
  return false;
}

async function persistMissingEndDate(studentId, student) {
  if (!studentId || !student) return student;
  ensureCreditLotsBackfilled(student);
  const sync = syncSubscriptionFieldsFromLots(student);
  if (!sync.subscriptionEndDate) return student;
  const patch = {
    subscriptionEndDate: sync.subscriptionEndDate,
    subscriptionPlan: sync.subscriptionPlan || student.subscriptionPlan,
  };
  if (Array.isArray(student.creditLots) && student.creditLots.length) {
    patch.creditLots = student.creditLots;
  }
  await Student.updateOne({ _id: studentId }, { $set: patch });
  return { ...student, ...patch };
}

/**
 * Expire due plan lots only — newer plans keep their remaining credits.
 */
async function applyExpiredCreditsIfNeeded(studentId, studentLean, now = new Date()) {
  if (!studentId || !studentLean) {
    return { applied: false, student: studentLean };
  }
  let student = { ...studentLean };
  ensureCreditLotsBackfilled(student, now);
  const expiredAmt = expireDueLotsInMemory(student, now);
  if (expiredAmt <= 0) {
    student = await persistMissingEndDate(studentId, student);
    return { applied: false, student };
  }

  const sync = syncSubscriptionFieldsFromLots(student, now);
  const lotSum = sumLotRemaining(student.creditLots);
  const prevBal = Math.max(0, Number(student.creditBalance) || 0);
  const newBal = Math.min(prevBal, lotSum);
  const dropped = Math.max(0, prevBal - newBal);
  const zeroAll = lotSum <= 0;

  const updated = await Student.findOneAndUpdate(
    { _id: studentId },
    {
      $set: {
        creditLots: student.creditLots,
        creditBalance: newBal,
        subscriptionEndDate: sync.subscriptionEndDate,
        subscriptionPlan: sync.subscriptionPlan || student.subscriptionPlan,
        subscriptionStatus: zeroAll ? 'expired' : 'active',
        isSubscribed: !zeroAll,
      },
      $inc: { expiredCredits: dropped || expiredAmt },
      $push: {
        creditHistory: {
          date: now,
          plan: 'Plan validity ended',
          credits: -(dropped || expiredAmt),
          amountPaid: 0,
          paymentId: `lot-expiry:${now.toISOString()}`,
          entryType: 'expiry',
          balanceAfter: newBal,
        },
      },
    },
    { new: true }
  );
  if (!updated) {
    return { applied: false, student };
  }

  try {
    const { invalidateStudentProfileCache } = require('../studentController');
    await invalidateStudentProfileCache(studentId);
  } catch (_e) {
    /* cache optional */
  }

  const unused = dropped || expiredAmt;
  if (unused > 0 && !noticeAlreadySent(student, 'expired')) {
    const claimed = await Student.findOneAndUpdate(
      {
        _id: studentId,
        $or: [
          { 'creditExpiryNotices.expired': null },
          { 'creditExpiryNotices.expired': { $exists: false } },
        ],
      },
      { $set: { 'creditExpiryNotices.expired': now } },
      { new: true }
    );
    if (claimed) {
      try {
        const { notifyStudent } = require('./notifyService');
        const more =
          newBal > 0
            ? ` ${newBal} credit${newBal === 1 ? '' : 's'} from newer plan(s) remain.`
            : ' Renew a plan to keep booking classes.';
        await notifyStudent(
          claimed.username,
          'credits-expired',
          `A plan window ended: ${unused} unused credit${unused === 1 ? '' : 's'} expired.${more}`,
          {
            actionUrl: '/student-credits.html',
            importance: 'actionable',
            meta: { expiredCredits: unused, remainingBalance: newBal },
          }
        );
      } catch (e) {
        console.warn('[credit-expiry] expired notify failed:', e.message || e);
      }
      await emailCreditExpiryNotice(claimed, 'expired', {
        unused,
        endLabel: DateTime.fromJSDate(now, { zone: 'utc' }).setZone(MANILA).toFormat('LLL d, yyyy'),
      });
    }
  }

  return { applied: true, student: updated.toObject() };
}

function creditsEmailAllowed(student) {
  if (!student || !student.notificationPrefs) return true;
  return student.notificationPrefs.credits !== false;
}

async function emailCreditExpiryNotice(student, kind, details) {
  if (!creditsEmailAllowed(student)) return;
  try {
    const { sendCreditExpiryEmail } = require('../emailService');
    const result = await sendCreditExpiryEmail({
      student,
      kind,
      unused: details.unused,
      daysLeft: details.daysLeft,
      endLabel: details.endLabel,
    });
    if (result && result.success === false && !result.skipped && !result.fallback) {
      console.warn('[credit-expiry] email failed:', result.error);
    }
  } catch (e) {
    console.warn('[credit-expiry] email failed:', e.message || e);
  }
}

function noticeMessage(unused, daysLeft, endLabel) {
  const n = Number(unused) || 0;
  const creditWord = n === 1 ? 'credit' : 'credits';
  if (daysLeft === 0) {
    return `You have ${n} unused lesson ${creditWord}. They expire today (${endLabel}) and will return to 0 if unused.`;
  }
  if (daysLeft === 1) {
    return `You have ${n} unused lesson ${creditWord}. They expire tomorrow (${endLabel}) and will return to 0 if unused.`;
  }
  return `You have ${n} unused lesson ${creditWord}. They expire in ${daysLeft} days (${endLabel}) and will return to 0 if unused.`;
}

async function sendCreditExpiryNotices(now = new Date()) {
  const horizon = DateTime.fromJSDate(now, { zone: 'utc' }).setZone(MANILA).plus({ days: 11 }).toJSDate();
  const students = await Student.find({
    creditBalance: { $gt: 0 },
    subscriptionEndDate: { $gt: now, $lte: horizon },
    subscriptionStatus: { $in: ['active', 'pending'] },
  })
    .select(
      'username email parentEmail firstName lastName creditBalance subscriptionEndDate subscriptionStatus creditExpiryNotices notificationPrefs'
    )
    .limit(200)
    .lean();

  const { notifyStudent } = require('./notifyService');
  let sent = 0;
  for (const s of students) {
    try {
      const payload = buildExpiryPayload(s, now);
      if (payload.creditsExpired) continue;
      const unused = Math.max(0, Number(s.creditBalance) || 0);
      if (unused <= 0) continue;
      const milestone = pickNoticeMilestone(payload.daysUntilExpiry, false);
      if (!milestone || noticeAlreadySent(s, milestone)) continue;
      const field = NOTICE_FIELD[milestone];
      const claimed = await Student.findOneAndUpdate(
        {
          _id: s._id,
          creditBalance: { $gt: 0 },
          $or: [{ [field]: null }, { [field]: { $exists: false } }],
        },
        { $set: { [field]: now } },
        { new: true }
      );
      if (!claimed) continue;
      try {
        await notifyStudent(
          claimed.username,
          'credits-expiring',
          noticeMessage(unused, payload.daysUntilExpiry, payload.creditsExpireOnLabel),
          {
            actionUrl: '/student-credits.html',
            importance: 'actionable',
            meta: { daysLeft: payload.daysUntilExpiry, milestone, unusedCredits: unused },
          }
        );
      } catch (nErr) {
        console.warn('[credit-expiry] in-app notice failed:', claimed.username, nErr.message || nErr);
      }
      await emailCreditExpiryNotice(claimed, 'expiring', {
        unused,
        daysLeft: payload.daysUntilExpiry,
        endLabel: payload.creditsExpireOnLabel,
      });
      sent += 1;
    } catch (e) {
      console.warn('[credit-expiry] notice failed:', s.username, e.message || e);
    }
  }
  return sent;
}

async function expireDueStudents(now = new Date()) {
  const due = await Student.find({
    $or: [
      {
        creditLots: {
          $elemMatch: {
            expiresAt: { $lte: now },
            creditsRemaining: { $gt: 0 },
            expiredAt: null,
          },
        },
      },
      { subscriptionEndDate: { $lte: now }, creditBalance: { $gt: 0 } },
      { subscriptionStatus: 'active', subscriptionEndDate: { $lte: now } },
      { isSubscribed: true, subscriptionEndDate: { $lte: now } },
    ],
  })
    .select(
      'username creditBalance creditLots subscriptionEndDate subscriptionStartDate subscriptionPlan subscriptionStatus isSubscribed paymentStatus creditExpiryNotices expiredCredits'
    )
    .limit(150)
    .lean();

  let applied = 0;
  for (const s of due) {
    const result = await applyExpiredCreditsIfNeeded(s._id, s, now);
    if (result.applied) applied += 1;
  }
  return applied;
}

async function runCreditExpiryJobs() {
  const expired = await expireDueStudents();
  const notices = await sendCreditExpiryNotices();
  if (expired > 0 || notices > 0) {
    console.log(`⏰ Credit expiry job: expired ${expired} student(s), notices ${notices}`);
  }
  return { expired, notices };
}

module.exports = {
  MANILA,
  NOTICE_MILESTONES,
  emptyNoticeFlags,
  manilaCalendarDaysUntil,
  resolveCreditExpiryDate,
  resolveFarthestExpiryDate,
  shouldTrackValidity,
  buildExpiryPayload,
  persistMissingEndDate,
  applyExpiredCreditsIfNeeded,
  sendCreditExpiryNotices,
  expireDueStudents,
  runCreditExpiryJobs,
};
