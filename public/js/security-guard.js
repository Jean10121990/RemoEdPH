/**
 * Global auth guard for dashboards and live classroom.
 * - Requires token + role in storage (remoed_user_token|token, userRole|userType)
 * - Checks JWT exp (payload decode); expired → clear storage + replace redirect
 * - Live classroom: URL ?type= must match session role or user is sent to the correct dashboard
 * - Uses window.location.replace so Back cannot bypass checks
 */
(function () {
  'use strict';

  function getToken() {
    try {
      return (
        localStorage.getItem('remoed_user_token') ||
        localStorage.getItem('token') ||
        sessionStorage.getItem('remoed_user_token') ||
        sessionStorage.getItem('token') ||
        ''
      );
    } catch (_e) {
      return '';
    }
  }

  function getSessionRole() {
    try {
      var r =
        (localStorage.getItem('userRole') || localStorage.getItem('userType') || '').trim().toLowerCase();
      return r;
    } catch (_e2) {
      return '';
    }
  }

  function decodeJwtPayload(token) {
    try {
      var part = String(token).split('.')[1];
      if (!part) return null;
      var b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      var pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
      return JSON.parse(atob(b64 + pad));
    } catch (_e) {
      return null;
    }
  }

  function isJwtExpired(token) {
    var pl = decodeJwtPayload(token);
    if (!pl || pl.exp == null) return false;
    var nowSec = Math.floor(Date.now() / 1000);
    return nowSec >= Number(pl.exp);
  }

  function clearAuthStorage() {
    try {
      if (window.RemoedUserSession && typeof window.RemoedUserSession.clearUserToken === 'function') {
        window.RemoedUserSession.clearUserToken();
      }
    } catch (_e) {}
    try {
      localStorage.clear();
      sessionStorage.clear();
    } catch (_e2) {}
  }

  function replaceTo(url) {
    window.location.replace(url);
  }

  function isLiveClassroomPage() {
    var p = (window.location.pathname || '').toLowerCase();
    var h = (window.location.href || '').toLowerCase();
    return p.indexOf('live-classroom') !== -1 || h.indexOf('live-classroom') !== -1;
  }

  /** Wrong dashboard for role → send user to the correct home (replace, no Back bypass). */
  function isAuthPublicTeacherPage() {
    var p = (window.location.pathname || '').toLowerCase();
    var h = (window.location.href || '').toLowerCase();
    return (
      p.indexOf('teacher-login') !== -1 ||
      h.indexOf('teacher-login') !== -1 ||
      p.indexOf('teacher-signup') !== -1 ||
      h.indexOf('teacher-signup') !== -1 ||
      p.indexOf('teacher-register') !== -1 ||
      h.indexOf('teacher-register') !== -1
    );
  }

  /** Public marketing page "Our Teachers" — not the teacher portal. */
  function isPublicTeachersListing() {
    var p = (window.location.pathname || '').toLowerCase();
    return /\/teachers\.html$/i.test(p) || /\/teachers$/i.test(p);
  }

  /** Student must not use teacher portal pages (socket + UI); live classroom uses ?type= rules instead. */
  function enforceStudentNotOnTeacherPortal() {
    if (isLiveClassroomPage() || isAuthPublicTeacherPage() || isPublicTeachersListing()) return false;
    var p = (window.location.pathname || '').toLowerCase();
    var h = (window.location.href || '').toLowerCase();
    if (getSessionRole() !== 'student') return false;
    if (p.indexOf('teacher-') !== -1 || h.indexOf('teacher-') !== -1) {
      replaceTo('/student-dashboard.html');
      return true;
    }
    return false;
  }

  function isPublicStudentAuthPage() {
    var p = (window.location.pathname || '').toLowerCase();
    return (
      p.indexOf('student-login') !== -1 ||
      p.indexOf('student-signup') !== -1 ||
      p.indexOf('student-register') !== -1
    );
  }

  /** Teacher must not use student portal pages (except live classroom / public auth). */
  function enforceTeacherNotOnStudentPortal() {
    if (isLiveClassroomPage() || isPublicStudentAuthPage()) return false;
    var p = (window.location.pathname || '').toLowerCase();
    if (getSessionRole() !== 'teacher') return false;
    if (p.indexOf('student-') !== -1) {
      replaceTo('/teacher-dashboard.html');
      return true;
    }
    return false;
  }

  function enforceDashboardRole() {
    var p = (window.location.pathname || '').toLowerCase();
    var r = getSessionRole();
    if (p.indexOf('teacher-dashboard') !== -1 && r === 'student') {
      replaceTo('/student-dashboard.html');
      return true;
    }
    if (p.indexOf('student-dashboard') !== -1 && r === 'teacher') {
      replaceTo('/teacher-dashboard.html');
      return true;
    }
    return false;
  }

  function enforceClassroomRoleVsUrl() {
    if (!isLiveClassroomPage()) return;

    var sp = new URLSearchParams(window.location.search);
    var typeParam = (sp.get('type') || '').trim().toLowerCase();
    if (!typeParam) return;

    var sessionRole = getSessionRole();
    if (!sessionRole) {
      clearAuthStorage();
      replaceTo('/index.html?error=unauthorized');
      return;
    }

    if (typeParam === 'teacher' && sessionRole === 'student') {
      replaceTo('/student-dashboard.html');
      return;
    }
    if (typeParam === 'student' && sessionRole === 'teacher') {
      replaceTo('/teacher-dashboard.html');
      return;
    }
  }

  var token = getToken();
  var role = getSessionRole();

  if (!token || !role) {
    clearAuthStorage();
    replaceTo('/index.html?error=unauthorized');
    return;
  }

  if (isJwtExpired(token)) {
    clearAuthStorage();
    replaceTo('/index.html?error=session_expired');
    return;
  }

  if (enforceStudentNotOnTeacherPortal()) {
    return;
  }

  if (enforceTeacherNotOnStudentPortal()) {
    return;
  }

  if (enforceDashboardRole()) {
    return;
  }

  enforceClassroomRoleVsUrl();

  window.RemoedSecurityGuard = {
    getToken: getToken,
    getSessionRole: getSessionRole,
    decodeJwtPayload: decodeJwtPayload,
  };
})();
