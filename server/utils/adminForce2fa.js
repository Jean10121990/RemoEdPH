/**
 * Primary admin (or env override) must complete TOTP enrollment before receiving a portal JWT.
 * Set FORCE_2FA_ADMIN_IDENTIFIER=username-or-email (default admin@remoedph.com).
 */
const ADMIN_2FA_ENROLLMENT_PURPOSE = 'admin_2fa_enrollment';

const FORCED_IDENTIFIER = String(process.env.FORCE_2FA_ADMIN_IDENTIFIER || 'admin@remoedph.com')
  .toLowerCase()
  .trim();

function adminMatchesForcedIdentifier(admin) {
  if (!admin) return false;
  const u = String(admin.username || '')
    .toLowerCase()
    .trim();
  const e = String(admin.email || '')
    .toLowerCase()
    .trim();
  return u === FORCED_IDENTIFIER || e === FORCED_IDENTIFIER;
}

/** True when this account must finish 2FA setup (no full JWT until isTwoFactorEnabled is true). */
function requiresForced2faEnrollment(admin) {
  return adminMatchesForcedIdentifier(admin) && admin.isTwoFactorEnabled !== true;
}

module.exports = {
  ADMIN_2FA_ENROLLMENT_PURPOSE,
  FORCED_IDENTIFIER,
  adminMatchesForcedIdentifier,
  requiresForced2faEnrollment,
};
