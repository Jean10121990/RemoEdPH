/**
 * Student-facing Redis keys and profile cache + entrypoint for isolated slot booking.
 *
 * Keys (per product spec):
 * - student:profile:${studentId}
 * - teacher:slots:${teacherId} — implemented in services/slotsRedisCache.js (same string shape)
 */
const { getRedis } = require('./utils/redisClient');

const PROFILE_TTL_SEC = 120;

function studentProfileCacheKey(studentId) {
  return `student:profile:${String(studentId || '').trim()}`;
}

function teacherSlotsCacheKey(teacherId) {
  return `teacher:slots:${encodeURIComponent(String(teacherId || '').trim())}`;
}

async function getStudentProfileFromCache(studentId) {
  const r = await getRedis();
  if (!r) return null;
  let raw;
  try {
    raw = await r.get(studentProfileCacheKey(studentId));
  } catch (_e) {
    return null;
  }
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (_e) {
    return null;
  }
}

async function setStudentProfileCache(studentId, body) {
  const r = await getRedis();
  if (!r) return;
  try {
    await r.set(studentProfileCacheKey(studentId), JSON.stringify(body), { EX: PROFILE_TTL_SEC });
  } catch (_e) {
    /* ignore */
  }
}

async function invalidateStudentProfileCache(studentId) {
  const r = await getRedis();
  if (!r) return;
  try {
    await r.del(studentProfileCacheKey(studentId));
  } catch (_e) {
    /* ignore */
  }
}

async function bookSlot(req, res) {
  const { runBookSlot } = require('./services/studentBookSlotService');
  return runBookSlot(req, res);
}

module.exports = {
  studentProfileCacheKey,
  teacherSlotsCacheKey,
  getStudentProfileFromCache,
  setStudentProfileCache,
  invalidateStudentProfileCache,
  bookSlot,
};
