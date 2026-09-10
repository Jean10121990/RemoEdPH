/**
 * Shared teacher portal access + token helpers.
 * Accepts userType/userRole or teacher JWT (same idea as security-guard).
 */
(function (global) {
  'use strict';

  function storageRole() {
    try {
      return String(
        global.localStorage.getItem('userType') ||
          global.localStorage.getItem('userRole') ||
          ''
      )
        .trim()
        .toLowerCase();
    } catch (e) {
      return '';
    }
  }

  function decodeJwtRole(token) {
    try {
      if (!token || String(token).split('.').length < 2) return '';
      var json = String(token)
        .split('.')[1]
        .replace(/-/g, '+')
        .replace(/_/g, '/');
      while (json.length % 4) json += '=';
      var payload = JSON.parse(global.atob(json));
      var r = String(payload.userRole || payload.userType || payload.role || '')
        .trim()
        .toLowerCase();
      if (r === 'teacher') return 'teacher';
      if (payload.teacherId && !payload.studentId) return 'teacher';
      return r;
    } catch (e) {
      return '';
    }
  }

  function getTeacherToken() {
    try {
      if (
        global.RemoedUserSession &&
        typeof global.RemoedUserSession.getUserToken === 'function'
      ) {
        var t = global.RemoedUserSession.getUserToken();
        if (t) return t;
      }
    } catch (e) {}
    try {
      return (
        global.localStorage.getItem('remoed_teacher_token') ||
        global.sessionStorage.getItem('remoed_teacher_token') ||
        global.localStorage.getItem('remoed_teacher_auth') ||
        global.sessionStorage.getItem('remoed_teacher_auth') ||
        global.localStorage.getItem('remoed_user_token') ||
        global.sessionStorage.getItem('remoed_user_token') ||
        global.localStorage.getItem('token') ||
        global.sessionStorage.getItem('token') ||
        ''
      );
    } catch (e2) {
      return '';
    }
  }

  /** True when storage or teacher JWT says teacher; heals stale userType when JWT wins. */
  function isTeacherSession() {
    var tok = getTeacherToken();
    var role = storageRole();
    var jwtRole = decodeJwtRole(tok);
    if (role === 'teacher' || jwtRole === 'teacher') {
      try {
        if (role !== 'teacher' && jwtRole === 'teacher') {
          global.localStorage.setItem('userType', 'teacher');
          global.localStorage.setItem('userRole', 'teacher');
        }
      } catch (e) {}
      return true;
    }
    return false;
  }

  /**
   * @param {{ redirect?: string, message?: string, requireToken?: boolean, alert?: boolean }} [opts]
   * @returns {boolean}
   */
  function requireTeacher(opts) {
    opts = opts || {};
    if (!isTeacherSession()) {
      if (opts.alert !== false) {
        global.alert(
          opts.message || 'Access denied. This page is for teachers only.'
        );
      }
      global.location.href = opts.redirect || '/login/';
      return false;
    }
    if (opts.requireToken !== false && !getTeacherToken()) {
      global.location.href = opts.redirect || '/login/';
      return false;
    }
    return true;
  }

  global.RemoedTeacherSession = {
    getToken: getTeacherToken,
    requireTeacher: requireTeacher,
    isTeacherSession: isTeacherSession,
    storageRole: storageRole,
  };
})(typeof window !== 'undefined' ? window : this);
