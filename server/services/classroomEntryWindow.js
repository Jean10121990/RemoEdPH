/**
 * Live classroom entry: allow joining at scheduled start minus 10 minutes (inclusive).
 * Uses the same zone convention as bookings (Asia/Manila default) when only date+time exist.
 */
const { DateTime } = require('luxon');

const EARLY_ENTRY_MINUTES = 10;
/** Live class hard stop. A closed tab must not leave the session open for hours. */
const CLASS_MAX_MINUTES = 40;

function getScheduledStartMs(booking) {
  if (!booking) return null;
  if (booking.dateTimeUtc) {
    let utc = booking.dateTimeUtc;
    if (typeof utc === 'string') {
      utc = utc.trim();
      if (!/Z$/i.test(utc)) utc += 'Z';
    }
    const d = utc instanceof Date ? utc : new Date(utc);
    const t = d.getTime();
    return Number.isFinite(t) ? t : null;
  }
  if (booking.scheduledStartTime) {
    let s = String(booking.scheduledStartTime).trim();
    if (s && !/Z$/i.test(s)) s += 'Z';
    const t = new Date(s).getTime();
    if (Number.isFinite(t)) return t;
  }
  if (booking.date && booking.time) {
    const zone = booking.teacherLocalZone || booking.studentLocalZone || 'Asia/Manila';
    const timeNorm = String(booking.time).trim();
    const withSec = timeNorm.length <= 5 ? `${timeNorm}:00` : timeNorm;
    const dt = DateTime.fromISO(`${booking.date}T${withSec}`, { zone });
    if (!dt.isValid) return null;
    return dt.toUTC().toMillis();
  }
  return null;
}

/**
 * True when the live session was finished / finalized — no re-entry.
 * @param {object} booking
 */
function isClassroomSessionEnded(booking) {
  if (!booking) return false;
  const st = String(booking.status || '').toLowerCase();
  if (st === 'pending_feedback' || st === 'completed') return true;
  if (booking.sessionEndedAt) return true;
  if (booking.finishedAt) return true;
  if (booking.attendance && booking.attendance.classCompleted) return true;
  return false;
}

/**
 * @param {object} booking - Mongoose doc or plain object
 * @param {number} [nowMs=Date.now()]
 * @returns {{ allowed: boolean, code?: string, opensAt?: string, scheduledStart?: string, message?: string, reason?: string }}
 */
function getClassroomEntryGate(booking, nowMs = Date.now()) {
  if (isClassroomSessionEnded(booking)) {
    return {
      allowed: false,
      code: 'SESSION_ENDED',
      message:
        'This live classroom session has already ended. You cannot re-enter this time slot.',
    };
  }
  const startMs = getScheduledStartMs(booking);
  if (startMs == null) {
    return { allowed: true, reason: 'no_schedule' };
  }
  const earliestMs = startMs - EARLY_ENTRY_MINUTES * 60 * 1000;
  if (nowMs < earliestMs) {
    return {
      allowed: false,
      code: 'TOO_EARLY',
      opensAt: new Date(earliestMs).toISOString(),
      scheduledStart: new Date(startMs).toISOString(),
      message: `Class opens ${EARLY_ENTRY_MINUTES} minutes before the start time.`,
    };
  }
  return {
    allowed: true,
    scheduledStart: new Date(startMs).toISOString(),
    opensAt: new Date(earliestMs).toISOString(),
  };
}

/** Scheduled start plus 40 minutes. Null when the booking has no start time. */
function classHardEndDate(booking) {
  const startMs = getScheduledStartMs(booking);
  if (startMs == null) return null;
  return new Date(startMs + CLASS_MAX_MINUTES * 60 * 1000);
}

/**
 * Clock used when a session ends. Never later than the 40-minute mark,
 * so a late Finish click cannot store a multi-hour duration.
 */
function cappedClassEndDate(booking, now = new Date()) {
  const hard = classHardEndDate(booking);
  if (!hard) return now;
  return now.getTime() > hard.getTime() ? hard : now;
}

module.exports = {
  EARLY_ENTRY_MINUTES,
  CLASS_MAX_MINUTES,
  getScheduledStartMs,
  isClassroomSessionEnded,
  getClassroomEntryGate,
  classHardEndDate,
  cappedClassEndDate,
};
