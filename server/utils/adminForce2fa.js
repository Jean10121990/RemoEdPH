/**
 * All staff admins must complete TOTP enrollment before receiving a portal JWT.
 * True when 2FA is not fully enabled yet (no successful first verification / flag off).
 */
const ADMIN_2FA_ENROLLMENT_PURPOSE = 'admin_2fa_enrollment';

/** @deprecated Legacy single-account gate; unified login still uses identifier to avoid leaking admin emails. */
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

/** True when this admin must finish QR setup + first 6-digit code before full sign-in. */
function requiresForced2faEnrollment(admin) {
  if (!admin) return false;
  return admin.isTwoFactorEnabled !== true;
}

module.exports = {
  ADMIN_2FA_ENROLLMENT_PURPOSE,
  FORCED_IDENTIFIER,
  adminMatchesForcedIdentifier,
  requiresForced2faEnrollment,
};
