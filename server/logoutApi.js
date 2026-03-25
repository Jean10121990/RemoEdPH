const { blacklistToken } = require('./services/jwtBlacklist');
const { sessionCookieBase } = require('./config/authTokens');

const SESSION_NAME = 'remoed.admin.sid';

function setLogoutCacheHeaders(res) {
  res.set(
    'Cache-Control',
    'no-store, no-cache, must-revalidate, proxy-revalidate'
  );
  res.set('Pragma', 'no-cache');
  res.set('Expires', '0');
}

/**
 * Unified logout: blacklist Bearer JWT (student/teacher/admin) and destroy admin session cookie.
 */
function postApiLogout(req, res) {
  const token =
    req.headers.authorization?.split(' ')[1] || req.body?.token || req.query?.token;
  if (token) blacklistToken(token);

  const cookieOpts = { path: '/', ...sessionCookieBase() };
  res.clearCookie(SESSION_NAME, cookieOpts);

  if (!req.session) {
    setLogoutCacheHeaders(res);
    return res.status(200).json({ success: true, message: 'Logged out' });
  }

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, error: 'Logout failed' });
    }
    setLogoutCacheHeaders(res);
    res.status(200).json({ success: true, message: 'Logged out' });
  });
}

module.exports = { postApiLogout, setLogoutCacheHeaders, SESSION_NAME };
