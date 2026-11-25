'use strict';

/**
 * Referral / Unique Link commission paid when a referred student buys a plan.
 * Keyed by canonical plan id (server/config/planCredits.js):
 *   ₱1,000 once for spark, steady, scholar, and summit. Affiliates also earn 2% of the monthly price each paid month.
 * Unknown or blank plan falls back to the lowest tier so a referral is never left at ₱0.
 */
const { normalizePlanId } = require('../config/planCredits');
const { readSetting } = require('../services/siteSettings');

const REFERRAL_COMMISSION_BY_PLAN = {
  spark: 1000,
  steady: 1000,
  scholar: 1000,
  summit: 1000,
};

const DEFAULT_REFERRAL_COMMISSION = REFERRAL_COMMISSION_BY_PLAN.spark;

const COMMISSION_KEYS = {
  spark: 'commissionSpark',
  steady: 'commissionSteady',
  scholar: 'commissionScholar',
  summit: 'commissionSummit',
};

function referralCommissionForPlan(plan) {
  const id = normalizePlanId(plan);
  const key = COMMISSION_KEYS[id];
  const live = key ? Number(readSetting(key)) : NaN;
  const amount = Number.isFinite(live) && live > 0 ? live : REFERRAL_COMMISSION_BY_PLAN[id];
  return Number.isFinite(amount) ? amount : DEFAULT_REFERRAL_COMMISSION;
}

module.exports = {
  REFERRAL_COMMISSION_BY_PLAN,
  DEFAULT_REFERRAL_COMMISSION,
  referralCommissionForPlan,
};
