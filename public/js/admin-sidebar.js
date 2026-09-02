/**
 * Admin Portal – shared sidebar (same look as teacher sidebar, admin menu items).
 * Usage: <div id="admin-sidebar-root"></div> then AdminSidebar.render('admin-sidebar-root', 'dashboard');
 */
(function (global) {
    'use strict';

    var SVG_STROKE = 'stroke-width="2"';
    var LS_KEY = 'remoed_admin_sidebar_collapsed';

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
        { id: 'dashboard', label: 'Dashboard', href: 'admin-dashboard.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>' },
        { id: 'hr-hub', label: 'HR Hub', href: 'admin-hr-hub.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M17 21v-2a4 4 0 00-4-4H5a4 4 0 00-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M23 21v-2a4 4 0 00-3-3.87M16 3.13a4 4 0 010 7.75"/></svg>' },
        { id: 'qa-hub', label: 'QA Hub', href: 'admin-qa-hub.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>' },
        { id: 'accounting-hub', label: 'Accounting Hub', href: 'admin-accounting-hub.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M12 2v20M17 5H9.5a3.5 3.5 0 000 7h5a3.5 3.5 0 010 7H6"/></svg>' },
        { id: 'announcements', label: 'Announcements', href: 'admin-announcements.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M11 5.882V19.24a1.76 1.76 0 01-3.417.592l-2.147-6.15M18 13a3 3 0 100-6M5.436 13.683A4.001 4.001 0 017 6h1.832c4.1 0 7.625-1.234 9.168-3v14c-1.543-1.766-5.067-3-9.168-3H7a3.988 3.988 0 01-1.564-.317z"/></svg>' },
        { id: 'videos', label: 'Videos', href: 'admin-videos.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="3" y="5" width="14" height="12" rx="2"/><path d="M17 9l4-2v10l-4-2"/></svg>' },
        { id: 'reports', label: 'Reports', href: 'admin-reports.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z"/></svg>' },
        { id: 'messages', label: 'Messages', href: 'admin-messages.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>' },
        { id: 'profile-settings', label: 'Profile settings', href: 'admin-profile-settings.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>' },
        { id: 'settings', label: 'Settings', href: 'admin-settings.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z"/><path d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"/></svg>' },
        { id: 'super-monitor', label: 'System monitor', href: 'super-monitor.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z"/></svg>' },
        { id: 'logout', label: 'Logout', href: null, icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7"/><path d="M3 12a9 9 0 0118 0 9 9 0 01-18 0z"/></svg>', isLogout: true }
    ];

    function getActiveFromPath() {
        var path = (window.location.pathname || '').replace(/^\//, '') || window.location.href;
        if (path.indexOf('admin-dashboard') !== -1) return 'dashboard';
        if (path.indexOf('admin-hr-hub') !== -1) return 'hr-hub';
        if (path.indexOf('admin-users') !== -1) return 'hr-hub';
        if (path.indexOf('admin-teacher-assessments') !== -1) return 'hr-hub';
        if (path.indexOf('admin-assessment-answer-key') !== -1) return 'hr-hub';
        if (path.indexOf('admin-teacher-pipeline') !== -1) return 'hr-hub';
        if (path.indexOf('admin-accounting-hub') !== -1) return 'accounting-hub';
        if (path.indexOf('admin-unique-link-commission') !== -1) return 'accounting-hub';
        if (path.indexOf('admin-payroll') !== -1) return 'accounting-hub';
        if (path.indexOf('admin-announcements') !== -1) return 'announcements';
        if (path.indexOf('admin-videos') !== -1) return 'videos';
        if (path.indexOf('admin-reports') !== -1) return 'reports';
        if (path.indexOf('admin-qa-hub') !== -1) return 'qa-hub';
        if (path.indexOf('admin-issue-management') !== -1) return 'qa-hub';
        if (path.indexOf('admin-classroom-recordings') !== -1) return 'qa-hub';
        if (path.indexOf('admin-lessons-library') !== -1) return 'qa-hub';
        if (path.indexOf('admin-messages') !== -1) return 'messages';
        if (path.indexOf('admin-profile-settings') !== -1) return 'profile-settings';
        if (path.indexOf('admin-settings') !== -1) return 'settings';
        if (path.indexOf('super-monitor') !== -1) return 'super-monitor';
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

    function getAdminAuthToken() {
        return (
            (typeof RemoedAdminSession !== 'undefined' && RemoedAdminSession.getAuthToken && RemoedAdminSession.getAuthToken()) ||
            localStorage.getItem('remoed_admin_token') ||
            localStorage.getItem('remoed_admin_auth') ||
            localStorage.getItem('adminToken') ||
            localStorage.getItem('token') ||
            ''
        );
    }

    /** Show uploaded photo in sidebar avatar, or fall back to letter initial. */
    function applyAvatarFromUrl(url) {
        var img = document.getElementById('profile-image');
        var text = document.getElementById('avatar-text');
        if (!img || !text) return;
        var src = String(url || '').trim();
        if (src) {
            img.src = src;
            img.style.display = 'block';
            text.style.display = 'none';
        } else {
            img.removeAttribute('src');
            img.style.display = 'none';
            text.style.display = '';
        }
    }

    function loadProfileIntoSidebar() {
        var token = getAdminAuthToken();
        if (!token) return;
        fetch('/api/admin/me', {
            method: 'GET',
            headers: { Authorization: 'Bearer ' + token },
            credentials: 'include'
        })
            .then(function (r) {
                return r.ok ? r.json() : null;
            })
            .then(function (data) {
                if (!data || !data.profile) return;
                var p = data.profile;
                var nameBits = [(p.firstName || ''), (p.lastName || '')].join(' ').trim();
                var friendly = nameBits || displayNameFromUsername(p.username || localStorage.getItem('adminUsername') || 'Admin');
                var usernameEl = document.getElementById('remoed-username');
                var avatarTextEl = document.getElementById('avatar-text');
                if (usernameEl) usernameEl.textContent = 'Hi, ' + String(friendly).split(/\s+/)[0];
                if (avatarTextEl) avatarTextEl.textContent = (String(friendly).charAt(0) || 'A').toUpperCase();
                applyAvatarFromUrl(p.profilePictureUrl || '');
            })
            .catch(function () {});
    }

    /** HR / QA / Accounting hub entries — visibility by adminRole (matches adminhr@ / adminqa@ / adminacct@ roles). */
    function shouldShowNavItem(itemId) {
        var role = '';
        try {
            role = String(localStorage.getItem('adminRole') || '').trim();
        } catch (e) {}
        if (itemId === 'settings') return role === 'super_admin';
        if (itemId === 'super-monitor') return role === 'super_admin';
        if (!role || role === 'super_admin') return true;
        if (itemId === 'hr-hub') return role === 'admin_hr';
        if (itemId === 'qa-hub') return role === 'admin_qa';
        if (itemId === 'accounting-hub') return role === 'admin_accounting';
        return true;
    }

    function systemSettingsHref() {
        var role = '';
        try {
            role = String(localStorage.getItem('adminRole') || '').trim();
        } catch (e) {}
        return role === 'super_admin' ? 'admin-settings.html' : 'admin-profile-settings.html';
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
        document.body.classList.toggle('admin-sidebar-collapsed', !!collapsed);
        // Drop dual off-canvas model used by floating portal chrome.
        document.body.classList.remove('remoed-desktop-sidebar-collapsed', 'remoed-portal-sidebar-mounted', 'remoed-drawer-open');
    }

    function removeLegacyFloatingChrome() {
        try {
            var legacy = document.getElementById('sidebarToggle');
            if (legacy) legacy.remove();
            var closeBtn = document.getElementById('sidebarClose');
            if (closeBtn) closeBtn.remove();
            document.querySelectorAll(
                '.mobile-hamburger, .mobile-sidebar-overlay, .remoed-mobile-topbar, .portal-sidebar-toggle, #remoed-nav-toggle'
            ).forEach(function (el) {
                try { el.remove(); } catch (_e) {}
            });
            document.body.classList.remove('remoed-desktop-sidebar-collapsed', 'remoed-portal-sidebar-mounted', 'remoed-drawer-open');
        } catch (_e) {}
    }

    function render(containerIdOrElement, activePageId) {
        var container = typeof containerIdOrElement === 'string'
            ? document.getElementById(containerIdOrElement)
            : containerIdOrElement;
        if (!container) return;

        // Mirror Teacher SoT: in-sidebar collapse only; remove floating #sidebarToggle.
        removeLegacyFloatingChrome();

        var active = activePageId || getActiveFromPath();

        var menuHtml = MENU_ITEMS.filter(function (item) {
            return shouldShowNavItem(item.id);
        }).map(function (item) {
            var activeClass = (item.id === active && !item.isLogout) ? ' class="active"' : '';
            var idAttr = item.id === 'logout' ? ' id="logout-nav"' : '';
            var dataNav = ' data-nav="' + item.id + '"';
            var labelSpan = '<span class="menu-label">' + item.label + '</span>';
            if (item.isLogout) {
                return '<li title="' + item.label + '"' + idAttr + activeClass + dataNav + ' data-logout="1">' + item.icon + labelSpan + '</li>';
            }
            return '<li title="' + item.label + '"' + activeClass + dataNav + ' onclick="window.location.href=\'' + item.href + '\'">' + item.icon + labelSpan + '</li>';
        }).join('');

        var avatarHref = systemSettingsHref().replace(/'/g, "\\'");

        var html =
            '<nav class="remoed-sidebar admin-sidebar">' +
            '  <div class="sidebar-header">' +
            '    <div class="sidebar-header-inner">' +
            '      <img class="sidebar-logo-img" src="images/remoed-logo.png" alt="RemoEdPH" onerror="this.src=\'remoed-logo.png\'">' +
            '      <div class="sidebar-brand">' +
            '        <div class="sidebar-title">RemoEdPH</div>' +
            '        <div class="sidebar-subtitle">Admin Portal</div>' +
            '      </div>' +
            '      <button type="button" class="sidebar-collapse-toggle" aria-label="Toggle sidebar" title="Toggle sidebar">' +
            svgBars() +
            '      </button>' +
            '    </div>' +
            '  </div>' +
            '  <div class="sidebar-user">' +
            '    <div class="sidebar-user-inner">' +
            '      <div id="remoed-avatar" onclick="window.location.href=\'' + avatarHref + '\'" style="cursor:pointer;" title="Profile">' +
            '        <img id="profile-image" src="" alt="Profile" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:none;">' +
            '        <span id="avatar-text">A</span>' +
            '      </div>' +
            '      <span class="remoed-username" id="remoed-username">Hi, Admin</span>' +
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
                var W = typeof window !== 'undefined' ? window : null;
                var adminLoginTarget = '';
                try {
                    if (W && W.RemoedAdminSession && typeof W.RemoedAdminSession.getLoginPath === 'function') {
                        adminLoginTarget = W.RemoedAdminSession.getLoginPath() || '';
                    }
                } catch (e0) {}
                var token =
                    (typeof RemoedAdminSession !== 'undefined' && RemoedAdminSession.getAuthToken && RemoedAdminSession.getAuthToken()) ||
                    localStorage.getItem('remoed_admin_token') ||
                    localStorage.getItem('remoed_admin_auth') ||
                    localStorage.getItem('adminToken') ||
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
                    if (W) {
                        if (adminLoginTarget) {
                            W.location.replace(adminLoginTarget);
                        } else {
                            W.location.replace('admin-login.html?r=a');
                        }
                    }
                });
            });
        }

        applyGreetingFromStorage();
        loadProfileIntoSidebar();
        // Mini-sidebar collapse is handled locally (.sidebar-collapse-toggle); no floating portal chrome.
        removeLegacyFloatingChrome();

        // Shared top header (black 18px title) on full admin pages — skip hub embeds.
        try {
            if (!global.__ADMIN_EMBED__ && global.AdminPageHeader && typeof global.AdminPageHeader.render === 'function') {
                global.AdminPageHeader.render(active);
            } else if (!global.__ADMIN_EMBED__) {
                var s = document.createElement('script');
                s.src = 'js/admin-page-header.js';
                s.onload = function () {
                    if (global.AdminPageHeader) global.AdminPageHeader.render(active);
                };
                document.head.appendChild(s);
            }
        } catch (_hdr) {}
    }

    global.AdminSidebar = {
        render: render,
        MENU_ITEMS: MENU_ITEMS,
        applyGreetingFromStorage: applyGreetingFromStorage,
        applyAvatarFromUrl: applyAvatarFromUrl,
        loadProfileIntoSidebar: loadProfileIntoSidebar,
        shouldShowNavItem: shouldShowNavItem,
        systemSettingsHref: systemSettingsHref
    };
})(typeof window !== 'undefined' ? window : this);
