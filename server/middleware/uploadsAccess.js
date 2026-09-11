/**
 * Auth-gated serving for files under uploads/ (replaces public express.static('/uploads')).
 * Accepts: Authorization Bearer, ?token=, remoed_media_token cookie, or admin session.
 * Public allowlist: teacher-profiles (marketing directory / landing).
 */
const path = require('path');
const fs = require('fs');
const jwt = require('jsonwebtoken');
const { isTokenBlacklisted } = require('../services/jwtBlacklist');
const { findUpload, openDownloadStream } = require('../services/uploadStore');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';
const UPLOADS_ROOT = path.resolve(path.join(__dirname, '../../uploads'));

/** First path segment under /uploads that may be fetched without auth (public marketing assets). */
const PUBLIC_UPLOAD_PREFIXES = new Set(['teacher-profiles']);

function getCookieValue(req, name) {
  const raw = String(req.headers && req.headers.cookie ? req.headers.cookie : '');
  if (!raw) return '';
  const parts = raw.split(';');
  for (let i = 0; i < parts.length; i++) {
    const piece = parts[i].trim();
    if (!piece) continue;
    const eq = piece.indexOf('=');
    if (eq <= 0) continue;
    const key = piece.slice(0, eq).trim();
    if (key !== name) continue;
    try {
      return decodeURIComponent(piece.slice(eq + 1).trim());
    } catch (_e) {
      return piece.slice(eq + 1).trim();
    }
  }
  return '';
}

function extractBearerOrQueryToken(req) {
  const header = req.headers && req.headers.authorization;
  if (header && typeof header === 'string') {
    const parts = header.split(' ');
    if (parts.length >= 2 && /^Bearer$/i.test(parts[0])) {
      return parts.slice(1).join(' ').trim();
    }
  }
  if (req.query && req.query.token) return String(req.query.token).trim();
  if (req.body && req.body.token) return String(req.body.token).trim();
  return getCookieValue(req, 'remoed_media_token');
}

function jwtPayloadIsAdmin(decoded) {
  if (!decoded) return false;
  if (decoded.isAdmin === true) return true;
  return String(decoded.role || '')
    .trim()
    .toLowerCase() === 'admin';
}

/**
 * Relative path under uploads from req path (/uploads/foo/bar → foo/bar).
 */
function relativeUploadPathFromReq(req) {
  const full = String(req.path || req.url || '').split('?')[0];
  let rel = full;
  if (rel.startsWith('/uploads/')) rel = rel.slice('/uploads/'.length);
  else if (rel.startsWith('/api/media/')) rel = rel.slice('/api/media/'.length);
  else if (rel.startsWith('/')) rel = rel.slice(1);
  try {
    rel = decodeURIComponent(rel);
  } catch (_e) {
    /* keep raw */
  }
  return rel.replace(/^[/\\]+/, '').replace(/\\/g, '/');
}

function isPublicUploadRelative(rel) {
  const first = String(rel || '')
    .split('/')
    .filter(Boolean)[0];
  return first && PUBLIC_UPLOAD_PREFIXES.has(first);
}

/**
 * Resolve to an absolute file path under uploads/, or null if unsafe / missing.
 */
function resolveSafeUploadFile(relPath) {
  const rel = String(relPath || '')
    .replace(/\\/g, '/')
    .replace(/^[/\\]+/, '');
  if (!rel || rel.includes('\0') || /(^|\/)\.\.(?:\/|$)/.test(rel)) {
    return null;
  }
  const abs = path.resolve(UPLOADS_ROOT, rel);
  const rootWithSep = UPLOADS_ROOT.endsWith(path.sep) ? UPLOADS_ROOT : UPLOADS_ROOT + path.sep;
  if (abs !== UPLOADS_ROOT && !abs.startsWith(rootWithSep)) {
    return null;
  }
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) {
    return null;
  }
  return abs;
}

/**
 * Legacy issue screenshots: DB may store /uploads/slides/screenshot-T-R.ext while the file
 * lives under uploads/issue-screenshots/issue-T-R.ext.
 */
function resolveLegacyIssueScreenshot(relPath) {
  const m = /^slides\/(screenshot-.+)$/i.exec(String(relPath || '').replace(/\\/g, '/'));
  if (!m) return null;
  const safe = path.basename(m[1]);
  if (!safe || safe !== m[1] || safe.includes('..')) return null;
  const issuePath = path.join(UPLOADS_ROOT, 'issue-screenshots', 'issue-' + safe.replace(/^screenshot-/i, ''));
  if (fs.existsSync(issuePath) && fs.statSync(issuePath).isFile()) {
    return issuePath;
  }
  return null;
}

function requireUploadAccess(req, res, next) {
  try {
    const rel = relativeUploadPathFromReq(req);
    req.uploadRelativePath = rel;

    if (isPublicUploadRelative(rel)) {
      return next();
    }

    if (req.session && req.session.adminAuth === true && req.session.adminUsername) {
      req.user = {
        username: req.session.adminUsername,
        isAdmin: true,
        role: 'admin',
        adminId: req.session.adminId || null,
        adminRole: req.session.adminRole || 'super_admin',
        sessionVersion: req.session.adminSessionVersion,
      };
      return next();
    }

    const token = extractBearerOrQueryToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Access denied. Authentication required for uploads.' });
    }
    // Shared secret for server-to-server pulls (localhost → production file mirror).
    const mirror = String(process.env.UPLOADS_FETCH_TOKEN || process.env.MEDIA_FETCH_TOKEN || '').trim();
    if (mirror && token === mirror) {
      req.user = { role: 'service', isAdmin: true, purpose: 'uploads-fetch' };
      return next();
    }
    if (isTokenBlacklisted(token)) {
      return res.status(401).json({ error: 'Token has been revoked.' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    req.user = decoded;
    return next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token.' });
  }
}

function mimeFromPath(filePath) {
  const ext = path.extname(filePath || '').toLowerCase();
  const map = {
    '.pdf': 'application/pdf',
    '.png': 'image/png',
    '.jpg': 'image/jpeg',
    '.jpeg': 'image/jpeg',
    '.gif': 'image/gif',
    '.webp': 'image/webp',
    '.svg': 'image/svg+xml',
    '.mp4': 'video/mp4',
    '.webm': 'video/webm',
    '.mp3': 'audio/mpeg',
    '.wav': 'audio/wav',
    '.ogg': 'audio/ogg',
    '.txt': 'text/plain',
    '.html': 'text/html',
    '.htm': 'text/html',
    '.css': 'text/css',
    '.js': 'application/javascript',
    '.json': 'application/json',
    '.ppt': 'application/vnd.ms-powerpoint',
    '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    '.doc': 'application/msword',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  };
  return map[ext] || 'application/octet-stream';
}

/**
 * Serve a file kept in GridFS. Returns false when the path is not stored there, so the
 * caller can fall through to its own 404.
 */
async function serveStoredUpload(req, res, rel) {
  const doc = await findUpload(rel);
  if (!doc) return false;

  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', isPublicUploadRelative(rel) ? 'public, max-age=3600' : 'private, no-store');
  res.setHeader('Content-Type', doc.contentType || mimeFromPath(rel));
  if (Number.isFinite(Number(doc.length))) {
    res.setHeader('Content-Length', String(doc.length));
  }
  if (doc.uploadDate) {
    res.setHeader('Last-Modified', new Date(doc.uploadDate).toUTCString());
  }

  if (req.method === 'HEAD') {
    res.end();
    return true;
  }

  const stream = openDownloadStream(doc._id);
  stream.on('error', (err) => {
    console.error('uploads stream error:', (err && err.message) || err);
    if (!res.headersSent) res.status(404).json({ error: 'File not found' });
    else res.destroy();
  });
  stream.pipe(res);
  return true;
}

async function serveAuthenticatedUpload(req, res) {
  try {
    const rel = req.uploadRelativePath || relativeUploadPathFromReq(req);
    let abs = resolveSafeUploadFile(rel);
    if (!abs) {
      abs = resolveLegacyIssueScreenshot(rel);
    }
    if (!abs) {
      // Files uploaded in production live in GridFS, not on the container filesystem.
      const stored = await serveStoredUpload(req, res, rel).catch((err) => {
        console.error('uploads store lookup failed:', (err && err.message) || err);
        return false;
      });
      if (stored) return undefined;
      return res.status(404).json({ error: 'File not found' });
    }

    const publicOk = isPublicUploadRelative(rel);
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Cache-Control', publicOk ? 'public, max-age=3600' : 'private, no-store');
    res.setHeader('Content-Type', mimeFromPath(abs));

    return res.sendFile(abs, (err) => {
      if (err && !res.headersSent) {
        console.error('uploads serve error:', err.message || err);
        res.status(404).json({ error: 'File not found' });
      }
    });
  } catch (err) {
    console.error('uploads serve error:', err);
    return res.status(500).json({ error: 'Failed to serve file' });
  }
}

const uploadsAccessHandlers = [requireUploadAccess, serveAuthenticatedUpload];

module.exports = {
  UPLOADS_ROOT,
  PUBLIC_UPLOAD_PREFIXES,
  getCookieValue,
  extractBearerOrQueryToken,
  relativeUploadPathFromReq,
  isPublicUploadRelative,
  resolveSafeUploadFile,
  resolveLegacyIssueScreenshot,
  requireUploadAccess,
  serveAuthenticatedUpload,
  serveStoredUpload,
  uploadsAccessHandlers,
  jwtPayloadIsAdmin,
};
