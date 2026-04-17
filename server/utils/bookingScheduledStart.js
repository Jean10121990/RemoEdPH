const { DateTime } = require('luxon');

/**
 * Canonical class start as UTC ISO string (matches teacher.js / index.js scheduling).
 * Prefers booking.dateTimeUtc; otherwise interprets date+time in teacher/student zone or Manila.
 */
function getScheduledStartTime(booking) {
  if (!booking) return null;
  if (booking.dateTimeUtc) {
    let utc = booking.dateTimeUtc;
    if (typeof utc === 'string') {
      utc = utc.trim();
      if (!/Z$/i.test(utc)) utc = `${utc}Z`;
    }
    const d = utc instanceof Date ? utc : new Date(utc);
    return Number.isNaN(d.getTime()) ? null : d.toISOString();
  }
  if (booking.date && booking.time) {
    const zone = booking.teacherLocalZone || booking.studentLocalZone || 'Asia/Manila';
    const t = String(booking.time);
    const timeNorm = t.length <= 5 ? `${t}:00` : t;
    const dt = DateTime.fromISO(`${booking.date}T${timeNorm}`, { zone });
    if (!dt.isValid) return null;
    return dt.toUTC().toISO();
  }
  return null;
}

function getBookingStartAsDate(booking) {
  const iso = getScheduledStartTime(booking);
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : d;
}

module.exports = { getScheduledStartTime, getBookingStartAsDate };
