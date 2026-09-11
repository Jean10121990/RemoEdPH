/**
 * Central remoed_* + legacy token resolver for teacher portal and live classroom.
 * Prefer role tokens, then remoed_user_token, then legacy `token`.
 */
(function (global) {
  'use strict';

  function ls(key) {
    try {
      return global.localStorage.getItem(key) || '';
    } catch (_e) {
      return '';
    }
  }

  function ss(key) {
    try {
      return global.sessionStorage.getItem(key) || '';
    } catch (_e) {
      return '';
    }
  }

  function firstNonEmpty() {
    for (var i = 0; i < arguments.length; i++) {
      var v = arguments[i];
      if (v != null && String(v).trim()) return String(v).trim();
    }
    return '';
  }

  function getTeacherToken() {
    try {
      if (global.RemoedTeacherSession && typeof global.RemoedTeacherSession.getToken === 'function') {
        var t = global.RemoedTeacherSession.getToken();
        if (t) return t;
      }
    } catch (_e) {}
    try {
      if (global.RemoedUserSession && typeof global.RemoedUserSession.getUserToken === 'function') {
        var u = global.RemoedUserSession.getUserToken();
        if (u) return u;
      }
    } catch (_e2) {}
    return firstNonEmpty(
      ls('remoed_teacher_token'),
      ss('remoed_teacher_token'),
      ls('remoed_teacher_auth'),
      ss('remoed_teacher_auth'),
      ls('remoed_user_token'),
      ss('remoed_user_token'),
      ls('token'),
      ss('token')
    );
  }

  function getStudentToken() {
    try {
      if (global.RemoedSecurityGuard && typeof global.RemoedSecurityGuard.getToken === 'function') {
        var kind =
          typeof global.RemoedSecurityGuard.portalKind === 'function'
            ? global.RemoedSecurityGuard.portalKind()
            : '';
        if (kind === 'student') {
          var g = global.RemoedSecurityGuard.getToken();
          if (g) return g;
        }
      }
    } catch (_e) {}
    return firstNonEmpty(
      ls('remoed_student_token'),
      ss('remoed_student_token'),
      ls('remoed_student_auth'),
      ss('remoed_student_auth'),
      ls('remoed_user_token'),
      ss('remoed_user_token'),
      ls('token'),
      ss('token')
    );
  }

  /**
   * Classroom / shared surfaces: honor ?type=, then SecurityGuard, then role tokens.
   */
  function resolveClassroomToken() {
    try {
      if (global.RemoedSecurityGuard && typeof global.RemoedSecurityGuard.getToken === 'function') {
        var sg = global.RemoedSecurityGuard.getToken();
        if (sg) return sg;
      }
    } catch (_e) {}
    try {
      var typeParam = '';
      try {
        typeParam = String(new URLSearchParams(global.location.search || '').get('type') || '')
          .trim()
          .toLowerCase();
      } catch (_e2) {}
      if (typeParam === 'teacher') return getTeacherToken();
      if (typeParam === 'student') return getStudentToken();
      if (global.RemoedTeacherSession && typeof global.RemoedTeacherSession.isTeacherSession === 'function') {
        if (global.RemoedTeacherSession.isTeacherSession()) return getTeacherToken();
      }
      var ut = String(ls('userType') || ls('userRole') || '')
        .trim()
        .toLowerCase();
      if (ut === 'teacher') return getTeacherToken();
      if (ut === 'student') return getStudentToken();
      return firstNonEmpty(getTeacherToken(), getStudentToken());
    } catch (_e3) {
      return firstNonEmpty(ls('token'), ss('token'));
    }
  }

  /** Selective clear for auth miss / 401 — never wipe all of localStorage. */
  function clearSessionTokens() {
    try {
      if (global.RemoedUserSession && typeof global.RemoedUserSession.clearUserToken === 'function') {
        global.RemoedUserSession.clearUserToken();
        return;
      }
    } catch (_e) {}
    try {
      [
        'remoed_teacher_token',
        'remoed_teacher_auth',
        'remoed_student_token',
        'remoed_student_auth',
        'remoed_user_token',
        'token',
        'userType',
        'userRole',
      ].forEach(function (k) {
        try {
          global.localStorage.removeItem(k);
          global.sessionStorage.removeItem(k);
        } catch (_e2) {}
      });
    } catch (_e3) {}
  }

  global.RemoedAuthToken = {
    getTeacherToken: getTeacherToken,
    getStudentToken: getStudentToken,
    resolveClassroomToken: resolveClassroomToken,
    clearSessionTokens: clearSessionTokens,
  };
})(typeof window !== 'undefined' ? window : this);
