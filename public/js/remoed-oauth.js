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
      var allow = opts.providers || ['google', 'facebook'];
      el.innerHTML = '';
      el.hidden = !allow.some(function (name) {
        return !!p[name];
      });
      if (el.hidden) return;

      var title = document.createElement('p');
      title.className = 'remoed-oauth-title';
      title.textContent = opts.title || 'Or continue with';
      el.appendChild(title);

      var row = document.createElement('div');
      row.className = 'remoed-oauth-row';

      var marks = {
        google:
          '<svg class="remoed-oauth-mark" viewBox="0 0 48 48" aria-hidden="true"><path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.3 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.7-.4-3.5z"/><path fill="#FF3D00" d="M6.3 14.7l6.6 4.8C14.7 16 19 12 24 12c3.1 0 5.8 1.2 8 3.1l5.7-5.7C34.2 6.1 29.4 4 24 4 16.3 4 9.6 8.3 6.3 14.7z"/><path fill="#4CAF50" d="M24 44c5.2 0 10-2 13.6-5.2l-6.3-5.3C29.2 35.1 26.7 36 24 36c-5.3 0-9.7-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z"/><path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-1.1 3.2-3.5 5.7-6.7 7.1l6.3 5.3C37.4 38.3 44 33 44 24c0-1.3-.1-2.7-.4-3.5z"/></svg>',
        facebook:
          '<svg class="remoed-oauth-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="#1877F2" d="M24 12.07C24 5.4 18.63 0 12 0S0 5.4 0 12.07C0 18.1 4.39 23.09 10.13 24v-8.44H7.08v-3.49h3.05V9.41c0-3.02 1.79-4.7 4.53-4.7 1.31 0 2.68.24 2.68.24v2.96h-1.51c-1.49 0-1.95.93-1.95 1.89v2.27h3.32l-.53 3.49h-2.79V24C19.61 23.09 24 18.1 24 12.07z"/></svg>',
      };

      function addBtn(provider, label) {
        if (!p[provider]) return;
        var btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'remoed-oauth-btn remoed-oauth-btn--' + provider;
        btn.innerHTML = (marks[provider] || '') + '<span>' + label + '</span>';
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

      if (allow.indexOf('google') !== -1) addBtn('google', 'Continue with Google');
      if (allow.indexOf('facebook') !== -1) addBtn('facebook', 'Continue with Facebook');
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
    '.remoed-oauth-btn{min-height:44px;border-radius:999px;border:1px solid #cbd5e1;background:#fff;font-weight:800;cursor:pointer;color:#0f172a;display:inline-flex;align-items:center;justify-content:center;gap:10px}' +
    '.remoed-oauth-mark{width:18px;height:18px;flex:none;display:block}' +
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
