const crypto = require('crypto');

/**
 * Generate a short URL-friendly referral code.
 * 10 chars, uppercase alphanumeric (stable format used across teacher/admin flows).
 */
function generateReferralCode() {
  const raw = crypto.randomBytes(16).toString('base64url').toUpperCase();
  return raw.replace(/[^A-Z0-9]/g, '').slice(0, 10);
}

module.exports = { generateReferralCode };

