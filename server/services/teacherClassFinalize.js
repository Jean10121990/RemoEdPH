const { consumeReservedCreditForBooking } = require('./bookingCreditLedger');
const realtime = require('../realtime');

const FEEDBACK_ROLE_TEACHER_TO_STUDENT = 'teacher_to_student';

function isBookingSessionFinalized(booking) {
  if (!booking) return false;
  return (
    String(booking.status || '').toLowerCase() === 'completed' &&
    booking.attendance &&
    booking.attendance.classCompleted === true &&
    !!booking.creditConsumedAt
  );
}

async function emitBookingsUpdatedForTeacher(teacherId, booking) {
  try {
    realtime.emitAll('bookingsUpdated', {
      teacherId,
      bookingId: booking._id.toString(),
      date: booking.date,
      time: booking.time,
      status: booking.status,
      ts: Date.now(),
    });
  } catch (emitErr) {
    console.warn('bookingsUpdated emit:', emitErr);
  }
}

/**
 * Marks booking completed for fees and consumes reserved credit — only after teacher wrap-up feedback exists.
 */
async function finalizeBookingAfterTeacherFeedbackWrap(booking, teacherId) {
  const st = String(booking.status || '').toLowerCase();
  if (['absent', 'cancelled', 'canceled'].includes(st)) {
    throw new Error('Booking cannot be finalized in this state');
  }
  const ledgerDone =
    !!booking.creditConsumedAt &&
    booking.attendance &&
    booking.attendance.classCompleted === true;

  booking.status = 'completed';
  booking.attendance = booking.attendance || {};
  booking.attendance.classCompleted = true;
  if (!booking.finishedAt) {
    booking.finishedAt = new Date();
  }

  if (!ledgerDone) {
    await consumeReservedCreditForBooking(booking, 'Class finished');
  }
  await booking.save();
  await emitBookingsUpdatedForTeacher(teacherId, booking);
}

module.exports = {
  FEEDBACK_ROLE_TEACHER_TO_STUDENT,
  isBookingSessionFinalized,
  emitBookingsUpdatedForTeacher,
  finalizeBookingAfterTeacherFeedbackWrap,
};
