const test = require('node:test');
const assert = require('node:assert/strict');
const {
  pickNoticeMilestone,
  lowCreditLotsToNotify,
  lotNoticeKey,
} = require('../server/services/creditExpiry');

test('notices fire at 14 and 7 days, not the old 10/5/2 ladder', () => {
  assert.equal(pickNoticeMilestone(14, false), 14);
  assert.equal(pickNoticeMilestone(10, false), 14);
  assert.equal(pickNoticeMilestone(8, false), 14);
  assert.equal(pickNoticeMilestone(7, false), 7);
  assert.equal(pickNoticeMilestone(2, false), 7);
  assert.equal(pickNoticeMilestone(15, false), null);
  assert.equal(pickNoticeMilestone(0, true), null);
});

test('3 credits left notifies once per lot', () => {
  const lot = {
    planId: 'spark',
    paymentId: 'pay-1',
    purchasedAt: new Date('2026-08-01T00:00:00.000Z'),
    creditsRemaining: 3,
  };
  const key = lotNoticeKey(lot);
  const first = lowCreditLotsToNotify({ creditLots: [lot], creditExpiryNotices: { low3Keys: [] } });
  assert.equal(first.length, 1);
  assert.equal(first[0].key, key);
  const again = lowCreditLotsToNotify({
    creditLots: [lot],
    creditExpiryNotices: { low3Keys: [key] },
  });
  assert.equal(again.length, 0);
  const otherBalance = lowCreditLotsToNotify({
    creditLots: [{ ...lot, creditsRemaining: 4 }],
    creditExpiryNotices: { low3Keys: [] },
  });
  assert.equal(otherBalance.length, 0);
});
