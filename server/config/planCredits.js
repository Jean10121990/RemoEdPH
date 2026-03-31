/**
 * Canonical subscription plans: 1 month = 22 lesson credits.
 * Credits = months × 22. PayMongo and webhooks must use this only for credit counts / durations.
 * Never accept credit amounts from the client.
 */

const CREDITS_PER_MONTH = 22;

/** months + marketing label; credits derived as months × CREDITS_PER_MONTH */
const PLAN_DEFINITIONS = {
  spark: { months: 1, label: 'RemoSpark' },
  steady: { months: 3, label: 'RemoSteady' },
  scholar: { months: 6, label: 'RemoScholar' },
  summit: { months: 12, label: 'RemoSummit' },
};

const PLAN_CREDITS = Object.fromEntries(
  Object.entries(PLAN_DEFINITIONS).map(([id, def]) => [
    id,
    {
      months: def.months,
      label: def.label,
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

/** Calendar months for subscription window (webhooks / subscriptionEndDate). */
function getPlanDurationMonths(planRaw) {
  const id = normalizePlanId(planRaw);
  const row = PLAN_CREDITS[id];
  return row && row.months != null ? row.months : 1;
}

function creditsForPlan(plan) {
  const id = normalizePlanId(plan);
  const row = PLAN_CREDITS[id];
  return row
    ? { planId: id, credits: row.credits, label: row.label, months: row.months }
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
