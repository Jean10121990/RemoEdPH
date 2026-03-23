/**
 * Admin Portal – shared sidebar (same look as teacher sidebar, admin menu items).
 * Usage: <div id="admin-sidebar-root"></div> then AdminSidebar.render('admin-sidebar-root', 'dashboard');
 */
(function (global) {
    'use strict';

    var SVG_STROKE = 'stroke-width="2"';

    var MENU_ITEMS = [
        { id: 'dashboard', label: 'Dashboard', href: 'admin-dashboard.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>' },
        { id: 'users', label: 'User Management', href: 'admin-users.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197m13.5-9a2.5 2.5 0 11-5 0 2.5 2.5 0 015 0z"/></svg>' },
        { id: 'teacher-assessments', label: 'Teacher Assessments', href: 'admin-teacher-assessments.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"/></svg>' },
<<<<<<< HEAD
=======
        { id: 'teacher-pipeline', label: 'TeacherPipeline', href: 'admin-teacher-pipeline.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M3 6h18M3 12h18M3 18h18"/><path d="M8 6v12"/></svg>' },
>>>>>>> 50700b36e828b653968685fb464adca59f1fbdcc
        { id: 'announcements', label: 'Announcements', href: 'admin-announcements.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>' },
        { id: 'unique-link-commission', label: 'Unique Link Commission', href: 'admin-unique-link-commission.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M10 13a5 5 0 0 1 0-7l1-1a5 5 0 0 1 7 7l-1 1"/><path d="M14 11a5 5 0 0 1 0 7l-1 1a5 5 0 0 1-7-7l1-1"/></svg>' },
        { id: 'payroll', label: 'Payroll Management', href: 'admin-payroll.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 10c-4.41 0-8-1.79-8-4V6c0-2.21 3.59-4 8-4s8 1.79 8 4v8c0 2.21-3.59 4-8 4z"/></svg>' },
        { id: 'reports', label: 'Reports', href: 'admin-reports.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>' },
        { id: 'issues', label: 'Issue Management', href: 'admin-issue-management.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"/></svg>' },
        { id: 'lessons', label: 'Lesson Library', href: 'admin-lessons-library.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
        { id: 'messages', label: 'Messages', href: 'admin-messages.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>' },
        { id: 'classroom-recordings', label: 'Lesson recordings', href: 'admin-classroom-recordings.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"/></svg>' },
        { id: 'settings', label: 'Settings', href: 'admin-settings.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' },
        { id: 'logout', label: 'Logout', href: null, icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7"/><path d="M3 12a9 9 0 0118 0 9 9 0 01-18 0z"/></svg>', isLogout: true }
    ];

    function getActiveFromPath() {
        var path = (window.location.pathname || '').replace(/^\//, '') || window.location.href;
        if (path.indexOf('admin-dashboard') !== -1) return 'dashboard';
        if (path.indexOf('admin-users') !== -1) return 'users';
        if (path.indexOf('admin-teacher-assessments') !== -1) return 'teacher-assessments';
<<<<<<< HEAD
=======
        if (path.indexOf('admin-teacher-pipeline') !== -1) return 'teacher-pipeline';
>>>>>>> 50700b36e828b653968685fb464adca59f1fbdcc
        if (path.indexOf('admin-announcements') !== -1) return 'announcements';
        if (path.indexOf('admin-unique-link-commission') !== -1) return 'unique-link-commission';
        if (path.indexOf('admin-payroll') !== -1) return 'payroll';
        if (path.indexOf('admin-reports') !== -1) return 'reports';
        if (path.indexOf('admin-issue-management') !== -1) return 'issues';
        if (path.indexOf('admin-lessons-library') !== -1) return 'lessons';
        if (path.indexOf('admin-messages') !== -1) return 'messages';
        if (path.indexOf('admin-classroom-recordings') !== -1) return 'classroom-recordings';
        if (path.indexOf('admin-settings') !== -1) return 'settings';
        return null;
    }

    function displayNameFromUsername(raw) {
        if (!raw) return 'Admin';
        var u = String(raw).split('@')[0];
        if (!u) return 'Admin';
        return u.charAt(0).toUpperCase() + u.slice(1);
    }

    /** Keep sidebar greeting uniform: always "Hi, Name" (same on every admin page). */
    function applyGreetingFromStorage() {
        var raw = localStorage.getItem('adminUsername') || 'admin';
        var friendly = displayNameFromUsername(raw);
        var usernameEl = document.getElementById('remoed-username');
        var avatarTextEl = document.getElementById('avatar-text');
        if (usernameEl) usernameEl.textContent = 'Hi, ' + friendly;
        if (avatarTextEl) avatarTextEl.textContent = (friendly[0] || 'A').toUpperCase();
    }

    function render(containerIdOrElement, activePageId) {
        var container = typeof containerIdOrElement === 'string'
            ? document.getElementById(containerIdOrElement)
            : containerIdOrElement;
        if (!container) return;

        var active = activePageId || getActiveFromPath();

        var menuHtml = MENU_ITEMS.map(function (item) {
            var activeClass = (item.id === active && !item.isLogout) ? ' class="active"' : '';
            var idAttr = item.id === 'logout' ? ' id="logout-nav"' : '';
            if (item.isLogout) {
                return '<li' + idAttr + activeClass + ' data-logout="1">' + item.icon + item.label + '</li>';
            }
            return '<li' + activeClass + ' onclick="window.location.href=\'' + item.href + '\'">' + item.icon + item.label + '</li>';
        }).join('');

        var html =
            '<nav class="remoed-sidebar">' +
            '  <div class="sidebar-header">' +
            '    <div class="sidebar-header-inner">' +
            '      <img class="sidebar-logo-img" src="images/remoed-logo.png" alt="RemoEdPH" onerror="this.src=\'remoed-logo.png\'">' +
            '      <div>' +
            '        <div class="sidebar-title">RemoEdPH</div>' +
            '        <div class="sidebar-subtitle">Admin Portal</div>' +
            '      </div>' +
            '    </div>' +
            '  </div>' +
            '  <div class="sidebar-user">' +
            '    <div class="sidebar-user-inner">' +
            '      <div id="remoed-avatar" onclick="window.location.href=\'admin-settings.html\'" style="cursor:pointer;">' +
            '        <span id="avatar-text">A</span>' +
            '      </div>' +
            '      <span class="remoed-username" id="remoed-username">Hi, Admin</span>' +
            '    </div>' +
            '  </div>' +
            '  <ul class="remoed-menu">' + menuHtml + '</ul>' +
            '</nav>';

        container.innerHTML = html;

        var logoutLi = container.querySelector('#logout-nav');
        if (logoutLi) {
            logoutLi.addEventListener('click', function () {
                localStorage.removeItem('adminToken');
                localStorage.removeItem('adminUsername');
                localStorage.removeItem('userType');
                localStorage.removeItem('token');
                window.location.href = 'admin-login.html';
            });
        }

        applyGreetingFromStorage();
    }

    global.AdminSidebar = {
        render: render,
        MENU_ITEMS: MENU_ITEMS,
        applyGreetingFromStorage: applyGreetingFromStorage
    };
})(typeof window !== 'undefined' ? window : this);
