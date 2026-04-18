/**
 * Keeps the user on the current dashboard when using the browser Back button.
 * Logout uses localStorage.clear() + location.replace, which removes this entry from history.
 */
(function () {
  'use strict';
  if (!window.history || typeof window.history.pushState !== 'function') return;
  try {
    history.pushState({ remoedDashboardHistoryLock: 1 }, '', window.location.href);
  } catch (_e) {}
  window.addEventListener('popstate', function () {
    try {
      history.pushState({ remoedDashboardHistoryLock: 1 }, '', window.location.href);
    } catch (_e2) {}
  });
})();
