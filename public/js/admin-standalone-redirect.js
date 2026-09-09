/**
 * When an admin tool page is opened directly (not inside a hub iframe),
 * redirect to the appropriate hub + hash. Skip when ?adminEmbed=1 (iframe).
 */
(function () {
    'use strict';
    try {
        if (new URLSearchParams(window.location.search).get('adminEmbed') === '1') return;
        var file = (window.location.pathname.split('/').pop() || '').toLowerCase();
        var targets = {
            'admin-users.html': 'admin-hr-hub.html#users',
            'admin-teacher-assessments.html': 'admin-hr-hub.html#assessments',
            'admin-teacher-pipeline.html': 'admin-hr-hub.html#pipeline',
            'admin-payroll.html': 'admin-accounting-hub.html#payroll',
            'admin-unique-link-commission.html': 'admin-accounting-hub.html#commissions',
            'admin-student-subscriptions.html': 'admin-accounting-hub.html#subscriptions',
            'admin-lessons-library.html': 'admin-qa-hub.html#library'
        };
        var t = targets[file];
        if (t) window.location.replace(t);
    } catch (e) {}
})();
