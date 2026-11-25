'use strict';

const crypto = require('crypto');

/** Same alphabet as student share codes: no 0/O/1/l. */
const CODE_ALPHABET = '23456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz';

function generateAffiliateReferralCode() {
  const bytes = crypto.randomBytes(8);
  let out = '';
  for (let i = 0; i < 8; i += 1) out += CODE_ALPHABET[bytes[i] % CODE_ALPHABET.length];
  return out;
}

/** Older links used the email or the full name. Those stay valid after the code changes. */
function isLegacyReferralSlug(slug) {
  const s = String(slug || '').trim();
  if (!s) return true;
  return s.includes('@') || /\s/.test(s);
}

async function allocateAffiliateReferralSlug() {
  const Affiliate = require('../models/Affiliate');
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = generateAffiliateReferralCode();
    const taken = await Affiliate.findOne({ referralSlug: code }).select('_id').lean();
    if (!taken) return code;
  }
  throw new Error('Could not assign a referral code');
}

async function ensureRandomAffiliateSlug(affiliate) {
  if (!affiliate || !isLegacyReferralSlug(affiliate.referralSlug)) return affiliate;
  const previous = Array.isArray(affiliate.previousReferralSlugs)
    ? affiliate.previousReferralSlugs.map((value) => String(value || '').trim()).filter(Boolean)
    : [];
  const current = String(affiliate.referralSlug || '').trim();
  if (current && !previous.some((value) => value.toLowerCase() === current.toLowerCase())) {
    previous.push(current);
  }
  affiliate.previousReferralSlugs = previous;
  affiliate.referralSlug = await allocateAffiliateReferralSlug();
  await affiliate.save();
  return affiliate;
}

function escapeRegex(s) {
  return String(s || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Case-insensitive exact match for referralSlug / email. */
function affiliateSlugExactRe(raw) {
  const code = String(raw || '').trim().slice(0, 254);
  if (!code) return null;
  return new RegExp(`^${escapeRegex(code)}$`, 'i');
}

function enrollLinkForSlug(slug, origin = 'https://remoedph.com') {
  const s = String(slug || '').trim();
  if (!s) return `${origin}/enroll`;
  return `${origin}/enroll?ref=${encodeURIComponent(s)}`;
}

/** Match the current code, a retired email/name slug, or the account email. */
function affiliateSlugMatch(raw) {
  const slugRe = affiliateSlugExactRe(raw);
  if (!slugRe) return null;
  return {
    $or: [
      { referralSlug: slugRe },
      { previousReferralSlugs: slugRe },
      { email: slugRe },
    ],
  };
}

module.exports = {
  generateAffiliateReferralCode,
  isLegacyReferralSlug,
  allocateAffiliateReferralSlug,
  ensureRandomAffiliateSlug,
  affiliateSlugExactRe,
  affiliateSlugMatch,
  enrollLinkForSlug,
  escapeRegex,
};
