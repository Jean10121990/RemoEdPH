/**
 * Optional daily email digest of unread in-app notifications.
 * Only users with notificationPrefs.digestEmail === true.
 */
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const StudentNotification = require('../models/StudentNotification');
const Notification = require('../models/Notification');
const { sendNotificationDigestEmail } = require('../emailService');
const { enrichNotificationList } = require('./notifyService');

async function buildDigestLines(list) {
  return enrichNotificationList(list)
    .slice(0, 15)
    .map((n) => {
      const when = n.createdAt
        ? new Date(n.createdAt).toLocaleString('en-PH', { timeZone: 'Asia/Manila' })
        : '';
      return `• [${n.actionable ? 'Action' : 'FYI'}] ${n.message} (${when})`;
    });
}

async function sendDailyNotificationDigests() {
  let sent = 0;
  const cutoff = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);

  const students = await Student.find({ 'notificationPrefs.digestEmail': true })
    .select('username email notificationPrefs')
    .limit(500)
    .lean();
  for (const s of students) {
    try {
      if (!s.email) continue;
      const list = await StudentNotification.find({
        studentId: s.username,
        read: false,
        createdAt: { $gte: cutoff },
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      if (!list.length) continue;
      const lines = await buildDigestLines(list);
      const result = await sendNotificationDigestEmail(s.email, s.username, lines, 'student');
      if (result && result.success) sent += 1;
    } catch (e) {
      console.warn('[digest] student', s.username, e.message || e);
    }
  }

  const teachers = await Teacher.find({ 'notificationPrefs.digestEmail': true })
    .select('teacherId username email notificationPrefs')
    .limit(500)
    .lean();
  for (const t of teachers) {
    try {
      const email = t.email || (String(t.teacherId || '').includes('@') ? t.teacherId : '');
      if (!email) continue;
      const ids = [t.teacherId, t.username].filter(Boolean);
      const list = await Notification.find({
        teacherId: { $in: ids },
        read: false,
        createdAt: { $gte: cutoff },
      })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();
      if (!list.length) continue;
      const lines = await buildDigestLines(list);
      const result = await sendNotificationDigestEmail(email, t.username || t.teacherId, lines, 'teacher');
      if (result && result.success) sent += 1;
    } catch (e) {
      console.warn('[digest] teacher', t.teacherId, e.message || e);
    }
  }

  if (sent > 0) console.log(`📧 Sent ${sent} notification digest email(s)`);
  return sent;
}

module.exports = { sendDailyNotificationDigests };
