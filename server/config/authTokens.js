/**
 * Central auth/session TTL and cookie options.
 * Admin idle / session cookie default: 30 minutes (rolling).
 * Student JWT default remains 1 hour unless JWT_EXPIRES_IN is set.
 * Teacher JWT covers a full teaching day (18 hours). Do not shorten it:
 * a mid-shift logout makes a teacher late for the next booked class.
 */

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

/** Teacher portal JWT. Remember-me still uses 30 days. Idle logout does not apply. */
const TEACHER_JWT_EXPIRES_IN = process.env.TEACHER_JWT_EXPIRES_IN || '18h';

/** Admin Bearer JWT lifetime (active work). Idle logout is enforced separately at 30 minutes. */
const ADMIN_JWT_EXPIRES_IN = process.env.ADMIN_JWT_EXPIRES_IN || '2h';

/** Admin idle window and session cookie max age (default 30 minutes). */
const ADMIN_IDLE_TIMEOUT_MS = (() => {
  const fromEnv = parseInt(process.env.ADMIN_IDLE_TIMEOUT_MS || '', 10);
  if (Number.isFinite(fromEnv) && fromEnv > 0) return fromEnv;
  return 30 * 60 * 1000;
})();

const parsedSessionMs = parseInt(process.env.SESSION_MAX_AGE_MS || '', 10);
const SESSION_MAX_AGE_MS =
  Number.isFinite(parsedSessionMs) && parsedSessionMs > 0
    ? parsedSessionMs
    : ADMIN_IDLE_TIMEOUT_MS;

function isProductionSecureCookie() {
  // Security Hotspot: session cookies must be Secure.
  // NOTE: This requires HTTPS; if you test locally over http://, cookies may not persist.
  return true;
}

/** sameSite: 'strict' by default; set SESSION_COOKIE_SAMESITE=lax for looser dev setups */
function sessionSameSite() {
  const v = String(process.env.SESSION_COOKIE_SAMESITE || 'strict').toLowerCase();
  if (v === 'lax' || v === 'none' || v === 'strict') return v;
  return 'strict';
}

function sessionCookieBase() {
  return {
    httpOnly: true,
    secure: isProductionSecureCookie(),
    sameSite: sessionSameSite(),
    maxAge: SESSION_MAX_AGE_MS,
  };
}

module.exports = {
  JWT_EXPIRES_IN,
  TEACHER_JWT_EXPIRES_IN,
  ADMIN_JWT_EXPIRES_IN,
  ADMIN_IDLE_TIMEOUT_MS,
  SESSION_MAX_AGE_MS,
  isProductionSecureCookie,
  sessionSameSite,
  sessionCookieBase,
};
