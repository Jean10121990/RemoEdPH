/**
 * Canonical plan → lesson credits mapping (PayMongo / admin grant must use this only).
 * Never accept credit amounts from the client.
 */

const PLAN_CREDITS = {
  spark: { credits: 22, label: 'RemoSpark' },
  steady: { credits: 66, label: 'RemoSteady' },
  scholar: { credits: 132, label: 'RemoScholar' },
  summit: { credits: 264, label: 'RemoSummit' },
};

function normalizePlanId(plan) {
  const p = String(plan || '').toLowerCase();
  if (p === '1month') return 'spark';
  if (p === '3months') return 'steady';
  if (p === '6months') return 'scholar';
  if (p === '1year') return 'summit';
  return p;
}

function creditsForPlan(plan) {
  const id = normalizePlanId(plan);
  const row = PLAN_CREDITS[id];
  return row ? { planId: id, credits: row.credits, label: row.label } : null;
}

module.exports = {
  PLAN_CREDITS,
  normalizePlanId,
  creditsForPlan,
};
