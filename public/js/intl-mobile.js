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

  var openMenu = null;

  function flagSrc(iso) {
    return 'https://flagcdn.com/w40/' + String(iso || '').trim().toLowerCase() + '.png';
  }

  function ensureFlagStyles() {
    if (document.getElementById('remoed-flag-picker-style')) return;
    var style = document.createElement('style');
    style.id = 'remoed-flag-picker-style';
    style.textContent = [
      '.remoed-flag-picker{position:relative;flex:0 0 8.25rem;width:8.25rem;min-width:8.25rem;}',
      '.remoed-flag-picker .remoed-flag-native{position:absolute!important;width:1px!important;height:1px!important;opacity:0!important;pointer-events:none!important;padding:0!important;border:0!important;overflow:hidden!important;}',
      '.remoed-flag-picker-btn{width:100%;height:100%;min-height:48px;display:flex;align-items:center;gap:6px;padding:10px 8px;border:3px solid #E8F4FD;border-radius:12px;background:#fff;color:#1E3A5F;font:600 0.95rem "Segoe UI",Tahoma,Geneva,Verdana,sans-serif;cursor:pointer;box-sizing:border-box;}',
      '.remoed-flag-picker-btn:disabled{background:#f8f9fa;color:#495057;cursor:not-allowed;}',
      '.remoed-flag-picker-btn:focus{outline:none;border-color:#1CA7E7;box-shadow:0 0 0 4px rgba(28,167,231,.1);}',
      '.remoed-flag-picker-btn.is-invalid{border-color:#e11d48;box-shadow:0 0 0 3px rgba(225,29,72,.12);}',
      '.remoed-flag-picker-btn img,.remoed-flag-option img{width:22px;height:16px;object-fit:cover;border-radius:2px;flex:0 0 22px;box-shadow:0 0 0 1px rgba(15,23,42,.12);}',
      '.remoed-flag-menu{position:fixed;z-index:9000;margin:0;padding:4px 0;list-style:none;background:#fff;border:1px solid #dbe7f3;border-radius:10px;box-shadow:0 10px 28px rgba(15,23,42,.16);max-height:280px;overflow:auto;min-width:9.5rem;}',
      '.remoed-flag-option{width:100%;display:flex;align-items:center;gap:8px;padding:8px 12px;border:0;background:#fff;color:#1E3A5F;font:600 0.95rem "Segoe UI",Tahoma,sans-serif;cursor:pointer;text-align:left;}',
      '.remoed-flag-option:hover,.remoed-flag-option.is-active{background:#E8F4FD;}'
    ].join('');
    document.head.appendChild(style);
  }

  function flagImage(iso) {
    var img = document.createElement('img');
    img.src = flagSrc(iso);
    img.alt = '';
    img.width = 22;
    img.height = 16;
    img.decoding = 'async';
    return img;
  }

  function closeFlagMenu() {
    if (!openMenu) return;
    openMenu.hidden = true;
    if (openMenu._btn) openMenu._btn.setAttribute('aria-expanded', 'false');
    openMenu = null;
  }

  function syncFlagButton(selectEl) {
    var picker = selectEl._remoedFlagPicker;
    if (!picker) return;
    var opt = selectEl.options[selectEl.selectedIndex];
    var iso = opt && opt.value ? opt.value : '';
    var country = byIso(iso);
    picker.btn.replaceChildren();
    if (country) picker.btn.appendChild(flagImage(country.iso));
    var label = document.createElement('span');
    label.textContent = country ? '+' + country.dial : 'Code';
    picker.btn.appendChild(label);
    picker.btn.title = country ? country.name : 'Country calling code';
    picker.btn.setAttribute('aria-label', country ? country.name + ' +' + country.dial : 'Country calling code');
    picker.btn.disabled = !!selectEl.disabled;
    picker.btn.classList.toggle('is-invalid', selectEl.classList.contains('is-invalid'));
    Array.prototype.forEach.call(picker.menu.querySelectorAll('.remoed-flag-option'), function (item) {
      item.classList.toggle('is-active', item.getAttribute('data-iso') === iso);
    });
  }

  function ensureFlagPicker(selectEl) {
    if (selectEl._remoedFlagPicker) return selectEl._remoedFlagPicker;
    ensureFlagStyles();
    var root = document.createElement('div');
    root.className = 'remoed-flag-picker';
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'remoed-flag-picker-btn';
    btn.setAttribute('aria-haspopup', 'listbox');
    btn.setAttribute('aria-expanded', 'false');
    var menu = document.createElement('ul');
    menu.className = 'remoed-flag-menu';
    menu.setAttribute('role', 'listbox');
    menu.hidden = true;
    menu._btn = btn;
    selectEl.classList.add('remoed-flag-native');
    selectEl.setAttribute('tabindex', '-1');
    if (selectEl.parentNode) selectEl.parentNode.insertBefore(root, selectEl);
    root.appendChild(btn);
    root.appendChild(selectEl);
    document.body.appendChild(menu);

    btn.addEventListener('click', function () {
      if (selectEl.disabled) return;
      if (openMenu === menu) {
        closeFlagMenu();
        return;
      }
      closeFlagMenu();
      var rect = btn.getBoundingClientRect();
      var menuHeight = Math.min(280, menu.scrollHeight || 280);
      var below = window.innerHeight - rect.bottom;
      var top = below < menuHeight && rect.top > below ? rect.top - menuHeight - 4 : rect.bottom + 4;
      menu.style.left = Math.max(8, rect.left) + 'px';
      menu.style.top = Math.max(8, top) + 'px';
      menu.style.width = Math.max(rect.width, 150) + 'px';
      menu.hidden = false;
      btn.setAttribute('aria-expanded', 'true');
      openMenu = menu;
    });

    selectEl.addEventListener('change', function () { syncFlagButton(selectEl); });
    new MutationObserver(function () { syncFlagButton(selectEl); }).observe(selectEl, {
      attributes: true,
      attributeFilter: ['disabled', 'class']
    });

    if (!document.documentElement._remoedFlagDismiss) {
      document.documentElement._remoedFlagDismiss = true;
      document.addEventListener('pointerdown', function (ev) {
        if (!openMenu) return;
        if (openMenu.contains(ev.target) || (openMenu._btn && openMenu._btn.contains(ev.target))) return;
        closeFlagMenu();
      });
      window.addEventListener('resize', closeFlagMenu);
      window.addEventListener('scroll', function (ev) {
        if (!openMenu) return;
        if (ev.target && openMenu.contains(ev.target)) return;
        closeFlagMenu();
      }, true);
    }

    selectEl._remoedFlagPicker = { root: root, btn: btn, menu: menu };
    selectEl._remoedFlagButton = btn;
    return selectEl._remoedFlagPicker;
  }

  function rebuildFlagMenu(selectEl) {
    var picker = ensureFlagPicker(selectEl);
    picker.menu.replaceChildren();
    Array.prototype.forEach.call(selectEl.options, function (opt) {
      if (!opt.value) return;
      var country = byIso(opt.value);
      if (!country) return;
      var item = document.createElement('li');
      item.setAttribute('role', 'none');
      var choice = document.createElement('button');
      choice.type = 'button';
      choice.className = 'remoed-flag-option';
      choice.setAttribute('role', 'option');
      choice.setAttribute('data-iso', country.iso);
      choice.title = country.name;
      choice.appendChild(flagImage(country.iso));
      var num = document.createElement('span');
      num.textContent = '+' + country.dial;
      choice.appendChild(num);
      choice.addEventListener('click', function () {
        selectEl.value = country.iso;
        selectEl.dispatchEvent(new Event('change', { bubbles: true }));
        closeFlagMenu();
        syncFlagButton(selectEl);
      });
      item.appendChild(choice);
      picker.menu.appendChild(item);
    });
    syncFlagButton(selectEl);
  }

  /** Fill a country <select> and show a flag + dialing number picker. */
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
      opt.textContent = '+' + c.dial;
      if (selectedIso && String(selectedIso).toUpperCase() === c.iso) opt.selected = true;
      selectEl.appendChild(opt);
    });
    if (typeof document !== 'undefined') rebuildFlagMenu(selectEl);
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
