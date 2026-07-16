const Teacher = require('../models/Teacher');
const Student = require('../models/Student');
const Admin = require('../models/Admin');

const DENY_TEACHER_STUDENT_MSG =
  'Direct messaging between teachers and students is disabled.';

/**
 * Resolve peer messaging role for a canonical id.
 * @returns {'teacher'|'admin'|'student'|null}
 */
async function resolvePeerRole(rawId) {
  const id = String(rawId || '').trim();
  if (!id) return null;

  if (id.startsWith('admin:')) {
    const username = id.slice(6).trim();
    if (!username) return null;
    const admin = await Admin.findOne({ username }).select('_id username').lean();
    return admin ? 'admin' : null;
  }

  const teacher = await Teacher.findOne({
    $or: [{ teacherId: id }, { username: id }, { email: id }],
  })
    .select('_id teacherId')
    .lean();
  if (teacher) return 'teacher';

  const admin = await Admin.findOne({
    $or: [{ username: id }, { email: id }],
  })
    .select('_id username')
    .lean();
  if (admin) return 'admin';

  const student = await Student.findOne({
    $or: [{ username: id }, { email: id }, { studentId: id }],
  })
    .select('_id username')
    .lean();
  if (student) return 'student';

  return null;
}

/** True if a teacher may send a peer message to this recipient id. */
async function teacherMayMessageRecipient(recipientId) {
  const role = await resolvePeerRole(recipientId);
  return role === 'teacher' || role === 'admin';
}

/** Canonical peerId for an admin account used in PeerMessage / notifications. */
function adminPeerId(username) {
  return 'admin:' + String(username || '').trim();
}

module.exports = {
  DENY_TEACHER_STUDENT_MSG,
  resolvePeerRole,
  teacherMayMessageRecipient,
  adminPeerId,
};
