/**
 * Case-insensitive identity for teacherId / email-style identifiers.
 * Use at every boundary: save, query keys, and client maps.
 */
function normalizeId(id) {
  if (id == null || id === '') return '';
  return String(id).trim().toLowerCase();
}

module.exports = { normalizeId };
