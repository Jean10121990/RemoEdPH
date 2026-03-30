/**
 * Single source of truth for student credit figures returned to clients.
 * All arithmetic stays on the server; UIs must not recompute balances from raw fields.
 *
 * Field meanings (see Student model):
 * - creditBalance: pool field decremented when a credit is reserved for a booking (see teacher book-class)
 * - totalCredits: optional override for pool size (same precedence as Mongo $expr in book-class)
 * - reservedCredits: held for upcoming bookings
 * - usedCredits: lifetime consumed count
 * - totalCreditsEarned: lifetime purchased / credited top-ups
 */

const mongoose = require('mongoose');
const Student = require('../models/Student');

/**
 * Invariant (when totalCredits is not set): creditBalance + reservedCredits === totalCreditsEarned - usedCredits.
 * Heal creditBalance if history/earned drifted (e.g. partial updates).
 */
async function reconcileStudentCreditBalanceIfDrifted(studentId, studentLean) {
  if (!studentId || !studentLean) return false;
  if (!mongoose.Types.ObjectId.isValid(studentId)) return false;

  const tc = studentLean.totalCredits;
  if (tc != null && tc !== '' && Number.isFinite(Number(tc))) {
    return false;
  }

  const earned = Math.max(0, Number(studentLean.totalCreditsEarned) || 0);
  const used = Math.max(0, Number(studentLean.usedCredits) || 0);
  const reserved = Math.max(0, Number(studentLean.reservedCredits) || 0);
  const cb = Math.max(0, Number(studentLean.creditBalance) || 0);

  const expectedRemaining = Math.max(0, earned - used);
  const sumParts = cb + reserved;
  if (sumParts === expectedRemaining) return false;

  const targetCB = Math.max(0, expectedRemaining - reserved);
  if (targetCB === cb) return false;

  await Student.updateOne({ _id: studentId }, { $set: { creditBalance: targetCB } });
  return true;
}

/** Same pool base as book-class atomic reserve: totalCredits if set, else creditBalance */
function getCreditPoolTotal(student) {
  if (!student) return 0;
  const tc = student.totalCredits;
  if (tc != null && tc !== '' && Number.isFinite(Number(tc))) {
    return Math.max(0, Number(tc));
  }
  return Math.max(0, Number(student.creditBalance) || 0);
}

function getReservedCredits(student) {
  if (!student) return 0;
  return Math.max(0, Number(student.reservedCredits) || 0);
}

/** Credits the student can use to reserve another class (matches book-class $expr). */
function getAvailableBookingCredits(student) {
  const pool = getCreditPoolTotal(student);
  const reserved = getReservedCredits(student);
  return Math.max(pool - reserved, 0);
}

function buildStudentCreditApiResponse(student) {
  if (!student) return null;

  const pool = getCreditPoolTotal(student);
  const reserved = getReservedCredits(student);
  const used = Math.max(0, Number(student.usedCredits) || 0);
  const totalEarned = Math.max(0, Number(student.totalCreditsEarned) || 0);

  const availableBalance = Math.max(pool - reserved, 0);

  const totalPurchased =
    totalEarned > 0 ? totalEarned : Math.max(used + pool, pool);

  const credits = Array.isArray(student.creditTransactions)
    ? [...student.creditTransactions]
    : [];
  credits.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  const creditHistory = Array.isArray(student.creditHistory)
    ? [...student.creditHistory]
    : [];
  creditHistory.sort((a, b) => new Date(b.date || 0) - new Date(a.date || 0));

  return {
    success: true,
    balance: pool,
    availableBalance,
    totalCredits: pool,
    totalPurchased,
    reservedCredits: reserved,
    totalEarned: totalPurchased,
    used,
    usedCredits: used,
    subscriptionPlan: student.subscriptionPlan || null,
    subscriptionStatus: student.subscriptionStatus || null,
    paymentStatus: student.paymentStatus || null,
    creditHistory: creditHistory.map((c) => ({
      date: c.date,
      plan: c.plan,
      credits: c.credits,
      amountPaid: c.amountPaid,
      paymentId: c.paymentId || '',
    })),
    credits: credits.map((c) => ({
      date: c.date,
      type: c.type,
      plan: c.plan,
      description: c.description,
      credits: c.credits,
      balanceAfter: c.balanceAfter,
      amountPaid: c.amountPaid,
    })),
  };
}

module.exports = {
  buildStudentCreditApiResponse,
  getCreditPoolTotal,
  getReservedCredits,
  getAvailableBookingCredits,
  reconcileStudentCreditBalanceIfDrifted,
};
