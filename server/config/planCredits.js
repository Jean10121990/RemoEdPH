/**
 * Canonical subscription plans: pack size = months × 22 lesson credits.
 * validityMonths = recommended credit window (Asia/Manila calendar months).
 * PayMongo and webhooks must use this only for credit counts / durations.
 * Never accept credit amounts from the client.
 *
 * Pricing (server/payments.js): $7/class; Founder Discount $21 × months (spark = $0).
 * spark  Starter  — 22 lessons, $154, Valid 3 Months
 * steady Progress — 66 lessons, $399, Save $63, Valid 6 Months
 * scholar Mastery — 132 lessons, $798, Save $126, Valid 12 Months
 * summit Ultimate — 264 lessons, $1,596, Save $252, Valid 24 Months
 */

const CREDITS_PER_MONTH = 22;

/** months drives credit pack size; validityMonths drives subscription window */
const PLAN_DEFINITIONS = {
  spark: { months: 1, validityMonths: 3, label: 'RemoSpark', bundleName: 'Starter Bundle' },
  steady: { months: 3, validityMonths: 6, label: 'RemoSteady', bundleName: 'Progress Bundle' },
  scholar: { months: 6, validityMonths: 12, label: 'RemoScholar', bundleName: 'Mastery Bundle' },
  summit: { months: 12, validityMonths: 24, label: 'RemoSummit', bundleName: 'Ultimate Bundle' },
};

const PLAN_CREDITS = Object.fromEntries(
  Object.entries(PLAN_DEFINITIONS).map(([id, def]) => [
    id,
    {
      months: def.months,
      validityMonths: def.validityMonths,
      label: def.label,
      bundleName: def.bundleName,
      credits: def.months * CREDITS_PER_MONTH,
    },
  ])
);

function normalizePlanId(plan) {
  const p = String(plan || '').toLowerCase();
  if (p === '1month') return 'spark';
  if (p === '3months') return 'steady';
  if (p === '6months') return 'scholar';
  if (p === '1year') return 'summit';
  return p;
}

/** Calendar months for subscription / credit validity window. */
function getPlanDurationMonths(planRaw) {
  const id = normalizePlanId(planRaw);
  const row = PLAN_CREDITS[id];
  if (!row) return 1;
  return row.validityMonths != null ? row.validityMonths : row.months;
}

function creditsForPlan(plan) {
  const id = normalizePlanId(plan);
  const row = PLAN_CREDITS[id];
  return row
    ? {
        planId: id,
        credits: row.credits,
        label: row.label,
        months: row.months,
        validityMonths: row.validityMonths,
        bundleName: row.bundleName,
      }
    : null;
}

module.exports = {
  CREDITS_PER_MONTH,
  PLAN_DEFINITIONS,
  PLAN_CREDITS,
  normalizePlanId,
  creditsForPlan,
  getPlanDurationMonths,
};
