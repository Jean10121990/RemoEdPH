const Student = require('../models/Student');
const { sendLesson1FeedbackReadyEmail } = require('../emailService');

/**
 * After teacher submits Lesson 1 feedback, notify the student (by booking username/email).
 */
async function notifyStudentLesson1FeedbackReady(booking) {
  if (!booking || !booking.studentId) return;
  const sid = String(booking.studentId).trim();
  if (!sid) return;
  let student =
    (await Student.findOne({ username: sid }).lean()) ||
    (await Student.findOne({ email: new RegExp(`^${escapeRegex(sid)}$`, 'i') }).lean());
  if (!student || !student.email) return;
  const greet =
    [student.firstName, student.lastName].filter(Boolean).join(' ').trim() ||
    (student.email ? String(student.email).split('@')[0] : '') ||
    'there';
  const base = (process.env.FRONTEND_URL || 'http://localhost:5000').replace(/\/$/, '');
  const dashboardUrl = `${base}/student-dashboard.html`;
  const plansUrl = `${base}/index.html#plans`;
  await sendLesson1FeedbackReadyEmail(student.email, greet, dashboardUrl, plansUrl);
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

module.exports = { notifyStudentLesson1FeedbackReady };
