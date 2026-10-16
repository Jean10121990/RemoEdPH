/**
 * Social OAuth provider config (Google / Facebook).
 * Leave client ids unset to disable that provider (routes return 503).
 */

function trim(v) {
  return String(v == null ? '' : v).trim();
}

function googleConfigured() {
  return !!(trim(process.env.GOOGLE_CLIENT_ID) && trim(process.env.GOOGLE_CLIENT_SECRET));
}

function facebookConfigured() {
  return !!(trim(process.env.FACEBOOK_APP_ID) && trim(process.env.FACEBOOK_APP_SECRET));
}

function oauthStateSecret() {
  const s = trim(process.env.OAUTH_STATE_SECRET);
  if (s) return s;
  // Dev fallback only — production must set OAUTH_STATE_SECRET.
  const jwt = trim(process.env.JWT_SECRET);
  return jwt ? `oauth-state:${jwt}` : 'oauth-state-dev-insecure';
}

function providerPublicStatus() {
  return {
    google: googleConfigured(),
    facebook: facebookConfigured(),
  };
}

module.exports = {
  googleConfigured,
  facebookConfigured,
  oauthStateSecret,
  providerPublicStatus,
  googleClientId: () => trim(process.env.GOOGLE_CLIENT_ID),
  googleClientSecret: () => trim(process.env.GOOGLE_CLIENT_SECRET),
  facebookAppId: () => trim(process.env.FACEBOOK_APP_ID),
  facebookAppSecret: () => trim(process.env.FACEBOOK_APP_SECRET),
};
