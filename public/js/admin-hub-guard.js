/**
 * Backward-compatible hub guard. Delegates to admin-access-guard.js
 * (permission-based + legacy role fallback).
 */
(function () {
    'use strict';
    var hub = '';
    try {
        var sc = document.currentScript;
        hub = (sc && sc.getAttribute('data-hub')) || '';
    } catch (e) {}

    var s = document.createElement('script');
    s.src = 'js/admin-access-guard.js?v=rbac-1';
    if (hub) s.setAttribute('data-hub', hub);
    document.head.appendChild(s);
})();
