/**
 * Pure rules for attendance exceptions. No database.
 * Default close is 07:00 Asia/Manila the morning after the business date,
 * which matches the existing 7:00 AM business-day cutoff and covers overnight work.
 * A system close is not verified working time.
 */
const { DateTime } = require('luxon');

const BLOCKING_STATUSES = ['PENDING_REVIEW', 'NEEDS_CLARIFICATION', 'REJECTED'];
const OPEN_REVIEW_STATUSES = ['PENDING_REVIEW', 'NEEDS_CLARIFICATION'];
const CLASSIFICATIONS = ['ATTENDANCE_EXCEPTION', 'CONFIRMED_NEGLIGENCE', 'EXCUSED', 'DISMISSED'];
const STATUSES = ['PENDING_REVIEW', 'NEEDS_CLARIFICATION', 'APPROVED', 'REJECTED', 'CANCELLED'];

function attendanceConfig(env = process.env) {
  const zone = String(env.ATTENDANCE_TIMEZONE || 'Asia/Manila').trim() || 'Asia/Manila';
  const closeHour = Number(env.ATTENDANCE_CLOSE_HOUR);
  const reviewHours = Number(env.ATTENDANCE_REVIEW_SLA_HOURS);
  return {
    zone: DateTime.now().setZone(zone).isValid ? zone : 'Asia/Manila',
    closeHour: Number.isFinite(closeHour) && closeHour >= 0 && closeHour <= 23 ? closeHour : 7,
    reviewSlaHours: Number.isFinite(reviewHours) && reviewHours > 0 ? reviewHours : 24,
    provisionalTimeIn: false,
  };
}

function cutoffForAttendanceDate(ymd, cfg) {
  const config = cfg || attendanceConfig();
  const day = DateTime.fromISO(String(ymd || ''), { zone: config.zone });
  if (!day.isValid) return null;
  return day.plus({ days: 1 }).set({
    hour: config.closeHour,
    minute: 0,
    second: 0,
    millisecond: 0,
  });
}

function formatPhLabel(date, zone) {
  const dt = date instanceof DateTime ? date : DateTime.fromJSDate(new Date(date), { zone: zone || 'Asia/Manila' });
  if (!dt.isValid) return '';
  return dt.setZone(zone || 'Asia/Manila').toFormat('hh:mm:ss a');
}

function isBlockingStatus(status) {
  return BLOCKING_STATUSES.indexOf(String(status || '')) !== -1;
}

/**
 * Reported time-out on the attendance business date, or the next calendar morning for overnight shifts.
 * @returns {{ ok: true, at: DateTime } | { ok: false, message: string }}
 */
function parseReportedTimeout({ attendanceDate, clockIn, reportedHm, now, zone }) {
  const z = zone || 'Asia/Manila';
  const hm = String(reportedHm || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(hm)) {
    return { ok: false, message: 'Enter the actual time-out as HH:MM.' };
  }
  const parts = hm.split(':');
  const hour = Number(parts[0]);
  const minute = Number(parts[1]);
  if (hour > 23 || minute > 59) {
    return { ok: false, message: 'That time-out is not a valid clock time.' };
  }
  const day = DateTime.fromISO(String(attendanceDate || ''), { zone: z });
  if (!day.isValid) return { ok: false, message: 'Attendance date is missing.' };
  let at = day.set({ hour, minute, second: 0, millisecond: 0 });
  const start = DateTime.fromJSDate(new Date(clockIn), { zone: z });
  if (!start.isValid) return { ok: false, message: 'Original time-in is missing.' };
  if (at <= start) at = at.plus({ days: 1 });
  if (at <= start) return { ok: false, message: 'Actual time-out must be after the original time-in.' };
  if (at.diff(start, 'hours').hours > 18) {
    return { ok: false, message: 'Actual time-out is more than 18 hours after time-in. Check the time.' };
  }
  const current = now ? DateTime.fromJSDate(new Date(now), { zone: z }) : DateTime.now().setZone(z);
  if (at > current.plus({ minutes: 2 })) {
    return { ok: false, message: 'Actual time-out cannot be in the future.' };
  }
  return { ok: true, at };
}

function reviewerIsEmployee(reviewerUsername, workerId) {
  const reviewer = String(reviewerUsername || '').trim().toLowerCase();
  const worker = String(workerId || '').trim().toLowerCase();
  if (!reviewer || !worker) return true;
  if (worker === reviewer) return true;
  if (worker === 'admin:' + reviewer) return true;
  return false;
}

function releaseAllowed(status) {
  return status === 'APPROVED' || status === 'CANCELLED';
}

module.exports = {
  BLOCKING_STATUSES,
  OPEN_REVIEW_STATUSES,
  CLASSIFICATIONS,
  STATUSES,
  attendanceConfig,
  cutoffForAttendanceDate,
  formatPhLabel,
  isBlockingStatus,
  parseReportedTimeout,
  reviewerIsEmployee,
  releaseAllowed,
};
