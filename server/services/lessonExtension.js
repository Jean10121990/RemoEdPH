/**
 * Optional 3-month extension so unfinished lessons can be completed.
 * Parents request it. A teacher grants it only after confirming a one-on-one
 * video call with the parents about the student's performance.
 * The grant does not create affiliate recurring months.
 */

const { DateTime } = require('luxon');
const Booking = require('../models/Booking');
const { resolveToCanonicalTeacherId } = require('./teacherSlotResolve');

const EXTENSION_MONTHS = 3;
const OFFER_WINDOW_DAYS = 30;

function creditsRemaining(student) {
  const lots = Array.isArray(student && student.creditLots) ? student.creditLots : [];
  if (lots.length) {
    return lots.reduce((n, lot) => n + Math.max(0, Number(lot.creditsRemaining) || 0), 0);
  }
  return Math.max(0, Number(student && student.creditBalance) || 0);
}

function plusMonths(date, months) {
  return DateTime.fromJSDate(new Date(date), { zone: 'Asia/Manila' })
    .plus({ months })
    .toJSDate();
}

/**
 * Pure gate. `now` and `end` are ms or Dates.
 * A grant already applied to the current end date cannot be stacked.
 */
function extensionDecision({ end, now, creditsRemaining: left, extension }) {
  if (!(Number(left) > 0)) {
    return { ok: false, error: 'There are no unfinished lessons to extend.' };
  }
  if (!end) {
    return { ok: false, error: 'This student has no subscription end date.' };
  }
  const endMs = new Date(end).getTime();
  if (!Number.isFinite(endMs)) {
    return { ok: false, error: 'This student has no subscription end date.' };
  }
  const daysUntilEnd = (endMs - new Date(now).getTime()) / 86400000;
  if (daysUntilEnd > OFFER_WINDOW_DAYS) {
    return {
      ok: false,
      error: 'The 3-month extension is available at the end of the subscription.',
    };
  }
  const grantedEnd = extension && extension.status === 'granted' && extension.newEnd
    ? new Date(extension.newEnd).getTime()
    : NaN;
  if (Number.isFinite(grantedEnd) && Math.abs(grantedEnd - endMs) < 86400000) {
    return { ok: false, error: 'This subscription already has a 3-month extension.' };
  }
  return { ok: true };
}

function extensionView(student, now) {
  const left = creditsRemaining(student);
  const end = student && student.subscriptionEndDate;
  const extension = (student && student.lessonExtension) || {};
  const decision = extensionDecision({
    end,
    now: now || new Date(),
    creditsRemaining: left,
    extension,
  });
  return {
    status: extension.status || 'none',
    months: EXTENSION_MONTHS,
    canRequest: decision.ok && extension.status !== 'requested',
    requested: extension.status === 'requested',
    granted: extension.status === 'granted' && decision.ok === false
      && /already has/.test(decision.error || ''),
    newEnd: extension.newEnd || null,
    message: decision.ok
      ? 'Lessons still left? Contact your teacher. A 3-month extension is available after a one-on-one video call about your child\'s progress.'
      : decision.error,
  };
}

async function requestLessonExtension(student) {
  const decision = extensionDecision({
    end: student.subscriptionEndDate,
    now: new Date(),
    creditsRemaining: creditsRemaining(student),
    extension: student.lessonExtension,
  });
  if (!decision.ok) {
    const err = new Error(decision.error);
    err.status = 400;
    throw err;
  }
  if (student.lessonExtension && student.lessonExtension.status === 'requested') {
    return extensionView(student);
  }
  student.lessonExtension = {
    status: 'requested',
    months: EXTENSION_MONTHS,
    requestedAt: new Date(),
    grantedAt: null,
    grantedBy: '',
    parentCallConfirmed: false,
    baseEnd: student.subscriptionEndDate,
    newEnd: null,
  };
  student.markModified('lessonExtension');
  await student.save();
  return extensionView(student);
}

async function teacherTaughtStudent(teacherId, student) {
  const canonical = await resolveToCanonicalTeacherId(teacherId);
  const teacherIds = [canonical, teacherId].map((id) => String(id || '').trim()).filter(Boolean);
  const studentIds = [student.username, String(student._id)].filter(Boolean);
  if (!teacherIds.length || !studentIds.length) return false;
  const row = await Booking.exists({
    teacherId: { $in: teacherIds },
    studentId: { $in: studentIds },
    status: { $nin: ['cancelled', 'canceled'] },
  });
  return !!row;
}

async function grantLessonExtension(student, teacherId, parentCallConfirmed) {
  if (parentCallConfirmed !== true && parentCallConfirmed !== 'true') {
    const err = new Error('Confirm the one-on-one video call with the parents about this student\'s performance before offering the extension.');
    err.status = 400;
    throw err;
  }
  const taught = await teacherTaughtStudent(teacherId, student);
  if (!taught) {
    const err = new Error('You can offer this extension only for a student you teach.');
    err.status = 403;
    throw err;
  }
  const decision = extensionDecision({
    end: student.subscriptionEndDate,
    now: new Date(),
    creditsRemaining: creditsRemaining(student),
    extension: student.lessonExtension,
  });
  if (!decision.ok) {
    const err = new Error(decision.error);
    err.status = 400;
    throw err;
  }
  const previousEnd = new Date(student.subscriptionEndDate);
  const newEnd = plusMonths(previousEnd, EXTENSION_MONTHS);
  student.subscriptionEndDate = newEnd;
  if (student.subscriptionStatus === 'expired') student.subscriptionStatus = 'active';
  for (const lot of student.creditLots || []) {
    if (!(Number(lot.creditsRemaining) > 0)) continue;
    const base = lot.expiresAt && new Date(lot.expiresAt) <= previousEnd
      ? lot.expiresAt
      : previousEnd;
    lot.expiresAt = plusMonths(base, EXTENSION_MONTHS);
    lot.expiredAt = null;
  }
  student.lessonExtension = {
    status: 'granted',
    months: EXTENSION_MONTHS,
    requestedAt: student.lessonExtension && student.lessonExtension.requestedAt
      ? student.lessonExtension.requestedAt
      : null,
    grantedAt: new Date(),
    grantedBy: String(teacherId || ''),
    parentCallConfirmed: true,
    baseEnd: previousEnd,
    newEnd,
  };
  student.markModified('creditLots');
  student.markModified('lessonExtension');
  await student.save();
  return {
    status: 'granted',
    months: EXTENSION_MONTHS,
    previousEnd,
    newEnd,
  };
}

module.exports = {
  EXTENSION_MONTHS,
  OFFER_WINDOW_DAYS,
  creditsRemaining,
  extensionDecision,
  extensionView,
  requestLessonExtension,
  grantLessonExtension,
};
