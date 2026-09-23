/**
 * Admin page access guard — redirects to admin-403.html when the path
 * requires a permission the current role lacks.
 * Prefer loading after admin-session.js. Uses /api/admin/me/permissions.
 */
(function () {
    'use strict';

    var PATH_RULES = [
        { re: /admin-settings/, key: 'nav:settings' },
        { re: /super-monitor/, key: 'nav:super_monitor' },
        { re: /admin-hr-hub|admin-users|admin-hr-documents|admin-teacher-pipeline|admin-teacher-training|admin-teacher-schedule|admin-teacher-assessments|admin-assessment-answer-key/, key: 'nav:hr_hub' },
        { re: /admin-qa-hub|admin-lessons-library|admin-classroom-recordings|admin-issue-management/, key: 'nav:qa_hub' },
        { re: /admin-accounting-hub|admin-payroll|admin-student-subscriptions/, key: 'nav:accounting_hub' },
        { re: /admin-fee/, key: 'nav:admin_fee' },
        { re: /admin-marketing-hub|admin-unique-link-commission/, key: 'nav:marketing' },
    ];

    function token() {
        return (
            (typeof RemoedAdminSession !== 'undefined' &&
                RemoedAdminSession.getAuthToken &&
                RemoedAdminSession.getAuthToken()) ||
            localStorage.getItem('remoed_admin_token') ||
            localStorage.getItem('remoed_admin_auth') ||
            localStorage.getItem('adminToken') ||
            ''
        );
    }

    function requiredKeyForPath() {
        var path = String(window.location.pathname || '') + String(window.location.href || '');
        for (var i = 0; i < PATH_RULES.length; i++) {
            if (PATH_RULES[i].re.test(path)) return PATH_RULES[i].key;
        }
        return null;
    }

    // Legacy hub-guard compatibility (data-hub attribute)
    var hub = '';
    try {
        var sc = document.currentScript;
        hub = (sc && sc.getAttribute('data-hub')) || '';
    } catch (e0) {}
    hub = String(hub || '').toLowerCase();

    var needed = requiredKeyForPath();
    if (hub === 'hr') needed = needed || 'nav:hr_hub';
    if (hub === 'qa') needed = needed || 'nav:qa_hub';
    if (hub === 'accounting') needed = needed || 'nav:accounting_hub';
    if (hub === 'marketing') needed = needed || 'nav:marketing';

    if (!needed) return;

    var role = '';
    try {
        role = String(localStorage.getItem('adminRole') || '').trim().toLowerCase();
    } catch (e1) {}
    if (role === 'super_admin' || !role) return;

    var tok = token();
    if (!tok) return;

    fetch('/api/admin/me/permissions', {
        headers: { Authorization: 'Bearer ' + tok },
        credentials: 'include',
    })
        .then(function (r) {
            return r.ok ? r.json() : null;
        })
        .then(function (data) {
            if (!data) {
                // Fall back to legacy hub rules
                legacyHubBlock(hub, role);
                return;
            }
            try {
                sessionStorage.setItem(
                    'remoed_admin_perm_nav',
                    JSON.stringify({ nav: data.nav || {}, at: Date.now() })
                );
            } catch (e2) {}
            var perms = data.permissions || [];
            if (data.isSuperAdmin) return;
            if (perms.indexOf(needed) === -1) {
                window.location.replace(
                    'admin-403.html?need=' + encodeURIComponent(needed)
                );
            }
        })
        .catch(function () {
            legacyHubBlock(hub, role);
        });

    function legacyHubBlock(h, r) {
        if (!h || !r || r === 'super_admin') return;
        var blocked = false;
        if (h === 'hr') blocked = r === 'admin_qa' || r === 'admin_accounting' || r === 'admin_marketing';
        else if (h === 'qa') blocked = r === 'admin_hr' || r === 'admin_accounting' || r === 'admin_marketing';
        else if (h === 'accounting') blocked = r === 'admin_hr' || r === 'admin_qa' || r === 'admin_marketing';
        else if (h === 'marketing') blocked = r === 'admin_hr' || r === 'admin_qa';
        if (blocked) {
            try {
                window.location.replace('admin-403.html');
            } catch (e3) {
                window.location.href = 'admin-dashboard.html';
            }
        }
    }
})();
