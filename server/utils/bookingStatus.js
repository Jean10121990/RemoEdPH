/** True for any cancelled booking status (plain or emergency). */
function isCancelledStatus(status) {
  const s = String(status || '').toLowerCase();
  return s === 'cancelled' || s === 'cancelled_by_student_emergency' || s.startsWith('cancelled');
}

/** Values to exclude from "active" booking queries. */
function cancelledStatusValues() {
  return ['cancelled', 'cancelled_by_student_emergency'];
}

module.exports = {
  isCancelledStatus,
  cancelledStatusValues,
};
