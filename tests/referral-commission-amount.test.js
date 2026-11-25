const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const {
  REFERRAL_COMMISSION_BY_PLAN,
  referralCommissionForPlan,
} = require('../server/utils/referralCommissionTiers');

test('every plan pays a 1000 peso one-time referral bonus', () => {
  assert.equal(REFERRAL_COMMISSION_BY_PLAN.spark, 1000);
  assert.equal(REFERRAL_COMMISSION_BY_PLAN.steady, 1000);
  assert.equal(REFERRAL_COMMISSION_BY_PLAN.scholar, 1000);
  assert.equal(REFERRAL_COMMISSION_BY_PLAN.summit, 1000);
  assert.equal(referralCommissionForPlan('spark'), 1000);
  assert.equal(referralCommissionForPlan(''), 1000);
});

test('the affiliates list has profile, edit, suspend, and delete', () => {
  const html = fs.readFileSync('public/admin-users.html', 'utf8');
  assert.match(html, /viewAffiliateProfile/);
  assert.match(html, /editUser\(decodeURIComponent/);
  assert.match(html, /suspendUser/);
  assert.match(html, /deleteUser\(decodeURIComponent/);
  assert.match(html, /Add Affiliate/);
});
