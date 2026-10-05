'use strict';

/**
 * Base payout tiers → display titles:
 * Free Trial (code 83, flat ₱45 per 25-min class = ₱90/hr) | 180 Newbie Teacher | 230 Junior Teacher |
 * 280 Senior Teacher and Trainer | 330 Head Teacher and Teaching Quality
 *
 * The Free Trial tier sits before Tier 1. `83` is only a stored code (tier base values are integers);
 * its pay is the fixed FREE_TRIAL_RATE_PER_25MIN and credential add-ons do not apply.
 */
const FREE_TRIAL_TIER_BASE = 83;
const FREE_TRIAL_RATE_PER_25MIN = 45;
const TIER_VALUES = [FREE_TRIAL_TIER_BASE, 180, 230, 280, 330];

function isFreeTrialTier(tierBase) {
  return Number(tierBase) === FREE_TRIAL_TIER_BASE;
}

/**
 * 25-minute class rate (PHP) from base tier + credential add-ons (+₱10/hr each).
 * Free Trial tier: flat ₱45 (₱90/hr), no add-ons. The stored code stays 83 so teachers
 * already on this tier keep it; 90 would collide with the hourly-rate reverse lookup.
 */
function computeRatePer25Min(tierBase, c1, c2, c3) {
  if (isFreeTrialTier(tierBase)) return FREE_TRIAL_RATE_PER_25MIN;
  const tb = TIER_VALUES.includes(Number(tierBase)) ? Number(tierBase) : 180;
  const n = (c1 ? 1 : 0) + (c2 ? 1 : 0) + (c3 ? 1 : 0);
  const totalHourly = tb + n * 10;
  return totalHourly / 2;
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
  const impliedHourly = r * 2;
  for (let i = 0; i < TIER_VALUES.length; i++) {
    const base = TIER_VALUES[i];
    if (isFreeTrialTier(base)) continue;
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
  FREE_TRIAL_TIER_BASE,
  FREE_TRIAL_RATE_PER_25MIN,
  isFreeTrialTier,
  computeRatePer25Min,
  derivePayoutFromHourlyRate25,
  effectivePayoutFields,
  ratePer25FromTeacher,
};
