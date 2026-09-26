/**
 * Per-plan credit lots: each purchase is its own validity window.
 * Consumption is FIFO by expiresAt (then purchasedAt) — earlier plans burn first.
 * When a lot's window ends, only that lot's remaining credits expire.
 */
const mongoose = require('mongoose');
const {
  normalizePlanId,
  getPlanDurationMonths,
  creditsForPlan,
} = require('../config/planCredits');

function toDate(value) {
  if (!value) return null;
  const d = value instanceof Date ? value : new Date(value);
  return Number.isNaN(d.getTime()) ? null : d;
}

function lotExpiresAtFromPurchase(purchasedAt, planId) {
  const start = toDate(purchasedAt) || new Date();
  const end = new Date(start);
  end.setMonth(end.getMonth() + getPlanDurationMonths(planId));
  return end;
}

function buildCreditLot({
  planId,
  planLabel,
  credits,
  purchasedAt,
  expiresAt,
  paymentId,
}) {
  const id = normalizePlanId(planId) || String(planId || '').toLowerCase() || 'plan';
  const cfg = creditsForPlan(id);
  const n = Math.max(0, Number(credits) || 0);
  const boughtAt = toDate(purchasedAt) || new Date();
  return {
    _id: new mongoose.Types.ObjectId(),
    planId: id,
    planLabel: planLabel || (cfg && cfg.label) || id,
    creditsPurchased: n,
    creditsRemaining: n,
    purchasedAt: boughtAt,
    expiresAt: toDate(expiresAt) || lotExpiresAtFromPurchase(boughtAt, id),
    paymentId: String(paymentId || ''),
    expiredAt: null,
  };
}

/** Active = remaining > 0 and not past expiresAt (and not already marked expired). */
function isLotActive(lot, now = new Date()) {
  if (!lot) return false;
  if (lot.expiredAt) return false;
  const rem = Math.max(0, Number(lot.creditsRemaining) || 0);
  if (rem <= 0) return false;
  const exp = toDate(lot.expiresAt);
  if (exp && exp.getTime() <= now.getTime()) return false;
  return true;
}

function sortLotsFifo(lots) {
  return [...(lots || [])].sort((a, b) => {
    const ea = toDate(a.expiresAt);
    const eb = toDate(b.expiresAt);
    const ta = ea ? ea.getTime() : Number.MAX_SAFE_INTEGER;
    const tb = eb ? eb.getTime() : Number.MAX_SAFE_INTEGER;
    if (ta !== tb) return ta - tb;
    const pa = toDate(a.purchasedAt);
    const pb = toDate(b.purchasedAt);
    return (pa ? pa.getTime() : 0) - (pb ? pb.getTime() : 0);
  });
}

function sumLotRemaining(lots) {
  return (lots || []).reduce((s, l) => s + Math.max(0, Number(l.creditsRemaining) || 0), 0);
}

/**
 * If student has balance but no lots (legacy), synthesize one lot from
 * subscriptionEndDate / subscriptionPlan so FIFO + expiry still work.
 */
function ensureCreditLotsBackfilled(student, now = new Date()) {
  if (!student) return { student, created: false };
  const lots = Array.isArray(student.creditLots) ? student.creditLots : [];
  if (lots.length > 0) {
    student.creditLots = lots;
    return { student, created: false };
  }
  const balance = Math.max(0, Number(student.creditBalance) || 0);
  if (balance <= 0 && !student.subscriptionEndDate) {
    student.creditLots = [];
    return { student, created: false };
  }
  if (balance <= 0) {
    student.creditLots = [];
    return { student, created: false };
  }
  const planId = normalizePlanId(student.subscriptionPlan) || 'summit';
  const cfg = creditsForPlan(planId);
  const purchasedAt = toDate(student.subscriptionStartDate) || now;
  const expiresAt =
    toDate(student.subscriptionEndDate) || lotExpiresAtFromPurchase(purchasedAt, planId);
  student.creditLots = [
    buildCreditLot({
      planId,
      planLabel: (cfg && cfg.label) || planId,
      credits: balance,
      purchasedAt,
      expiresAt,
      paymentId: 'legacy-backfill',
    }),
  ];
  // Remaining equals current balance (already consumed credits are not in balance)
  student.creditLots[0].creditsPurchased = Math.max(
    balance,
    Math.max(0, Number(student.totalCreditsEarned) || 0) -
      Math.max(0, Number(student.usedCredits) || 0) -
      Math.max(0, Number(student.expiredCredits) || 0)
  );
  student.creditLots[0].creditsRemaining = balance;
  return { student, created: true };
}

/**
 * Mark due lots expired in memory; returns total credits expired this pass.
 */
function expireDueLotsInMemory(student, now = new Date()) {
  ensureCreditLotsBackfilled(student, now);
  let expiredAmt = 0;
  for (const lot of student.creditLots || []) {
    if (lot.expiredAt) continue;
    const rem = Math.max(0, Number(lot.creditsRemaining) || 0);
    if (rem <= 0) continue;
    const exp = toDate(lot.expiresAt);
    if (!exp || exp.getTime() > now.getTime()) continue;
    lot.creditsRemaining = 0;
    lot.expiredAt = now;
    expiredAmt += rem;
  }
  return expiredAmt;
}

function syncSubscriptionFieldsFromLots(student, now = new Date()) {
  const active = sortLotsFifo(
    (student.creditLots || []).filter((l) => isLotActive(l, now))
  );
  if (!active.length) {
    return {
      subscriptionStatus: student.creditBalance > 0 ? 'active' : 'expired',
      subscriptionEndDate: toDate(student.subscriptionEndDate),
      subscriptionPlan: student.subscriptionPlan || null,
      nearestExpiresAt: null,
      farthestExpiresAt: null,
    };
  }
  const nearest = active[0];
  const farthest = active[active.length - 1];
  // farthest by expiry among active
  let far = active[0];
  for (const l of active) {
    const e = toDate(l.expiresAt);
    const f = toDate(far.expiresAt);
    if (e && (!f || e.getTime() > f.getTime())) far = l;
  }
  return {
    subscriptionStatus: 'active',
    subscriptionEndDate: toDate(far.expiresAt),
    subscriptionPlan: far.planId || student.subscriptionPlan,
    nearestExpiresAt: toDate(nearest.expiresAt),
    farthestExpiresAt: toDate(far.expiresAt),
  };
}

/**
 * Pick FIFO lot id to consume 1 credit (must be active).
 */
function pickFifoLotId(student, now = new Date()) {
  ensureCreditLotsBackfilled(student, now);
  const active = sortLotsFifo(
    (student.creditLots || []).filter((l) => isLotActive(l, now))
  );
  if (!active.length) return null;
  return active[0]._id ? String(active[0]._id) : null;
}

module.exports = {
  buildCreditLot,
  lotExpiresAtFromPurchase,
  isLotActive,
  sortLotsFifo,
  sumLotRemaining,
  ensureCreditLotsBackfilled,
  expireDueLotsInMemory,
  syncSubscriptionFieldsFromLots,
  pickFifoLotId,
};
