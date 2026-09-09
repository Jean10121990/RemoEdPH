/**
 * Age from date of birth — updates automatically as years pass.
 */
(function (global) {
  function parseBirthday(raw) {
    if (raw == null || raw === '') return null;
    if (raw instanceof Date && !Number.isNaN(raw.getTime())) {
      return new Date(raw.getFullYear(), raw.getMonth(), raw.getDate());
    }
    var s = String(raw).trim();
    if (!s) return null;
    // Prefer YYYY-MM-DD (date input) to avoid TZ shifts
    var m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
    if (m) {
      return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
    }
    var d = new Date(s);
    if (Number.isNaN(d.getTime())) return null;
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  }

  /**
   * @param {string|Date|null|undefined} birthday
   * @param {Date} [asOf]
   * @returns {number|null}
   */
  function ageFromBirthday(birthday, asOf) {
    var born = parseBirthday(birthday);
    if (!born) return null;
    var now = asOf instanceof Date && !Number.isNaN(asOf.getTime()) ? asOf : new Date();
    var today = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    var age = today.getFullYear() - born.getFullYear();
    var monthDiff = today.getMonth() - born.getMonth();
    if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < born.getDate())) {
      age -= 1;
    }
    if (age < 0 || age > 150) return null;
    return age;
  }

  function formatAgeLabel(age) {
    if (age == null || !Number.isFinite(age)) return '';
    return age === 1 ? '1 year old' : age + ' years old';
  }

  global.RemoedAge = {
    parseBirthday: parseBirthday,
    ageFromBirthday: ageFromBirthday,
    formatAgeLabel: formatAgeLabel,
  };
})(typeof window !== 'undefined' ? window : globalThis);
