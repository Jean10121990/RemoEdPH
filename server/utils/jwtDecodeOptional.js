const jwt = require('jsonwebtoken');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

/** Decode Bearer JWT without failing; returns null if missing/invalid. */
function decodeBearerUser(req) {
  try {
    const h = req.headers && req.headers.authorization;
    if (!h || typeof h !== 'string' || !h.startsWith('Bearer ')) return null;
    const token = h.slice(7).trim();
    if (!token) return null;
    return jwt.verify(token, JWT_SECRET);
  } catch (_e) {
    return null;
  }
}

module.exports = { decodeBearerUser };
