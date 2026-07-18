const Student = require('../models/Student');
const CreditAudit = require('../models/CreditAudit');

async function findStudentForBooking(booking) {
  if (!booking || !booking.studentId) return null;
  return Student.findOne({
    $or: [{ username: booking.studentId }, { email: booking.studentId }],
  });
}

/**
 * Deduct exactly 1 credit when a class is completed or student is marked absent.
 * No reserve-on-book: deducts directly from creditBalance.
 * Mutates booking in memory; caller must persist the booking document.
 */
async function deductCreditOnClassOutcome(booking, descriptionPrefix = 'Class finished', opts = {}) {
  if (!booking || booking.creditConsumedAt) {
    return null;
  }
  const student = await findStudentForBooking(booking);
  if (!student) return null;
  const now = new Date();
  const isTrial = !!booking.isAssessmentFreeTrialBooking;
  const balance = Math.max(0, Number(student.creditBalance) || 0);

  if (!isTrial && balance < 1) {
    const err = new Error('No credits available for this booking');
    err.code = 'NO_CREDITS';
    throw err;
  }

  const planLabel = student.subscriptionPlan || '';
  const desc = `${descriptionPrefix} (${booking.date} ${booking.time})`;
  const balanceAfter = Math.max(0, balance - (isTrial && balance < 1 ? 0 : 1));

  const session = opts && opts.session ? opts.session : undefined;

  if (isTrial && balance < 1) {
    // Trial class with no paid balance: finalize booking flags only, no balance decrement.
    const trialSet = {
      accountStatus: 'trial_completed',
      trialCompletedAt: now,
      assessmentTrialCreditActive: false,
      hasFreeTrial: false,
    };
    await Student.updateOne({ _id: student._id }, { $set: trialSet }).session(session || null);
  } else {
    const update = {
      $inc: { creditBalance: -1, usedCredits: 1 },
      $push: {
        creditTransactions: {
          date: now,
          type: 'use',
          plan: planLabel,
          description: desc,
          credits: -1,
          balanceAfter,
          amountPaid: 0,
        },
        creditHistory: {
          date: now,
          plan: desc,
          credits: -1,
          amountPaid: 0,
          paymentId: '',
          entryType: 'usage',
          balanceAfter,
        },
      },
    };
    if (booking.isAssessmentFreeTrialBooking) {
      update.$set = {
        accountStatus: 'trial_completed',
        trialCompletedAt: now,
        assessmentTrialCreditActive: false,
        hasFreeTrial: false,
      };
    }

    const result = await Student.updateOne(
      { _id: student._id, creditBalance: { $gte: 1 } },
      update
    ).session(session || null);

    if (!result || result.modifiedCount === 0) {
      const err = new Error('No credits available for this booking');
      err.code = 'NO_CREDITS';
      throw err;
    }
  }

  const actorType = (opts && opts.actorType) || 'system';
  const actorId = (opts && opts.actorId) || '';
  try {
    await CreditAudit.create(
      [
        {
          studentId: student._id,
          bookingId: booking._id || null,
          deltaCredits: isTrial && balance < 1 ? 0 : -1,
          reason: descriptionPrefix,
          description: desc,
          actorType,
          actorId,
          meta: {
            date: booking.date,
            time: booking.time,
            wasTrial: !!booking.isAssessmentFreeTrialBooking,
          },
        },
      ],
      session ? { session } : undefined
    );
  } catch (auditErr) {
    console.error('[credit audit] failed:', auditErr.message || auditErr);
  }

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

/** @deprecated Alias — call sites still import the old name. */
async function consumeReservedCreditForBooking(booking, descriptionPrefix, opts) {
  return deductCreditOnClassOutcome(booking, descriptionPrefix, opts);
}

/**
 * Legacy no-op under no-reserve model (nothing was held at book time).
 * Still migrates any leftover reservedCredits for this student if present.
 */
async function releaseReservedCreditForBooking(booking, opts = {}) {
  if (!booking || booking.creditConsumedAt) {
    return null;
  }
  const student = await findStudentForBooking(booking);
  if (!student) return null;

  const safeReserved = Math.max(0, Number(student.reservedCredits) || 0);
  if (safeReserved > 0) {
    await Student.updateOne(
      { _id: student._id, reservedCredits: { $gte: 1 } },
      {
        $inc: { creditBalance: safeReserved },
        $set: { reservedCredits: 0 },
      }
    );
  }

  if (opts.logEmergencyRetained || opts.logEmergencyRefund) {
    const now = new Date();
    const balance = Math.max(0, Number(student.creditBalance) || 0) + safeReserved;
    const desc = 'Emergency Cancellation (Credit Retained)';
    await Student.updateOne(
      { _id: student._id },
      {
        $push: {
          creditTransactions: {
            date: now,
            type: 'adjustment',
            plan: '',
            description: desc,
            credits: 0,
            balanceAfter: balance,
            amountPaid: 0,
          },
          creditHistory: {
            date: now,
            plan: desc,
            credits: 0,
            amountPaid: 0,
            paymentId: '',
            entryType: 'adjustment',
            balanceAfter: balance,
          },
        },
      }
    );
  }

  booking.creditReservationReleasedAt = new Date();
  return student._id;
}

/**
 * Append Credit Retained ledger row without changing balance (emergency cancel).
 */
async function logEmergencyCreditRetained(booking) {
  const student = await findStudentForBooking(booking);
  if (!student) return null;
  const now = new Date();
  const balance = Math.max(0, Number(student.creditBalance) || 0);
  const desc = 'Emergency Cancellation (Credit Retained)';
  await Student.updateOne(
    { _id: student._id },
    {
      $push: {
        creditTransactions: {
          date: now,
          type: 'adjustment',
          plan: '',
          description: desc,
          credits: 0,
          balanceAfter: balance,
          amountPaid: 0,
        },
        creditHistory: {
          date: now,
          plan: desc,
          credits: 0,
          amountPaid: 0,
          paymentId: '',
          entryType: 'adjustment',
          balanceAfter: balance,
        },
      },
    }
  );
  return student._id;
}

module.exports = {
  findStudentForBooking,
  deductCreditOnClassOutcome,
  consumeReservedCreditForBooking,
  releaseReservedCreditForBooking,
  logEmergencyCreditRetained,
};
