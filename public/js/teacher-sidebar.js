/**
 * Teacher Portal – shared sidebar component.
 * Renders the same menu on every teacher page. Add a new item here to update the whole app.
 * Usage: <div id="teacher-sidebar-root"></div> then TeacherSidebar.render('dashboard');
 */

(function (global) {
    'use strict';

    var SVG_STROKE = 'stroke-width="2"'; // consistent 2px line weight
    var LS_KEY = 'remoed_teacher_sidebar_collapsed';

    function svgBars() {
        return (
            '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" ' +
            SVG_STROKE +
            ' aria-hidden="true">' +
            '<path d="M4 6h16M4 12h16M4 18h16"/>' +
            '</svg>'
        );
    }

    var MENU_ITEMS = [
        { id: 'dashboard', label: 'Dashboard', href: 'teacher-dashboard.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>' },
        { id: 'class-schedule', label: 'Class Schedule', href: 'teacher-class-table.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 3v4M8 3v4"/></svg>' },
        { id: 'class-configuration', label: 'Class Configuration', href: 'teacher-open-class.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>' },
        { id: 'device-check', label: 'Device Check', href: 'device-check.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>' },
        { id: 'lessons-library', label: 'Lessons Library', href: 'teacher-lessons-library.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
        { id: 'teaching-fee', label: 'Teaching Fee', href: 'teacher-service-fee.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 10c-4.41 0-8-1.79-8-4V6c0-2.21 3.59-4 8-4s8 1.79 8 4v8c0 2.21-3.59 4-8 4z"/></svg>' },
        { id: 'referral-rewards', label: 'Referral Rewards', href: 'teacher-referrals.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>' },
        { id: 'performance-indicator', label: 'Performance Indicator', href: 'teacher-performance-indicator.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 12h10M7 8h6M7 16h4"/></svg>' },
        { id: 'professional-development', label: 'Career Growth', href: 'teacher-professional-development.html?v=5', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>' },
        { id: 'messages', label: 'Messages', href: 'teacher-messages.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>' },
        { id: 'profile', label: 'Profile', href: 'teacher-profile.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>' },
        { id: 'logout', label: 'Logout', href: null, icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7"/><path d="M3 12a9 9 0 0118 0 9 9 0 01-18 0z"/></svg>', isLogout: true }
    ];

    function getActiveFromPath() {
        var path = (window.location.pathname || '').replace(/^\//, '') || window.location.href;
        if (path.indexOf('teacher-dashboard') !== -1) return 'dashboard';
        if (path.indexOf('teacher-class-table') !== -1) return 'class-schedule';
        if (path.indexOf('teacher-schedule') !== -1) return 'class-schedule';
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

    function readCollapsedPref() {
        try {
            return localStorage.getItem(LS_KEY) === '1';
        } catch (_e) {
            return false;
        }
    }

    function writeCollapsedPref(collapsed) {
        try {
            localStorage.setItem(LS_KEY, collapsed ? '1' : '0');
        } catch (_e) {}
    }

    function applyCollapsedState(nav, collapsed) {
        if (!nav) return;
        nav.classList.toggle('sidebar-collapsed', !!collapsed);
        document.body.classList.toggle('teacher-sidebar-collapsed', !!collapsed);
    }

    function render(containerIdOrElement, activePageId) {
        var container = typeof containerIdOrElement === 'string'
            ? document.getElementById(containerIdOrElement)
            : containerIdOrElement;
        if (!container) return;

        // Hard cleanup: remove any legacy floating toggles/overlays injected by older scripts or cached JS.
        try {
            var legacy = document.getElementById('sidebarToggle');
            if (legacy) legacy.remove();
            document.querySelectorAll('.mobile-hamburger, .mobile-sidebar-overlay, .remoed-mobile-topbar').forEach(function (el) {
                try { el.remove(); } catch (_e) {}
            });
        } catch (_e) {}

        var active = activePageId || getActiveFromPath();

        var menuHtml = MENU_ITEMS.map(function (item) {
            var activeClass = (item.id === active && !item.isLogout) ? ' class="active"' : '';
            var idAttr = item.id === 'logout' ? ' id="logout-nav"' : '';
            var dataNav = ' data-nav="' + item.id + '"';
            if (item.isLogout) {
                return '<li title="' + item.label + '"' + idAttr + activeClass + dataNav + ' data-logout="1">' + item.icon + '<span class="menu-label">' + item.label + '</span></li>';
            }
            var badgeOrDot = '';
            if (item.id === 'class-schedule') {
                badgeOrDot = '<span class="remoed-schedule-count-badge" aria-hidden="true"></span>';
            } else if (item.id === 'teaching-fee') {
                badgeOrDot = '<span class="remoed-pending-dot" aria-hidden="true"></span>';
            }
            return '<li title="' + item.label + '"' + activeClass + dataNav + ' onclick="window.location.href=\'' + item.href + '\'">' + item.icon + badgeOrDot + '<span class="menu-label">' + item.label + '</span></li>';
        }).join('');

        var html =
            '<nav class="remoed-sidebar">' +
            '  <div class="sidebar-header">' +
            '    <div class="sidebar-header-inner">' +
            '      <img class="sidebar-logo-img" src="images/remoed-logo.png" alt="RemoEdPH">' +
            '      <div class="sidebar-brand">' +
            '        <div class="sidebar-title">RemoEdPH</div>' +
            '        <div class="sidebar-subtitle">Teacher Portal</div>' +
            '      </div>' +
            '      <button type="button" class="sidebar-collapse-toggle" aria-label="Toggle sidebar" title="Toggle sidebar">' +
            svgBars() +
            '      </button>' +
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

        var nav = container.querySelector('nav.remoed-sidebar');
        applyCollapsedState(nav, readCollapsedPref());

        var toggleBtn = container.querySelector('.sidebar-collapse-toggle');
        if (toggleBtn) {
            toggleBtn.addEventListener('click', function (e) {
                e.preventDefault();
                e.stopPropagation();
                var next = !(nav && nav.classList.contains('sidebar-collapsed'));
                applyCollapsedState(nav, next);
                writeCollapsedPref(next);
                try {
                    global.dispatchEvent(new Event('resize'));
                } catch (_e) {}
            });
        }

        var logoutLi = container.querySelector('#logout-nav');
        if (logoutLi) {
            logoutLi.addEventListener('click', function () {
                var token =
                    (typeof RemoedUserSession !== 'undefined' && RemoedUserSession.getUserToken && RemoedUserSession.getUserToken()) ||
                    localStorage.getItem('remoed_teacher_token') ||
                    sessionStorage.getItem('remoed_teacher_token') ||
                    localStorage.getItem('remoed_teacher_auth') ||
                    sessionStorage.getItem('remoed_teacher_auth') ||
                    localStorage.getItem('remoed_user_token') ||
                    sessionStorage.getItem('remoed_user_token') ||
                    localStorage.getItem('token') ||
                    '';
                var opts = { method: 'POST', credentials: 'include' };
                if (token) {
                    opts.headers = { Authorization: 'Bearer ' + token };
                }
                fetch('/api/logout', opts).catch(function () {}).finally(function () {
                    try {
                        localStorage.clear();
                        sessionStorage.clear();
                    } catch (e) {}
                    window.location.replace('/login/');
                });
            });
        }

        var raw = localStorage.getItem('remoedUsername') || 'Teacher';
        var username = (raw && raw.indexOf('Hi,') === 0) ? raw : 'Hi, ' + raw;
        var usernameEl = container.querySelector('#remoed-username');
        var avatarTextEl = container.querySelector('#avatar-text');
        if (usernameEl) usernameEl.textContent = username;
        if (avatarTextEl) avatarTextEl.textContent = (raw.replace(/^Hi,\s*/i, '') || 'T')[0].toUpperCase();

        loadProfileIntoSidebar(container);
        updatePendingFeedbackDots(container);
        // Mini-sidebar collapse is handled locally; no floating toggle buttons.
    }

    function setClassSchedulePendingBadge(n) {
        var root = document.getElementById('teacher-sidebar-root');
        if (!root) return;
        var li = root.querySelector('li[data-nav="class-schedule"]');
        var badge = li && li.querySelector('.remoed-schedule-count-badge');
        if (!li || !badge) return;
        var num = Number(n) || 0;
        if (num > 0) {
            li.classList.add('remoed-has-pending-count');
            badge.textContent = num > 99 ? '99+' : String(num);
            badge.setAttribute('aria-label', num + ' pending feedback');
        } else {
            li.classList.remove('remoed-has-pending-count');
            badge.textContent = '';
            badge.removeAttribute('aria-label');
        }
    }

    function updatePendingFeedbackDots(container) {
        var root =
            container && container.querySelector
                ? container
                : document.getElementById('teacher-sidebar-root');
        if (!root) return;
        var menu = root.querySelector('.remoed-menu');
        if (!menu) return;
        menu.querySelectorAll('li[data-nav]').forEach(function (li) {
            li.classList.remove('remoed-has-pending');
        });
        setClassSchedulePendingBadge(0);
        var token =
            (typeof RemoedUserSession !== 'undefined' &&
                RemoedUserSession.getUserToken &&
                RemoedUserSession.getUserToken()) ||
            localStorage.getItem('token');
        if (!token) return;
        fetch('/api/teacher/pending-feedback-bookings', {
            headers: { Authorization: 'Bearer ' + token },
        })
            .then(function (r) {
                return r.ok ? r.json() : null;
            })
            .then(function (data) {
                if (!data || !data.success) return;
                var n = Number(data.count) || 0;
                setClassSchedulePendingBadge(n);
                if (n > 0) {
                    var feeLi = menu.querySelector('li[data-nav="teaching-fee"]');
                    if (feeLi) feeLi.classList.add('remoed-has-pending');
                }
            })
            .catch(function () {});
    }

    if (!global.__remoedPendingFeedbackDotListener) {
        global.__remoedPendingFeedbackDotListener = true;
        global.addEventListener('remoed:pending-feedback-changed', function () {
            var c = document.getElementById('teacher-sidebar-root');
            if (c) updatePendingFeedbackDots(c);
        });
    }

    function loadProfileIntoSidebar(container) {
        var token =
            (typeof RemoedUserSession !== 'undefined' && RemoedUserSession.getUserToken && RemoedUserSession.getUserToken()) ||
            localStorage.getItem('remoed_teacher_token') ||
            sessionStorage.getItem('remoed_teacher_token') ||
            localStorage.getItem('remoed_teacher_auth') ||
            sessionStorage.getItem('remoed_teacher_auth') ||
            localStorage.getItem('remoed_user_token') ||
            sessionStorage.getItem('remoed_user_token') ||
            localStorage.getItem('token');
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
        MENU_ITEMS: MENU_ITEMS,
        refreshPendingFeedbackDots: function () {
            var c = document.getElementById('teacher-sidebar-root');
            if (c) updatePendingFeedbackDots(c);
        },
        setClassSchedulePendingBadge: setClassSchedulePendingBadge,
    };
})(typeof window !== 'undefined' ? window : this);
