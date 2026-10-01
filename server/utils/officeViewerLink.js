/**
 * Microsoft PowerPoint (Office for the web) viewer for uploaded lesson decks.
 * Microsoft's servers fetch the .pptx without our login, so the file link carries
 * a short-lived signed token scoped to one lesson file.
 */
const jwt = require('jsonwebtoken');
const { getJwtSecret } = require('../config/jwtSecret');

const PURPOSE = 'office-viewer';
const TOKEN_TTL = '6h';
const OFFICE_VIEWER_BASE = 'https://view.officeapps.live.com/op/embed.aspx?src=';

/** Separate key so this token can never pass as a portal login JWT. */
function viewerSecret() {
  return getJwtSecret() + ':' + PURPOSE;
}

function signOfficeViewerToken(fileId) {
  return jwt.sign({ purpose: PURPOSE, fid: String(fileId) }, viewerSecret(), { expiresIn: TOKEN_TTL });
}

function verifyOfficeViewerToken(token, fileId) {
  try {
    const payload = jwt.verify(String(token || ''), viewerSecret());
    return !!payload && payload.purpose === PURPOSE && String(payload.fid) === String(fileId);
  } catch (_e) {
    return false;
  }
}

function isPublicHttpsOrigin(origin) {
  try {
    const u = new URL(origin);
    if (u.protocol !== 'https:') return false;
    return !/^(localhost|127\.0\.0\.1|0\.0\.0\.0)$|\.local$|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./i.test(u.hostname);
  } catch (_e) {
    return false;
  }
}

/**
 * FRONTEND_URL -> https origin Microsoft can reach. Adds https:// when the scheme is missing,
 * upgrades http:// for public hosts, drops any path/trailing slash. '' when unusable (localhost etc).
 */
function normalizeFrontendOrigin(raw) {
  let s = String(raw || '').trim();
  if (!s) return '';
  if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(s)) s = 'https://' + s.replace(/^\/+/, '');
  try {
    const u = new URL(s);
    if (u.protocol === 'http:') u.protocol = 'https:';
    const origin = u.origin;
    return isPublicHttpsOrigin(origin) ? origin : '';
  } catch (_e) {
    return '';
  }
}

function publicSiteOrigin(req) {
  const envOrigin = normalizeFrontendOrigin(process.env.FRONTEND_URL);
  if (envOrigin) return envOrigin;
  if (req && typeof req.get === 'function') {
    const host = req.get('host');
    const fromReq = host ? `${req.protocol}://${host}` : '';
    if (fromReq && isPublicHttpsOrigin(fromReq)) return fromReq;
  }
  return '';
}

function viewerFileName(file) {
  const raw = String((file && file.fileName) || 'lesson.pptx');
  const base = raw.replace(/[^a-zA-Z0-9._-]+/g, '_');
  return /\.(ppt|pptx)$/i.test(base) ? base : base + '.pptx';
}

/** Returns '' when the site is not reachable by Microsoft (localhost / plain http). */
function buildOfficeViewerEmbedUrl(req, file) {
  if (!file || !file._id) return '';
  if (!/\.(ppt|pptx)$/i.test(String(file.fileName || ''))) return '';
  const origin = publicSiteOrigin(req);
  if (!origin) return '';
  const fileId = String(file._id);
  const src =
    origin +
    '/api/office-viewer/presentation/' +
    encodeURIComponent(fileId) +
    '/' +
    encodeURIComponent(signOfficeViewerToken(fileId)) +
    '/' +
    encodeURIComponent(viewerFileName(file));
  return OFFICE_VIEWER_BASE + encodeURIComponent(src);
}

/** One-line startup status for production logs. */
function describeOfficeViewerOrigin() {
  const raw = String(process.env.FRONTEND_URL || '').trim();
  const origin = normalizeFrontendOrigin(raw);
  if (origin) {
    return {
      ok: true,
      message: `[office-viewer] FRONTEND_URL=${raw} OK (Microsoft PowerPoint links use ${origin})`
    };
  }
  return {
    ok: false,
    message:
      `[office-viewer] WARNING: FRONTEND_URL=${raw || '(not set)'} is not a public https site. ` +
      'Lessons will not open in Microsoft PowerPoint until it is set to https://remoedph.com.'
  };
}

module.exports = {
  normalizeFrontendOrigin,
  describeOfficeViewerOrigin,
  signOfficeViewerToken,
  verifyOfficeViewerToken,
  buildOfficeViewerEmbedUrl,
};
