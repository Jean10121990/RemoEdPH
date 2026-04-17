/**
 * Remember the obfuscated admin login URL path after a successful visit so
 * logout and session expiry can send the browser back without hardcoding it.
 */
(function (global) {
  'use strict';

  function getLoginPath() {
    try {
      var p = localStorage.getItem('remoedAdminEntryPath');
      if (p && p.charAt(0) === '/') return p;
    } catch (e) {}
    return '';
  }

  function redirectToAdminLogin() {
    var p = getLoginPath();
    if (p) {
      global.location.href = p;
      return;
    }
    // Safe fallback for admin pages served under /admin/* static.
    global.location.href = '/admin/admin-login.html';
  }

  /** Call from admin-login.html on load (before or after login UI). */
  function rememberCurrentPathAsAdminEntry() {
    try {
      var path = global.location.pathname || '';
      if (path && path !== '/' && path.indexOf('index.html') === -1) {
        localStorage.setItem('remoedAdminEntryPath', path);
      }
    } catch (e) {}
  }

  global.RemoedAdminSession = {
    getLoginPath: getLoginPath,
    redirectToAdminLogin: redirectToAdminLogin,
    rememberCurrentPathAsAdminEntry: rememberCurrentPathAsAdminEntry,
  };
})(typeof window !== 'undefined' ? window : this);
