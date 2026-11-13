/**
 * Canonical subscription plans: pack size = months × 22 lesson credits.
 * validityMonths matches the paid months. A 3-month extension is optional and
 * is granted only by a teacher after a parent video call (server/services/lessonExtension.js).
 * PayMongo and webhooks must use this only for credit counts / durations.
 * Never accept credit amounts from the client.
 *
 * Pricing (server/payments.js): $7/class; Founder Discount $21 × months (spark = $0).
 * spark  Starter  — 22 lessons, $154, 1 month
 * steady Progress — 66 lessons, $399, Save $63, 3 months
 * scholar Mastery — 132 lessons, $798, Save $126, 6 months
 * summit Ultimate — 264 lessons, $1,596, Save $252, 12 months
 */

const { readSetting } = require('../services/siteSettings');

const CREDITS_PER_MONTH = 22;

function creditsPerMonth() {
  const n = Number(readSetting('creditsPerMonth'));
  return Number.isInteger(n) && n > 0 ? n : CREDITS_PER_MONTH;
}

/** months is both the credit pack and the subscription window */
const PLAN_DEFINITIONS = {
  spark: { months: 1, validityMonths: 1, label: 'RemoSpark', bundleName: 'Starter Bundle' },
  steady: { months: 3, validityMonths: 3, label: 'RemoSteady', bundleName: 'Progress Bundle' },
  scholar: { months: 6, validityMonths: 6, label: 'RemoScholar', bundleName: 'Mastery Bundle' },
  summit: { months: 12, validityMonths: 12, label: 'RemoSummit', bundleName: 'Ultimate Bundle' },
};

function planCreditsMap() {
  const perMonth = creditsPerMonth();
  return Object.fromEntries(
    Object.entries(PLAN_DEFINITIONS).map(([id, def]) => [
      id,
      {
        months: def.months,
        validityMonths: def.validityMonths,
        label: def.label,
        bundleName: def.bundleName,
        credits: def.months * perMonth,
      },
    ])
  );
}

/** Fallback map at 22 credits. Live readers use planCreditsMap(). */
const PLAN_CREDITS = planCreditsMap();

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
  const row = planCreditsMap()[id];
  if (!row) return 1;
  return row.validityMonths != null ? row.validityMonths : row.months;
}

function creditsForPlan(plan) {
  const id = normalizePlanId(plan);
  const row = planCreditsMap()[id];
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
  creditsPerMonth,
  PLAN_DEFINITIONS,
  PLAN_CREDITS,
  planCreditsMap,
  normalizePlanId,
  creditsForPlan,
  getPlanDurationMonths,
};
