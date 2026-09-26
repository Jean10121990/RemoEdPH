/**
 * Deduct / release lesson credits for bookings.
 * Consumption burns FIFO credit lots (earliest expiresAt first).
 */
const mongoose = require('mongoose');
const Student = require('../models/Student');
const CreditAudit = require('../models/CreditAudit');
const { isMongoObjectId } = require('../utils/mongoObjectId');
const {
  ensureCreditLotsBackfilled,
  expireDueLotsInMemory,
  pickFifoLotId,
  syncSubscriptionFieldsFromLots,
  sumLotRemaining,
} = require('./creditLots');

async function findStudentForBooking(booking) {
  if (!booking || !booking.studentId) return null;
  const raw = String(booking.studentId).trim();
  if (!raw || raw === 'undefined' || raw === 'null') return null;
  const or = [{ username: raw }, { email: raw }, { email: raw.toLowerCase() }];
  if (isMongoObjectId(raw)) or.push({ _id: raw });
  return Student.findOne({ $or: or });
}

function attachSession(query, session) {
  return session ? query.session(session) : query;
}

async function persistExpiredLotsIfNeeded(student, now) {
  ensureCreditLotsBackfilled(student, now);
  const before = sumLotRemaining(student.creditLots);
  const expiredAmt = expireDueLotsInMemory(student, now);
  if (expiredAmt <= 0) return 0;
  const sync = syncSubscriptionFieldsFromLots(student, now);
  const after = sumLotRemaining(student.creditLots);
  const bal = Math.max(0, Number(student.creditBalance) || 0);
  const newBal = Math.min(bal, after);
  const dropped = Math.max(0, bal - newBal);
  await Student.updateOne(
    { _id: student._id },
    {
      $set: {
        creditLots: student.creditLots,
        creditBalance: newBal,
        subscriptionEndDate: sync.subscriptionEndDate,
        subscriptionPlan: sync.subscriptionPlan,
        subscriptionStatus: sync.subscriptionStatus,
        isSubscribed: sync.subscriptionStatus === 'active',
      },
      $inc: { expiredCredits: dropped || expiredAmt },
      $push: {
        creditHistory: {
          date: now,
          plan: 'Plan validity ended',
          credits: -(dropped || expiredAmt),
          amountPaid: 0,
          paymentId: `lot-expiry:${now.toISOString()}`,
          entryType: 'expiry',
          balanceAfter: newBal,
        },
      },
    }
  );
  student.creditBalance = newBal;
  void before;
  return dropped || expiredAmt;
}

/**
 * Deduct 1 unused credit when a class is completed or marked absent.
 * Burns the earliest-expiring active lot first (FIFO).
 */
async function deductCreditOnClassOutcome(booking, descriptionPrefix = 'Class finished', opts = {}) {
  if (!booking || booking.creditConsumedAt) {
    return null;
  }
  const student = await findStudentForBooking(booking);
  if (!student) return null;
  const now = new Date();
  const isTrial = !!booking.isAssessmentFreeTrialBooking;
  const session = opts && opts.session ? opts.session : undefined;

  await persistExpiredLotsIfNeeded(student, now);
  // Reload after possible expiry write
  const fresh = await attachSession(Student.findById(student._id), session);
  if (!fresh) return null;

  ensureCreditLotsBackfilled(fresh, now);
  const balance = Math.max(0, Number(fresh.creditBalance) || 0);
  const planLabel = fresh.subscriptionPlan || '';
  const desc = `${descriptionPrefix} (${booking.date} ${booking.time})`;
  const skipBalanceDecrement = balance < 1;
  const balanceAfter = skipBalanceDecrement ? balance : Math.max(0, balance - 1);
  const lotId = skipBalanceDecrement ? null : pickFifoLotId(fresh, now);

  if (isTrial && balance < 1) {
    const trialSet = {
      accountStatus: 'trial_completed',
      trialCompletedAt: now,
      assessmentTrialCreditActive: false,
      hasFreeTrial: false,
    };
    await attachSession(Student.updateOne({ _id: fresh._id }, { $set: trialSet }), session);
  } else if (balance < 1) {
    console.warn(
      '[credits] wrap-up with 0 unused credits; finalizing booking without deduct',
      String(booking._id || '')
    );
    await attachSession(
      Student.updateOne(
        { _id: fresh._id },
        {
          $inc: { usedCredits: 1 },
          $push: {
            creditTransactions: {
              date: now,
              type: 'use',
              plan: planLabel,
              description: `${desc} (booked class; unused credits already 0)`,
              credits: 0,
              balanceAfter: 0,
              amountPaid: 0,
            },
            creditHistory: {
              date: now,
              plan: desc,
              credits: 0,
              amountPaid: 0,
              paymentId: '',
              entryType: 'usage',
              balanceAfter: 0,
            },
          },
        }
      ),
      session
    );
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

    let result;
    if (lotId && mongoose.Types.ObjectId.isValid(lotId)) {
      update.$inc['creditLots.$[lot].creditsRemaining'] = -1;
      result = await attachSession(
        Student.updateOne(
          {
            _id: fresh._id,
            creditBalance: { $gte: 1 },
            creditLots: {
              $elemMatch: { _id: new mongoose.Types.ObjectId(lotId), creditsRemaining: { $gte: 1 } },
            },
          },
          update,
          { arrayFilters: [{ 'lot._id': new mongoose.Types.ObjectId(lotId), 'lot.creditsRemaining': { $gte: 1 } }] }
        ),
        session
      );
    } else {
      result = await attachSession(
        Student.updateOne({ _id: fresh._id, creditBalance: { $gte: 1 } }, update),
        session
      );
    }

    if (!result || result.modifiedCount === 0) {
      console.warn(
        '[credits] deduct raced to 0 balance; finalizing without decrement',
        String(booking._id || '')
      );
    } else {
      // Refresh subscription display fields from remaining lots
      const after = await Student.findById(fresh._id).lean();
      if (after) {
        ensureCreditLotsBackfilled(after, now);
        const sync = syncSubscriptionFieldsFromLots(after, now);
        await Student.updateOne(
          { _id: fresh._id },
          {
            $set: {
              subscriptionEndDate: sync.subscriptionEndDate,
              subscriptionPlan: sync.subscriptionPlan,
              subscriptionStatus: sync.subscriptionStatus,
              isSubscribed: sync.subscriptionStatus === 'active',
            },
          }
        );
      }
    }
  }

  const actorType = (opts && opts.actorType) || 'system';
  const actorId = (opts && opts.actorId) || '';
  try {
    await CreditAudit.create(
      [
        {
          studentId: fresh._id,
          bookingId: booking._id || null,
          deltaCredits: skipBalanceDecrement ? 0 : -1,
          reason: descriptionPrefix,
          description: desc,
          actorType,
          actorId,
          meta: {
            date: booking.date,
            time: booking.time,
            wasTrial: !!booking.isAssessmentFreeTrialBooking,
            skippedDecrement: !!skipBalanceDecrement,
            lotId: lotId || null,
          },
        },
      ],
      session ? { session } : undefined
    );
  } catch (auditErr) {
    console.error('[credit audit] failed:', auditErr.message || auditErr);
  }

  if (booking.isAssessmentFreeTrialBooking && fresh.email) {
    try {
      const emailService = require('../emailService');
      const greet =
        [fresh.firstName, fresh.lastName].filter(Boolean).join(' ').trim() ||
        (fresh.email ? String(fresh.email).split('@')[0] : '') ||
        'there';
      setImmediate(() => {
        emailService
          .sendLesson2InvitationEmail(fresh.email, greet)
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

  return fresh._id;
}

/** @deprecated Alias — call sites still import the old name. */
async function consumeReservedCreditForBooking(booking, descriptionPrefix, opts) {
  return deductCreditOnClassOutcome(booking, descriptionPrefix, opts);
}

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
