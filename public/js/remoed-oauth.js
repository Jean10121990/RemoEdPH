/**
 * Shared Continue with Google / Facebook helpers for login, register, teacher signup.
 */
(function (global) {
  'use strict';

  var cached = null;

  function providers() {
    if (cached) return Promise.resolve(cached);
    return fetch('/api/auth/oauth/providers', { credentials: 'same-origin' })
      .then(function (r) {
        return r.json();
      })
      .then(function (body) {
        cached = (body && body.providers) || { google: false, facebook: false };
        return cached;
      })
      .catch(function () {
        cached = { google: false, facebook: false };
        return cached;
      });
  }

  function startUrl(provider, query) {
    var q = new URLSearchParams();
    Object.keys(query || {}).forEach(function (k) {
      var v = query[k];
      if (v === undefined || v === null || v === '') return;
      q.set(k, String(v));
    });
    return '/api/auth/oauth/' + encodeURIComponent(provider) + '/start?' + q.toString();
  }

  function go(provider, query) {
    window.location.href = startUrl(provider, query);
  }

  function mountButtons(root, opts) {
    opts = opts || {};
    var el = typeof root === 'string' ? document.getElementById(root) : root;
    if (!el) return Promise.resolve();
    return providers().then(function (p) {
      el.innerHTML = '';
      el.hidden = !(p.google || p.facebook);
      if (el.hidden) return;

      var title = document.createElement('p');
      title.className = 'remoed-oauth-title';
      title.textContent = opts.title || 'Or continue with';
      el.appendChild(title);

      var row = document.createElement('div');
      row.className = 'remoed-oauth-row';

      function addBtn(provider, label) {
        if (!p[provider]) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'remoed-oauth-btn remoed-oauth-btn--' + provider;
        btn.textContent = label;
        btn.addEventListener('click', function () {
          if (typeof opts.beforeStart === 'function') {
            var ok = opts.beforeStart(provider);
            if (ok === false) return;
          }
          var q = typeof opts.query === 'function' ? opts.query(provider) : opts.query || {};
          go(provider, q);
        });
        row.appendChild(btn);
      }

      addBtn('google', 'Continue with Google');
      addBtn('facebook', 'Continue with Facebook');
      el.appendChild(row);

      if (opts.hint) {
        var hint = document.createElement('p');
        hint.className = 'remoed-oauth-hint';
        hint.textContent = opts.hint;
        el.appendChild(hint);
      }
    });
  }

  var css =
    '.remoed-oauth{margin:16px 0 8px;text-align:center}' +
    '.remoed-oauth[hidden]{display:none!important}' +
    '.remoed-oauth-title{margin:0 0 10px;font-size:.85rem;font-weight:700;color:#64748b}' +
    '.remoed-oauth-row{display:flex;flex-direction:column;gap:8px}' +
    '.remoed-oauth-btn{min-height:44px;border-radius:999px;border:1px solid #cbd5e1;background:#fff;font-weight:800;cursor:pointer;color:#0f172a}' +
    '.remoed-oauth-btn--google:hover{border-color:#4285f4;background:#eff6ff}' +
    '.remoed-oauth-btn--facebook:hover{border-color:#1877f2;background:#eff6ff}' +
    '.remoed-oauth-hint{margin:8px 0 0;font-size:.78rem;color:#64748b;font-weight:600}';

  if (!document.getElementById('remoed-oauth-css')) {
    var style = document.createElement('style');
    style.id = 'remoed-oauth-css';
    style.textContent = css;
    document.head.appendChild(style);
  }

  global.RemoEdOAuth = {
    providers: providers,
    startUrl: startUrl,
    go: go,
    mountButtons: mountButtons,
  };
})(window);
