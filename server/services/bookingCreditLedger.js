const Student = require('../models/Student');

async function findStudentForBooking(booking) {
  if (!booking || !booking.studentId) return null;
  return Student.findOne({
    $or: [{ username: booking.studentId }, { email: booking.studentId }],
  });
}

function coalesceLessonPool(student) {
  const cb = Math.max(0, Number(student.creditBalance) || 0);
  const res = Math.max(0, Number(student.reservedCredits) || 0);
  const tcRaw = student.totalCredits;
  const tc = tcRaw == null || tcRaw === '' ? null : Number(tcRaw);
  if (Number.isFinite(tc) && tc > 0) {
    return { poolTotal: tc, reserved: res, mode: 'totalCredits' };
  }
  return { poolTotal: cb + res, reserved: res, mode: 'balance' };
}

/**
 * Convert one reserved credit into a used lesson credit (MongoDB updates only).
 * Mutates booking in memory; caller must persist the booking document.
 */
async function consumeReservedCreditForBooking(booking, descriptionPrefix = 'Class finished') {
  if (!booking || booking.creditConsumedAt || booking.creditReservationReleasedAt) {
    return null;
  }
  const student = await findStudentForBooking(booking);
  if (!student) return null;
  const now = new Date();
  const safeReserved = Number(student.reservedCredits || 0);
  if (safeReserved <= 0) return student._id;
  const { poolTotal, reserved, mode } = coalesceLessonPool(student);
  const nextReserved = Math.max(reserved - 1, 0);
  const nextPoolTotal = Math.max(poolTotal - 1, 0);
  const nextAvailable = Math.max(nextPoolTotal - nextReserved, 0);
  const planLabel = student.subscriptionPlan || '';
  const desc = `${descriptionPrefix} (${booking.date} ${booking.time})`;

  const setDoc = {
    reservedCredits: nextReserved,
    creditBalance: nextAvailable,
  };
  if (mode === 'totalCredits') {
    setDoc.totalCredits = nextPoolTotal;
  }
  if (booking.isAssessmentFreeTrialBooking) {
    setDoc.accountStatus = 'trial_completed';
    setDoc.trialCompletedAt = now;
    setDoc.assessmentTrialCreditActive = false;
    setDoc.hasFreeTrial = false;
  }

  await Student.updateOne(
    { _id: student._id },
    {
      $set: setDoc,
      $inc: { usedCredits: 1 },
      $push: {
        creditTransactions: {
          date: now,
          type: 'use',
          plan: planLabel,
          description: desc,
          credits: -1,
          balanceAfter: nextAvailable,
          amountPaid: 0,
        },
        creditHistory: {
          date: now,
          plan: planLabel,
          credits: -1,
          amountPaid: 0,
          paymentId: '',
        },
      },
    }
  );

  if (booking.isAssessmentFreeTrialBooking && student.email) {
    try {
      const emailService = require('../emailService');
      const greet =
        [student.firstName, student.lastName].filter(Boolean).join(' ').trim() ||
        (student.email ? String(student.email).split('@')[0] : '') ||
        'there';
      setImmediate(() => {
        emailService
          .sendLesson2InvitationEmail(student.email, greet)
          .catch((err) =>
            console.error('[lesson2 invite] email failed:', err.message || err)
          );
      });
    } catch (e) {
      console.error('[trial conversion] could not queue email:', e.message || e);
    }
  }

  booking.creditConsumedAt = now;
  booking.creditReservationReleasedAt = null;
  booking.creditsFinalized = true;

  return student._id;
}

async function releaseReservedCreditForBooking(booking) {
  if (!booking || booking.creditConsumedAt || booking.creditReservationReleasedAt) {
    return null;
  }
  const student = await findStudentForBooking(booking);
  if (!student) return null;
  const safeReserved = Number(student.reservedCredits || 0);
  if (safeReserved <= 0) return student._id;

  await Student.updateOne(
    { _id: student._id, reservedCredits: { $gte: 1 } },
    { $inc: { reservedCredits: -1, creditBalance: 1 } }
  );
  booking.creditReservationReleasedAt = new Date();
  return student._id;
}

module.exports = {
  findStudentForBooking,
  consumeReservedCreditForBooking,
  releaseReservedCreditForBooking,
};
