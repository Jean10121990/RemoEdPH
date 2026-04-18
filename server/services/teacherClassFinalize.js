const { consumeReservedCreditForBooking } = require('./bookingCreditLedger');
const realtime = require('../realtime');
const mongoose = require('mongoose');

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

  const useTransactions =
    String(process.env.USE_TRANSACTIONS || '').toLowerCase() !== 'false';

  function isTransactionUnsupportedError(err) {
    const msg = String(err && (err.message || err)).toLowerCase();
    return (
      msg.includes('transaction numbers are only allowed') ||
      msg.includes('replica set') ||
      msg.includes('mongos') ||
      msg.includes('does not support transactions')
    );
  }

  if (!ledgerDone && useTransactions) {
    const session = await mongoose.startSession();
    try {
      await session.withTransaction(async () => {
        booking.$session(session);
        await consumeReservedCreditForBooking(booking, 'Class finished', {
          session,
          actorType: 'teacher',
          actorId: String(teacherId || ''),
        });
        await booking.save({ session });
      });
    } catch (txnErr) {
      if (isTransactionUnsupportedError(txnErr)) {
        await consumeReservedCreditForBooking(booking, 'Class finished', {
          actorType: 'teacher',
          actorId: String(teacherId || ''),
        });
        await booking.save();
      } else {
        throw txnErr;
      }
    } finally {
      session.endSession();
    }
  } else {
    if (!ledgerDone) {
      await consumeReservedCreditForBooking(booking, 'Class finished', {
        actorType: 'teacher',
        actorId: String(teacherId || ''),
      });
    }
    await booking.save();
  }
  await emitBookingsUpdatedForTeacher(teacherId, booking);
}

module.exports = {
  FEEDBACK_ROLE_TEACHER_TO_STUDENT,
  isBookingSessionFinalized,
  emitBookingsUpdatedForTeacher,
  finalizeBookingAfterTeacherFeedbackWrap,
};
