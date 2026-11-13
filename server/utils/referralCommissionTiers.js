'use strict';

/**
 * Referral / Unique Link commission paid when a referred student buys a plan.
 * Keyed by canonical plan id (server/config/planCredits.js):
 *   spark (1 month) ₱1,000 | steady (3 months) ₱1,500 | scholar (6 months) ₱2,000 | summit (1 year) ₱2,500
 * Unknown or blank plan falls back to the lowest tier so a referral is never left at ₱0.
 */
const { normalizePlanId } = require('../config/planCredits');
const { readSetting } = require('../services/siteSettings');

const REFERRAL_COMMISSION_BY_PLAN = {
  spark: 1000,
  steady: 1500,
  scholar: 2000,
  summit: 2500,
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
