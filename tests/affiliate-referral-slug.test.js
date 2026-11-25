const test = require('node:test');
const assert = require('node:assert/strict');
const {
  generateAffiliateReferralCode,
  isLegacyReferralSlug,
  affiliateSlugMatch,
} = require('../server/utils/affiliateReferralSlug');

test('a new affiliate code is 8 characters and is not an email', () => {
  const code = generateAffiliateReferralCode();
  assert.equal(code.length, 8);
  assert.equal(isLegacyReferralSlug(code), false);
  assert.doesNotMatch(code, /[@\s01OIl]/);
});

test('an email or a full name is a retired referral slug', () => {
  assert.equal(isLegacyReferralSlug('jean10121990@gmail.com'), true);
  assert.equal(isLegacyReferralSlug('Jean Dela Cruz'), true);
  assert.equal(isLegacyReferralSlug(''), true);
  const match = affiliateSlugMatch('jean10121990@gmail.com');
  assert.ok(match.$or.some((clause) => clause.previousReferralSlugs));
  assert.ok(match.$or.some((clause) => clause.email));
});
