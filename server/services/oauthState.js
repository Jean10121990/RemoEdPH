/**
 * Signed OAuth state + short-lived finish tickets (HMAC, no Math.random identity).
 */
const crypto = require('crypto');
const { oauthStateSecret } = require('../config/oauth');

const STATE_TTL_MS = 10 * 60 * 1000;
const FINISH_TTL_MS = 2 * 60 * 1000;

function b64url(buf) {
  return Buffer.from(buf)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}

function fromB64url(str) {
  const s = String(str || '').replace(/-/g, '+').replace(/_/g, '/');
  const pad = s.length % 4 === 0 ? '' : '='.repeat(4 - (s.length % 4));
  return Buffer.from(s + pad, 'base64').toString('utf8');
}

function signPayload(payload, ttlMs) {
  const body = {
    ...payload,
    exp: Date.now() + ttlMs,
    n: crypto.randomBytes(8).toString('hex'),
  };
  const raw = b64url(JSON.stringify(body));
  const sig = crypto.createHmac('sha256', oauthStateSecret()).update(raw).digest('base64url');
  return `${raw}.${sig}`;
}

function verifyPayload(token) {
  const parts = String(token || '').split('.');
  if (parts.length !== 2) return null;
  const [raw, sig] = parts;
  const expect = crypto.createHmac('sha256', oauthStateSecret()).update(raw).digest('base64url');
  const a = Buffer.from(sig);
  const b = Buffer.from(expect);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  let body;
  try {
    body = JSON.parse(fromB64url(raw));
  } catch (_e) {
    return null;
  }
  if (!body || typeof body !== 'object') return null;
  if (!body.exp || Date.now() > Number(body.exp)) return null;
  return body;
}

function signState(payload) {
  return signPayload(payload, STATE_TTL_MS);
}

function verifyState(token) {
  return verifyPayload(token);
}

function signFinishTicket(payload) {
  return signPayload({ purpose: 'oauth_finish', ...payload }, FINISH_TTL_MS);
}

function verifyFinishTicket(token) {
  const body = verifyPayload(token);
  if (!body || body.purpose !== 'oauth_finish') return null;
  return body;
}

module.exports = {
  signState,
  verifyState,
  signFinishTicket,
  verifyFinishTicket,
  STATE_TTL_MS,
  FINISH_TTL_MS,
};
