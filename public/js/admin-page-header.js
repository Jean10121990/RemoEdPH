/**
 * Shared admin portal top bar — matches Admin Dashboard:
 * left: icon + page title (black 18px); right: clock mini + notifications.
 * Titles keep existing page labels (no renames).
 */
(function (global) {
    'use strict';

    var GRID_ICON =
        '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
        '<path d="M3 13h8V3H3v10zm0 8h8v-6H3v6zm10 0h8V11h-8v10zm0-18v6h8V3h-8z"/>' +
        '</svg>';

    var BELL_ICON =
        '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
        '<path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5S10.5 3.17 10.5 4v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>' +
        '</svg>';

    /** Map AdminSidebar page ids → existing page titles (labels unchanged). */
    var PAGES = {
        dashboard: 'Admin Dashboard',
        'hr-hub': 'HR Hub',
        'qa-hub': 'QA Hub',
        'accounting-hub': 'Accounting Hub',
        announcements: 'Announcements',
        videos: 'Videos',
        reports: 'Reports',
        messages: 'Messages',
        'profile-settings': 'Profile settings',
        settings: 'Settings',
        'super-monitor': 'System monitor',
        users: 'User Management',
        'teacher-assessments': 'Teacher Assessment Submissions',
        'teacher-pipeline': 'TeacherPipeline',
        'teacher-training': 'Teacher Training LMS',
        'teacher-schedule': 'Teacher Schedule',
        payroll: 'Bi-weekly Salary Disbursement',
        'unique-link-commission': 'Unique Link Commission',
        'issue-management': 'Class Issue Management',
        'classroom-recordings': 'Classroom Recordings',
        'lessons-library': 'Lessons Library',
        'view-user-profile': 'User Profile'
    };

    function escapeHtml(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function ensureStylesheet(href) {
        try {
            var links = document.querySelectorAll('link[rel="stylesheet"]');
            for (var i = 0; i < links.length; i++) {
                if (String(links[i].href || '').indexOf(href) !== -1) return;
            }
            var l = document.createElement('link');
            l.rel = 'stylesheet';
            l.href = href;
            document.head.appendChild(l);
        } catch (_e) {}
    }

    function ensureScript(src, onload) {
        try {
            var scripts = document.querySelectorAll('script[src]');
            for (var i = 0; i < scripts.length; i++) {
                if (String(scripts[i].src || '').indexOf(src) !== -1) {
                    if (typeof onload === 'function') onload();
                    return;
                }
            }
            var s = document.createElement('script');
            s.src = src;
            if (typeof onload === 'function') s.onload = onload;
            document.body.appendChild(s);
        } catch (_e) {
            if (typeof onload === 'function') onload();
        }
    }

    function titleFor(pageId, opts) {
        opts = opts || {};
        if (opts.title) return opts.title;
        if (PAGES[pageId]) return PAGES[pageId];
        if (global.AdminSidebar && Array.isArray(AdminSidebar.MENU_ITEMS)) {
            for (var i = 0; i < AdminSidebar.MENU_ITEMS.length; i++) {
                var item = AdminSidebar.MENU_ITEMS[i];
                if (item && item.id === pageId && item.label) return item.label;
            }
        }
        return 'Admin';
    }

    function rightChromeHtml() {
        return (
            '<div class="nav-right">' +
            '<div class="time-tracking-mini">' +
            '<span class="time-status-mini not-clocked" id="time-status-mini">Not Clocked In</span>' +
            '<button type="button" class="time-btn-mini clock-in primary" id="time-btn-mini">Time In</button>' +
            '</div>' +
            '<div class="nav-icon" id="admin-notifications-icon" title="Notifications">' +
            BELL_ICON +
            '<div class="nav-badge" id="admin-notifications-badge" style="display:none;">0</div>' +
            '<div class="nav-dropdown" id="admin-notifications-dropdown">' +
            '<div class="nav-dropdown-header" style="display:flex;align-items:center;justify-content:space-between;gap:8px;">' +
            '<span>Notifications</span>' +
            '<button type="button" id="admin-notifications-mark-read" style="font-size:0.75rem;padding:4px 8px;border:1px solid #cbd5e1;border-radius:6px;background:#fff;cursor:pointer;color:#334155;">Mark all read</button>' +
            '</div>' +
            '<div class="nav-dropdown-content" id="admin-notifications-dropdown-content"></div>' +
            '</div>' +
            '</div>' +
            '</div>'
        );
    }

    function polishTitle(header, title) {
        if (!header) return;
        var h1 = header.querySelector('.nav-left h1');
        if (!h1) return;
        h1.removeAttribute('style');
        h1.innerHTML = GRID_ICON + '<span class="nav-title-text">' + escapeHtml(title) + '</span>';
        var text = h1.querySelector('.nav-title-text');
        if (text) {
            text.style.color = '#000000';
            text.style.fontSize = '18px';
            text.style.fontWeight = '600';
        }
    }

    function wireNotifications(header) {
        var icon = header.querySelector('#admin-notifications-icon');
        if (!icon || icon.getAttribute('data-wired')) return;
        icon.setAttribute('data-wired', '1');
        icon.addEventListener('click', function (e) {
            e.stopPropagation();
            var dd = document.getElementById('admin-notifications-dropdown');
            if (!dd) return;
            dd.classList.toggle('show');
            if (typeof global.loadAdminNotifications === 'function') {
                global.loadAdminNotifications();
            }
        });
        document.addEventListener('click', function () {
            var dd = document.getElementById('admin-notifications-dropdown');
            if (dd) dd.classList.remove('show');
        });
    }

    function ensureTimeTracking() {
        ensureScript('js/admin-time-tracking.js');
    }

    function pageIdFromPath(fallback) {
        var path = (window.location.pathname || '').replace(/^\//, '') || '';
        if (path.indexOf('admin-dashboard') !== -1) return 'dashboard';
        if (path.indexOf('admin-hr-hub') !== -1) return 'hr-hub';
        if (path.indexOf('admin-qa-hub') !== -1) return 'qa-hub';
        if (path.indexOf('admin-accounting-hub') !== -1) return 'accounting-hub';
        if (path.indexOf('admin-announcements') !== -1) return 'announcements';
        if (path.indexOf('admin-videos') !== -1) return 'videos';
        if (path.indexOf('admin-reports') !== -1) return 'reports';
        if (path.indexOf('admin-messages') !== -1) return 'messages';
        if (path.indexOf('admin-profile-settings') !== -1) return 'profile-settings';
        if (path.indexOf('admin-settings') !== -1) return 'settings';
        if (path.indexOf('super-monitor') !== -1) return 'super-monitor';
        if (path.indexOf('admin-users') !== -1) return 'users';
        if (path.indexOf('admin-teacher-assessments') !== -1) return 'teacher-assessments';
        if (path.indexOf('admin-teacher-pipeline') !== -1) return 'teacher-pipeline';
        if (path.indexOf('admin-teacher-training') !== -1) return 'teacher-training';
        if (path.indexOf('admin-teacher-schedule') !== -1) return 'teacher-schedule';
        if (path.indexOf('admin-payroll') !== -1) return 'payroll';
        if (path.indexOf('admin-unique-link-commission') !== -1) return 'unique-link-commission';
        if (path.indexOf('admin-issue-management') !== -1) return 'issue-management';
        if (path.indexOf('admin-classroom-recordings') !== -1) return 'classroom-recordings';
        if (path.indexOf('admin-lessons-library') !== -1) return 'lessons-library';
        if (path.indexOf('admin-view-user-profile') !== -1) return 'view-user-profile';
        return fallback || 'dashboard';
    }

    function render(pageId, opts) {
        opts = opts || {};
        if (global.__ADMIN_EMBED__) return null;

        ensureStylesheet('css/portal-chrome-compact.css');

        var main = document.querySelector('.remoed-main');
        if (!main) return null;

        var resolvedId = pageIdFromPath(pageId);
        var title = titleFor(resolvedId, opts);
        var existing = main.querySelector(':scope > .nav-header');

        if (existing && !opts.force) {
            polishTitle(existing, title);
            if (!existing.querySelector('#time-btn-mini')) {
                var right = existing.querySelector('.nav-right');
                if (right && !right.querySelector('.time-tracking-mini')) {
                    right.insertAdjacentHTML('afterbegin',
                        '<div class="time-tracking-mini">' +
                        '<span class="time-status-mini not-clocked" id="time-status-mini">Not Clocked In</span>' +
                        '<button type="button" class="time-btn-mini clock-in primary" id="time-btn-mini">Time In</button>' +
                        '</div>'
                    );
                }
            }
            document.body.classList.add('has-admin-page-header');
            wireNotifications(existing);
            ensureTimeTracking();
            return existing;
        }

        var header = document.createElement('div');
        header.className = 'nav-header';
        header.innerHTML =
            '<div class="nav-left"><h1>' +
            GRID_ICON +
            '<span class="nav-title-text">' +
            escapeHtml(title) +
            '</span></h1></div>' +
            rightChromeHtml();

        var content = main.querySelector('.remoed-content');
        if (content) main.insertBefore(header, content);
        else main.insertBefore(header, main.firstChild);

        document.body.classList.add('has-admin-page-header');
        polishTitle(header, title);
        wireNotifications(header);
        ensureTimeTracking();
        return header;
    }

    global.AdminPageHeader = {
        PAGES: PAGES,
        render: render,
        titleFor: titleFor
    };
})(typeof window !== 'undefined' ? window : this);
