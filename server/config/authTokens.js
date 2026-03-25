/**
 * Central auth/session TTL and cookie options.
 * JWT and admin session cookie share the same max age by default (1 hour).
 */

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

const parsedSessionMs = parseInt(process.env.SESSION_MAX_AGE_MS || '', 10);
const SESSION_MAX_AGE_MS =
  Number.isFinite(parsedSessionMs) && parsedSessionMs > 0 ? parsedSessionMs : 60 * 60 * 1000;

function isProductionSecureCookie() {
  return (
    process.env.SESSION_COOKIE_SECURE === 'true' ||
    (process.env.NODE_ENV === 'production' && process.env.SESSION_COOKIE_SECURE !== 'false')
  );
}

/** sameSite: 'strict' by default; set SESSION_COOKIE_SAMESITE=lax for looser dev setups */
function sessionSameSite() {
  const v = String(process.env.SESSION_COOKIE_SAMESITE || 'strict').toLowerCase();
  if (v === 'lax' || v === 'none') return v;
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
  SESSION_MAX_AGE_MS,
  isProductionSecureCookie,
  sessionSameSite,
  sessionCookieBase,
};
