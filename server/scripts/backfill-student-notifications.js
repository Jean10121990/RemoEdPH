/**
 * One-shot: backfill StudentNotification rows from recent Booking activity
 * so the student bell shows real book/cancel history (last 31 days).
 * Idempotent via bookingId + type.
 */
require('dotenv').config();
const path = require('path');
const mongoose = require('mongoose');
// Load .env from repo root when run from server/scripts
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const { connectDB } = require('../db');

(async () => {
  await connectDB();
  const Booking = require('../models/Booking');
  const StudentNotification = require('../models/StudentNotification');
  const { notifyStudent, resolveStudentUsername } = require('../services/notifyService');
  const { isCancelledStatus } = require('../utils/bookingStatus');

  const cutoff = new Date(Date.now() - 31 * 24 * 60 * 60 * 1000);
  const bookings = await Booking.find({
    $or: [{ createdAt: { $gte: cutoff } }, { date: { $gte: cutoff.toISOString().slice(0, 10) } }],
  })
    .sort({ createdAt: -1 })
    .limit(500)
    .lean();

  console.log('Candidates:', bookings.length);
  let created = 0;
  let skipped = 0;

  for (const b of bookings) {
    const username = await resolveStudentUsername(b.studentId);
    if (!username) {
      skipped += 1;
      continue;
    }
    const bid = String(b._id);
    const cancelled = isCancelledStatus(b.status);
    const type = cancelled ? 'cancel' : 'booking';
    const existing = await StudentNotification.findOne({ bookingId: bid, type, studentId: username }).lean();
    if (existing) {
      skipped += 1;
      continue;
    }
    const when = `${b.date || ''} ${b.time || ''}`.trim();
    const message = cancelled
      ? `Your class on ${when} was cancelled.`
      : `Your class is confirmed for ${when}.`;
    const doc = await notifyStudent(username, type, message, {
      bookingId: bid,
      actionUrl: cancelled ? '/student-book.html' : '/student-dashboard.html',
      meta: { backfill: true },
    });
    if (doc) created += 1;
    else skipped += 1;
  }

  const total = await StudentNotification.countDocuments({});
  console.log({ created, skipped, studentNotificationTotal: total });
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
