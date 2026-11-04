const test = require('node:test');
const assert = require('node:assert/strict');
const { computeRatePer25Min, PAID_TIER_VALUES } = require('../server/utils/teacherPayoutTier');

test('paid tiers use hourly × 25/60 rounded to cents', () => {
  assert.deepEqual(PAID_TIER_VALUES, [180, 230, 280, 330]);
  assert.equal(computeRatePer25Min(180, false, false, false), 75);
  assert.equal(computeRatePer25Min(230, false, false, false), 95.83);
  assert.equal(computeRatePer25Min(280, false, false, false), 116.67);
  assert.equal(computeRatePer25Min(330, false, false, false), 137.5);
});

test('legacy free-trial code 83 stays ₱45 and is not a new assignment rate', () => {
  assert.equal(computeRatePer25Min(83, true, true, true), 45);
});

test('Tier 3 with 22 classes is ₱2,566.74 after per-class rounding', () => {
  const perClass = computeRatePer25Min(280, false, false, false);
  const total = Math.round(perClass * 22 * 100) / 100;
  assert.equal(perClass, 116.67);
  assert.equal(total, 2566.74);
});
