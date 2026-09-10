/**
 * Class starting-soon reminders + teacher-late alerts (in-app).
 * Idempotent via Booking.classReminderSentAt / teacherLateNotifiedAt / reminderSnoozeUntil.
 */
const Booking = require('../models/Booking');
const { notifyTeacher, notifyStudent } = require('./notifyService');
const { getBookingStartAsDate } = require('../utils/bookingScheduledStart');
const { isCancelledStatus } = require('../utils/bookingStatus');

const WINDOW_MIN_MS = 14 * 60 * 1000;
const WINDOW_MAX_MS = 31 * 60 * 1000;
const LATE_AFTER_MS = 5 * 60 * 1000;
const LATE_WINDOW_MS = 25 * 60 * 1000;

async function sendClassStartingReminders() {
  const now = Date.now();
  const from = new Date(now + WINDOW_MIN_MS);
  const to = new Date(now + WINDOW_MAX_MS);

  const candidates = await Booking.find({
    classReminderSentAt: null,
    status: { $nin: ['cancelled', 'cancelled_by_student_emergency', 'Completed', 'completed', 'absent'] },
    $and: [
      { $or: [{ reminderSnoozeUntil: null }, { reminderSnoozeUntil: { $lte: new Date(now) } }] },
      {
        $or: [
          { dateTimeUtc: { $gte: from, $lte: to } },
          {
            dateTimeUtc: null,
            date: {
              $gte: new Date(now - 24 * 3600 * 1000).toISOString().slice(0, 10),
              $lte: new Date(now + 2 * 24 * 3600 * 1000).toISOString().slice(0, 10),
            },
          },
        ],
      },
    ],
  })
    .limit(80)
    .lean();

  let sent = 0;
  for (const booking of candidates) {
    try {
      if (isCancelledStatus(booking.status)) continue;
      if (booking.reminderSnoozeUntil && new Date(booking.reminderSnoozeUntil).getTime() > now) continue;
      const start = getBookingStartAsDate(booking);
      if (!start) continue;
      const delta = start.getTime() - now;
      if (delta < WINDOW_MIN_MS || delta > WINDOW_MAX_MS) continue;

      const when = start.toLocaleString('en-PH', {
        timeZone: 'Asia/Manila',
        month: 'short',
        day: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      });
      const bid = String(booking._id);
      const claim = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          classReminderSentAt: null,
          $or: [{ reminderSnoozeUntil: null }, { reminderSnoozeUntil: { $lte: new Date(now) } }],
        },
        { $set: { classReminderSentAt: new Date(), reminderSnoozeUntil: null } },
        { new: true }
      );
      if (!claim) continue;

      await notifyStudent(
        booking.studentId,
        'reminder',
        `Your class starts soon (${when}). Please join on time.`,
        {
          bookingId: bid,
          actionUrl: '/student-waiting-room.html?bookingId=' + encodeURIComponent(bid),
          importance: 'actionable',
        }
      );
      await notifyTeacher(
        booking.teacherId,
        'reminder',
        `Class with ${booking.studentId} starts soon (${when}).`,
        {
          bookingId: bid,
          actionUrl: '/teacher-class-table.html',
          importance: 'actionable',
        }
      );
      sent += 1;
    } catch (e) {
      console.warn('[class-reminder]', booking && booking._id, e.message || e);
    }
  }
  if (sent > 0) console.log(`⏰ Sent ${sent} class starting-soon reminder(s)`);
  return sent;
}

/** Notify student once if teacher has not entered ~5–25 min after start. */
async function sendTeacherLateAlerts() {
  const now = Date.now();
  const from = new Date(now - LATE_WINDOW_MS);
  const to = new Date(now - LATE_AFTER_MS);

  const candidates = await Booking.find({
    teacherLateNotifiedAt: null,
    'attendance.teacherEntered': { $ne: true },
    status: { $nin: ['cancelled', 'cancelled_by_student_emergency', 'Completed', 'completed', 'absent'] },
    dateTimeUtc: { $gte: from, $lte: to },
  })
    .limit(40)
    .lean();

  let sent = 0;
  for (const booking of candidates) {
    try {
      if (isCancelledStatus(booking.status)) continue;
      const start = getBookingStartAsDate(booking);
      if (!start) continue;
      const lateFor = now - start.getTime();
      if (lateFor < LATE_AFTER_MS || lateFor > LATE_WINDOW_MS) continue;

      const claim = await Booking.findOneAndUpdate(
        {
          _id: booking._id,
          teacherLateNotifiedAt: null,
          'attendance.teacherEntered': { $ne: true },
        },
        { $set: { teacherLateNotifiedAt: new Date() } },
        { new: true }
      );
      if (!claim) continue;

      const bid = String(booking._id);
      await notifyStudent(
        booking.studentId,
        'teacher-late',
        `Your teacher has not joined yet for the class scheduled at ${booking.time}. You can wait in the waiting room or report an issue.`,
        {
          bookingId: bid,
          actionUrl: '/student-waiting-room.html?bookingId=' + encodeURIComponent(bid),
          importance: 'actionable',
        }
      );
      sent += 1;
    } catch (e) {
      console.warn('[teacher-late]', booking && booking._id, e.message || e);
    }
  }
  if (sent > 0) console.log(`⏰ Sent ${sent} teacher-late alert(s)`);
  return sent;
}

async function runClassNotificationJobs() {
  const a = await sendClassStartingReminders();
  const b = await sendTeacherLateAlerts();
  const c = await sendTrialEndingAlerts();
  return { reminders: a, late: b, trialEnding: c };
}

/** Soft in-app nudge when assessment trial credit is still unused after ~20h. */
async function sendTrialEndingAlerts() {
  const Student = require('../models/Student');
  const since = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const until = new Date(Date.now() - 20 * 60 * 60 * 1000);
  const students = await Student.find({
    assessmentTrialCreditActive: true,
    assessmentTrialGrantedAt: { $gte: since, $lte: until },
    trialEndingNotifiedAt: null,
  })
    .select('username assessmentTrialGrantedAt')
    .limit(40)
    .lean();

  let sent = 0;
  for (const s of students) {
    try {
      const claim = await Student.findOneAndUpdate(
        { _id: s._id, trialEndingNotifiedAt: null, assessmentTrialCreditActive: true },
        { $set: { trialEndingNotifiedAt: new Date() } },
        { new: true }
      );
      if (!claim) continue;
      await notifyStudent(
        s.username,
        'trial-ending',
        'Your free trial Lesson 1 is still available — book soon so you don’t miss it.',
        { actionUrl: '/student-book.html', importance: 'actionable' }
      );
      sent += 1;
    } catch (e) {
      console.warn('[trial-ending]', s.username, e.message || e);
    }
  }
  return sent;
}

module.exports = {
  sendClassStartingReminders,
  sendTeacherLateAlerts,
  sendTrialEndingAlerts,
  runClassNotificationJobs,
};
