const Student = require('./models/Student');

/**
 * Available credits = pool minus holds for upcoming classes.
 * @param {import('mongoose').Document | object} student
 */
function availableLessonCredits(student) {
  const bal = Number(student.creditBalance) || 0;
  const res = Number(student.reservedCredits) || 0;
  return Math.max(0, bal - res);
}

/**
 * When a booking is cancelled before completion, release one reserved credit.
 * @param {import('mongoose').Document} booking
 */
async function releaseReservedCreditForCancelledBooking(booking) {
  if (!booking || !booking.creditsReserved || booking.creditsFinalized) {
    return { ok: true, skipped: true };
  }
  const student = await Student.findOne({ username: booking.studentId });
  if (!student) {
    return { ok: false, error: 'Student not found' };
  }
  const updated = await Student.findOneAndUpdate(
    { _id: student._id, reservedCredits: { $gte: 1 } },
    { $inc: { reservedCredits: -1 } },
    { new: true }
  );
  if (!updated) {
    console.warn(
      '[lessonCredits] releaseReserved: reservedCredits was 0 for student',
      student._id,
      'booking',
      booking._id
    );
  }
  return { ok: true };
}

/**
 * When teacher marks class finished: consume reserved credit + deduct pool + log usage.
 * @param {import('mongoose').Document} booking
 */
async function finalizeLessonCreditsOnCompletion(booking) {
  if (!booking || !booking.creditsReserved || booking.creditsFinalized) {
    return { ok: true, skipped: true };
  }
  const student = await Student.findOne({ username: booking.studentId });
  if (!student) {
    return { ok: false, error: 'Student not found' };
  }

  const updated = await Student.findOneAndUpdate(
    { _id: student._id, reservedCredits: { $gte: 1 } },
    { $inc: { reservedCredits: -1, creditBalance: -1, usedCredits: 1 } },
    { new: true }
  );
  if (!updated) {
    return {
      ok: false,
      error: 'Could not finalize lesson credits (no reserved credit to apply).'
    };
  }

  const balanceAfter = Number(updated.creditBalance) || 0;

  await Student.updateOne(
    { _id: student._id },
    {
      $push: {
        creditHistory: {
          date: new Date(),
          entryType: 'usage',
          plan: booking.lesson || 'Lesson',
          credits: 1,
          amountPaid: 0,
          paymentId: String(booking._id),
          balanceAfter
        }
      }
    }
  );

  booking.creditsFinalized = true;
  await booking.save();

  return { ok: true };
}

module.exports = {
  availableLessonCredits,
  releaseReservedCreditForCancelledBooking,
  finalizeLessonCreditsOnCompletion
};
