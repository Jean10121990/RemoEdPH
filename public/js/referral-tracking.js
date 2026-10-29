// Capture ?ref= from the URL. When the link includes ?ref=, that code wins
// (affiliate / teacher enroll links). Otherwise keep the stored code for 30 days.
// Also records a link click (once per browser session per code).
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
    var params = new URLSearchParams(window.location.search);
    var ref = params.get('ref');
    ref = ref && String(ref).trim() ? String(ref).trim() : '';

    if (ref) {
      // Opening an enroll/share link always attributes to that ref (not first-wins-only).
      localStorage.setItem('referralCode', ref);
      localStorage.setItem('referralCapturedAt', new Date().toISOString());
      writeCookie(ref);
      recordClick(ref);
      return;
    }

    var stored = localStorage.getItem('referralCode') || '';
    var cookie = readCookie();
    if (!stored && cookie) {
      localStorage.setItem('referralCode', cookie);
    }
  } catch (e) {
    // ignore storage errors
  }
})();
