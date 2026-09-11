/**
 * Subscription validity: unused lesson credits return to 0 after subscriptionEndDate.
 * Notices at 10 / 5 / 2 calendar days (Asia/Manila). Already-booked classes are untouched
 * (those credits were already deducted on book).
 */
const { DateTime } = require('luxon');
const Student = require('../models/Student');
const { getPlanDurationMonths } = require('../config/planCredits');

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

function resolveCreditExpiryDate(student) {
  if (!student) return null;
  const stored = toDate(student.subscriptionEndDate);
  if (stored) return stored;
  const start = toDate(student.subscriptionStartDate);
  if (!start) return null;
  const months = getPlanDurationMonths(student.subscriptionPlan);
  const end = new Date(start);
  end.setMonth(end.getMonth() + months);
  return end;
}

function shouldTrackValidity(student) {
  if (!student) return false;
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
  const end = resolveCreditExpiryDate(student);
  if (!end) {
    return {
      creditsExpireAt: null,
      daysUntilExpiry: null,
      expiryCountdownLabel: null,
      creditsExpired: false,
    };
  }
  const expired = now.getTime() >= end.getTime();
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
  if (!studentId || !student || student.subscriptionEndDate) return student;
  if (!shouldTrackValidity(student)) return student;
  const end = resolveCreditExpiryDate(student);
  if (!end) return student;
  await Student.updateOne(
    { _id: studentId, $or: [{ subscriptionEndDate: null }, { subscriptionEndDate: { $exists: false } }] },
    { $set: { subscriptionEndDate: end } }
  );
  return { ...student, subscriptionEndDate: end };
}

async function applyExpiredCreditsIfNeeded(studentId, studentLean, now = new Date()) {
  if (!studentId || !studentLean) {
    return { applied: false, student: studentLean };
  }
  let student = await persistMissingEndDate(studentId, studentLean);
  const end = resolveCreditExpiryDate(student);
  if (!end || now.getTime() < end.getTime()) {
    return { applied: false, student };
  }

  const unused = Math.max(0, Number(student.creditBalance) || 0);
  const status = String(student.subscriptionStatus || '');
  const stillLive = student.isSubscribed === true || status === 'active';
  if (unused <= 0 && !stillLive && status === 'expired') {
    return { applied: false, student };
  }

  const setFields = {
    creditBalance: 0,
    subscriptionStatus: 'expired',
    isSubscribed: false,
  };
  const update = { $set: setFields };
  if (unused > 0) {
    update.$inc = { expiredCredits: unused };
    update.$push = {
      creditHistory: {
        date: now,
        plan: 'Validity ended',
        credits: -unused,
        amountPaid: 0,
        paymentId: `expiry:${end.toISOString()}`,
        entryType: 'expiry',
        balanceAfter: 0,
      },
    };
  }

  const updated = await Student.findOneAndUpdate(
    {
      _id: studentId,
      subscriptionEndDate: { $lte: now },
      $or: [
        { creditBalance: { $gt: 0 } },
        { subscriptionStatus: { $ne: 'expired' } },
        { isSubscribed: true },
      ],
    },
    update,
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
        await notifyStudent(
          claimed.username,
          'credits-expired',
          `Your unused lesson credits (${unused}) expired and returned to 0. Renew a plan to keep booking classes.`,
          {
            actionUrl: '/student-credits.html',
            importance: 'actionable',
            meta: { expiredCredits: unused },
          }
        );
      } catch (e) {
        console.warn('[credit-expiry] expired notify failed:', e.message || e);
      }
    }
  }

  return { applied: true, student: updated.toObject() };
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
      'username creditBalance subscriptionEndDate subscriptionStatus creditExpiryNotices'
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
      sent += 1;
    } catch (e) {
      console.warn('[credit-expiry] notice failed:', s.username, e.message || e);
    }
  }
  return sent;
}

async function expireDueStudents(now = new Date()) {
  const due = await Student.find({
    subscriptionEndDate: { $lte: now },
    $or: [
      { creditBalance: { $gt: 0 } },
      { subscriptionStatus: 'active' },
      { isSubscribed: true },
    ],
  })
    .select(
      'username creditBalance subscriptionEndDate subscriptionStartDate subscriptionPlan subscriptionStatus isSubscribed paymentStatus creditExpiryNotices expiredCredits'
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
  shouldTrackValidity,
  buildExpiryPayload,
  persistMissingEndDate,
  applyExpiredCreditsIfNeeded,
  sendCreditExpiryNotices,
  expireDueStudents,
  runCreditExpiryJobs,
};
