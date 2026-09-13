/**
 * Philippines mobile normalize/validate for teacher profiles.
 * Accepts 09XXXXXXXXX or +639XXXXXXXXX → stores +639XXXXXXXXX
 */

function digitsOnly(value) {
  return String(value == null ? '' : value).replace(/\D/g, '');
}

/**
 * @returns {{ ok: true, e164: string } | { ok: false, error: string }}
 */
function normalizePhMobile(raw) {
  let d = digitsOnly(raw);
  if (!d) {
    return { ok: false, error: 'Contact number is required.' };
  }
  if (d.startsWith('63') && d.length === 12) {
    d = d.slice(2);
  } else if (d.startsWith('0') && d.length === 11) {
    d = d.slice(1);
  }
  if (d.length !== 10 || !d.startsWith('9')) {
    return {
      ok: false,
      error: 'Enter a valid Philippine mobile number (e.g. 09XXXXXXXXX).',
    };
  }
  return { ok: true, e164: '+63' + d };
}

/** Display national part without country code for form inputs. */
function phNationalFromStored(raw) {
  const d = digitsOnly(raw);
  if (!d) return '';
  if (d.startsWith('63') && d.length >= 12) return d.slice(2);
  if (d.startsWith('0') && d.length === 11) return d.slice(1);
  if (d.length === 10 && d.startsWith('9')) return d;
  return d;
}

module.exports = {
  digitsOnly,
  normalizePhMobile,
  phNationalFromStored,
};
