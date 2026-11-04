const test = require('node:test');
const assert = require('node:assert/strict');
const {
  affiliatePlanMonths,
  affiliateMonthlyRecurringPhp,
  affiliateRecurringMonthKeys,
  affiliateRecurringAnchor,
} = require('../server/utils/affiliateRecurring');

test('RemoSpark 2% is the full 1-month price once', () => {
  assert.equal(affiliatePlanMonths('spark'), 1);
  const once = affiliateMonthlyRecurringPhp({ phpTotal: 9244.62, plan: 'spark' });
  assert.equal(once, 184.89);
  assert.equal(affiliateRecurringMonthKeys('spark', '2026-11').length, 1);
});

test('a later month does not open a second RemoSpark 2% window', () => {
  const anchor = affiliateRecurringAnchor(['2026-10'], '2026-11');
  assert.equal(anchor, '2026-10');
  assert.deepEqual(affiliateRecurringMonthKeys('spark', anchor), ['2026-10']);
  assert.equal(affiliateMonthlyRecurringPhp({ amountPaid: 9244.62, plan: 'spark' }), 184.89);
});

test('longer plans pay 2% only for the months of classes', () => {
  assert.equal(affiliatePlanMonths('steady'), 3);
  assert.equal(affiliatePlanMonths('scholar'), 6);
  assert.equal(affiliatePlanMonths('summit'), 12);
  assert.equal(affiliateRecurringMonthKeys('steady', '2026-11').length, 3);
  assert.equal(affiliateRecurringMonthKeys('summit', '2026-11').length, 12);
});
