/**
 * One-off: write lessonFocus "balanced" on bookings that do not have it yet.
 * Do not run this against production unless you were asked to.
 * Usage: ALLOW_LESSON_FOCUS_MIGRATE=1 node scripts/migrate-lesson-focus.js
 */
if (process.env.ALLOW_LESSON_FOCUS_MIGRATE !== '1') {
  console.error('Refusing to run. Set ALLOW_LESSON_FOCUS_MIGRATE=1 when you mean to update bookings.');
  process.exit(1);
}

const mongoose = require('mongoose');
const { connectDB } = require('../server/db');
const Booking = require('../server/models/Booking');

(async () => {
  await connectDB();
  const result = await Booking.updateMany(
    { $or: [{ lessonFocus: { $exists: false } }, { lessonFocus: null }, { lessonFocus: '' }] },
    { $set: { lessonFocus: 'balanced' } }
  );
  console.log('Bookings updated:', result.modifiedCount || result.nModified || 0);
  await mongoose.disconnect();
})().catch((err) => {
  console.error(err && err.message ? err.message : err);
  process.exit(1);
});
