/**
 * Shared session helpers for Student/Teacher/Admin portals.
 * Role-specific storage: remoed_admin_token, remoed_teacher_token, remoed_student_token
 * (legacy: remoed_*_auth, adminToken, remoed_user_token, token)
 * Bearer token for /api/* is chosen from the current URL path so admin and teacher sessions do not overwrite each other.
 */
(function (global) {
  'use strict';

  /** Native fetch; must not be the patched global.fetch or /api calls recurse forever. */
  var realFetch = typeof global.fetch === 'function' ? global.fetch.bind(global) : null;

  var LS_ADMIN = 'remoed_admin_token';
  var LS_TEACHER = 'remoed_teacher_token';
  var LS_STUDENT = 'remoed_student_token';

  function portalKindFromLocation() {
    try {
      if (global.__REMOED_ADMIN_LOGIN_HTML__ === true) return '';
      var loc = global.location;
      if (!loc || !loc.pathname) return '';
      var p = String(loc.pathname).toLowerCase();
      if (p.indexOf('super-monitor') !== -1) return 'admin';
      if (p.startsWith('/admin-') || p.indexOf('/admin/') !== -1) return 'admin';
      if (p.startsWith('/teacher-')) return 'teacher';
      if (p.startsWith('/student-')) return 'student';
      if (p.indexOf('change-password') !== -1) {
        try {
          var utCh = (global.localStorage.getItem('userType') || global.localStorage.getItem('userRole') || '').toLowerCase();
          if (utCh === 'admin') return 'admin';
          if (utCh === 'teacher') return 'teacher';
          if (utCh === 'student') return 'student';
        } catch (_ec) {}
      }
      if (p.indexOf('live-classroom') !== -1 || p.indexOf('video-room') !== -1 || p.indexOf('whiteboard') !== -1) {
        try {
          var ut = (global.localStorage.getItem('userType') || global.localStorage.getItem('userRole') || '').toLowerCase();
          if (ut === 'admin') return 'admin';
          if (ut === 'teacher') return 'teacher';
          if (ut === 'student') return 'student';
        } catch (_e) {}
      }
      try {
        var ut2 = (global.localStorage.getItem('userType') || global.localStorage.getItem('userRole') || '').toLowerCase();
        if (ut2 === 'admin') return 'admin';
        if (ut2 === 'teacher') return 'teacher';
        if (ut2 === 'student') return 'student';
      } catch (_e2) {}
      return '';
    } catch (_e3) {
      return '';
    }
  }

  function getUserToken() {
    try {
      var kind = portalKindFromLocation();
      if (kind === 'admin') {
        return (
          global.localStorage.getItem('remoed_admin_auth') ||
          global.sessionStorage.getItem('remoed_admin_auth') ||
          global.localStorage.getItem(LS_ADMIN) ||
          global.sessionStorage.getItem(LS_ADMIN) ||
          global.localStorage.getItem('adminToken') ||
          global.sessionStorage.getItem('adminToken') ||
          ''
        );
      }
      if (kind === 'teacher') {
        return (
          global.localStorage.getItem(LS_TEACHER) ||
          global.sessionStorage.getItem(LS_TEACHER) ||
          global.localStorage.getItem('remoed_teacher_auth') ||
          global.sessionStorage.getItem('remoed_teacher_auth') ||
          global.localStorage.getItem('remoed_user_token') ||
          global.sessionStorage.getItem('remoed_user_token') ||
          global.localStorage.getItem('token') ||
          global.sessionStorage.getItem('token') ||
          ''
        );
      }
      if (kind === 'student') {
        return (
          global.localStorage.getItem(LS_STUDENT) ||
          global.sessionStorage.getItem(LS_STUDENT) ||
          global.localStorage.getItem('remoed_student_auth') ||
          global.sessionStorage.getItem('remoed_student_auth') ||
          global.localStorage.getItem('remoed_user_token') ||
          global.sessionStorage.getItem('remoed_user_token') ||
          global.localStorage.getItem('token') ||
          global.sessionStorage.getItem('token') ||
          ''
        );
      }
      return (
        global.localStorage.getItem('remoed_user_token') ||
        global.sessionStorage.getItem('remoed_user_token') ||
        global.localStorage.getItem('token') ||
        global.sessionStorage.getItem('token') ||
        global.localStorage.getItem(LS_TEACHER) ||
        global.localStorage.getItem(LS_STUDENT) ||
        ''
      );
    } catch (_e) {
      return '';
    }
  }

  function clearUserToken() {
    try {
      var kind = portalKindFromLocation();
      if (kind === 'admin') {
        global.localStorage.removeItem(LS_ADMIN);
        global.sessionStorage.removeItem(LS_ADMIN);
        global.localStorage.removeItem('remoed_admin_auth');
        global.sessionStorage.removeItem('remoed_admin_auth');
        global.localStorage.removeItem('adminToken');
        global.sessionStorage.removeItem('adminToken');
        global.localStorage.removeItem('adminUsername');
        global.localStorage.removeItem('adminRole');
        global.localStorage.removeItem('userType');
        global.localStorage.removeItem('userRole');
        return;
      }
      if (kind === 'teacher') {
        global.localStorage.removeItem(LS_TEACHER);
        global.sessionStorage.removeItem(LS_TEACHER);
        global.localStorage.removeItem('remoed_teacher_auth');
        global.sessionStorage.removeItem('remoed_teacher_auth');
        global.localStorage.removeItem('remoed_user_token');
        global.sessionStorage.removeItem('remoed_user_token');
        global.localStorage.removeItem('token');
        global.sessionStorage.removeItem('token');
        global.localStorage.removeItem('teacherId');
        global.localStorage.removeItem('teacherMongoId');
        global.localStorage.removeItem('remoedUsername');
        global.localStorage.removeItem('userType');
        global.localStorage.removeItem('userRole');
        return;
      }
      if (kind === 'student') {
        global.localStorage.removeItem(LS_STUDENT);
        global.sessionStorage.removeItem(LS_STUDENT);
        global.localStorage.removeItem('remoed_student_auth');
        global.sessionStorage.removeItem('remoed_student_auth');
        global.localStorage.removeItem('remoed_user_token');
        global.sessionStorage.removeItem('remoed_user_token');
        global.localStorage.removeItem('token');
        global.sessionStorage.removeItem('token');
        global.localStorage.removeItem('studentId');
        global.localStorage.removeItem('studentUsername');
        global.localStorage.removeItem('username');
        global.localStorage.removeItem('userType');
        global.localStorage.removeItem('userRole');
        return;
      }
      global.localStorage.removeItem(LS_ADMIN);
      global.sessionStorage.removeItem(LS_ADMIN);
      global.localStorage.removeItem('remoed_admin_auth');
      global.sessionStorage.removeItem('remoed_admin_auth');
      global.localStorage.removeItem('adminToken');
      global.sessionStorage.removeItem('adminToken');
      global.localStorage.removeItem(LS_TEACHER);
      global.sessionStorage.removeItem(LS_TEACHER);
      global.localStorage.removeItem('remoed_teacher_auth');
      global.sessionStorage.removeItem('remoed_teacher_auth');
      global.localStorage.removeItem(LS_STUDENT);
      global.sessionStorage.removeItem(LS_STUDENT);
      global.localStorage.removeItem('remoed_student_auth');
      global.sessionStorage.removeItem('remoed_student_auth');
      global.localStorage.removeItem('remoed_user_token');
      global.sessionStorage.removeItem('remoed_user_token');
      global.localStorage.removeItem('token');
      global.sessionStorage.removeItem('token');
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
    portalKindFromLocation: portalKindFromLocation,
    LS_ADMIN: LS_ADMIN,
    LS_TEACHER: LS_TEACHER,
    LS_STUDENT: LS_STUDENT,
  };
})(typeof window !== 'undefined' ? window : this);
