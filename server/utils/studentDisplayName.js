/**
 * Classroom-facing label for a student (child privacy: no legal names on the class stage).
 * Prefers the nickname the student set; otherwise a stable "Student####" so the same
 * child keeps the same label in every class.
 */

const FALLBACK_PREFIX = 'Student';

function hashSeed(seed) {
  const s = String(seed || '');
  let h = 0x811c9dc5; // FNV-1a offset basis
  for (let i = 0; i < s.length; i += 1) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Stable 4-digit number (1000–9999) for a student account seed. */
function stableStudentNumber(seed) {
  return 1000 + (hashSeed(String(seed || '').trim().toLowerCase()) % 9000);
}

function studentNicknameOf(student) {
  if (!student) return '';
  return String(student.nickname || '').trim();
}

/**
 * @param {object|null} student Student document or lean object (may be null)
 * @param {string} [seedFallback] Booking studentId (username/email) when the student doc is missing
 * @returns {string} nickname, else "Student####", else "Student"
 */
function studentClassroomLabel(student, seedFallback = '') {
  const nickname = studentNicknameOf(student);
  if (nickname) return nickname;
  // Username first so the label matches whether or not the student doc was found
  const seed =
    (student && (student.username || student.email || student._id)) || seedFallback || '';
  const normalized = String(seed || '').trim();
  if (!normalized || normalized === 'undefined' || normalized === 'null') return FALLBACK_PREFIX;
  return FALLBACK_PREFIX + stableStudentNumber(normalized);
}

module.exports = {
  FALLBACK_PREFIX,
  stableStudentNumber,
  studentNicknameOf,
  studentClassroomLabel,
};
