/**
 * Single source of truth for student credit figures returned to clients.
 * All arithmetic stays on the server; UIs must not recompute balances from raw fields.
 *
 * Field meanings (see Student model):
 * - creditBalance: unreserved slice of the lesson pool (reserve moves 1 from here into reservedCredits)
 * - totalCredits: optional override for pool size (same precedence as Mongo $expr in book-class)
 * - reservedCredits: held for upcoming bookings
 * - usedCredits: lifetime consumed count
 * - totalCreditsEarned: lifetime purchased / credited top-ups
 */

const mongoose = require('mongoose');
const Student = require('../models/Student');
const {
  dedupeMergedCreditRows,
  filterLegacyPaymongoTransactionRows,
} = require('../creditLedgerRepair');

/**
 * Merge creditTransactions + creditHistory, dedupe (same lesson was written to both arrays),
 * and return rows still carrying `source` for internal ranking (strip before JSON).
 */
function buildUnifiedDedupedLedger(student) {
  if (!student) return [];

  const txs = Array.isArray(student.creditTransactions) ? student.creditTransactions : [];
  const hist = Array.isArray(student.creditHistory) ? student.creditHistory : [];

  const txRows = txs.map((tx) => ({
    date: tx.date,
    type: tx.type || (Number(tx.credits) < 0 ? 'use' : 'purchase'),
    plan: tx.plan,
    description: tx.description || tx.plan || '',
    credits: Number(tx.credits),
    balanceAfter: tx.balanceAfter != null ? tx.balanceAfter : null,
    amountPaid: tx.amountPaid != null ? Number(tx.amountPaid) : 0,
    paymentId: String(tx.paymentId || '').trim(),
    source: 'transaction',
  }));

  const filteredTx = filterLegacyPaymongoTransactionRows(txRows);

  const histRows = hist.map((h) => {
    const c = Number(h.credits);
    const entryType = String(h.entryType || '');
    const isUsage = entryType === 'usage' || c < 0;
    const isAdjustment = entryType === 'adjustment';
    let description;
    if (isAdjustment) {
      description = h.plan || h.description || 'Adjustment';
    } else if (c >= 0) {
      description = `Plan purchase (${h.plan || 'Subscription'})`;
    } else {
      description = `Lesson completed (${h.plan || 'Lesson'})`;
    }
    return {
      date: h.date,
      type: isUsage ? 'use' : isAdjustment ? 'adjustment' : 'purchase',
      plan: h.plan,
      description,
      credits: c,
      balanceAfter: h.balanceAfter != null ? h.balanceAfter : null,
      amountPaid: h.amountPaid != null ? Number(h.amountPaid) : 0,
      paymentId: String(h.paymentId || '').trim(),
      source: 'creditHistory',
    };
  });

  return dedupeMergedCreditRows([...filteredTx, ...histRows]);
}

/**
 * Set _displayBalanceAfter on each row = total lesson **pool** after that event
 * (same as getCreditPoolTotal: credits on hand including those held for bookings).
 * Walks newest→oldest from **current pool** so purchase rows show 22, 44, 66…
 * Using availableBalance (pool − reserved) wrongly made every purchase row look
 * like it was short by the current “held for bookings” amount.
 */
function assignDisplayBalancesForLedger(rows, endPoolTotal) {
  if (!Array.isArray(rows) || rows.length === 0) return;
  const asc = [...rows].sort((a, b) => {
    const ta = new Date(a.date || 0).getTime();
    const tb = new Date(b.date || 0).getTime();
    if (ta !== tb) return ta - tb;
    const sa = a.source === 'transaction' ? 0 : 1;
    const sb = b.source === 'transaction' ? 0 : 1;
    if (sa !== sb) return sa - sb;
    return 0;
  });
  let running = Math.max(0, Number(endPoolTotal) || 0);
  for (let i = asc.length - 1; i >= 0; i -= 1) {
    const r = asc[i];
    const c = Number(r.credits);
    const d = Number.isFinite(c) ? c : 0;
    r._displayBalanceAfter = running;
    running -= d;
  }
}

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

/**
 * Live lesson credit balance (no-reserve model).
 * Optional totalCredits override is ignored for booking gates; creditBalance is canonical.
 */
function getCreditPoolTotal(student) {
  if (!student) return 0;
  return Math.max(0, Number(student.creditBalance) || 0);
}

function getReservedCredits() {
  return 0;
}

/** Credits available to book another class (= live creditBalance). */
function getAvailableBookingCredits(student) {
  return getCreditPoolTotal(student);
}

function buildStudentCreditApiResponse(student) {
  if (!student) return null;

  const pool = getCreditPoolTotal(student);
  const reserved = 0;
  const storedUsed = Math.max(0, Number(student.usedCredits) || 0);
  const totalEarned = Math.max(0, Number(student.totalCreditsEarned) || 0);

  const availableBalance = pool;

  const unified = buildUnifiedDedupedLedger(student);
  assignDisplayBalancesForLedger(unified, pool);

  const ledgerUsedSum = unified.reduce((acc, r) => {
    const c = Number(r.credits);
    return acc + (c < 0 ? -c : 0);
  }, 0);
  const used = Math.max(ledgerUsedSum, storedUsed);

  const totalPurchased =
    totalEarned > 0 ? totalEarned : Math.max(used + pool, pool);

  const usages = unified.filter((r) => Number(r.credits) < 0);
  const purchases = unified.filter((r) => Number(r.credits) > 0);
  const adjustments = unified.filter(
    (r) =>
      String(r.type || '') === 'adjustment' ||
      (Number(r.credits) === 0 &&
        String(r.description || r.plan || '').indexOf('Emergency Cancellation') >= 0)
  );

  const credits = usages.map((r) => ({
    date: r.date,
    type: r.type,
    plan: r.plan,
    description: r.description,
    credits: r.credits,
    balanceAfter: r._displayBalanceAfter != null ? r._displayBalanceAfter : r.balanceAfter,
    amountPaid: r.amountPaid,
  }));

  const creditHistory = purchases
    .concat(adjustments)
    .map((c) => ({
      date: c.date,
      plan: c.plan,
      description: c.description || c.plan || '',
      type: c.type || 'purchase',
      credits: c.credits,
      amountPaid: c.amountPaid,
      paymentId: c.paymentId || '',
      balanceAfter: c._displayBalanceAfter != null ? c._displayBalanceAfter : c.balanceAfter,
    }));

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
    creditHistory,
    credits,
  };
}

module.exports = {
  buildStudentCreditApiResponse,
  getCreditPoolTotal,
  getReservedCredits,
  getAvailableBookingCredits,
  reconcileStudentCreditBalanceIfDrifted,
};
