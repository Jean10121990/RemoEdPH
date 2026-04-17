/**
 * Shared session helpers for Student/Teacher portals.
 * - Canonical token key: remoed_user_token (stored in localStorage OR sessionStorage)
 * - Backward compatible with legacy key: token
 */
(function (global) {
  'use strict';

  /** Native fetch; must not be the patched global.fetch or /api calls recurse forever. */
  var realFetch = typeof global.fetch === 'function' ? global.fetch.bind(global) : null;

  function getUserToken() {
    try {
      return (
        global.localStorage.getItem('remoed_user_token') ||
        global.sessionStorage.getItem('remoed_user_token') ||
        global.localStorage.getItem('token') ||
        global.sessionStorage.getItem('token') ||
        ''
      );
    } catch (_e) {
      return '';
    }
  }

  function clearUserToken() {
    try {
      global.localStorage.removeItem('remoed_user_token');
      global.sessionStorage.removeItem('remoed_user_token');
      global.localStorage.removeItem('token');
      global.sessionStorage.removeItem('token');
      // Keep legacy cleanup for existing pages
      global.localStorage.removeItem('userType');
    } catch (_e) {}
  }

  function logoutToUnifiedLogin() {
    clearUserToken();
    try {
      global.location.replace('/login/');
    } catch (_e) {
      global.location.href = '/login/';
    }
  }

  async function apiFetch(url, init) {
    var cfg = init && typeof init === 'object' ? Object.assign({}, init) : {};
    var headers = Object.assign({}, cfg.headers || {});
    var token = getUserToken();
    if (token && !headers.Authorization && !headers.authorization) {
      headers.Authorization = 'Bearer ' + token;
    }
    cfg.headers = headers;
    cfg.credentials = 'include';
    if (!realFetch) {
      throw new Error('fetch is not available');
    }
    var res = await realFetch(url, cfg);
    if (res && (res.status === 401 || res.status === 403)) {
      logoutToUnifiedLogin();
    }
    return res;
  }

  // Optional: inject token automatically for same-origin /api/* requests.
  // This reduces the need to modify every dashboard script.
  (function patchFetch() {
    if (!realFetch || global.__REMOED_FETCH_PATCHED__) return;
    global.__REMOED_FETCH_PATCHED__ = true;
    global.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (typeof url === 'string' && url.indexOf('/api/') === 0) {
          return apiFetch(url, init);
        }
      } catch (_e) {}
      return realFetch(input, init);
    };
  })();

  global.RemoedUserSession = {
    getUserToken: getUserToken,
    clearUserToken: clearUserToken,
    logoutToUnifiedLogin: logoutToUnifiedLogin,
    apiFetch: apiFetch,
  };
})(typeof window !== 'undefined' ? window : this);

