/**
 * Shared loader for GET /api/student/lesson-progress.
 * Uses studentToken or token (matches student-sidebar / mixed login storage).
 */
(function (global) {
  'use strict';

  function authToken() {
    try {
      return (
        global.localStorage.getItem('studentToken') ||
        global.localStorage.getItem('token') ||
        global.localStorage.getItem('remoed_student_token') ||
        ''
      );
    } catch (e) {
      return '';
    }
  }

  function loadProgressPayload() {
    var t = authToken();
    if (!t) {
      return Promise.reject(new Error('Sign in to see your lesson progress.'));
    }
    return fetch('/api/student/lesson-progress', {
      method: 'GET',
      headers: { Authorization: 'Bearer ' + t },
      credentials: 'same-origin',
    }).then(function (r) {
      return r.json().then(function (data) {
        if (!r.ok) {
          throw new Error((data && data.error) || 'Could not load progress');
        }
        return data || {};
      });
    });
  }

  function loadCompletedKeys() {
    return loadProgressPayload().then(function (data) {
      return new Set((data && data.completedKeys) || []);
    });
  }

  /**
   * Summary for dashboard widgets: completed count, per-level tallies, next hint.
   */
  function loadProgressSummary() {
    return loadProgressPayload().then(function (data) {
      var keys = (data && data.completedKeys) || [];
      var byLevel = {};
      var levels = (data && data.levels) || [
        'Little Seeds',
        'Sprouts',
        'Saplings',
        'Young Stewards',
      ];
      levels.forEach(function (lvl) {
        byLevel[lvl] = 0;
      });
      keys.forEach(function (k) {
        var parts = String(k).split(':');
        var lvl = parts[0];
        if (lvl && Object.prototype.hasOwnProperty.call(byLevel, lvl)) {
          byLevel[lvl] += 1;
        } else if (lvl) {
          byLevel[lvl] = (byLevel[lvl] || 0) + 1;
        }
      });
      var primaryLevel = levels[0];
      var maxDone = -1;
      levels.forEach(function (lvl) {
        var n = byLevel[lvl] || 0;
        if (n > maxDone) {
          maxDone = n;
          primaryLevel = lvl;
        }
      });
      return {
        completedKeys: keys,
        completedCount:
          typeof data.completedCount === 'number' ? data.completedCount : keys.length,
        inProgressCount: data.inProgressCount || 0,
        byLevel: byLevel,
        primaryLevel: primaryLevel,
        primaryCompleted: byLevel[primaryLevel] || 0,
        levelTotal: (data.batchesPerLevel || 10) * (data.lessonsPerBatch || 22),
        levels: levels,
      };
    });
  }

  global.RemoEdLessonProgress = {
    authToken: authToken,
    loadCompletedKeys: loadCompletedKeys,
    loadProgressPayload: loadProgressPayload,
    loadProgressSummary: loadProgressSummary,
  };
})(typeof window !== 'undefined' ? window : this);
