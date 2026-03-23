/**
 * Teacher Portal – shared sidebar component.
 * Renders the same menu on every teacher page. Add a new item here to update the whole app.
 * Usage: <div id="teacher-sidebar-root"></div> then TeacherSidebar.render('dashboard');
 */

(function (global) {
    'use strict';

    var SVG_STROKE = 'stroke-width="2"'; // consistent 2px line weight

    var MENU_ITEMS = [
        { id: 'dashboard', label: 'Dashboard', href: 'teacher-dashboard.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>' },
        { id: 'class-schedule', label: 'Class Schedule', href: 'teacher-class-table.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 3v4M8 3v4"/></svg>' },
        { id: 'class-configuration', label: 'Class Configuration', href: 'teacher-open-class.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>' },
        { id: 'device-check', label: 'Device Check', href: 'device-check.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>' },
        { id: 'lessons-library', label: 'Lessons Library', href: 'teacher-lessons-library.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
        { id: 'teaching-fee', label: 'Teaching Fee', href: 'teacher-service-fee.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 10c-4.41 0-8-1.79-8-4V6c0-2.21 3.59-4 8-4s8 1.79 8 4v8c0 2.21-3.59 4-8 4z"/></svg>' },
        { id: 'referral-rewards', label: 'Referral Rewards', href: 'teacher-referrals.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>' },
        { id: 'performance-indicator', label: 'Performance Indicator', href: 'teacher-performance-indicator.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 12h10M7 8h6M7 16h4"/></svg>' },
        { id: 'professional-development', label: 'Professional Development', href: 'teacher-professional-development.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>' },
        { id: 'messages', label: 'Messages', href: 'teacher-messages.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>' },
        { id: 'profile', label: 'Profile', href: 'teacher-profile.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>' },
        { id: 'logout', label: 'Logout', href: null, icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7"/><path d="M3 12a9 9 0 0118 0 9 9 0 01-18 0z"/></svg>', isLogout: true }
    ];

    function getActiveFromPath() {
        var path = (window.location.pathname || '').replace(/^\//, '') || window.location.href;
        if (path.indexOf('teacher-dashboard') !== -1) return 'dashboard';
        if (path.indexOf('teacher-class-table') !== -1) return 'class-schedule';
        if (path.indexOf('teacher-open-class') !== -1) return 'class-configuration';
        if (path.indexOf('device-check') !== -1) return 'device-check';
        if (path.indexOf('teacher-lessons-library') !== -1) return 'lessons-library';
        if (path.indexOf('teacher-service-fee') !== -1) return 'teaching-fee';
        if (path.indexOf('teacher-referrals') !== -1) return 'referral-rewards';
        if (path.indexOf('teacher-performance-indicator') !== -1) return 'performance-indicator';
        if (path.indexOf('teacher-professional-development') !== -1) return 'professional-development';
        if (path.indexOf('teacher-messages') !== -1) return 'messages';
        if (path.indexOf('teacher-profile') !== -1) return 'profile';
        return null;
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
            '      <img class="sidebar-logo-img" src="images/remoed-logo.png" alt="RemoEdPH">' +
            '      <div>' +
            '        <div class="sidebar-title">RemoEdPH</div>' +
            '        <div class="sidebar-subtitle">Teacher Portal</div>' +
            '      </div>' +
            '    </div>' +
            '  </div>' +
            '  <div class="sidebar-user">' +
            '    <div class="sidebar-user-inner">' +
            '      <div id="remoed-avatar" onclick="window.location.href=\'teacher-profile.html\'" style="cursor:pointer;">' +
            '        <img id="profile-image" src="" alt="Profile" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:none;">' +
            '        <span id="avatar-text">T</span>' +
            '      </div>' +
            '      <span class="remoed-username" id="remoed-username">Hi, Teacher</span>' +
            '    </div>' +
            '  </div>' +
            '  <ul class="remoed-menu">' + menuHtml + '</ul>' +
            '</nav>';

        container.innerHTML = html;

        var logoutLi = container.querySelector('#logout-nav');
        if (logoutLi) {
            logoutLi.addEventListener('click', function () {
                localStorage.removeItem('token');
                localStorage.removeItem('teacherId');
                localStorage.removeItem('remoedUsername');
                window.location.href = 'teacher-login.html';
            });
        }

        var raw = localStorage.getItem('remoedUsername') || 'Teacher';
        var username = (raw && raw.indexOf('Hi,') === 0) ? raw : 'Hi, ' + raw;
        var usernameEl = container.querySelector('#remoed-username');
        var avatarTextEl = container.querySelector('#avatar-text');
        if (usernameEl) usernameEl.textContent = username;
        if (avatarTextEl) avatarTextEl.textContent = (raw.replace(/^Hi,\s*/i, '') || 'T')[0].toUpperCase();

        loadProfileIntoSidebar(container);
    }

    function loadProfileIntoSidebar(container) {
        var token = localStorage.getItem('token');
        var teacherId = localStorage.getItem('teacherId');
        if (!token || !teacherId) return;

        var usernameEl = container.querySelector('#remoed-username');
        var avatarTextEl = container.querySelector('#avatar-text');
        var profileImageEl = container.querySelector('#profile-image');
        var raw = localStorage.getItem('remoedUsername') || 'Teacher';

        fetch('/api/teacher/profile', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token }
        }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
            if (!data || !data.profile) return;
            var firstName = data.profile.firstName || raw.replace(/^Hi,\s*/i, '') || 'Teacher';
            if (usernameEl) usernameEl.textContent = 'Hi, ' + firstName;
            if (avatarTextEl) avatarTextEl.textContent = firstName[0].toUpperCase();
            if (data.profile.profilePicture && profileImageEl) {
                profileImageEl.src = data.profile.profilePicture;
                profileImageEl.style.display = 'block';
                if (avatarTextEl) avatarTextEl.style.display = 'none';
            } else if (avatarTextEl) {
                avatarTextEl.style.display = '';
            }
        }).catch(function () {
            if (usernameEl) usernameEl.textContent = (raw.indexOf('Hi,') === 0) ? raw : 'Hi, ' + raw;
        });
    }

    global.TeacherSidebar = {
        render: render,
        MENU_ITEMS: MENU_ITEMS
    };
})(typeof window !== 'undefined' ? window : this);
