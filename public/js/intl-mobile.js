/**
 * Client mirror of server/utils/intlMobile.js — student country picker.
 */
(function (global) {
  var COUNTRIES = [
    { iso: 'US', name: 'United States', dial: '1', min: 10, max: 10 },
    { iso: 'CA', name: 'Canada', dial: '1', min: 10, max: 10 },
    { iso: 'GB', name: 'United Kingdom', dial: '44', min: 10, max: 10 },
    { iso: 'AU', name: 'Australia', dial: '61', min: 9, max: 9 },
    { iso: 'NZ', name: 'New Zealand', dial: '64', min: 8, max: 10 },
    { iso: 'SG', name: 'Singapore', dial: '65', min: 8, max: 8 },
    { iso: 'MY', name: 'Malaysia', dial: '60', min: 9, max: 10 },
    { iso: 'PH', name: 'Philippines', dial: '63', min: 10, max: 10 },
    { iso: 'JP', name: 'Japan', dial: '81', min: 9, max: 11 },
    { iso: 'KR', name: 'South Korea', dial: '82', min: 9, max: 11 },
    { iso: 'CN', name: 'China', dial: '86', min: 11, max: 11 },
    { iso: 'HK', name: 'Hong Kong', dial: '852', min: 8, max: 8 },
    { iso: 'TW', name: 'Taiwan', dial: '886', min: 9, max: 9 },
    { iso: 'IN', name: 'India', dial: '91', min: 10, max: 10 },
    { iso: 'AE', name: 'United Arab Emirates', dial: '971', min: 9, max: 9 },
    { iso: 'SA', name: 'Saudi Arabia', dial: '966', min: 9, max: 9 },
    { iso: 'QA', name: 'Qatar', dial: '974', min: 8, max: 8 },
    { iso: 'KW', name: 'Kuwait', dial: '965', min: 8, max: 8 },
    { iso: 'BH', name: 'Bahrain', dial: '973', min: 8, max: 8 },
    { iso: 'OM', name: 'Oman', dial: '968', min: 8, max: 8 },
    { iso: 'DE', name: 'Germany', dial: '49', min: 10, max: 11 },
    { iso: 'FR', name: 'France', dial: '33', min: 9, max: 9 },
    { iso: 'ES', name: 'Spain', dial: '34', min: 9, max: 9 },
    { iso: 'IT', name: 'Italy', dial: '39', min: 9, max: 10 },
    { iso: 'NL', name: 'Netherlands', dial: '31', min: 9, max: 9 },
    { iso: 'BE', name: 'Belgium', dial: '32', min: 8, max: 9 },
    { iso: 'CH', name: 'Switzerland', dial: '41', min: 9, max: 9 },
    { iso: 'AT', name: 'Austria', dial: '43', min: 10, max: 11 },
    { iso: 'SE', name: 'Sweden', dial: '46', min: 9, max: 10 },
    { iso: 'NO', name: 'Norway', dial: '47', min: 8, max: 8 },
    { iso: 'DK', name: 'Denmark', dial: '45', min: 8, max: 8 },
    { iso: 'IE', name: 'Ireland', dial: '353', min: 9, max: 9 },
    { iso: 'BR', name: 'Brazil', dial: '55', min: 10, max: 11 },
    { iso: 'MX', name: 'Mexico', dial: '52', min: 10, max: 10 },
    { iso: 'TH', name: 'Thailand', dial: '66', min: 9, max: 9 },
    { iso: 'VN', name: 'Vietnam', dial: '84', min: 9, max: 10 },
    { iso: 'ID', name: 'Indonesia', dial: '62', min: 9, max: 12 },
    { iso: 'ZA', name: 'South Africa', dial: '27', min: 9, max: 9 },
    { iso: 'EG', name: 'Egypt', dial: '20', min: 10, max: 10 },
    { iso: 'NG', name: 'Nigeria', dial: '234', min: 10, max: 10 },
  ];

  function byIso(iso) {
    var key = String(iso || '').trim().toUpperCase();
    return COUNTRIES.find(function (c) { return c.iso === key; }) || null;
  }

  function digitsOnly(value) {
    return String(value == null ? '' : value).replace(/\D/g, '');
  }

  function normalizeIntlMobile(iso, nationalRaw) {
    var country = byIso(iso);
    if (!country) {
      return { ok: false, error: 'Select a country code' };
    }
    var national = digitsOnly(nationalRaw);
    if (!national) return { ok: false, error: 'Required' };
    if (national.startsWith('0')) national = national.replace(/^0+/, '');
    if (national.startsWith(country.dial) && national.length > country.dial.length + country.min - 1) {
      national = national.slice(country.dial.length);
    }
    if (national.length < country.min || national.length > country.max) {
      return {
        ok: false,
        error: national.length < country.min ? 'Not enough digits' : 'Too many digits',
      };
    }
    return { ok: true, e164: '+' + country.dial + national, iso: country.iso };
  }

  function guessIsoFromE164(raw) {
    var d = digitsOnly(raw);
    if (!d) return '';
    var sorted = COUNTRIES.slice().sort(function (a, b) {
      return b.dial.length - a.dial.length;
    });
    for (var i = 0; i < sorted.length; i++) {
      var c = sorted[i];
      if (d.startsWith(c.dial)) {
        var rest = d.slice(c.dial.length);
        if (rest.length >= c.min && rest.length <= c.max + 2) return c.iso;
      }
    }
    return '';
  }

  function nationalFromE164(raw, iso) {
    var d = digitsOnly(raw);
    if (!d) return '';
    var country = byIso(iso) || byIso(guessIsoFromE164(raw));
    if (country && d.startsWith(country.dial)) return d.slice(country.dial.length);
    return d;
  }

  /** Fill a <select> with country options. */
  function fillCountrySelect(selectEl, selectedIso) {
    if (!selectEl) return;
    var sorted = COUNTRIES.slice().sort(function (a, b) {
      return a.name.localeCompare(b.name);
    });
    selectEl.innerHTML = '';
    var empty = document.createElement('option');
    empty.value = '';
    empty.textContent = 'Code';
    selectEl.appendChild(empty);
    sorted.forEach(function (c) {
      var opt = document.createElement('option');
      opt.value = c.iso;
      opt.title = c.name;
      opt.textContent = c.iso + ' +' + c.dial;
      if (selectedIso && String(selectedIso).toUpperCase() === c.iso) opt.selected = true;
      selectEl.appendChild(opt);
    });
  }

  function dialLabelForIso(iso) {
    var c = byIso(iso);
    return c ? '+' + c.dial : '+';
  }

  global.RemoedIntlMobile = {
    COUNTRIES: COUNTRIES,
    byIso: byIso,
    digitsOnly: digitsOnly,
    normalizeIntlMobile: normalizeIntlMobile,
    guessIsoFromE164: guessIsoFromE164,
    nationalFromE164: nationalFromE164,
    fillCountrySelect: fillCountrySelect,
    dialLabelForIso: dialLabelForIso,
  };
})(typeof window !== 'undefined' ? window : globalThis);
