'use strict';

const { normalizePlanId, PLAN_CREDITS } = require('../config/planCredits');

const AFFILIATE_MONTHLY_PCT = 0.05;

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

/**
 * 5% of amortized monthly plan value (phpTotal / planMonths).
 * Falls back to amountPaid / months when totals unavailable.
 */
function affiliateMonthlyRecurringPhp({ amountPaid = 0, plan = '', phpTotal = null } = {}) {
  const id = normalizePlanId(plan);
  const months = Math.max(1, Number((PLAN_CREDITS[id] && PLAN_CREDITS[id].months) || 1));
  const total = Number(phpTotal != null ? phpTotal : amountPaid) || 0;
  if (total <= 0) return 0;
  const monthly = total / months;
  return Math.round(monthly * AFFILIATE_MONTHLY_PCT * 100) / 100;
}

module.exports = {
  AFFILIATE_MONTHLY_PCT,
  phYyyymm,
  affiliateMonthlyRecurringPhp,
};
