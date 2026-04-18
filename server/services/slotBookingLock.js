/**
 * Redis mutex per (teacherId, TeacherSlot _id) so only one student can book that row at a time.
 * Key: lock:slot:{teacherId}:{slotId} — SET NX EX 5
 */
const { getRedis } = require('../utils/redisClient');

const LOCK_EX_SEC = 5;

function buildSlotLockKey(teacherId, slotMongoId) {
  const tid = String(teacherId || '').trim();
  const sid = String(slotMongoId || '').trim();
  return `lock:slot:${encodeURIComponent(tid)}:${encodeURIComponent(sid)}`;
}

/**
 * @param {string} teacherId — canonical Teacher.teacherId
 * @param {string} slotMongoId — TeacherSlot document _id
 * @param {string} ownerValue — student id or username stored as lock value
 * @returns {Promise<{ acquired: boolean, redisSkipped: boolean }>}
 */
async function tryAcquireSlotLock(teacherId, slotMongoId, ownerValue) {
  const r = await getRedis();
  if (!r) {
    return { acquired: true, redisSkipped: true };
  }
  const key = buildSlotLockKey(teacherId, slotMongoId);
  const val = String(ownerValue || 'unknown');
  try {
    const ok = await r.set(key, val, { NX: true, EX: LOCK_EX_SEC });
    return { acquired: ok === 'OK', redisSkipped: false };
  } catch (_e) {
    return { acquired: true, redisSkipped: true };
  }
}

async function releaseSlotLock(teacherId, slotMongoId) {
  const r = await getRedis();
  if (!r) return;
  try {
    await r.del(buildSlotLockKey(teacherId, slotMongoId));
  } catch (_e) {
    /* ignore */
  }
}

module.exports = {
  buildSlotLockKey,
  tryAcquireSlotLock,
  releaseSlotLock,
  LOCK_EX_SEC,
};
