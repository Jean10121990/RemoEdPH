/**
 * Optional Redis client (cache-aside). If Redis is down or missing, getRedis() resolves to null
 * so the API server keeps running without Redis.
 */
const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const CONNECT_FAIL_COOLDOWN_MS = 60 * 1000;

let client = null;
let connectPromise = null;
let lastConnectFailAt = 0;

function logWarn(msg, err) {
  const extra = err && err.message ? `: ${err.message}` : '';
  console.warn(`[redis] ${msg}${extra}`);
}

/**
 * @returns {Promise<import('redis').RedisClientType | null>}
 */
async function getRedis() {
  if (process.env.REDIS_DISABLED === '1') {
    return null;
  }
  if (client && client.isOpen) {
    return client;
  }
  if (
    !connectPromise &&
    lastConnectFailAt > 0 &&
    Date.now() - lastConnectFailAt < CONNECT_FAIL_COOLDOWN_MS
  ) {
    return null;
  }
  if (connectPromise) {
    try {
      await connectPromise;
    } catch (_e) {
      return null;
    }
    return client && client.isOpen ? client : null;
  }

  const c = createClient({ url: REDIS_URL });
  c.on('error', (err) => {
    logWarn('client error', err);
  });

  connectPromise = c
    .connect()
    .then(() => {
      connectPromise = null;
      client = c;
      lastConnectFailAt = 0;
      console.log('[redis] connected', REDIS_URL.replace(/:[^:@/]+@/, ':****@'));
      return client;
    })
    .catch((err) => {
      connectPromise = null;
      lastConnectFailAt = Date.now();
      logWarn('connect failed — continuing without Redis (retry after cooldown)', err);
      client = null;
      return null;
    });

  const resolved = await connectPromise;
  return resolved && resolved.isOpen ? resolved : null;
}

module.exports = { getRedis, REDIS_URL };
