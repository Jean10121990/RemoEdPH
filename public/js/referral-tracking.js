// Capture ?ref= once. First code wins for 30 days (cookie + localStorage).
// Also records a link click for the referrer (once per browser session per code).
(function () {
  'use strict';

  var COOKIE = 'remoed_ref';
  var MAX_AGE = 30 * 24 * 60 * 60;

  function readCookie() {
    var parts = String(document.cookie || '').split(';');
    for (var i = 0; i < parts.length; i++) {
      var bit = parts[i].trim();
      if (bit.indexOf(COOKIE + '=') === 0) {
        try {
          return decodeURIComponent(bit.slice(COOKIE.length + 1));
        } catch (e) {
          return bit.slice(COOKIE.length + 1);
        }
      }
    }
    return '';
  }

  function writeCookie(value) {
    var secure = location.protocol === 'https:' ? '; Secure' : '';
    document.cookie =
      COOKIE + '=' + encodeURIComponent(value) + '; Max-Age=' + MAX_AGE + '; Path=/; SameSite=Lax' + secure;
  }

  function recordClick(code) {
    if (!code) return;
    var key = 'remoed_ref_click_' + code;
    try {
      if (sessionStorage.getItem(key)) return;
      sessionStorage.setItem(key, '1');
    } catch (e) {
      /* still try to record once this page load */
    }
    try {
      fetch('/api/public/referral-click', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'omit',
        body: JSON.stringify({ code: code }),
        keepalive: true,
      }).catch(function () {});
    } catch (e2) {}
  }

  try {
    var stored = localStorage.getItem('referralCode') || '';
    var cookie = readCookie();
    if (!stored && cookie) {
      localStorage.setItem('referralCode', cookie);
      stored = cookie;
    }
    var params = new URLSearchParams(window.location.search);
    var ref = params.get('ref');
    ref = ref && String(ref).trim() ? String(ref).trim() : '';
    if (ref) {
      // Count a visit whenever the URL carries ?ref=, even if first-wins already stored another code.
      recordClick(ref);
    }
    if (!ref || stored || cookie) return;
    localStorage.setItem('referralCode', ref);
    localStorage.setItem('referralCapturedAt', new Date().toISOString());
    writeCookie(ref);
  } catch (e) {
    // ignore storage errors
  }
})();
