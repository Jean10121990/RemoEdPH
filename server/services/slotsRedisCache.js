/**
 * Cache-aside for GET /api/teacher/slots (per canonical teacherId).
 * Key: teacher:slots:{teacherId} — value JSON { week, allSlotsFlag, tz, payload } with 300s TTL.
 * (Legacy key slots:{...} is deleted on invalidate for one-time cleanup.)
 */
const { getRedis } = require('../utils/redisClient');

const TTL_SEC = 300;

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
  const r = await getRedis();
  if (!r) return null;
  let raw;
  try {
    raw = await r.get(cacheKey(teacherId));
  } catch (e) {
    return null;
  }
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
  const r = await getRedis();
  if (!r) return;
  const body = JSON.stringify({
    week: String(week),
    allSlotsFlag: Boolean(allSlotsFlag),
    tz: tz == null ? '' : String(tz),
    payload,
  });
  try {
    await r.set(cacheKey(teacherId), body, { EX: TTL_SEC });
  } catch (_e) {
    /* ignore */
  }
}

async function invalidateSlotsCache(teacherId) {
  const r = await getRedis();
  if (!r) return;
  try {
    await r.del(cacheKey(teacherId));
    await r.del(legacySlotsCacheKey(teacherId));
  } catch (_e) {
    /* ignore */
  }
}

module.exports = {
  readTeacherSlotsCache,
  writeTeacherSlotsCache,
  invalidateSlotsCache,
};
