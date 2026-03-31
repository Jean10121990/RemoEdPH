/**
 * Live classroom entry: allow joining at scheduled start minus 10 minutes (inclusive).
 * Uses the same zone convention as bookings (Asia/Manila default) when only date+time exist.
 */
const { DateTime } = require('luxon');

const EARLY_ENTRY_MINUTES = 10;

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
 * @param {object} booking - Mongoose doc or plain object
 * @param {number} [nowMs=Date.now()]
 * @returns {{ allowed: boolean, code?: string, opensAt?: string, scheduledStart?: string, message?: string, reason?: string }}
 */
function getClassroomEntryGate(booking, nowMs = Date.now()) {
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

module.exports = {
  EARLY_ENTRY_MINUTES,
  getScheduledStartMs,
  getClassroomEntryGate,
};
