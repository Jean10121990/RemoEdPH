'use strict';

const { normalizePlanId, PLAN_CREDITS } = require('../config/planCredits');

const AFFILIATE_MONTHLY_PCT = 0.02;

/** Asia/Manila YYYY-MM for ledger keys. */
function phYyyymm(date = new Date()) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
  })
    .format(date)
    .slice(0, 7);
}

/** Plan pack length in months: spark 1 · steady 3 · scholar 6 · summit 12. */
function affiliatePlanMonths(plan) {
  const id = normalizePlanId(plan);
  return Math.max(1, Number((PLAN_CREDITS[id] && PLAN_CREDITS[id].months) || 1));
}

/** Add n calendar months to a YYYY-MM string. */
function addMonthsToYyyymm(yyyymm, n) {
  const m = String(yyyymm || '').match(/^(\d{4})-(\d{2})$/);
  if (!m) return yyyymm;
  const d = new Date(Date.UTC(Number(m[1]), Number(m[2]) - 1 + Number(n || 0), 1));
  const y = d.getUTCFullYear();
  const mo = String(d.getUTCMonth() + 1).padStart(2, '0');
  return `${y}-${mo}`;
}

/**
 * 2% of amortized monthly plan value (phpTotal / planMonths).
 * A 3-month plan → this amount once per month for 3 months (same for 6 / 12).
 */
function affiliateMonthlyRecurringPhp({ amountPaid = 0, plan = '', phpTotal = null } = {}) {
  const months = affiliatePlanMonths(plan);
  const total = Number(phpTotal != null ? phpTotal : amountPaid) || 0;
  if (total <= 0) return 0;
  const monthly = total / months;
  return Math.round(monthly * AFFILIATE_MONTHLY_PCT * 100) / 100;
}

/**
 * YYYY-MM keys for every month of the subscription pack, starting this PH month.
 * spark → [this]; steady → this + next 2; scholar → 6; summit → 12.
 */
function affiliateRecurringMonthKeys(plan, startYyyymm = phYyyymm()) {
  const months = affiliatePlanMonths(plan);
  const keys = [];
  for (let i = 0; i < months; i++) {
    keys.push(addMonthsToYyyymm(startYyyymm, i));
  }
  return keys;
}

module.exports = {
  AFFILIATE_MONTHLY_PCT,
  phYyyymm,
  affiliatePlanMonths,
  addMonthsToYyyymm,
  affiliateMonthlyRecurringPhp,
  affiliateRecurringMonthKeys,
};
