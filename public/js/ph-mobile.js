/**
 * Client mirror of server/utils/phMobile.js — teacher PH +63.
 */
(function (global) {
  function digitsOnly(value) {
    return String(value == null ? '' : value).replace(/\D/g, '');
  }

  function normalizePhMobile(raw) {
    let d = digitsOnly(raw);
    if (!d) return { ok: false, error: 'Contact number is required.' };
    if (d.startsWith('63') && d.length === 12) d = d.slice(2);
    else if (d.startsWith('0') && d.length === 11) d = d.slice(1);
    if (d.length !== 10 || !d.startsWith('9')) {
      return {
        ok: false,
        error: 'Enter a valid Philippine mobile number (e.g. 09XXXXXXXXX).',
      };
    }
    return { ok: true, e164: '+63' + d };
  }

  function phNationalFromStored(raw) {
    const d = digitsOnly(raw);
    if (!d) return '';
    if (d.startsWith('63') && d.length >= 12) return d.slice(2);
    if (d.startsWith('0') && d.length === 11) return d.slice(1);
    if (d.length === 10 && d.startsWith('9')) return d;
    return d;
  }

  global.RemoedPhMobile = { digitsOnly, normalizePhMobile, phNationalFromStored };
})(typeof window !== 'undefined' ? window : globalThis);
