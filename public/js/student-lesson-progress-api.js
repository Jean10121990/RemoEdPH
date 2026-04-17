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
        ''
      );
    } catch (e) {
      return '';
    }
  }

  function loadCompletedKeys() {
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
        return new Set((data && data.completedKeys) || []);
      });
    });
  }

  global.RemoEdLessonProgress = {
    authToken: authToken,
    loadCompletedKeys: loadCompletedKeys,
  };
})(typeof window !== 'undefined' ? window : this);
