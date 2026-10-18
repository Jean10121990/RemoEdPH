// Capture ?ref= once. First code wins for 30 days (cookie + localStorage).
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
    if (!ref || stored || cookie) return;
    localStorage.setItem('referralCode', ref);
    localStorage.setItem('referralCapturedAt', new Date().toISOString());
    writeCookie(ref);
  } catch (e) {
    // ignore storage errors
  }
})();
