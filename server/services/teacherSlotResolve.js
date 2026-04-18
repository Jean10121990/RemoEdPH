const Teacher = require('../models/Teacher');
const TeacherSlot = require('../models/TeacherSlot');
const Booking = require('../models/Booking');

/** 24-char hex MongoDB ObjectId — use with Teacher.findById */
function isProbableHexObjectIdForTeacher(s) {
  return typeof s === 'string' && /^[a-f0-9]{24}$/i.test(String(s).trim());
}

function escapeRegexForTeacherLookup(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Normalize slot storage (ObjectId or string) to Teacher.teacherId string */
async function resolveToCanonicalTeacherId(rawTeacherId) {
  if (rawTeacherId == null || rawTeacherId === '') return null;
  if (typeof rawTeacherId === 'string') {
    const s = rawTeacherId.trim();
    const byField = await Teacher.findOne({ teacherId: s });
    if (byField) return byField.teacherId;
    const emailMatch = { email: { $regex: new RegExp('^' + escapeRegexForTeacherLookup(s) + '$', 'i') } };
    const byUsername = await Teacher.findOne({ $or: [{ username: s }, emailMatch] });
    if (byUsername) return byUsername.teacherId;
  }
  if (isProbableHexObjectIdForTeacher(String(rawTeacherId))) {
    const byOid = await Teacher.findById(rawTeacherId);
    if (byOid) return byOid.teacherId;
  }
  return null;
}

/** Find open slots for a booking instant (handles Date vs ISO string in DB). */
async function findOpenSlotsByUtcInstant(canonicalUtcIso) {
  const utcInstant = new Date(canonicalUtcIso);
  if (isNaN(utcInstant.getTime())) return [];
  let slots = await TeacherSlot.find({
    dateTimeUtc: utcInstant,
    available: true
  }).lean();
  if (slots.length > 0) return slots;
  const t0 = utcInstant.getTime();
  return TeacherSlot.find({
    available: true,
    dateTimeUtc: { $gte: new Date(t0 - 2000), $lte: new Date(t0 + 2000) }
  }).lean();
}

/** All teachers with an open slot at this UTC instant and no conflicting booking */
async function getCandidateTeachersForSlotUtc(canonicalUtcIso) {
  const slots = await findOpenSlotsByUtcInstant(canonicalUtcIso);
  const candidates = [];
  const utcD = new Date(canonicalUtcIso);
  for (const slot of slots) {
    const tid = await resolveToCanonicalTeacherId(slot.teacherId);
    if (!tid) continue;
    let existing = await Booking.findOne({
      teacherId: tid,
      dateTimeUtc: utcD,
      status: { $ne: 'cancelled' }
    });
    if (!existing) {
      existing = await Booking.findOne({
        teacherId: tid,
        dateTimeUtc: canonicalUtcIso,
        status: { $ne: 'cancelled' }
      });
    }
    if (!existing) candidates.push(tid);
  }
  return [...new Set(candidates)].sort((a, b) => a.localeCompare(b));
}

module.exports = {
  isProbableHexObjectIdForTeacher,
  escapeRegexForTeacherLookup,
  resolveToCanonicalTeacherId,
  findOpenSlotsByUtcInstant,
  getCandidateTeachersForSlotUtc,
};
