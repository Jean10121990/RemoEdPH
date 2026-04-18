/**
 * Remember the obfuscated admin login URL path after a successful visit so
 * logout and session expiry can send the browser back without hardcoding it.
 */
(function (global) {
  'use strict';

  var LS_ADMIN = 'remoed_admin_token';

  function getAuthToken() {
    try {
      return (
        global.localStorage.getItem(LS_ADMIN) ||
        global.sessionStorage.getItem(LS_ADMIN) ||
        global.localStorage.getItem('remoed_admin_auth') ||
        global.sessionStorage.getItem('remoed_admin_auth') ||
        global.localStorage.getItem('adminToken') ||
        global.sessionStorage.getItem('adminToken') ||
        ''
      );
    } catch (e) {
      return '';
    }
  }

  function setAuthToken(t) {
    try {
      var tok = String(t || '');
      if (!tok) return;
      global.localStorage.setItem(LS_ADMIN, tok);
      global.localStorage.setItem('adminToken', tok);
    } catch (e) {}
  }

  function clearAuthToken() {
    try {
      global.localStorage.removeItem(LS_ADMIN);
      global.sessionStorage.removeItem(LS_ADMIN);
      global.localStorage.removeItem('remoed_admin_auth');
      global.sessionStorage.removeItem('remoed_admin_auth');
      global.localStorage.removeItem('adminToken');
      global.sessionStorage.removeItem('adminToken');
    } catch (e) {}
  }

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
      global.location.replace(p);
      return;
    }
    // Safe fallback for admin pages served under /admin/* static.
    global.location.replace('/admin/admin-login.html');
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
    getAuthToken: getAuthToken,
    setAuthToken: setAuthToken,
    clearAuthToken: clearAuthToken,
  };
})(typeof window !== 'undefined' ? window : this);
