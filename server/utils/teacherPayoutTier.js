'use strict';

const TIER_VALUES = [180, 230, 280, 330];

/**
 * 25-minute class rate (PHP) from base tier + credential add-ons (+₱10/hr each).
 */
function computeRatePer25Min(tierBase, c1, c2, c3) {
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
  const impliedHourly = r * 2;
  for (let i = 0; i < TIER_VALUES.length; i++) {
    const base = TIER_VALUES[i];
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
    [180, 230, 280, 330].includes(Number(o.payoutTierBase));
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
  o.hourlyRate = computeRatePer25Min(
    o.payoutTierBase,
    o.payoutCred1,
    o.payoutCred2,
    o.payoutCred3
  );
  return o;
}

module.exports = {
  TIER_VALUES,
  computeRatePer25Min,
  derivePayoutFromHourlyRate25,
  effectivePayoutFields,
};
