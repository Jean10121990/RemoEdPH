/**
 * App-wide currency converter (display only). Pages keep their own PHP / USD amounts;
 * this adds a small button + panel and, when a currency is chosen, shows an estimate
 * beside each single-amount element via a CSS ::after label (data-remoed-fx). The label is
 * not part of textContent, so pages that read totals back from the DOM are unaffected.
 *
 * Privacy: only public rates are fetched (GET /api/public/fx-rates, same origin). Amounts
 * shown on the page are converted in the browser and never sent anywhere.
 */
(function () {
  if (window.__remoedCurrencyConverter) return;
  window.__remoedCurrencyConverter = true;

  var STORE_KEY = 'remoed_display_currency';
  var REFRESH_MS = 60 * 1000;
  var ATTR = 'data-remoed-fx';
  var SKIP_TAGS = { SCRIPT: 1, STYLE: 1, NOSCRIPT: 1, TEXTAREA: 1, INPUT: 1, SELECT: 1, OPTION: 1, BUTTON: 1, TITLE: 1, svg: 1, SVG: 1 };
  var NUM = '(\\d[\\d,]*(?:\\.\\d+)?)';
  var PHP_RE = new RegExp('(?:₱|\\bPHP\\s*)\\s*' + NUM + '|' + NUM + '\\s*PHP\\b', 'g');
  var USD_RE = new RegExp('(?:US\\$|\\bUSD\\s*|\\$)\\s*' + NUM + '(?:\\s*USD\\b)?|' + NUM + '\\s*USD\\b', 'g');
  var HINT_RE = /₱|\$|\bPHP\b|\bUSD\b/;

  var rates = { USD: 1, PHP: 60.03 };
  var updatedAt = null;
  var live = false;
  var display = '';
  var names = null;
  var ui = null;
  var scanTimer = null;
  var pollTimer = null;
  var conflicts = typeof WeakSet === 'function' ? new WeakSet() : null;

  try { names = new Intl.DisplayNames(['en'], { type: 'currency' }); } catch (_e) {}
  try { display = localStorage.getItem(STORE_KEY) || ''; } catch (_e) {}

  function currencyName(code) {
    try { return (names && names.of(code)) || code; } catch (_e) { return code; }
  }

  function format(amount, code) {
    var digits = Math.abs(amount) >= 1000 && code !== 'USD' && code !== 'PHP' ? 0 : 2;
    try {
      return new Intl.NumberFormat('en', {
        style: 'currency',
        currency: code,
        currencyDisplay: 'symbol',
        minimumFractionDigits: digits,
        maximumFractionDigits: digits
      }).format(amount);
    } catch (_e) {
      return amount.toFixed(digits) + ' ' + code;
    }
  }

  function convert(amount, from, to) {
    var a = rates[from];
    var b = rates[to];
    if (!a || !b) return null;
    return (amount / a) * b;
  }

  function findAmounts(text) {
    var found = [];
    [['PHP', PHP_RE], ['USD', USD_RE]].forEach(function (pair) {
      var re = pair[1];
      re.lastIndex = 0;
      var m;
      while ((m = re.exec(text))) {
        var raw = m[1] || m[2];
        if (!raw) continue;
        var n = Number(raw.replace(/,/g, ''));
        if (!isFinite(n)) continue;
        var before = text.charAt(m.index - 1);
        if (before === '-' || before === '−') n = -n;
        found.push({ code: pair[0], amount: n, index: m.index });
      }
    });
    return found;
  }

  function skippable(el) {
    for (var node = el; node && node !== document.body; node = node.parentElement) {
      if (SKIP_TAGS[node.tagName]) return true;
      if (node.isContentEditable) return true;
      if (node.id === 'remoed-fx-root') return true;
      if (node.hasAttribute && node.hasAttribute('data-no-fx')) return true;
    }
    return false;
  }

  function hasOwnAfter(el) {
    if (conflicts && conflicts.has(el)) return true;
    if (el.hasAttribute(ATTR)) return false;
    var content = '';
    try { content = getComputedStyle(el, '::after').content; } catch (_e) {}
    if (content && content !== 'none' && content !== 'normal') {
      if (conflicts) conflicts.add(el);
      return true;
    }
    return false;
  }

  function scan() {
    scanTimer = null;
    if (!document.body) return;
    var seen = 0;
    var keep = [];
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, null);
    var node;
    while ((node = walker.nextNode())) {
      var value = node.nodeValue;
      if (!value || !HINT_RE.test(value)) continue;
      var host = node.parentElement;
      if (!host || skippable(host)) continue;
      var amounts = findAmounts(host.textContent || '');
      if (!amounts.length) continue;
      seen++;
      if (!display || host.children.length || amounts.length !== 1) continue;
      var a = amounts[0];
      if (a.code === display) continue;
      var out = convert(a.amount, a.code, display);
      if (out == null || hasOwnAfter(host)) continue;
      var label = '≈ ' + format(out, display);
      if (host.getAttribute(ATTR) !== label) host.setAttribute(ATTR, label);
      keep.push(host);
    }
    var tagged = document.querySelectorAll('[' + ATTR + ']');
    for (var i = 0; i < tagged.length; i++) {
      if (keep.indexOf(tagged[i]) === -1) tagged[i].removeAttribute(ATTR);
    }
    if (seen) ensureUi();
    if (ui) ui.root.hidden = !seen;
    if (seen) placeButton();
  }

  function queueScan() {
    if (scanTimer) return;
    scanTimer = setTimeout(scan, 250);
  }

  function injectStyles() {
    if (document.getElementById('remoed-fx-style')) return;
    var css = [
      '[' + ATTR + ']::after{content:" " attr(' + ATTR + ');font-size:.8em;font-weight:500;opacity:.72;white-space:nowrap;margin-left:.3em;letter-spacing:0;}',
      '#remoed-fx-root{position:fixed;left:16px;bottom:16px;z-index:90;font-family:inherit;}',
      '#remoed-fx-root[hidden]{display:none!important;}',
      '#remoed-fx-btn{display:inline-flex;align-items:center;gap:6px;min-height:40px;padding:0 14px;border-radius:999px;border:1px solid rgba(15,23,42,.12);background:#fff;color:#0f172a;font:600 13px/1 inherit;box-shadow:0 4px 14px rgba(15,23,42,.14);cursor:pointer;}',
      '#remoed-fx-btn:hover{background:#f8fafc;}',
      '#remoed-fx-btn svg{width:16px;height:16px;flex:none;}',
      '#remoed-fx-panel{position:absolute;left:0;bottom:calc(100% + 8px);width:min(320px,calc(100vw - 24px));background:#fff;color:#0f172a;border:1px solid rgba(15,23,42,.1);border-radius:14px;box-shadow:0 12px 32px rgba(15,23,42,.2);padding:14px;box-sizing:border-box;font-size:13px;line-height:1.4;z-index:var(--z-dropdown,400);max-height:calc(100vh - 90px);max-height:calc(100dvh - 90px);overflow-y:auto;overscroll-behavior:contain;}',
      '#remoed-fx-panel[hidden]{display:none;}',
      '#remoed-fx-panel h2{margin:0 0 10px;font-size:15px;font-weight:700;}',
      '#remoed-fx-panel label{display:block;font-weight:600;font-size:12px;color:#475569;margin:8px 0 4px;}',
      '#remoed-fx-panel select,#remoed-fx-panel input{width:100%;box-sizing:border-box;min-height:38px;padding:6px 10px;border:1px solid #cbd5e1;border-radius:8px;font:inherit;background:#fff;color:inherit;}',
      '#remoed-fx-panel .fx-row{display:flex;gap:8px;}',
      '#remoed-fx-panel .fx-row > *{flex:1;min-width:0;}',
      '#remoed-fx-result{margin-top:10px;padding:10px;border-radius:8px;background:#f1f5f9;font-weight:700;font-size:15px;word-break:break-word;}',
      '#remoed-fx-panel .fx-meta{margin-top:8px;font-size:12px;color:#64748b;}',
      '#remoed-fx-panel .fx-live{display:inline-block;width:7px;height:7px;border-radius:50%;background:#16a34a;margin-right:5px;vertical-align:middle;}',
      '#remoed-fx-panel .fx-live.off{background:#f59e0b;}',
      '@media (max-width:768px){#remoed-fx-root{left:12px!important;bottom:calc(76px + env(safe-area-inset-bottom,0px));}#remoed-fx-panel{max-height:calc(100dvh - 150px - env(safe-area-inset-bottom,0px));}body.remoed-more-open #remoed-fx-root{display:none!important;}}',
      '@media print{#remoed-fx-root{display:none!important;}[' + ATTR + ']::after{content:none!important;}}'
    ].join('\n');
    var style = document.createElement('style');
    style.id = 'remoed-fx-style';
    style.textContent = css;
    document.head.appendChild(style);
  }

  function svgIcon() {
    var ns = 'http://www.w3.org/2000/svg';
    var svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', '0 0 24 24');
    svg.setAttribute('fill', 'none');
    svg.setAttribute('stroke', 'currentColor');
    svg.setAttribute('stroke-width', '2');
    svg.setAttribute('stroke-linecap', 'round');
    svg.setAttribute('stroke-linejoin', 'round');
    svg.setAttribute('aria-hidden', 'true');
    ['M8 3 4 7l4 4', 'M4 7h16', 'm16 21 4-4-4-4', 'M20 17H4'].forEach(function (d) {
      var p = document.createElementNS(ns, 'path');
      p.setAttribute('d', d);
      svg.appendChild(p);
    });
    return svg;
  }

  function el(tag, attrs, text) {
    var node = document.createElement(tag);
    if (attrs) Object.keys(attrs).forEach(function (k) { node.setAttribute(k, attrs[k]); });
    if (text != null) node.textContent = text;
    return node;
  }

  function sortedCodes() {
    return Object.keys(rates).sort(function (a, b) {
      return currencyName(a).localeCompare(currencyName(b));
    });
  }

  function fillSelect(select, value, opts) {
    var top = (opts && opts.top) || [];
    select.textContent = '';
    if (opts && opts.offLabel) select.appendChild(el('option', { value: '' }, opts.offLabel));
    var codes = sortedCodes();
    top.concat(codes.filter(function (c) { return top.indexOf(c) === -1; })).forEach(function (code) {
      if (!rates[code]) return;
      select.appendChild(el('option', { value: code }, code + ' — ' + currencyName(code)));
    });
    select.value = value && (rates[value] || value === '') ? value : (opts && opts.offLabel ? '' : top[0] || 'USD');
  }

  function ensureUi() {
    if (ui || !document.body) return;
    injectStyles();
    var root = el('div', { id: 'remoed-fx-root', 'data-no-fx': '' });
    root.hidden = true;
    var btn = el('button', { type: 'button', id: 'remoed-fx-btn', 'aria-expanded': 'false', 'aria-controls': 'remoed-fx-panel', title: 'Currency converter' });
    btn.appendChild(svgIcon());
    var btnLabel = el('span', null, 'Currency');
    btn.appendChild(btnLabel);

    var panel = el('div', { id: 'remoed-fx-panel', role: 'dialog', 'aria-label': 'Currency converter' });
    panel.hidden = true;
    panel.appendChild(el('h2', null, 'Currency converter'));

    panel.appendChild(el('label', { for: 'remoed-fx-display' }, 'Show amounts on this page in'));
    var displaySel = el('select', { id: 'remoed-fx-display' });
    panel.appendChild(displaySel);

    panel.appendChild(el('label', { for: 'remoed-fx-amount' }, 'Convert an amount'));
    var row = el('div', { class: 'fx-row' });
    var amount = el('input', { id: 'remoed-fx-amount', type: 'number', inputmode: 'decimal', min: '0', step: 'any', placeholder: '1000' });
    var fromSel = el('select', { 'aria-label': 'From currency' });
    row.appendChild(amount);
    row.appendChild(fromSel);
    panel.appendChild(row);
    panel.appendChild(el('label', { for: 'remoed-fx-to' }, 'To'));
    var toSel = el('select', { id: 'remoed-fx-to' });
    panel.appendChild(toSel);
    var result = el('div', { id: 'remoed-fx-result', 'aria-live': 'polite' });
    panel.appendChild(result);
    var rateLine = el('div', { class: 'fx-meta' });
    panel.appendChild(rateLine);
    var status = el('div', { class: 'fx-meta' });
    panel.appendChild(status);
    panel.appendChild(el('div', { class: 'fx-meta' }, 'Estimates only, converted on your device. Payments and payouts stay in their original currency.'));

    root.appendChild(panel);
    root.appendChild(btn);
    document.body.appendChild(root);

    ui = { root: root, btn: btn, btnLabel: btnLabel, panel: panel, displaySel: displaySel, amount: amount, fromSel: fromSel, toSel: toSel, result: result, rateLine: rateLine, status: status };

    btn.addEventListener('click', function () {
      var open = panel.hidden;
      panel.hidden = !open;
      btn.setAttribute('aria-expanded', open ? 'true' : 'false');
      if (open) {
        loadRates();
        amount.focus();
      }
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && !panel.hidden) {
        panel.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
        btn.focus();
      }
    });
    document.addEventListener('click', function (e) {
      if (!panel.hidden && !root.contains(e.target)) {
        panel.hidden = true;
        btn.setAttribute('aria-expanded', 'false');
      }
    });
    displaySel.addEventListener('change', function () {
      display = displaySel.value;
      try { localStorage.setItem(STORE_KEY, display); } catch (_e) {}
      if (display) toSel.value = display;
      renderUi();
      scan();
    });
    amount.addEventListener('input', renderUi);
    fromSel.addEventListener('change', renderUi);
    toSel.addEventListener('change', renderUi);
    window.addEventListener('resize', placeButton);

    fillUiSelects();
    renderUi();
  }

  function fillUiSelects() {
    if (!ui) return;
    fillSelect(ui.displaySel, display, { offLabel: 'Original (no conversion)', top: ['USD', 'PHP'] });
    fillSelect(ui.fromSel, ui.fromSel.value || 'PHP', { top: ['PHP', 'USD'] });
    fillSelect(ui.toSel, ui.toSel.value || display || 'USD', { top: ['USD', 'PHP'] });
  }

  function renderUi() {
    if (!ui) return;
    ui.btnLabel.textContent = display ? 'Currency: ' + display : 'Currency';
    var from = ui.fromSel.value || 'PHP';
    var to = ui.toSel.value || 'USD';
    var n = Number(ui.amount.value);
    if (!ui.amount.value || !isFinite(n)) n = 1000;
    var out = convert(n, from, to);
    ui.result.textContent = out == null ? 'Rate not available' : format(n, from) + ' ≈ ' + format(out, to);
    var one = convert(1, from, to);
    var back = convert(1, to, from);
    ui.rateLine.textContent = one == null ? '' : '1 ' + from + ' = ' + one.toPrecision(4) + ' ' + to + ' · 1 ' + to + ' = ' + back.toPrecision(4) + ' ' + from;
    ui.status.textContent = '';
    var dot = el('span', { class: 'fx-live' + (live ? '' : ' off'), 'aria-hidden': 'true' });
    ui.status.appendChild(dot);
    var when = '';
    if (updatedAt) {
      var d = new Date(updatedAt);
      if (!isNaN(d.getTime())) {
        when = live
          ? ' · updated ' + d.toLocaleTimeString('en', { hour: 'numeric', minute: '2-digit', second: '2-digit' })
          : ' · updated ' + d.toLocaleDateString('en', { month: 'short', day: 'numeric' });
      }
    }
    ui.status.appendChild(document.createTextNode((live ? 'Live rate, refreshes every minute' : 'Daily rate') + when));
  }

  function placeButton() {
    if (!ui || ui.root.hidden) return;
    if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
      ui.root.style.left = '';
      return;
    }
    var left = 16;
    var probe = document.elementFromPoint(4, Math.max(0, window.innerHeight - 30));
    for (var node = probe; node && node !== document.body && node !== document.documentElement; node = node.parentElement) {
      if (ui.root.contains(node)) break;
      var cs = getComputedStyle(node);
      if (cs.position === 'fixed' || cs.position === 'sticky') {
        var r = node.getBoundingClientRect();
        if (r.left <= 1 && r.width < 420 && r.height > window.innerHeight * 0.5) left = Math.round(r.right + 16);
        break;
      }
    }
    ui.root.style.left = left + 'px';
  }

  var inflight = null;
  function loadRates() {
    if (inflight) return inflight;
    inflight = fetch('/api/public/fx-rates', { cache: 'no-cache', credentials: 'omit' })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (body) {
        if (!body || !body.rates) return;
        var next = {};
        Object.keys(body.rates).forEach(function (code) {
          var n = Number(body.rates[code]);
          if (/^[A-Z]{3}$/.test(code) && isFinite(n) && n > 0) next[code] = n;
        });
        if (!next.PHP) return;
        next.USD = 1;
        rates = next;
        updatedAt = body.updatedAt || null;
        live = !!body.live;
        fillUiSelects();
        renderUi();
        if (display) scan();
      })
      .catch(function () {})
      .then(function () { inflight = null; });
    return inflight;
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(function () {
      if (document.visibilityState !== 'visible') return;
      if (!display && (!ui || ui.panel.hidden)) return;
      loadRates();
    }, REFRESH_MS);
  }

  function start() {
    scan();
    loadRates();
    startPolling();
    document.addEventListener('visibilitychange', function () {
      if (document.visibilityState === 'visible' && (display || (ui && !ui.panel.hidden))) loadRates();
    });
    if (typeof MutationObserver === 'function') {
      new MutationObserver(function (records) {
        for (var i = 0; i < records.length; i++) {
          var t = records[i].target;
          var host = t && (t.nodeType === 1 ? t : t.parentElement);
          if (host && ui && ui.root.contains(host)) continue;
          queueScan();
          return;
        }
      }).observe(document.body, { childList: true, subtree: true, characterData: true });
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', start);
  } else {
    start();
  }
})();
