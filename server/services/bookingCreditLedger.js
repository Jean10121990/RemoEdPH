const Student = require('../models/Student');

async function findStudentForBooking(booking) {
  if (!booking || !booking.studentId) return null;
  return Student.findOne({
    $or: [{ username: booking.studentId }, { email: booking.studentId }],
  });
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
  const safeTotal = Number(student.totalCredits || 0);
  const nextReserved = Math.max(safeReserved - 1, 0);
  const nextTotal = Math.max(safeTotal - 1, 0);
  const nextAvailable = Math.max(nextTotal - nextReserved, 0);
  const planLabel = student.subscriptionPlan || '';
  const desc = `${descriptionPrefix} (${booking.date} ${booking.time})`;

  await Student.updateOne(
    { _id: student._id },
    {
      $set: {
        reservedCredits: nextReserved,
        totalCredits: nextTotal,
        creditBalance: nextAvailable,
      },
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

  booking.creditConsumedAt = now;
  booking.creditReservationReleasedAt = null;

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

  const safeTotal = Number(student.totalCredits || 0);
  const nextReserved = safeReserved - 1;
  const nextAvailable = Math.max(safeTotal - nextReserved, 0);

  await Student.updateOne(
    { _id: student._id },
    {
      $set: {
        reservedCredits: nextReserved,
        creditBalance: nextAvailable,
      },
    }
  );
  booking.creditReservationReleasedAt = new Date();
  return student._id;
}

module.exports = {
  findStudentForBooking,
  consumeReservedCreditForBooking,
  releaseReservedCreditForBooking,
};
