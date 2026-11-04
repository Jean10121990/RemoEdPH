'use strict';

/**
 * Paid tiers (per hour): ₱180 / ₱230 / ₱280 / ₱330.
 * Per 25-min class = round2(hourly × 25 / 60) → ₱75.00 / ₱95.83 / ₱116.67 / ₱137.50
 * before credential add-ons (+₱10/hr each).
 *
 * Code 83 is a legacy Free Trial rate (₱45 / 25 min). It stays payable and bookable
 * for teachers already stored as 83. New assignments use the four paid tiers only.
 */
const FREE_TRIAL_TIER_BASE = 83;
const FREE_TRIAL_RATE_PER_25MIN = 45;
const PAID_TIER_VALUES = [180, 230, 280, 330];
const TIER_VALUES = [FREE_TRIAL_TIER_BASE, ...PAID_TIER_VALUES];

function round2(n) {
  return Math.round((Number(n) + Number.EPSILON) * 100) / 100;
}

function isFreeTrialTier(tierBase) {
  return Number(tierBase) === FREE_TRIAL_TIER_BASE;
}

/**
 * 25-minute class rate (PHP) from base tier + credential add-ons (+₱10/hr each).
 * Paid tiers: round2(hourly × 25 / 60). Legacy Free Trial code 83 stays a flat ₱45.
 */
function computeRatePer25Min(tierBase, c1, c2, c3) {
  if (isFreeTrialTier(tierBase)) return FREE_TRIAL_RATE_PER_25MIN;
  const tb = PAID_TIER_VALUES.includes(Number(tierBase)) ? Number(tierBase) : 180;
  const n = (c1 ? 1 : 0) + (c2 ? 1 : 0) + (c3 ? 1 : 0);
  const totalHourly = tb + n * 10;
  return round2((totalHourly * 25) / 60);
}

/** Best-effort reverse of computeRatePer25Min for legacy hourlyRate-only rows. */
function derivePayoutFromHourlyRate25(ratePer25) {
  const r = Number(ratePer25);
  if (!isFinite(r) || r <= 0) {
    return { payoutTierBase: 180, payoutCred1: false, payoutCred2: false, payoutCred3: false };
  }
  if (Math.abs(r - FREE_TRIAL_RATE_PER_25MIN) < 0.005) {
    return {
      payoutTierBase: FREE_TRIAL_TIER_BASE,
      payoutCred1: false,
      payoutCred2: false,
      payoutCred3: false,
    };
  }
  const impliedHourly = (r * 60) / 25;
  for (let i = 0; i < PAID_TIER_VALUES.length; i++) {
    const base = PAID_TIER_VALUES[i];
    const delta = impliedHourly - base;
    if (delta >= 0 && delta <= 30 && delta % 10 === 0) {
      const creds = Math.round(delta / 10);
      return {
        payoutTierBase: base,
        payoutCred1: creds >= 1,
        payoutCred2: creds >= 2,
        payoutCred3: creds >= 3,
      };
    }
  }
  return { payoutTierBase: 180, payoutCred1: false, payoutCred2: false, payoutCred3: false };
}

/** Merge DB document with effective payout fields for API responses. */
function effectivePayoutFields(doc) {
  if (!doc || typeof doc !== 'object') return doc;
  const o =
    typeof doc.toObject === 'function' ? doc.toObject() : Object.assign({}, doc);
  const hasStored =
    o.payoutTierBase != null &&
    TIER_VALUES.includes(Number(o.payoutTierBase));
  if (hasStored) {
    o.payoutTierBase = Number(o.payoutTierBase);
    o.payoutCred1 = !!o.payoutCred1;
    o.payoutCred2 = !!o.payoutCred2;
    o.payoutCred3 = !!o.payoutCred3;
  } else {
    const d = derivePayoutFromHourlyRate25(o.hourlyRate);
    o.payoutTierBase = d.payoutTierBase;
    o.payoutCred1 = d.payoutCred1;
    o.payoutCred2 = d.payoutCred2;
    o.payoutCred3 = d.payoutCred3;
  }
  if (isFreeTrialTier(o.payoutTierBase)) {
    o.payoutCred1 = false;
    o.payoutCred2 = false;
    o.payoutCred3 = false;
  }
  o.hourlyRate = computeRatePer25Min(
    o.payoutTierBase,
    o.payoutCred1,
    o.payoutCred2,
    o.payoutCred3
  );
  return o;
}

/** Teacher on the Free Trial tier (stored code, or a legacy ₱45 hourlyRate). Free plan students book only these. */
function isFreeTrialTeacher(teacher) {
  if (!teacher) return false;
  return isFreeTrialTier(effectivePayoutFields(teacher).payoutTierBase);
}

/** Class rate actually paid. Tier (including Free Trial) wins over a stale hourlyRate. */
function ratePer25FromTeacher(teacher, fallback) {
  if (teacher && TIER_VALUES.includes(Number(teacher.payoutTierBase))) {
    return computeRatePer25Min(
      teacher.payoutTierBase,
      teacher.payoutCred1,
      teacher.payoutCred2,
      teacher.payoutCred3
    );
  }
  const stored = teacher && Number(teacher.hourlyRate);
  if (Number.isFinite(stored) && stored >= 0) return stored;
  const fb = Number(fallback);
  return Number.isFinite(fb) ? fb : 0;
}

module.exports = {
  TIER_VALUES,
  PAID_TIER_VALUES,
  FREE_TRIAL_TIER_BASE,
  FREE_TRIAL_RATE_PER_25MIN,
  round2,
  isFreeTrialTier,
  isFreeTrialTeacher,
  computeRatePer25Min,
  derivePayoutFromHourlyRate25,
  effectivePayoutFields,
  ratePer25FromTeacher,
};
