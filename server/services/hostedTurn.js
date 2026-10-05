/**
 * Optional hosted TURN relay (Cloudflare Realtime TURN) for the live classroom.
 * Enabled only when CLOUDFLARE_TURN_KEY_ID and CLOUDFLARE_TURN_API_TOKEN are set.
 * The server asks Cloudflare for short-lived credentials and caches them; the API token
 * never leaves the server. Returns [] on any failure so /api/rtc-config still works.
 */
const KEY_ID = () => String(process.env.CLOUDFLARE_TURN_KEY_ID || '').trim();
const API_TOKEN = () => String(process.env.CLOUDFLARE_TURN_API_TOKEN || '').trim();

const CREDENTIAL_TTL_SECONDS = 24 * 60 * 60;
const REFRESH_BEFORE_MS = 2 * 60 * 60 * 1000;
const FETCH_TIMEOUT_MS = 5000;

let cache = { servers: [], expiresAt: 0 };
let inflight = null;

function isConfigured() {
  return !!(KEY_ID() && API_TOKEN());
}

/** Chrome blocks TURN/STUN on port 53, so drop those URLs. */
function cleanUrls(urls) {
  const list = Array.isArray(urls) ? urls : [urls];
  return list
    .map((u) => String(u || '').trim())
    .filter(Boolean)
    .filter((u) => !/:53(\?|$)/.test(u));
}

/** Accepts the `generate-ice-servers` shape (array) or the older `generate` shape (object). */
function normalizeIceServers(body) {
  if (!body || !body.iceServers) return [];
  const raw = Array.isArray(body.iceServers) ? body.iceServers : [body.iceServers];
  return raw
    .map((s) => {
      if (!s) return null;
      const urls = cleanUrls(s.urls);
      if (!urls.length) return null;
      const out = { urls };
      if (s.username) {
        out.username = String(s.username);
        out.credential = String(s.credential || '');
      }
      return out;
    })
    .filter(Boolean);
}

async function requestCredentials() {
  if (typeof fetch !== 'function') throw new Error('global fetch unavailable (Node 18+ required)');
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  try {
    const resp = await fetch(
      `https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(KEY_ID())}/credentials/generate-ice-servers`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${API_TOKEN()}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify({ ttl: CREDENTIAL_TTL_SECONDS }),
        signal: controller.signal
      }
    );
    if (!resp.ok) throw new Error(`Cloudflare TURN HTTP ${resp.status}`);
    return normalizeIceServers(await resp.json());
  } finally {
    clearTimeout(timer);
  }
}

/** @returns {Promise<Array>} ICE server entries to append, or [] when unavailable. */
async function getHostedTurnServers() {
  if (!isConfigured()) return [];
  const now = Date.now();
  if (cache.servers.length && now < cache.expiresAt) return cache.servers;
  if (!inflight) {
    inflight = requestCredentials()
      .then((servers) => {
        if (servers.length) {
          cache = { servers, expiresAt: Date.now() + CREDENTIAL_TTL_SECONDS * 1000 - REFRESH_BEFORE_MS };
        }
        return servers;
      })
      .catch((err) => {
        console.warn('[hosted-turn] credential request failed:', err.message || err);
        return [];
      })
      .finally(() => {
        inflight = null;
      });
  }
  const fresh = await inflight;
  // If refresh failed, a previous (still valid for a while) set is better than nothing.
  return fresh.length ? fresh : (cache.expiresAt + REFRESH_BEFORE_MS > Date.now() ? cache.servers : []);
}

module.exports = { isConfigured, getHostedTurnServers, normalizeIceServers };
