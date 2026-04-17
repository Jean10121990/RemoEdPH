/**
 * Restrict HR / QA / Accounting hub pages by adminRole (JWT → localStorage.adminRole).
 * super_admin: no redirect. Legacy tokens without role: allow.
 */
(function () {
    'use strict';
    var hub = '';
    try {
        var sc = document.currentScript;
        hub = (sc && sc.getAttribute('data-hub')) || '';
    } catch (e) {}
    hub = String(hub || '').toLowerCase();

    var role = '';
    try {
        role = String(localStorage.getItem('adminRole') || '').trim();
    } catch (e2) {}

    if (!hub || !role || role === 'super_admin') return;

    var blocked = false;
    if (hub === 'hr') {
        blocked = role === 'admin_qa' || role === 'admin_accounting';
    } else if (hub === 'qa') {
        blocked = role === 'admin_hr' || role === 'admin_accounting';
    } else if (hub === 'accounting') {
        blocked = role === 'admin_hr' || role === 'admin_qa';
    }

    if (blocked) {
        try {
            window.location.replace('admin-dashboard.html');
        } catch (e3) {
            window.location.href = 'admin-dashboard.html';
        }
    }
})();
