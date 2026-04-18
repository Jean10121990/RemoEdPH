/**
 * Optional Redis client (cache-aside). If Redis is down or missing, getRedis() resolves to null
 * so the API server keeps running without Redis.
 *
 * - socket.connectTimeout: fail TCP connect quickly (default can hang).
 * - getRedis() caps how long it waits for an in-flight connect so callers can fall back to DB.
 * - primeRedisConnection() starts connect in the background after HTTP listen (never blocks boot).
 */
const { createClient } = require('redis');

const REDIS_URL = process.env.REDIS_URL || 'redis://127.0.0.1:6379';
const CONNECT_FAIL_COOLDOWN_MS = 60 * 1000;
/** Default 1.5s — fail fast so handlers fall through to MongoDB instead of long hangs. */
const REDIS_FAIL_FAST_MS = Number(process.env.REDIS_FAIL_FAST_MS || 1500);
/** Socket-level connect timeout (ms). */
const REDIS_CONNECT_TIMEOUT_MS = Number(
  process.env.REDIS_CONNECT_TIMEOUT_MS || REDIS_FAIL_FAST_MS
);
/** Max time a single getRedis() waits for an in-flight connect before returning null. */
const REDIS_GET_WAIT_MS = Number(process.env.REDIS_GET_WAIT_MS || REDIS_FAIL_FAST_MS);

const WAIT_TIMEOUT = Symbol('redisGetWaitTimeout');

let client = null;
let connectPromise = null;
let lastConnectFailAt = 0;

function logWarn(msg, err) {
  const extra = err && err.message ? `: ${err.message}` : '';
  console.warn(`[redis] ${msg}${extra}`);
}

function createRedisClient() {
  return createClient({
    url: REDIS_URL,
    /** Reject commands while socket is not ready — avoids queued waits on flaky Redis. */
    disableOfflineQueue: true,
    socket: {
      connectTimeout: REDIS_CONNECT_TIMEOUT_MS,
    },
  });
}

/**
 * Wait for an in-flight connect with a hard cap so API handlers can use DB immediately.
 * @param {Promise<import('redis').RedisClientType | null>} p
 * @param {number} ms
 */
async function awaitConnectCapped(p, ms) {
  const winner = await Promise.race([
    p,
    new Promise((resolve) => {
      setTimeout(() => resolve(WAIT_TIMEOUT), ms);
    }),
  ]);
  if (winner === WAIT_TIMEOUT) {
    return client && client.isOpen && client.isReady ? client : null;
  }
  return winner && winner.isOpen && winner.isReady ? winner : null;
}

/**
 * Start Redis handshake in the background (do not await at server boot).
 */
function primeRedisConnection() {
  if (process.env.REDIS_DISABLED === '1') return;
  setImmediate(() => {
    getRedis().catch(() => {});
  });
}

/**
 * Connected, ready client or null — never throws; callers use DB/cache-skip path.
 * @returns {Promise<import('redis').RedisClientType | null>}
 */
async function getRedis() {
  try {
    if (process.env.REDIS_DISABLED === '1') {
      return null;
    }
    if (client && client.isOpen && client.isReady) {
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
        return await awaitConnectCapped(connectPromise, REDIS_GET_WAIT_MS);
      } catch (_e) {
        return null;
      }
    }

    const c = createRedisClient();
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

    try {
      return await awaitConnectCapped(connectPromise, REDIS_GET_WAIT_MS);
    } catch (_e) {
      return client && client.isOpen && client.isReady ? client : null;
    }
  } catch (e) {
    logWarn('getRedis failed — using DB fallback', e);
    return null;
  }
}

/**
 * Run a Redis op with fail-fast semantics: any error or missing client → null (or caller default).
 * @template T
 * @param {(r: import('redis').RedisClientType) => Promise<T>} fn
 * @returns {Promise<T | null>}
 */
async function withRedis(fn) {
  let r;
  try {
    r = await getRedis();
    if (!r || !r.isOpen) return null;
    return await fn(r);
  } catch (_e) {
    return null;
  }
}

module.exports = { getRedis, withRedis, REDIS_URL, primeRedisConnection };
