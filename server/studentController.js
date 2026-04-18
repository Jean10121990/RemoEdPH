/**
 * Student-facing Redis keys and profile cache + entrypoint for isolated slot booking.
 *
 * Keys (per product spec):
 * - student:profile:${studentId}
 * - teacher:slots:${teacherId} — implemented in services/slotsRedisCache.js (same string shape)
 */
const { withRedis } = require('./utils/redisClient');

const PROFILE_TTL_SEC = 120;

function studentProfileCacheKey(studentId) {
  return `student:profile:${String(studentId || '').trim()}`;
}

function teacherSlotsCacheKey(teacherId) {
  return `teacher:slots:${encodeURIComponent(String(teacherId || '').trim())}`;
}

async function getStudentProfileFromCache(studentId) {
  try {
    const key = studentProfileCacheKey(studentId);
    const raw = await withRedis((r) => r.get(key));
    if (!raw) return null;
    try {
      return JSON.parse(raw);
    } catch (_e) {
      return null;
    }
  } catch (e) {
    console.warn('[studentController] Redis unavailable for profile cache read:', e.message || e);
    return null;
  }
}

async function setStudentProfileCache(studentId, body) {
  try {
    let payload;
    try {
      payload = JSON.stringify(body);
    } catch (e) {
      console.warn('[studentController] profile cache skip (not serializable):', e.message || e);
      return;
    }
    const key = studentProfileCacheKey(studentId);
    await withRedis((r) => r.set(key, payload, { EX: PROFILE_TTL_SEC }));
  } catch (e) {
    console.warn('[studentController] Redis unavailable for profile cache write:', e.message || e);
  }
}

async function invalidateStudentProfileCache(studentId) {
  try {
    const key = studentProfileCacheKey(studentId);
    await withRedis((r) => r.del(key));
  } catch (e) {
    console.warn('[studentController] Redis unavailable for profile cache invalidate:', e.message || e);
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
