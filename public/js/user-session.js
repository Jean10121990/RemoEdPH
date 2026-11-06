/**
 * Shared session helpers for Student/Teacher/Admin/Affiliate portals.
 * Role-specific storage: remoed_admin_token, remoed_teacher_token, remoed_student_token, remoed_affiliate_token
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
  var LS_AFFILIATE = 'remoed_affiliate_token';

  function portalKindFromLocation() {
    try {
      if (global.__REMOED_ADMIN_LOGIN_HTML__ === true) return '';
      var loc = global.location;
      if (!loc || !loc.pathname) return '';
      var p = String(loc.pathname).toLowerCase();
      if (p.indexOf('super-monitor') !== -1) return 'admin';
      if (p.startsWith('/admin-') || p.indexOf('/admin/') !== -1) return 'admin';
      if (p.indexOf('forgot-password') !== -1 || p.indexOf('reset-password') !== -1) return '';
      if (p.startsWith('/affiliate-') || p.indexOf('/affiliate/') !== -1) return 'affiliate';
      if (p.startsWith('/teacher-')) return 'teacher';
      if (p.startsWith('/student-')) return 'student';
      if (p.indexOf('change-password') !== -1) {
        try {
          var utCh = (global.localStorage.getItem('userType') || global.localStorage.getItem('userRole') || '').toLowerCase();
          if (utCh === 'admin') return 'admin';
          if (utCh === 'teacher') return 'teacher';
          if (utCh === 'student') return 'student';
          if (
            global.localStorage.getItem(LS_TEACHER) ||
            global.sessionStorage.getItem(LS_TEACHER) ||
            global.localStorage.getItem('remoed_teacher_auth')
          ) {
            return 'teacher';
          }
          if (
            global.localStorage.getItem(LS_STUDENT) ||
            global.sessionStorage.getItem(LS_STUDENT) ||
            global.localStorage.getItem('remoed_student_auth')
          ) {
            return 'student';
          }
        } catch (_ec) {}
      }
      if (p.indexOf('leaderboard') !== -1) {
        try {
          var utLb = (global.localStorage.getItem('userType') || global.localStorage.getItem('userRole') || '').toLowerCase();
          if (utLb === 'admin') return 'admin';
          if (utLb === 'teacher') return 'teacher';
          if (utLb === 'student') return 'student';
          if (
            global.localStorage.getItem(LS_ADMIN) ||
            global.sessionStorage.getItem(LS_ADMIN) ||
            global.localStorage.getItem('remoed_admin_auth')
          ) {
            return 'admin';
          }
        } catch (_elb) {}
      }
      if (p.indexOf('live-classroom') !== -1 || p.indexOf('video-room') !== -1 || p.indexOf('whiteboard') !== -1) {
        try {
          var typeParam = '';
          try {
            typeParam = String(new URLSearchParams(loc.search || '').get('type') || '')
              .trim()
              .toLowerCase();
          } catch (_tp) {}
          if (typeParam === 'teacher' || typeParam === 'student' || typeParam === 'admin') {
            return typeParam;
          }
          var ut = (global.localStorage.getItem('userType') || global.localStorage.getItem('userRole') || '').toLowerCase();
          if (ut === 'admin') return 'admin';
          if (ut === 'teacher') return 'teacher';
          if (ut === 'student') return 'student';
          // Prefer role tokens when userType is missing (new classroom tab)
          if (
            global.localStorage.getItem(LS_TEACHER) ||
            global.sessionStorage.getItem(LS_TEACHER) ||
            global.localStorage.getItem('remoed_teacher_auth')
          ) {
            return 'teacher';
          }
          if (
            global.localStorage.getItem(LS_STUDENT) ||
            global.sessionStorage.getItem(LS_STUDENT) ||
            global.localStorage.getItem('remoed_student_auth')
          ) {
            return 'student';
          }
        } catch (_e) {}
      }
      try {
        var ut2 = (global.localStorage.getItem('userType') || global.localStorage.getItem('userRole') || '').toLowerCase();
        if (ut2 === 'admin') return 'admin';
        if (ut2 === 'affiliate') return 'affiliate';
        if (ut2 === 'teacher') return 'teacher';
        if (ut2 === 'student') return 'student';
      } catch (_e2) {}
      return '';
    } catch (_e3) {
      return '';
    }
  }

  /** Cookie so <img>/<video>/iframe can load /uploads without Authorization headers. */
  function syncMediaAuthCookie(token) {
    try {
      var secure =
        global.location && String(global.location.protocol) === 'https:' ? '; Secure' : '';
      if (token) {
        global.document.cookie =
          'remoed_media_token=' +
          encodeURIComponent(String(token)) +
          '; path=/; SameSite=Lax' +
          secure;
      } else {
        global.document.cookie =
          'remoed_media_token=; path=/; Max-Age=0; SameSite=Lax' + secure;
      }
    } catch (_e) {}
  }

  function getUserToken() {
    try {
      var kind = portalKindFromLocation();
      var token = '';
      if (kind === 'admin') {
        token =
          global.localStorage.getItem('remoed_admin_auth') ||
          global.sessionStorage.getItem('remoed_admin_auth') ||
          global.localStorage.getItem(LS_ADMIN) ||
          global.sessionStorage.getItem(LS_ADMIN) ||
          global.localStorage.getItem('adminToken') ||
          global.sessionStorage.getItem('adminToken') ||
          '';
      } else if (kind === 'teacher') {
        token =
          global.localStorage.getItem(LS_TEACHER) ||
          global.sessionStorage.getItem(LS_TEACHER) ||
          global.localStorage.getItem('remoed_teacher_auth') ||
          global.sessionStorage.getItem('remoed_teacher_auth') ||
          global.localStorage.getItem('remoed_user_token') ||
          global.sessionStorage.getItem('remoed_user_token') ||
          global.localStorage.getItem('token') ||
          global.sessionStorage.getItem('token') ||
          '';
      } else if (kind === 'student') {
        token =
          global.localStorage.getItem(LS_STUDENT) ||
          global.sessionStorage.getItem(LS_STUDENT) ||
          global.localStorage.getItem('remoed_student_auth') ||
          global.sessionStorage.getItem('remoed_student_auth') ||
          global.localStorage.getItem('remoed_user_token') ||
          global.sessionStorage.getItem('remoed_user_token') ||
          global.localStorage.getItem('token') ||
          global.sessionStorage.getItem('token') ||
          '';
      } else if (kind === 'affiliate') {
        token =
          global.localStorage.getItem(LS_AFFILIATE) ||
          global.sessionStorage.getItem(LS_AFFILIATE) ||
          '';
      } else {
        token =
          global.localStorage.getItem('remoed_user_token') ||
          global.sessionStorage.getItem('remoed_user_token') ||
          global.localStorage.getItem('token') ||
          global.sessionStorage.getItem('token') ||
          global.localStorage.getItem(LS_TEACHER) ||
          global.localStorage.getItem(LS_STUDENT) ||
          global.localStorage.getItem(LS_AFFILIATE) ||
          '';
      }
      syncMediaAuthCookie(token);
      return token;
    } catch (_e) {
      return '';
    }
  }

  function clearUserToken() {
    try {
      syncMediaAuthCookie('');
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
      if (kind === 'affiliate') {
        global.localStorage.removeItem(LS_AFFILIATE);
        global.sessionStorage.removeItem(LS_AFFILIATE);
        global.localStorage.removeItem('affiliateId');
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
      global.localStorage.removeItem(LS_AFFILIATE);
      global.sessionStorage.removeItem(LS_AFFILIATE);
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
    var skipLogout = !!(cfg.remoedIgnoreAuthFailure || cfg.skipAuthLogout);
    try {
      delete cfg.remoedIgnoreAuthFailure;
      delete cfg.skipAuthLogout;
    } catch (_d) {}
    if (!realFetch) {
      throw new Error('fetch is not available');
    }
    var res = await realFetch(url, cfg);
    if (res && (res.status === 401 || res.status === 403)) {
      // Never wipe session on intentional/expected cross-role probes (e.g. live-classroom
      // entry gate accidentally hitting /api/student/* with a teacher JWT).
      if (!skipLogout) {
        try {
          var kind = portalKindFromLocation();
          var pathOnly = String(url || '').split('?')[0];
          if (
            (kind === 'teacher' && pathOnly.indexOf('/api/student/') !== -1) ||
            (kind === 'student' && pathOnly.indexOf('/api/teacher/') !== -1) ||
            (kind === 'admin' &&
              (pathOnly.indexOf('/api/student/') !== -1 || pathOnly.indexOf('/api/teacher/') !== -1))
          ) {
            skipLogout = true;
          }
        } catch (_m) {}
      }
      // A 403 that carries a business-gate code (consent needed, no credits, ...) means
      // "you are logged in but cannot do this yet", never "session expired".
      if (!skipLogout && (await isBusinessGateResponse(res))) {
        skipLogout = true;
      }
      if (!skipLogout) {
        logoutToUnifiedLogin();
      }
    }
    return res;
  }

  var BUSINESS_GATE_CODES = {
    CONSENT_REQUIRED: 1,
    SUBSCRIPTION_REQUIRED_LESSON_2: 1,
    CREDITS_EXPIRED: 1,
    INSUFFICIENT_CREDITS: 1,
    TRIAL_LESSON_1_ONLY: 1,
    LESSON_AHEAD_OF_PROGRESS: 1,
    CHECKPOINT_REQUIRED: 1,
    FREE_PLAN_LESSON_ONLY: 1,
    FREE_PLAN_SEQUENCE: 1,
    FREE_PLAN_ALREADY_BOOKED: 1,
    FREE_PLAN_TRIAL_TEACHER_ONLY: 1,
    FREE_PLAN_SEQUENCE_DONE: 1,
    FREE_PLAN_LOCKED: 1,
    ALREADY_BOOKED: 1,
    SLOT_NOT_AVAILABLE: 1,
    WRONG_PIN: 1,
    WRONG_ACCOUNT_PASSWORD: 1
  };

  async function isBusinessGateResponse(res) {
    try {
      var ct = (res.headers && res.headers.get && res.headers.get('content-type')) || '';
      if (ct.indexOf('json') === -1) return false;
      var body = await res.clone().json();
      return !!(body && body.code && BUSINESS_GATE_CODES[body.code]);
    } catch (_e) {
      return false;
    }
  }

  // Optional: inject token automatically for same-origin /api/* and /uploads/* requests.
  (function patchFetch() {
    if (!realFetch || global.__REMOED_FETCH_PATCHED__) return;
    global.__REMOED_FETCH_PATCHED__ = true;
    global.fetch = function (input, init) {
      try {
        var url = typeof input === 'string' ? input : (input && input.url) || '';
        if (
          typeof url === 'string' &&
          (url.indexOf('/api/') === 0 ||
            url.indexOf('/uploads/') === 0 ||
            url.indexOf('/api/media/') === 0)
        ) {
          return apiFetch(url, init);
        }
      } catch (_e) {}
      return realFetch(input, init);
    };
  })();

  function jwtExpMs(token) {
    try {
      var part = String(token).split('.')[1].replace(/-/g, '+').replace(/_/g, '/');
      while (part.length % 4) part += '=';
      var payload = JSON.parse(global.atob(part));
      var exp = Number(payload.exp);
      return Number.isFinite(exp) ? exp * 1000 : 0;
    } catch (_e) {
      return 0;
    }
  }

  function persistTeacherToken(oldToken, nextToken) {
    var keys = ['remoed_teacher_token', 'remoed_teacher_auth', 'remoed_user_token', 'token'];
    var stores = [global.localStorage, global.sessionStorage];
    var wrote = false;
    for (var s = 0; s < stores.length; s++) {
      var store = stores[s];
      if (!store) continue;
      for (var k = 0; k < keys.length; k++) {
        try {
          if (store.getItem(keys[k]) === oldToken) {
            store.setItem(keys[k], nextToken);
            wrote = true;
          }
        } catch (_e) {}
      }
    }
    if (!wrote) {
      try {
        global.localStorage.setItem(LS_TEACHER, nextToken);
      } catch (_e2) {}
    }
    syncMediaAuthCookie(nextToken);
  }

  /**
   * Teachers with back-to-back classes must not be dropped by a 1–2 hour token.
   * While a teacher page is open, replace a still-valid token once fewer than 6 hours remain.
   * An already-expired token is left alone here so this timer cannot sign them out.
   */
  function keepTeacherSession() {
    if (portalKindFromLocation() !== 'teacher') return;
    var token = getUserToken();
    if (!token || !realFetch) return;
    var exp = jwtExpMs(token);
    var now = Date.now();
    if (!exp || exp <= now) return;
    if (exp - now > 6 * 60 * 60 * 1000) return;
    realFetch('/api/auth/teacher-session/refresh', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + token },
      credentials: 'include',
    })
      .then(function (res) {
        if (!res || !res.ok) return null;
        return res.json();
      })
      .then(function (data) {
        if (data && data.token) persistTeacherToken(token, data.token);
      })
      .catch(function () {});
  }

  // Seed media cookie for <img>/<video> as soon as the script loads.
  try {
    getUserToken();
  } catch (_seed) {}

  try {
    keepTeacherSession();
    global.setInterval(keepTeacherSession, 30 * 60 * 1000);
  } catch (_keep) {}

  global.RemoedUserSession = {
    getUserToken: getUserToken,
    clearUserToken: clearUserToken,
    logoutToUnifiedLogin: logoutToUnifiedLogin,
    apiFetch: apiFetch,
    syncMediaAuthCookie: syncMediaAuthCookie,
    portalKindFromLocation: portalKindFromLocation,
    LS_ADMIN: LS_ADMIN,
    LS_TEACHER: LS_TEACHER,
    LS_STUDENT: LS_STUDENT,
  };
})(typeof window !== 'undefined' ? window : this);
