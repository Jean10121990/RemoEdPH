// Script to update old bookings with missing classroomId
const mongoose = require('mongoose');
const db = require('./db');
const Booking = require('./models/Booking');
const Student = require('./models/Student');

async function updateOldBookings() {
  try {
    const bookings = await Booking.find({ $or: [ { classroomId: { $exists: false } }, { classroomId: '' }, { classroomId: null } ] });
    console.log(`Found ${bookings.length} bookings to update.`);
    let updated = 0;
    for (const booking of bookings) {
      // Count previous bookings for this student (including this one)
      const studentBookingCount = await Booking.countDocuments({ studentId: booking.studentId, _id: { $lte: booking._id } });
      // Use only username part before @ if email
      const usernamePart = booking.studentId.includes('@') ? booking.studentId.split('@')[0] : booking.studentId;
      // Format: YYYYMMDDHHMM-username-N
      const dateStr = booking.date.replace(/-/g, '');
      const timeStr = booking.time.replace(':', '');
      const classroomId = `${dateStr}${timeStr}${usernamePart}${studentBookingCount}`;
      booking.classroomId = classroomId;
      await booking.save();
      updated++;
      console.log(`Updated booking ${booking._id}: classroomId = ${classroomId}`);
    }
    console.log(`Done. Updated ${updated} bookings.`);
    process.exit(0);
  } catch (err) {
    console.error('Error updating bookings:', err);
    process.exit(1);
  }
}

updateOldBookings(); 