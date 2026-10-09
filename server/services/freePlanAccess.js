/**
 * Free plan on the existing Student record.
 * Paid: a spark/steady/scholar/summit lot with credits left, or an active paid subscription.
 * Free: everyone else, including a leftover welcome credit.
 * Free students book the next Pre-Level lesson once per student-local calendar month.
 */
const mongoose = require('mongoose');
const { DateTime } = require('luxon');
const Booking = require('../models/Booking');
const Student = require('../models/Student');
const { PRE_LEVEL, normalizeCurriculumDocLevel } = require('../config/curriculumLevels');

const FREE_PLAN_LESSON_COUNT = 22;
const PAID_PLAN_IDS = ['spark', 'steady', 'scholar', 'summit'];
/** Admin Settings may force this username only. Other students ignore planModeOverride. */
const TEST_PLAN_STUDENT_USERNAME = 'jeanserolf';

function isTestPlanStudent(student) {
  return String((student && student.username) || '').trim().toLowerCase() === TEST_PLAN_STUDENT_USERNAME;
}

function zoneOrManila(zone) {
  return zone && DateTime.now().setZone(String(zone)).isValid ? String(zone) : 'Asia/Manila';
}

function currentPeriodKey(zone) {
  return DateTime.now().setZone(zoneOrManila(zone)).toFormat('yyyy-MM');
}

function isPaidSubscriber(student) {
  if (!student) return false;
  if (isTestPlanStudent(student)) {
    const mode = String(student.planModeOverride || '').toLowerCase();
    if (mode === 'paid') return true;
    if (mode === 'free') return false;
  }
  const lots = Array.isArray(student.creditLots) ? student.creditLots : [];
  const paidLot = lots.some((lot) => {
    const id = String((lot && lot.planId) || '').toLowerCase();
    return PAID_PLAN_IDS.indexOf(id) !== -1 && Number(lot.creditsRemaining) > 0;
  });
  if (paidLot) return true;
  return (
    student.isSubscribed === true &&
    String(student.subscriptionStatus || '') === 'active' &&
    String(student.paymentStatus || '') === 'paid'
  );
}

function completedCountOf(student) {
  const n = Number(student && student.freeLessonCompletedCount) || 0;
  if (n < 0) return 0;
  if (n > FREE_PLAN_LESSON_COUNT) return FREE_PLAN_LESSON_COUNT;
  return n;
}

function httpError(status, code, message) {
  const err = new Error(message);
  err.statusCode = status;
  err.code = code;
  return err;
}

async function describeBookedLesson(lessonId, lessonTitle, studentLevel) {
  let number = null;
  let level = normalizeCurriculumDocLevel(studentLevel);
  if (lessonId && mongoose.Types.ObjectId.isValid(String(lessonId))) {
    const Lesson = require('../models/Lesson');
    const Curriculum = require('../models/Curriculum');
    const doc = await Lesson.findById(String(lessonId)).select('lessonNumber title curriculumId').lean();
    if (doc) {
      const n = Number(doc.lessonNumber);
      if (!Number.isNaN(n)) number = n;
      if (doc.curriculumId) {
        const cur = await Curriculum.findById(doc.curriculumId).select('level').lean();
        if (cur && cur.level) level = normalizeCurriculumDocLevel(cur.level) || level;
      }
    }
  }
  if (number == null) {
    const m = String(lessonTitle || '').match(/lesson\s*(\d+)/i);
    if (m) number = parseInt(m[1], 10);
  }
  return { number, level };
}

async function upcomingFreeBooking(student, session) {
  const id = student && student.freeLessonActiveBookingId;
  if (!id) return null;
  let q = Booking.findById(id).select('status dateTimeUtc');
  if (session) q = q.session(session);
  const booking = await q.lean();
  if (!booking) return null;
  const status = String(booking.status || '').toLowerCase();
  if (status.indexOf('cancelled') === 0 || status === 'completed' || status === 'absent') return null;
  return booking;
}

async function loadStudent(studentOrId, session) {
  if (studentOrId && studentOrId._id && studentOrId.freeLessonCompletedCount != null && !session) {
    return studentOrId;
  }
  const id = studentOrId && studentOrId._id ? studentOrId._id : studentOrId;
  if (!id) return studentOrId || null;
  let q = Student.findById(id);
  if (session) q = q.session(session);
  return (await q) || studentOrId || null;
}

/**
 * @returns {Promise<{ ok: true, nextLessonNumber: number, periodKey: string } | { ok: false, error: Error }>}
 */
async function assertFreePlanLesson({ student, studentId, studentLevel, lessonId, lessonTitle, zone, session }) {
  const current = await loadStudent(student || studentId, session);
  const completed = completedCountOf(current);
  if (completed >= FREE_PLAN_LESSON_COUNT) {
    return {
      ok: false,
      error: httpError(
        403,
        'FREE_PLAN_SEQUENCE_DONE',
        'You finished all 22 free Pre-Level lessons. Subscribe to keep learning.'
      ),
    };
  }

  const described = await describeBookedLesson(lessonId, lessonTitle, studentLevel);
  if (described.level !== PRE_LEVEL) {
    return {
      ok: false,
      error: httpError(
        403,
        'FREE_PLAN_LESSON_ONLY',
        'The free plan books Pre-Level lessons only. Subscribe to book Little Seeds, Sprouts, Saplings, or Young Stewards.'
      ),
    };
  }

  const nextLessonNumber = completed + 1;
  if (described.number !== nextLessonNumber) {
    return {
      ok: false,
      error: httpError(
        403,
        'FREE_PLAN_SEQUENCE',
        'Your free lesson this month is Pre-Level Lesson ' + nextLessonNumber + '.'
      ),
    };
  }

  const periodKey = currentPeriodKey(zone);
  if (String((current && current.freeLessonPeriodKey) || '') === periodKey) {
    return {
      ok: false,
      error: httpError(
        403,
        'FREE_PLAN_MONTHLY_LIMIT',
        'You already booked this month’s free lesson. Next month you can book Pre-Level Lesson ' +
          nextLessonNumber +
          '.'
      ),
    };
  }

  const upcoming = await upcomingFreeBooking(current, session);
  if (upcoming) {
    return {
      ok: false,
      error: httpError(
        403,
        'FREE_PLAN_MONTHLY_LIMIT',
        'You already have a free Pre-Level class booked. Cancel it before the start time to book again this month.'
      ),
    };
  }

  return { ok: true, nextLessonNumber, periodKey };
}

async function freePlanProfile(student, zone) {
  const paid = isPaidSubscriber(student);
  const completed = completedCountOf(student);
  const periodKey = currentPeriodKey(zone);
  const sequenceDone = completed >= FREE_PLAN_LESSON_COUNT;
  const usedMonth = String((student && student.freeLessonPeriodKey) || '') === periodKey;
  const upcoming = paid ? null : await upcomingFreeBooking(student, null);
  const isFree = !paid;
  const nextLessonNumber = sequenceDone ? FREE_PLAN_LESSON_COUNT : completed + 1;
  return {
    isFree,
    nextLessonNumber,
    canBookThisMonth: isFree && !sequenceDone && !usedMonth && !upcoming,
    completedCount: completed,
    periodKey,
    sequenceDone,
  };
}

module.exports = {
  FREE_PLAN_LESSON_COUNT,
  PRE_LEVEL,
  TEST_PLAN_STUDENT_USERNAME,
  isTestPlanStudent,
  isPaidSubscriber,
  currentPeriodKey,
  assertFreePlanLesson,
  freePlanProfile,
};
