const DOMPurify = require('isomorphic-dompurify');

/**
 * Sanitize rich text intended for teacher-only lesson notes before DB storage.
 * Conservative tag allowlist; strips scripts and event handlers.
 */
function sanitizeTeacherNotes(input) {
  if (input == null) return '';
  const str = String(input);
  return DOMPurify.sanitize(str, {
    ALLOWED_TAGS: ['p', 'br', 'strong', 'em', 'b', 'i', 'u', 'ul', 'ol', 'li', 'a', 'span', 'div'],
    ALLOWED_ATTR: ['href', 'target', 'rel', 'class'],
  });
}

module.exports = { sanitizeTeacherNotes };
