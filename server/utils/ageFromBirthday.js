/**
 * Compute current age in whole years from a birthday (UTC-calendar safe for date-only).
 * @param {Date|string|null|undefined} birthday
 * @param {Date} [asOf]
 * @returns {number|null}
 */
function ageFromBirthday(birthday, asOf = new Date()) {
  if (birthday == null || birthday === '') return null;
  let y;
  let m;
  let d;
  if (birthday instanceof Date && !Number.isNaN(birthday.getTime())) {
    y = birthday.getUTCFullYear();
    m = birthday.getUTCMonth();
    d = birthday.getUTCDate();
  } else {
    const s = String(birthday).trim();
    const match = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (match) {
      y = Number(match[1]);
      m = Number(match[2]) - 1;
      d = Number(match[3]);
    } else {
      const parsed = new Date(s);
      if (Number.isNaN(parsed.getTime())) return null;
      y = parsed.getUTCFullYear();
      m = parsed.getUTCMonth();
      d = parsed.getUTCDate();
    }
  }
  const now = asOf instanceof Date && !Number.isNaN(asOf.getTime()) ? asOf : new Date();
  let age = now.getFullYear() - y;
  const monthDiff = now.getMonth() - m;
  if (monthDiff < 0 || (monthDiff === 0 && now.getDate() < d)) age -= 1;
  if (age < 0 || age > 150) return null;
  return age;
}

module.exports = { ageFromBirthday };
