const test = require('node:test');
const assert = require('node:assert/strict');
const { nextAffiliatePayoutDate } = require('../server/utils/affiliateBalance');

test('next payout is the 15th before mid-month and the last day after', () => {
  assert.equal(nextAffiliatePayoutDate(new Date('2026-11-04T02:00:00+08:00')), '2026-11-15');
  assert.equal(nextAffiliatePayoutDate(new Date('2026-11-15T10:00:00+08:00')), '2026-11-15');
  assert.equal(nextAffiliatePayoutDate(new Date('2026-11-20T10:00:00+08:00')), '2026-11-30');
});
