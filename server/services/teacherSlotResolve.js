const Teacher = require('../models/Teacher');
const TeacherSlot = require('../models/TeacherSlot');
const Booking = require('../models/Booking');
const { normalizeId } = require('../utils/normalizeId');

/** 24-char hex MongoDB ObjectId — use with Teacher.findById */
function isProbableHexObjectIdForTeacher(s) {
  return typeof s === 'string' && /^[a-f0-9]{24}$/i.test(String(s).trim());
}

function escapeRegexForTeacherLookup(str) {
  return String(str || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/** Normalize slot storage (ObjectId or string) to Teacher.teacherId string (case-insensitive for emails). */
async function resolveToCanonicalTeacherId(rawTeacherId) {
  if (rawTeacherId == null || rawTeacherId === '') return null;
  if (typeof rawTeacherId === 'string') {
    const s = String(rawTeacherId).trim();
    const norm = normalizeId(s);
    if (norm) {
      const byExact = await Teacher.findOne({ teacherId: s });
      if (byExact) return String(byExact.teacherId);
      const byNorm = await Teacher.findOne({ $expr: { $eq: [{ $toLower: '$teacherId' }, norm] } });
      if (byNorm) return String(byNorm.teacherId);
      const emailMatch = { email: { $regex: new RegExp('^' + escapeRegexForTeacherLookup(s) + '$', 'i') } };
      const byUsername = await Teacher.findOne({ $or: [{ username: s }, emailMatch] });
      if (byUsername) return String(byUsername.teacherId);
    }
  }
  if (isProbableHexObjectIdForTeacher(String(rawTeacherId))) {
    const byOid = await Teacher.findById(rawTeacherId);
    if (byOid) return String(byOid.teacherId);
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

/**
 * Open TeacherSlot for this UTC instant and normalized teacher id (email / portal id).
 * Uses $toLower on stored teacherId so legacy mixed-case rows still match.
 */
async function findOpenTeacherSlotByUtcAndNormalizedTeacher(canonicalUtcIso, rawTeacherId) {
  const norm = normalizeId(rawTeacherId);
  if (!norm) return null;
  const utcInstant = new Date(canonicalUtcIso);
  if (isNaN(utcInstant.getTime())) return null;
  const t0 = utcInstant.getTime();
  const row = await TeacherSlot.findOne({
    available: true,
    dateTimeUtc: { $gte: new Date(t0 - 2000), $lte: new Date(t0 + 2000) },
    $expr: { $eq: [{ $toLower: '$teacherId' }, norm] },
  }).lean();
  return row;
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
  return [...new Set(candidates.map((x) => String(x)))].sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
}

module.exports = {
  isProbableHexObjectIdForTeacher,
  escapeRegexForTeacherLookup,
  resolveToCanonicalTeacherId,
  findOpenSlotsByUtcInstant,
  findOpenTeacherSlotByUtcAndNormalizedTeacher,
  getCandidateTeachersForSlotUtc,
};
