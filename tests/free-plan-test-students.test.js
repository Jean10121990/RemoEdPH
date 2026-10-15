const test = require('node:test');
const assert = require('node:assert/strict');
const {
  isTestPlanStudent,
  isPaidSubscriber,
  resolveTestPlanSpec,
} = require('../server/services/freePlanAccess');

test('test-plan allowlist matches only the CTO and CEO emails', () => {
  assert.equal(isTestPlanStudent({ username: 'JeanSerolf' }), false);
  assert.equal(isTestPlanStudent({ email: 'plflores3302@gmail.com' }), true);
  assert.equal(isTestPlanStudent({ username: 'plflores3302@gmail.com' }), true);
  assert.equal(isTestPlanStudent({ email: 'JEAN10121990@gmail.com' }), true);
  assert.equal(isTestPlanStudent({ username: 'mia', email: 'other@example.com' }), false);
});

test('planModeOverride is ignored unless the student is on the allowlist', () => {
  assert.equal(isPaidSubscriber({ username: 'mia', planModeOverride: 'paid', creditLots: [] }), false);
  assert.equal(isPaidSubscriber({ username: 'jeanserolf', planModeOverride: 'paid', creditLots: [] }), false);
  assert.equal(isPaidSubscriber({ email: 'plflores3302@gmail.com', planModeOverride: 'paid', creditLots: [] }), true);
  assert.equal(isPaidSubscriber({ email: 'jean10121990@gmail.com', planModeOverride: 'free', creditLots: [{ planId: 'spark', creditsRemaining: 4 }] }), false);
});

test('resolveTestPlanSpec rejects anyone not on the list', () => {
  assert.equal(resolveTestPlanSpec('plflores3302@gmail.com').key, 'plflores3302@gmail.com');
  assert.equal(resolveTestPlanSpec('not-a-test-student'), null);
});
