/**
 * Global auth guard for dashboards and live classroom.
 * Uses role-specific tokens (remoed_admin_token, remoed_teacher_token, remoed_student_token) with legacy fallbacks.
 * Missing or wrong session for the current portal → window.location.replace('index.html')
 * Login pages: valid session → replace() to the matching dashboard (user never sees the form).
 */
(function () {
  'use strict';

  var LS_ADMIN = 'remoed_admin_token';
  var LS_TEACHER = 'remoed_teacher_token';
  var LS_STUDENT = 'remoed_student_token';

  function replaceToIndex() {
    window.location.replace('index.html');
  }

  function portalKindFromPath() {
    /* admin-login.html is served only at ADMIN_LOGIN_PATH (e.g. /admin-portal_...). That path still starts with "/admin-", so without this flag it would be treated as the protected admin portal and redirect to index. */
    if (typeof window !== 'undefined' && window.__REMOED_ADMIN_LOGIN_HTML__ === true) {
      return 'public';
    }
    var p = (window.location.pathname || '').toLowerCase();
    if (p.indexOf('super-monitor') !== -1) return 'admin';
    if (p.startsWith('/admin-') || p.indexOf('/admin/') !== -1) {
      if (/admin-login|admin-first-setup|admin-2fa-verify|admin-2fa-setup/.test(p)) return 'public';
      return 'admin';
    }
    if (p.startsWith('/teacher-')) return 'teacher';
    if (p.startsWith('/student-')) return 'student';
    if (p.indexOf('change-password') !== -1) {
      var utCh = (getSessionRoleFromStorage() || '').toLowerCase();
      if (utCh === 'admin') return 'admin';
      if (utCh === 'teacher') return 'teacher';
      if (utCh === 'student') return 'student';
    }
    if (p.indexOf('live-classroom') !== -1 || p.indexOf('video-room') !== -1 || p.indexOf('whiteboard') !== -1) {
      var ut = (getSessionRoleFromStorage() || '').toLowerCase();
      if (ut === 'admin') return 'admin';
      if (ut === 'teacher') return 'teacher';
      if (ut === 'student') return 'student';
    }
    var ut2 = (getSessionRoleFromStorage() || '').toLowerCase();
    if (ut2 === 'admin') return 'admin';
    if (ut2 === 'teacher') return 'teacher';
    if (ut2 === 'student') return 'student';
    return '';
  }

  function getSessionRoleFromStorage() {
    try {
      // Prefer userType so admin login (sets userType only) wins over a stale userRole from another portal.
      return (localStorage.getItem('userType') || localStorage.getItem('userRole') || '').trim();
    } catch (_e) {
      return '';
    }
  }

  function getTokenForPortal(portal) {
    try {
      if (portal === 'admin') {
        return (
          localStorage.getItem('remoed_admin_auth') ||
          sessionStorage.getItem('remoed_admin_auth') ||
          localStorage.getItem(LS_ADMIN) ||
          sessionStorage.getItem(LS_ADMIN) ||
          localStorage.getItem('adminToken') ||
          sessionStorage.getItem('adminToken') ||
          ''
        );
      }
      if (portal === 'teacher') {
        return (
          localStorage.getItem(LS_TEACHER) ||
          sessionStorage.getItem(LS_TEACHER) ||
          localStorage.getItem('remoed_teacher_auth') ||
          sessionStorage.getItem('remoed_teacher_auth') ||
          localStorage.getItem('remoed_user_token') ||
          sessionStorage.getItem('remoed_user_token') ||
          localStorage.getItem('token') ||
          sessionStorage.getItem('token') ||
          ''
        );
      }
      if (portal === 'student') {
        var stuPrimary =
          localStorage.getItem(LS_STUDENT) ||
          sessionStorage.getItem(LS_STUDENT) ||
          localStorage.getItem('remoed_student_auth') ||
          sessionStorage.getItem('remoed_student_auth') ||
          '';
        if (stuPrimary) return stuPrimary;
        var legTok =
          localStorage.getItem('remoed_user_token') ||
          sessionStorage.getItem('remoed_user_token') ||
          localStorage.getItem('token') ||
          sessionStorage.getItem('token') ||
          '';
        if (legTok && roleFromJwt(decodeJwtPayload(legTok)) === 'student') return legTok;
        return '';
      }
      return '';
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

  function normJwtRole(v) {
    return String(v == null ? '' : v).trim().toLowerCase();
  }

  function roleFromJwt(pl) {
    if (!pl) return '';
    var rr = normJwtRole(pl.role);
    var ur = normJwtRole(pl.userRole);
    var ut = normJwtRole(pl.userType);
    if (pl.isAdmin === true || rr === 'admin') return 'admin';
    if (ur === 'teacher' || ut === 'teacher' || rr === 'teacher') return 'teacher';
    if (ur === 'student' || ut === 'student') return 'student';
    if (pl.teacherId && !pl.studentId) return 'teacher';
    if (pl.studentId && !pl.teacherId) return 'student';
    return '';
  }

  function clearAuthStorage() {
    try {
      if (window.RemoedUserSession && typeof window.RemoedUserSession.clearUserToken === 'function') {
        window.RemoedUserSession.clearUserToken();
        return;
      }
    } catch (_e) {}
    try {
      localStorage.removeItem(LS_ADMIN);
      sessionStorage.removeItem(LS_ADMIN);
      localStorage.removeItem('remoed_admin_auth');
      sessionStorage.removeItem('remoed_admin_auth');
      localStorage.removeItem('adminToken');
      sessionStorage.removeItem('adminToken');
      localStorage.removeItem(LS_TEACHER);
      sessionStorage.removeItem(LS_TEACHER);
      localStorage.removeItem('remoed_teacher_auth');
      sessionStorage.removeItem('remoed_teacher_auth');
      localStorage.removeItem(LS_STUDENT);
      sessionStorage.removeItem(LS_STUDENT);
      localStorage.removeItem('remoed_student_auth');
      sessionStorage.removeItem('remoed_student_auth');
      localStorage.removeItem('remoed_user_token');
      sessionStorage.removeItem('remoed_user_token');
      localStorage.removeItem('token');
      sessionStorage.removeItem('token');
      localStorage.removeItem('userType');
      localStorage.removeItem('userRole');
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

  function isAuthPublicTeacherPage() {
    var p = (window.location.pathname || '').toLowerCase();
    var h = (window.location.href || '').toLowerCase();
    return (
      p.indexOf('teacher-login') !== -1 ||
      h.indexOf('teacher-login') !== -1 ||
      p.indexOf('teacher-signup') !== -1 ||
      h.indexOf('teacher-signup') !== -1 ||
      p.indexOf('/register.html') !== -1 ||
      h.indexOf('/register.html') !== -1 ||
      p.indexOf('teacher-register') !== -1 ||
      h.indexOf('teacher-register') !== -1
    );
  }

  function isPublicTeachersListing() {
    var p = (window.location.pathname || '').toLowerCase();
    return /\/teachers\.html$/i.test(p) || /\/teachers$/i.test(p);
  }

  function enforceStudentNotOnTeacherPortal() {
    if (isLiveClassroomPage() || isAuthPublicTeacherPage() || isPublicTeachersListing()) return false;
    var p = (window.location.pathname || '').toLowerCase();
    var h = (window.location.href || '').toLowerCase();
    if (getSessionRoleFromStorage().toLowerCase() !== 'student') return false;
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

  function enforceTeacherNotOnStudentPortal() {
    if (isLiveClassroomPage() || isPublicStudentAuthPage()) return false;
    var p = (window.location.pathname || '').toLowerCase();
    if (getSessionRoleFromStorage().toLowerCase() !== 'teacher') return false;
    if (p.indexOf('student-') !== -1) {
      replaceTo('/teacher-dashboard.html');
      return true;
    }
    return false;
  }

  function enforceDashboardRole() {
    var p = (window.location.pathname || '').toLowerCase();
    var r = getSessionRoleFromStorage().toLowerCase();
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

    var sessionRole = getSessionRoleFromStorage().toLowerCase();
    if (!sessionRole) {
      clearAuthStorage();
      replaceToIndex();
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

  function sessionLooksValidForPortal(portal) {
    var token = getTokenForPortal(portal);
    if (!token || isJwtExpired(token)) return false;
    var storageRole = getSessionRoleFromStorage().toLowerCase();
    var jwtRole = roleFromJwt(decodeJwtPayload(token)).toLowerCase();
    if (portal === 'admin') {
      return storageRole === 'admin' || jwtRole === 'admin';
    }
    if (portal === 'teacher') {
      return storageRole === 'teacher' || jwtRole === 'teacher';
    }
    if (portal === 'student') {
      if (jwtRole === 'admin' || jwtRole === 'teacher') return false;
      if (jwtRole === 'student') return true;
      return storageRole === 'student';
    }
    return false;
  }

  /** If already authenticated, skip login UI (must run before public-page early return). */
  function redirectIfAuthenticatedOnLoginPage() {
    var path = (window.location.pathname || '').toLowerCase();
    var href = (window.location.href || '').toLowerCase();

    var onStudentLogin = path.indexOf('student-login') !== -1 || href.indexOf('student-login') !== -1;
    var onTeacherLogin = path.indexOf('teacher-login') !== -1 || href.indexOf('teacher-login') !== -1;
    var onAdminLogin =
      (typeof window !== 'undefined' && window.__REMOED_ADMIN_LOGIN_HTML__ === true) ||
      /admin-login/.test(path) ||
      /admin-login/.test(href);
    var onUnifiedLogin =
      path === '/login' ||
      path === '/login/' ||
      path.endsWith('/login/index.html');

    if (onStudentLogin && sessionLooksValidForPortal('student')) {
      replaceTo('/student-dashboard.html');
      return true;
    }
    if (onTeacherLogin && sessionLooksValidForPortal('teacher')) {
      replaceTo('/teacher-dashboard.html');
      return true;
    }
    if (onAdminLogin && sessionLooksValidForPortal('admin')) {
      replaceTo('/admin-dashboard.html');
      return true;
    }
    if (onUnifiedLogin) {
      if (sessionLooksValidForPortal('admin')) {
        replaceTo('/admin-dashboard.html');
        return true;
      }
      if (sessionLooksValidForPortal('teacher')) {
        replaceTo('/teacher-dashboard.html');
        return true;
      }
      if (sessionLooksValidForPortal('student')) {
        replaceTo('/student-dashboard.html');
        return true;
      }
    }
    return false;
  }

  if (redirectIfAuthenticatedOnLoginPage()) {
    return;
  }

  var p = (window.location.pathname || '').toLowerCase();
  if (
    p === '/' ||
    !p ||
    p.endsWith('/index.html') ||
    p.endsWith('login.html') ||
    p.indexOf('login.html') !== -1 ||
    p.indexOf('catalog') !== -1 ||
    p.indexOf('privacy') !== -1 ||
    p.indexOf('terms-of-service') !== -1 ||
    p.indexOf('forgot-password') !== -1 ||
    p.indexOf('reset-password') !== -1 ||
    p.indexOf('clear-session') !== -1 ||
    p.indexOf('device-check') !== -1 ||
    p.indexOf('student-login') !== -1 ||
    p.indexOf('teacher-login') !== -1 ||
    p.indexOf('student-register') !== -1 ||
    p.indexOf('student-forgot') !== -1 ||
    p.indexOf('student-signup') !== -1 ||
    p.indexOf('trial-class') !== -1 ||
    p === '/login' ||
    p.startsWith('/login/') ||
    p.indexOf('admin-login') !== -1
  ) {
    window.RemoedSecurityGuard = {
      getToken: function () {
        return getTokenForPortal(portalKindFromPath());
      },
      getSessionRole: getSessionRoleFromStorage,
      decodeJwtPayload: decodeJwtPayload,
    };
    return;
  }

  var portal = portalKindFromPath();
  if (portal === 'public') {
    window.RemoedSecurityGuard = {
      getToken: function () {
        return getTokenForPortal(portalKindFromPath());
      },
      getSessionRole: getSessionRoleFromStorage,
      decodeJwtPayload: decodeJwtPayload,
    };
    return;
  }

  if (portal === '') {
    window.RemoedSecurityGuard = {
      getToken: function () {
        return getTokenForPortal(portalKindFromPath());
      },
      getSessionRole: getSessionRoleFromStorage,
      decodeJwtPayload: decodeJwtPayload,
    };
    return;
  }

  var token = getTokenForPortal(portal);
  var storageRole = getSessionRoleFromStorage().toLowerCase();
  var jwtRole = roleFromJwt(decodeJwtPayload(token)).toLowerCase();

  if (!token) {
    clearAuthStorage();
    replaceToIndex();
    return;
  }

  if (isJwtExpired(token)) {
    clearAuthStorage();
    replaceToIndex();
    return;
  }

  function portalMatchesRole() {
    if (portal === 'admin') {
      return storageRole === 'admin' || jwtRole === 'admin';
    }
    if (portal === 'teacher') {
      return storageRole === 'teacher' || jwtRole === 'teacher';
    }
    if (portal === 'student') {
      if (jwtRole === 'admin' || jwtRole === 'teacher') return false;
      if (jwtRole === 'student') return true;
      return storageRole === 'student';
    }
    return false;
  }

  if (!portalMatchesRole()) {
    clearAuthStorage();
    replaceToIndex();
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
    getToken: function () {
      return getTokenForPortal(portalKindFromPath());
    },
    getSessionRole: getSessionRoleFromStorage,
    decodeJwtPayload: decodeJwtPayload,
  };
})();
