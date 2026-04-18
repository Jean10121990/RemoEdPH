/**
 * Cache-aside for GET /api/teacher/slots (per canonical teacherId).
 * Key: teacher:slots:{teacherId} — value JSON { week, allSlotsFlag, tz, payload } with 300s TTL.
 * (Legacy key slots:{...} is deleted on invalidate for one-time cleanup.)
 */
const { withRedis } = require('../utils/redisClient');

const TTL_SEC = 300;
/** Skip Redis SET when serialized value exceeds this — stringify + network can exceed DB read cost. */
const MAX_CACHE_VALUE_BYTES = Number(process.env.REDIS_SLOTS_CACHE_MAX_BYTES || 384 * 1024);

function cacheKey(teacherId) {
  const tid = String(teacherId || '').trim();
  return `teacher:slots:${encodeURIComponent(tid)}`;
}

function legacySlotsCacheKey(teacherId) {
  const tid = String(teacherId || '').trim();
  return `slots:${encodeURIComponent(tid)}`;
}

/**
 * @returns {Promise<{ slots: any[], bookings: any[] } | null>}
 */
async function readTeacherSlotsCache(teacherId, week, allSlotsFlag, tz) {
  const raw = await withRedis((r) => r.get(cacheKey(teacherId)));
  if (!raw) return null;
  try {
    const o = JSON.parse(raw);
    if (String(o.week) !== String(week)) return null;
    if (Boolean(o.allSlotsFlag) !== Boolean(allSlotsFlag)) return null;
    const otz = o.tz == null ? '' : String(o.tz);
    const rtz = tz == null ? '' : String(tz);
    if (otz !== rtz) return null;
    if (!o.payload || !Array.isArray(o.payload.slots)) return null;
    return o.payload;
  } catch (_e) {
    return null;
  }
}

/**
 * @param {object} payload — { slots, bookings }
 */
async function writeTeacherSlotsCache(teacherId, week, allSlotsFlag, tz, payload) {
  // Single compact JSON object (no pretty-print) — smallest stringify for Redis value size.
  const envelope = {
    week: String(week),
    allSlotsFlag: Boolean(allSlotsFlag),
    tz: tz == null ? '' : String(tz),
    payload,
  };
  let body;
  try {
    body = JSON.stringify(envelope);
  } catch (_e) {
    return;
  }
  if (typeof body === 'string' && Buffer.byteLength(body, 'utf8') > MAX_CACHE_VALUE_BYTES) {
    return;
  }
  const key = cacheKey(teacherId);
  await withRedis((r) => r.set(key, body, { EX: TTL_SEC }));
}

async function invalidateSlotsCache(teacherId) {
  const k1 = cacheKey(teacherId);
  const k2 = legacySlotsCacheKey(teacherId);
  await withRedis(async (r) => {
    await r.del(k1);
    await r.del(k2);
  });
}

module.exports = {
  readTeacherSlotsCache,
  writeTeacherSlotsCache,
  invalidateSlotsCache,
};
