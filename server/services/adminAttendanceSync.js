const Admin = require('../models/Admin');
const AdminAttendance = require('../models/AdminAttendance');

const REQUIRED_SHIFT_HOURS = 8;

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

module.exports = {
  REQUIRED_SHIFT_HOURS,
  syncAdminAttendanceFromTimeLog,
  resolveAttendanceStatus,
};
