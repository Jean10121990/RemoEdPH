'use strict';

/**
 * Build unique human-readable referral slug: prefer email, else complete name.
 */
function buildAffiliateReferralSlug({ email, name } = {}) {
  const em = String(email || '')
    .trim()
    .toLowerCase();
  if (em && em.includes('@')) return em.slice(0, 254);

  const nm = String(name || '')
    .trim()
    .replace(/\s+/g, ' ');
  if (nm) return nm.slice(0, 120);

  return '';
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

module.exports = {
  buildAffiliateReferralSlug,
  affiliateSlugExactRe,
  enrollLinkForSlug,
  escapeRegex,
};
