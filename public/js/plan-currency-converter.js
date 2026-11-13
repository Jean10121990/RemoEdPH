/**
 * Landing-page plan currency converter. PHP is the primary card price (checkout rate);
 * this fills the secondary line in the chosen currency. Display only.
 * Rates: GET /api/public/fx-rates (USD base, cached on the server).
 */
(function () {
  /** Fallback only; replaced by the server rate from plan-pricing.js. */
  var CHECKOUT_PHP_RATE = 60.03;
  var STORE_KEY = 'remoed_plan_currency';
  var select = document.getElementById('plan-currency');
  var note = document.getElementById('plan-currency-note');
  var cells = document.querySelectorAll('#plans .plan-price-local[data-usd]');
  if (!select || !cells.length) return;

  var rates = { USD: 1, PHP: CHECKOUT_PHP_RATE };
  var updatedAt = null;
  var live = false;
  var names = null;
  try { names = new Intl.DisplayNames(['en'], { type: 'currency' }); } catch (_e) {}

  function currencyName(code) {
    var locale = (document.documentElement.lang || "en").split("-")[0];
    try {
      var localNames = new Intl.DisplayNames([locale], { type: "currency" });
      return localNames.of(code) || code;
    } catch (_e) {
      try { return (names && names.of(code)) || code; } catch (_e2) { return code; }
    }
  }

  function format(amount, code) {
    var digits = code !== 'USD' && amount >= 1000 ? 0 : 2;
    try {
      return new Intl.NumberFormat('en', {
        style: 'currency',
        currency: code,
        currencyDisplay: 'narrowSymbol',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      }).format(amount);
    } catch (_e) {
      return amount.toFixed(digits);
    }
  }

  function saved() {
    try { return localStorage.getItem(STORE_KEY) || ''; } catch (_e) { return ''; }
  }

  function remember(code) {
    try { localStorage.setItem(STORE_KEY, code); } catch (_e) {}
  }

  function fillOptions() {
    var codes = Object.keys(rates).filter(function (c) { return c !== 'PHP'; }).sort(function (a, b) {
      return currencyName(a).localeCompare(currencyName(b));
    });
    var top = ['USD'];
    var current = wanted || 'USD';
    select.textContent = '';
    top.concat(codes.filter(function (c) { return top.indexOf(c) === -1; })).forEach(function (code) {
      var opt = document.createElement('option');
      opt.value = code;
      if (code === 'USD' && window.SiteI18n && SiteI18n.t) {
        var usdLabel = SiteI18n.t('currency_usd');
        opt.textContent = usdLabel && usdLabel !== 'currency_usd' ? usdLabel : (code + ' — ' + currencyName(code));
      } else {
        opt.textContent = code + ' — ' + currencyName(code);
      }
      select.appendChild(opt);
    });
    select.value = current !== 'PHP' && rates[current] ? current : 'USD';
  }

  function render() {
    var code = select.value || 'USD';
    Array.prototype.forEach.call(cells, function (cell) {
      var usd = Number(cell.getAttribute('data-usd')) || 0;
      if (code === 'USD') {
        cell.textContent = format(usd, 'USD') + ' USD';
      } else {
        cell.textContent = '≈ ' + format(usd * rates[code], code) + ' ' + code;
      }
    });
    if (!note) return;
    var when = '';
    if (updatedAt) {
      var d = new Date(updatedAt);
      if (!isNaN(d.getTime())) {
        when = live
          ? ' Live rate, updated ' + d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit' }) + '.'
          : ' Rates updated ' + d.toLocaleDateString('en', { month: 'short', day: 'numeric', year: 'numeric' }) + '.';
      }
    }
    function tr(key, fallback) {
      if (window.SiteI18n && SiteI18n.t) {
        var value = SiteI18n.t(key);
        if (value && value !== key) return value;
      }
      return fallback;
    }
    note.textContent = code === 'USD'
      ? tr('currency_note_usd', 'Dollar prices stay fixed. Peso amounts use the current conversion ({rate} per US$1).').replace('{rate}', '₱' + CHECKOUT_PHP_RATE.toFixed(2))
      : tr('currency_note_other', 'Dollar prices stay fixed. The {code} line is an estimate at the current exchange rate.').replace('{code}', code) + when + ' ' + tr('currency_bank', 'Your bank sets the final amount.');
  }

  var wanted = saved();

  select.addEventListener('change', function () {
    wanted = select.value;
    remember(select.value);
    render();
  });

  fillOptions();
  render();

  if (window.RemoEdPlanPricing) {
    window.RemoEdPlanPricing.ready.then(function (data) {
      if (!data) return;
      CHECKOUT_PHP_RATE = data.exchangeRatePhp;
      render();
    });
  }

  function loadRates() {
    fetch('/api/public/fx-rates', { cache: 'no-cache', credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) {
        if (!body || !body.rates) return;
        var next = {};
        Object.keys(body.rates).forEach(function (code) {
          var n = Number(body.rates[code]);
          if (/^[A-Z]{3}$/.test(code) && isFinite(n) && n > 0) next[code] = n;
        });
        next.USD = 1;
        if (!next.PHP) next.PHP = CHECKOUT_PHP_RATE;
        rates = next;
        updatedAt = body.updatedAt || null;
        live = !!body.live;
        fillOptions();
        render();
      })
      .catch(function () {});
  }

  window.addEventListener('sitei18n:languagechanged', function () {
    fillOptions();
    render();
  });
  loadRates();
  setInterval(function () {
    if (document.visibilityState === 'visible') loadRates();
  }, 60 * 1000);
})();
