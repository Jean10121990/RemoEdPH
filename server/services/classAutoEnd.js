/**
 * End live classes 40 minutes after the scheduled start.
 * Closing the classroom tab does not mark anyone absent and does not consume a credit.
 * Credits still move only when the teacher submits wrap-up feedback.
 */
const Booking = require('../models/Booking');
const classroomChatStore = require('./classroomChatStore');
const realtime = require('../realtime');
const {
  getScheduledStartMs,
  CLASS_MAX_MINUTES,
  cappedClassEndDate,
} = require('./classroomEntryWindow');
const { emitBookingsUpdatedForTeacher } = require('./teacherClassFinalize');

const ACTIVE_STATUSES = [
  'booked',
  'confirmed',
  'scheduled',
  'upcoming',
  'in_progress',
  'in-progress',
  'ongoing',
];

function applyCappedEnd(booking, endAt) {
  booking.sessionEndedAt = endAt;
  const finMs = booking.finishedAt ? new Date(booking.finishedAt).getTime() : 0;
  if (!finMs || finMs > endAt.getTime()) booking.finishedAt = endAt;
}

async function forgetRoom(booking) {
  const room = booking && booking.classroomId ? String(booking.classroomId) : '';
  if (!room) return;
  try {
    await classroomChatStore.deleteRoom(room);
  } catch (err) {
    console.warn('[class-auto-end] chat delete:', err.message || err);
  }
  try {
    realtime.emitToRoom(room, 'class-finished', {
      room,
      userType: 'teacher',
      reason: 'forty-minutes',
    });
  } catch (_e) {
    /* socket optional */
  }
}

/**
 * Bookings still marked live after start + 40 minutes become pending feedback.
 * End timestamps are the hard stop, not "now", so duration stays 40 minutes.
 */
async function autoEndOverlongClasses(nowMs = Date.now()) {
  const maxMs = CLASS_MAX_MINUTES * 60 * 1000;
  const horizon = new Date(nowMs - maxMs);
  const lookback = new Date(nowMs - 21 * 24 * 60 * 60 * 1000);
  const bookings = await Booking.find({
    status: { $in: ACTIVE_STATUSES },
    dateTimeUtc: { $lte: horizon, $gte: lookback },
  }).limit(80);

  let ended = 0;
  for (const booking of bookings) {
    const startMs = getScheduledStartMs(booking);
    if (startMs == null || nowMs < startMs + maxMs) continue;
    if (booking.absentMarkedAt) continue;
    const st = String(booking.status || '').toLowerCase();
    if (st === 'absent' || st === 'cancelled' || st === 'canceled') continue;
    const endAt = cappedClassEndDate(booking, new Date(nowMs));
    applyCappedEnd(booking, endAt);
    booking.status = 'pending_feedback';
    await booking.save();
    await forgetRoom(booking);
    try {
      await emitBookingsUpdatedForTeacher(booking.teacherId, booking);
    } catch (_e) {
      /* non-blocking */
    }
    ended += 1;
  }
  if (ended) console.log(`⏰ Auto-ended ${ended} class(es) at ${CLASS_MAX_MINUTES} minutes`);
  return ended;
}

/**
 * Shorten stored end times that ran past the 40-minute mark (tab left open).
 * Does not change status, credits, or attendance.
 */
async function capStoredClassDuration() {
  const since = new Date(Date.now() - 120 * 24 * 60 * 60 * 1000);
  const rows = await Booking.find({
    finishedAt: { $ne: null },
    dateTimeUtc: { $gte: since },
  })
    .select('dateTimeUtc finishedAt sessionEndedAt date time teacherLocalZone studentLocalZone scheduledStartTime status')
    .limit(400);

  let capped = 0;
  for (const booking of rows) {
    const endAt = cappedClassEndDate(booking, new Date(booking.finishedAt));
    const finMs = new Date(booking.finishedAt).getTime();
    if (!Number.isFinite(finMs) || finMs <= endAt.getTime() + 60 * 1000) continue;
    booking.finishedAt = endAt;
    if (booking.sessionEndedAt && new Date(booking.sessionEndedAt).getTime() > endAt.getTime()) {
      booking.sessionEndedAt = endAt;
    }
    await booking.save();
    capped += 1;
  }
  if (capped) console.log(`⏰ Capped ${capped} class duration(s) to ${CLASS_MAX_MINUTES} minutes`);
  return capped;
}

module.exports = {
  autoEndOverlongClasses,
  capStoredClassDuration,
  applyCappedEnd,
};
