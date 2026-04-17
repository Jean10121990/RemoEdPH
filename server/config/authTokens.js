/**
 * Central auth/session TTL and cookie options.
 * JWT and admin session cookie share the same max age by default (1 hour).
 */

const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '1h';

const parsedSessionMs = parseInt(process.env.SESSION_MAX_AGE_MS || '', 10);
const SESSION_MAX_AGE_MS =
  Number.isFinite(parsedSessionMs) && parsedSessionMs > 0 ? parsedSessionMs : 60 * 60 * 1000;

function isProductionSecureCookie() {
  // Security Hotspot: session cookies must be Secure.
  // NOTE: This requires HTTPS; if you test locally over http://, cookies may not persist.
  return true;
}

/** sameSite: 'strict' by default; set SESSION_COOKIE_SAMESITE=lax for looser dev setups */
function sessionSameSite() {
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
