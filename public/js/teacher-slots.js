/**
 * Teacher slot grid: robust teacherId + safe /api/slots/:teacherId URLs.
 */
(function (global) {
  'use strict';

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
   * 1) localStorage teacherId
   * 2) JWT payload teacherId (then persist to localStorage)
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
        return fromJwt;
      }
    }
    return '';
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
   * Relative URL: /api/slots/:teacherId?week=...&allSlots=true&...
   * @param {Record<string,string|number>} [extraQuery] merged into query string
   */
  function buildSlotsUrl(teacherId, weekString, extraQuery) {
    var path = '/api/slots/' + encodeURIComponent(String(teacherId).trim());
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
    handleMissingAuth: handleMissingAuth,
    isInvalidTeacherId: isInvalidTeacherId,
    buildSlotsUrl: buildSlotsUrl,
  };
})(typeof window !== 'undefined' ? window : this);
