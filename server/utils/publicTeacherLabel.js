/**
 * Student-facing teacher label — prefers the nickname over the legal name (privacy).
 */
function publicTeacherLabel(t, fallback = 'Unknown Teacher') {
  if (!t) return fallback;
  const nick = t.nickname && String(t.nickname).trim();
  if (nick) return nick;
  return (
    (t.fullname && String(t.fullname).trim()) ||
    [t.firstName, t.lastName].filter(Boolean).join(' ').trim() ||
    t.username ||
    t.email ||
    fallback
  );
}

module.exports = { publicTeacherLabel };
