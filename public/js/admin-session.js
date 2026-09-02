/**
 * Remember the obfuscated admin login URL path after a successful visit so
 * logout and session expiry can send the browser back without hardcoding it.
 * Also enforces a 30-minute idle timeout for admin portal pages.
 */
(function (global) {
  'use strict';

  var LS_ADMIN = 'remoed_admin_token';
  /** Match server ADMIN_IDLE_TIMEOUT_MS default (30 minutes). */
  var IDLE_MS = 30 * 60 * 1000;
  var idleTimer = null;
  var idleArmed = false;

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
      global.localStorage.setItem('remoed_admin_auth', tok);
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

  function isAdminLoginPage() {
    try {
      var path = String(global.location.pathname || '').toLowerCase();
      var file = path.split('/').pop() || '';
      if (file.indexOf('admin-login') !== -1) return true;
      if (file.indexOf('2fa-setup') !== -1 || file.indexOf('2fa-verify') !== -1) return true;
      if (file.indexOf('admin-first-setup') !== -1) return true;
      return false;
    } catch (e) {
      return false;
    }
  }

  function forceIdleLogout() {
    clearAuthToken();
    try {
      global.localStorage.removeItem('userType');
      global.sessionStorage.removeItem('userType');
    } catch (e) {}
    try {
      fetch('/api/auth/admin-logout', { method: 'POST', credentials: 'include' }).catch(function () {});
    } catch (e2) {}
    redirectToAdminLogin();
  }

  function resetIdleTimer() {
    if (!idleArmed) return;
    if (idleTimer) {
      clearTimeout(idleTimer);
      idleTimer = null;
    }
    idleTimer = setTimeout(function () {
      forceIdleLogout();
    }, IDLE_MS);
  }

  function armIdleWatchdog() {
    if (idleArmed) {
      resetIdleTimer();
      return;
    }
    if (isAdminLoginPage()) return;

    var isAdmin = false;
    try {
      isAdmin = String(global.localStorage.getItem('userType') || '').toLowerCase() === 'admin';
    } catch (e) {}
    if (!isAdmin && !getAuthToken()) return;

    idleArmed = true;
    var events = ['mousemove', 'mousedown', 'keydown', 'touchstart', 'scroll', 'click', 'visibilitychange'];
    events.forEach(function (ev) {
      global.document.addEventListener(
        ev,
        function () {
          if (global.document.visibilityState && global.document.visibilityState === 'hidden') return;
          resetIdleTimer();
        },
        { passive: true }
      );
    });
    resetIdleTimer();
  }

  global.RemoedAdminSession = {
    getLoginPath: getLoginPath,
    redirectToAdminLogin: redirectToAdminLogin,
    rememberCurrentPathAsAdminEntry: rememberCurrentPathAsAdminEntry,
    getAuthToken: getAuthToken,
    setAuthToken: setAuthToken,
    clearAuthToken: clearAuthToken,
    idleTimeoutMs: IDLE_MS,
    armIdleWatchdog: armIdleWatchdog,
    resetIdleTimer: resetIdleTimer,
  };

  function bootIdle() {
    if (isAdminLoginPage()) return;
    try {
      var ut = String(global.localStorage.getItem('userType') || '').toLowerCase();
      if (ut === 'admin' || getAuthToken()) {
        armIdleWatchdog();
      }
    } catch (e) {}
  }

  if (global.document) {
    if (global.document.readyState === 'loading') {
      global.document.addEventListener('DOMContentLoaded', bootIdle);
    } else {
      bootIdle();
    }
  }
})(typeof window !== 'undefined' ? window : this);
