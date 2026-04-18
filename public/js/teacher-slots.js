/**
 * Teacher slot grid: MongoDB _id for /api/slots/:id, stable teacherId for legacy APIs.
 */
(function (global) {
  'use strict';

  function isProbableHexObjectId(s) {
    return typeof s === 'string' && /^[a-f0-9]{24}$/i.test(String(s).trim());
  }

  function decodeTeacherJwtPayload() {
    try {
      var t =
        global.localStorage.getItem('remoed_user_token') ||
        global.localStorage.getItem('token') ||
        global.sessionStorage.getItem('remoed_user_token') ||
        global.sessionStorage.getItem('token') ||
        '';
      if (!t) return null;
      var part = t.split('.')[1];
      if (!part) return null;
      var b64 = part.replace(/-/g, '+').replace(/_/g, '/');
      var pad = b64.length % 4 ? '='.repeat(4 - (b64.length % 4)) : '';
      return JSON.parse(global.atob(b64 + pad));
    } catch (_e) {
      return null;
    }
  }

  /**
   * Stable portal teacherId (string) — for /api/teacher/classes etc.
   */
  function getTeacherIdRobust() {
    var tid = global.localStorage.getItem('teacherId');
    if (tid) {
      tid = String(tid).trim();
      if (tid && tid !== 'undefined' && tid !== 'null') return tid;
    }
    var pl = decodeTeacherJwtPayload();
    if (pl && pl.teacherId != null) {
      var fromJwt = String(pl.teacherId).trim();
      if (fromJwt && fromJwt !== 'undefined' && fromJwt !== 'null') {
        global.localStorage.setItem('teacherId', fromJwt);
        if (pl.userType) global.localStorage.setItem('userType', pl.userType);
        if (pl.role) global.localStorage.setItem('userRole', pl.role);
        if (pl.teacherMongoId && isProbableHexObjectId(pl.teacherMongoId)) {
          global.localStorage.setItem('teacherMongoId', String(pl.teacherMongoId).trim());
        }
        return fromJwt;
      }
    }
    return '';
  }

  /**
   * MongoDB _id (24 hex) for GET /api/slots/:teacherId — preferred so the server uses findById.
   * Falls back to stable teacherId string for older sessions without teacherMongoId.
   */
  function getSlotsApiTeacherParam() {
    var mid = global.localStorage.getItem('teacherMongoId');
    if (mid && isProbableHexObjectId(mid)) return String(mid).trim();
    var pl = decodeTeacherJwtPayload();
    if (pl && pl.teacherMongoId && isProbableHexObjectId(pl.teacherMongoId)) {
      mid = String(pl.teacherMongoId).trim();
      global.localStorage.setItem('teacherMongoId', mid);
      return mid;
    }
    return getTeacherIdRobust();
  }

  function handleMissingAuth() {
    try {
      if (global.RemoedUserSession && typeof global.RemoedUserSession.clearUserToken === 'function') {
        global.RemoedUserSession.clearUserToken();
      }
    } catch (_e) {}
    try {
      global.localStorage.clear();
      global.sessionStorage.clear();
    } catch (_e2) {}
    try {
      global.location.replace('index.html');
    } catch (_e3) {
      global.location.href = 'index.html';
    }
  }

  function isInvalidTeacherId(id) {
    if (id == null) return true;
    var s = String(id).trim();
    return !s || s === 'undefined' || s === 'null';
  }

  /**
   * Relative URL: /api/slots/<param>?week=...&allSlots=true&...
   * Uses MongoDB _id in the path when `teacherMongoId` is stored (from login / JWT).
   */
  function buildSlotsUrl(weekString, extraQuery) {
    var param = getSlotsApiTeacherParam();
    var path = '/api/slots/' + encodeURIComponent(String(param).trim());
    var sp = new URLSearchParams();
    sp.set('week', weekString);
    sp.set('allSlots', 'true');
    if (extraQuery && typeof extraQuery === 'object') {
      Object.keys(extraQuery).forEach(function (k) {
        var v = extraQuery[k];
        if (v !== undefined && v !== null) sp.set(k, String(v));
      });
    }
    return path + '?' + sp.toString();
  }

  global.RemoedTeacherSlots = {
    getTeacherIdRobust: getTeacherIdRobust,
    getSlotsApiTeacherParam: getSlotsApiTeacherParam,
    handleMissingAuth: handleMissingAuth,
    isInvalidTeacherId: isInvalidTeacherId,
    buildSlotsUrl: buildSlotsUrl,
  };
})(typeof window !== 'undefined' ? window : this);
