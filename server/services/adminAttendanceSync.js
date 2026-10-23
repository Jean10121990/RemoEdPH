const Admin = require('../models/Admin');
const AdminAttendance = require('../models/AdminAttendance');

/** Minimum hours per required workday (Monday to Friday) for the admin fee. */
const REQUIRED_SHIFT_HOURS = 6;

function resolveAttendanceStatus(totalHours, hasClockOut) {
  if (!hasClockOut) return 'clocked_in';
  const hours = Number(totalHours) || 0;
  if (hours >= REQUIRED_SHIFT_HOURS) return 'completed';
  return 'short_shift';
}

/**
 * Upsert admin_attendance from a TimeLog document (admin clock in/out).
 * @param {object} timeLog
 * @param {string} username
 */
async function syncAdminAttendanceFromTimeLog(timeLog, username) {
  if (!timeLog || !username) return null;
  const adminUsername = String(username).trim().toLowerCase();
  const admin = await Admin.findOne({ username: new RegExp('^' + escapeRe(adminUsername) + '$', 'i') })
    .select('_id username')
    .lean();

  const hours = Number(timeLog.totalHours) || 0;
  const hasOut = !!(timeLog.clockOut && timeLog.clockOut.timestamp);
  const status = resolveAttendanceStatus(hours, hasOut || timeLog.status === 'clocked-out');

  const payload = {
    adminId: admin ? admin._id : null,
    adminUsername: admin ? admin.username : adminUsername,
    date: timeLog.date,
    timeIn: timeLog.clockIn && timeLog.clockIn.timestamp ? new Date(timeLog.clockIn.timestamp) : null,
    timeOut: hasOut ? new Date(timeLog.clockOut.timestamp) : null,
    timeInLabel: (timeLog.clockIn && timeLog.clockIn.time) || '',
    timeOutLabel: (timeLog.clockOut && timeLog.clockOut.time) || '',
    totalHours: Math.round(hours * 100) / 100,
    status: timeLog.status === 'clocked-in' ? 'clocked_in' : status,
    /** Legacy field name: true when the day met REQUIRED_SHIFT_HOURS. */
    metEightHours: hours >= REQUIRED_SHIFT_HOURS,
    timeLogId: timeLog._id || null,
  };

  return AdminAttendance.findOneAndUpdate(
    { adminUsername: payload.adminUsername, date: payload.date },
    { $set: payload },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

function escapeRe(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const WEEKDAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Weekday of a YYYY-MM-DD calendar date (0 = Sunday), independent of server timezone. */
function weekdayOfYmd(ymd) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
}

function eachYmd(startYmd, endYmd) {
  const out = [];
  const [y, m, d] = String(startYmd).split('-').map(Number);
  const cur = new Date(Date.UTC(y, m - 1, d));
  for (let i = 0; i < 40; i++) {
    const s = cur.toISOString().slice(0, 10);
    if (s > endYmd) break;
    out.push(s);
    cur.setUTCDate(cur.getUTCDate() + 1);
  }
  return out;
}

/** Today's admin time-log day (midnight to midnight, Asia/Manila), same rule as admin clock-in. */
function phBusinessYmd(now = new Date(), cutoffHour = 0) {
  const hour = Number(
    new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Manila', hour: '2-digit', hour12: false }).format(now)
  ) % 24;
  const effective = hour < cutoffHour ? new Date(now.getTime() - 24 * 60 * 60 * 1000) : now;
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Manila' }).format(effective);
}

/**
 * Admin fee eligibility: every Monday to Friday in the cutoff needs a time-in with at least
 * REQUIRED_SHIFT_HOURS worked. Weekend days count toward hours but are not required.
 * Days after today are `upcoming`; today without enough hours yet is `today`.
 */
function evaluateWeekdayAttendance(rows, startYmd, endYmd, todayYmd = phBusinessYmd()) {
  const byDate = new Map();
  (rows || []).forEach((r) => {
    if (r && r.date) byDate.set(String(r.date), r);
  });
  const days = [];
  let requiredDays = 0;
  let metDays = 0;
  let missedDays = 0;
  let pendingDays = 0;
  eachYmd(startYmd, endYmd).forEach((date) => {
    const wd = weekdayOfYmd(date);
    if (wd === 0 || wd === 6) return;
    requiredDays += 1;
    const row = byDate.get(date);
    const hours = row ? Number(row.totalHours) || 0 : 0;
    const closed = !!(row && row.status !== 'clocked_in');
    let status;
    if (closed && hours >= REQUIRED_SHIFT_HOURS) status = 'met';
    else if (date > todayYmd) status = 'upcoming';
    else if (date === todayYmd) status = 'today';
    else if (!row) status = 'missing';
    else status = 'short';
    if (status === 'met') metDays += 1;
    else if (status === 'missing' || status === 'short') missedDays += 1;
    else pendingDays += 1;
    days.push({ date, weekday: WEEKDAY_NAMES[wd], hours: Math.round(hours * 100) / 100, status });
  });
  return {
    requiredDays,
    metDays,
    missedDays,
    pendingDays,
    eligible: requiredDays > 0 && metDays === requiredDays,
    onTrack: missedDays === 0,
    days,
  };
}

/** Closed Monday–Friday rows with at least minHours. Used for the Admin QA daily rate. */
function countClosedWeekdays(rows, startYmd, endYmd, minHours) {
  const need = Number(minHours) || 0;
  const byDate = new Map();
  (rows || []).forEach((r) => {
    if (r && r.date) byDate.set(String(r.date), r);
  });
  let paidDays = 0;
  eachYmd(startYmd, endYmd).forEach((date) => {
    const wd = weekdayOfYmd(date);
    if (wd === 0 || wd === 6) return;
    const row = byDate.get(date);
    if (!row || row.status === 'clocked_in') return;
    if ((Number(row.totalHours) || 0) < need) return;
    paidDays += 1;
  });
  return paidDays;
}

module.exports = {
  REQUIRED_SHIFT_HOURS,
  syncAdminAttendanceFromTimeLog,
  resolveAttendanceStatus,
  evaluateWeekdayAttendance,
  countClosedWeekdays,
  phBusinessYmd,
};
