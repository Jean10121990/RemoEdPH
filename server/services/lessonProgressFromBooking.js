const Lesson = require('../models/Lesson');
const LessonProgress = require('../models/LessonProgress');
const Booking = require('../models/Booking');
const { resolveLessonIdFromBooking } = require('../lessonResolveFromBooking');
const { isMongoObjectId } = require('../utils/mongoObjectId');

/**
 * Upsert LessonProgress for a booking after class end / finalize.
 * Resolves lessonId + curriculumId from the booking when missing.
 * @returns {Promise<{ progress: object|null, skipped?: string }>}
 */
async function upsertLessonProgressFromBooking(bookingOrId, opts = {}) {
  const {
    status = 'completed',
    teacherId = null,
    notes = '',
  } = opts;

  let booking = bookingOrId;
  if (!booking || !booking._id) {
    if (!isMongoObjectId(bookingOrId)) {
      return { progress: null, skipped: 'invalid_booking_id' };
    }
    booking = await Booking.findById(bookingOrId);
  }
  if (!booking) {
    return { progress: null, skipped: 'booking_not_found' };
  }

  const studentId = String(booking.studentId || '').trim();
  if (!studentId) {
    return { progress: null, skipped: 'missing_student' };
  }

  let lessonId = booking.lessonId || null;
  if (lessonId && !isMongoObjectId(lessonId._id || lessonId)) {
    lessonId = null;
  }
  if (!lessonId) {
    try {
      lessonId = await resolveLessonIdFromBooking(booking);
    } catch (err) {
      console.warn('lessonProgressFromBooking resolveLessonId:', err && err.message);
    }
  }
  if (!lessonId) {
    return { progress: null, skipped: 'lesson_unresolved' };
  }

  let curriculumId = null;
  if (!isMongoObjectId(lessonId._id || lessonId)) {
    return { progress: null, skipped: 'invalid_lesson_id' };
  }
  const lesson = await Lesson.findById(lessonId).select('curriculumId').lean();
  if (lesson && lesson.curriculumId) {
    curriculumId = lesson.curriculumId;
  }
  if (!curriculumId) {
    return { progress: null, skipped: 'missing_curriculum' };
  }

  if (!booking.lessonId) {
    try {
      booking.lessonId = lessonId;
      await booking.save();
    } catch (saveErr) {
      console.warn('lessonProgressFromBooking persist lessonId:', saveErr && saveErr.message);
    }
  }

  const normalizedStatus = ['not_started', 'in_progress', 'completed'].includes(status)
    ? status
    : 'completed';

  const existing = await LessonProgress.findOne({ studentId, lessonId }).lean();
  // Never downgrade a completed lesson when session is ended again
  if (
    existing &&
    existing.status === 'completed' &&
    normalizedStatus !== 'completed'
  ) {
    return { progress: existing, skipped: 'already_completed' };
  }

  const update = {
    studentId,
    lessonId,
    curriculumId,
    bookingId: booking._id,
    status: normalizedStatus,
    teacherId: teacherId != null ? String(teacherId) : String(booking.teacherId || ''),
    notes: notes || '',
  };
  if (normalizedStatus === 'completed') {
    update.completedAt = existing && existing.completedAt ? existing.completedAt : new Date();
  } else {
    update.completedAt = null;
  }

  const progress = await LessonProgress.findOneAndUpdate(
    { studentId, lessonId },
    update,
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );

  return { progress };
}

/**
 * Best-effort wrapper — never throws into class-finish flows.
 */
async function safeUpsertLessonProgressFromBooking(bookingOrId, opts = {}) {
  try {
    return await upsertLessonProgressFromBooking(bookingOrId, opts);
  } catch (err) {
    console.warn('safeUpsertLessonProgressFromBooking:', err && err.message);
    return { progress: null, skipped: 'error', error: err };
  }
}

module.exports = {
  upsertLessonProgressFromBooking,
  safeUpsertLessonProgressFromBooking,
};
