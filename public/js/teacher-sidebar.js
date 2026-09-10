/**
 * Teacher Portal – shared sidebar component.
 * Renders the same menu on every teacher page. Add a new item here to update the whole app.
 * Usage: <div id="teacher-sidebar-root"></div> then TeacherSidebar.render('dashboard');
 */

(function (global) {
    'use strict';

    var SVG_STROKE = 'stroke-width="2"'; // consistent 2px line weight
    var LS_KEY = 'remoed_teacher_sidebar_collapsed';
    var BRAND_CSS_ID = 'teacher-brand-overrides';
    var PURPLE_HEX = /#667eea|#764ba2|#5a67d8|#6366f1|#4f46e5|#818cf8|#4c51bf|#8b5cf6|#7c3aed|#a78bfa|#9333ea|#6b46c1|#4c1d95|#312e81/gi;
    var PURPLE_TO_GREEN = {
        '667eea': '00a82d',
        '764ba2': '008a24',
        '5a67d8': '00a82d',
        '6366f1': '00a82d',
        '4f46e5': '008a24',
        '818cf8': '34c759',
        '4c51bf': '008a24',
        '8b5cf6': '00a82d',
        '7c3aed': '008a24',
        'a78bfa': '34c759',
        '9333ea': '00a82d',
        '6b46c1': '008a24',
        '4c1d95': '008a24',
        '312e81': '007a20'
    };

    function ensureBrandOverridesCss() {
        try {
            document.body.classList.add('teacher-portal');
            if (document.getElementById(BRAND_CSS_ID)) return;
            var link = document.createElement('link');
            link.id = BRAND_CSS_ID;
            link.rel = 'stylesheet';
            link.href = 'css/teacher-brand-overrides.css?v=mint-forest-1';
            document.head.appendChild(link);
        } catch (_e) {}
    }

    function scrubPurpleInlineStyles(root) {
        try {
            var scope = root && root.querySelectorAll ? root : document;
            var nodes = scope.querySelectorAll
                ? scope.querySelectorAll('[style]')
                : [];
            Array.prototype.forEach.call(nodes, function (el) {
                var s = el.getAttribute('style');
                if (!s || !PURPLE_HEX.test(s)) {
                    PURPLE_HEX.lastIndex = 0;
                    return;
                }
                PURPLE_HEX.lastIndex = 0;
                var next = s.replace(PURPLE_HEX, function (m) {
                    var key = String(m).replace('#', '').toLowerCase();
                    return '#' + (PURPLE_TO_GREEN[key] || '00a82d');
                });
                if (next !== s) el.setAttribute('style', next);
            });
        } catch (_e) {}
    }

    function schedulePurpleScrub() {
        scrubPurpleInlineStyles(document);
        setTimeout(function () { scrubPurpleInlineStyles(document); }, 400);
        setTimeout(function () { scrubPurpleInlineStyles(document); }, 1500);
    }

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
        { id: 'leaderboard', label: 'Leaderboard', href: 'leaderboard.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z"/><path d="M5 8H3a2 2 0 000 4h2M19 8h2a2 2 0 010 4h-2"/></svg>' },
        { id: 'class-schedule', label: 'Class Schedule', href: 'teacher-class-table.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 3v4M8 3v4"/></svg>' },
        { id: 'class-configuration', label: 'Class Configuration', href: 'teacher-open-class.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>' },
        { id: 'device-check', label: 'Device Check', href: 'device-check.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="2" y="3" width="20" height="14" rx="2"/><path d="M8 21h8M12 17v4"/></svg>' },
        { id: 'lessons-library', label: 'Lessons Library', href: 'teacher-lessons-library.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
        { id: 'teaching-fee', label: 'Teaching Fee', href: 'teacher-service-fee.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm0 10c-4.41 0-8-1.79-8-4V6c0-2.21 3.59-4 8-4s8 1.79 8 4v8c0 2.21-3.59 4-8 4z"/></svg>' },
        { id: 'referral-rewards', label: 'Referral Rewards', href: 'teacher-referrals.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/></svg>' },
        { id: 'performance-indicator', label: 'Performance Indicator', href: 'teacher-performance-indicator.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 12h10M7 8h6M7 16h4"/></svg>' },
        { id: 'professional-development', label: 'Career Growth', href: 'teacher-professional-development.html?v=6', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M12 2L2 7l10 5 10-5-10-5zM2 17l10 5 10-5M2 12l10 5 10-5"/></svg>' },
        { id: 'messages', label: 'Messages', href: 'teacher-messages.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>' },
        { id: 'profile', label: 'Profile', href: 'teacher-profile.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>' },
        { id: 'logout', label: 'Log out', href: null, icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7"/><path d="M3 12a9 9 0 0118 0 9 9 0 01-18 0z"/></svg>', isLogout: true }
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
        if (path.indexOf('leaderboard') !== -1) return 'leaderboard';
        if (path.indexOf('teacher-performance-indicator') !== -1) return 'performance-indicator';
        if (path.indexOf('teacher-professional-development') !== -1) return 'professional-development';
        if (path.indexOf('teacher-peer-learning') !== -1) return 'professional-development';
        if (path.indexOf('teacher-view-profile') !== -1) return 'professional-development';
        if (path.indexOf('teacher-training-course') !== -1) return 'professional-development';
        if (path.indexOf('teacher-assessment') !== -1) return 'professional-development';
        if (path.indexOf('teacher-attendance') !== -1) return 'performance-indicator';
        if (path.indexOf('teacher-payslip') !== -1) return 'teaching-fee';
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
        var toggleBtn = nav.querySelector('.sidebar-collapse-toggle');
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            toggleBtn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
            toggleBtn.setAttribute('aria-label', toggleBtn.title);
        }
    }

    function render(containerIdOrElement, activePageId) {
        ensureBrandOverridesCss();
        schedulePurpleScrub();
        try {
            document.body.classList.add('teacher-portal');
        } catch (_e) {}

        var container = typeof containerIdOrElement === 'string'
            ? document.getElementById(containerIdOrElement)
            : containerIdOrElement;
        if (!container && typeof containerIdOrElement === 'string') {
            container = document.getElementById('teacher-sidebar-root') || document.getElementById('sidebar');
        }
        if (!container) return;

        // Hard cleanup: remove legacy floating toggles/overlays only.
        // Keep portal-layout.js chrome (.remoed-mobile-topbar, #remoed-nav-toggle, bottom nav).
        try {
            var legacy = document.getElementById('sidebarToggle');
            if (legacy) legacy.remove();
            var closeBtn = document.getElementById('sidebarClose');
            if (closeBtn) closeBtn.remove();
            document.querySelectorAll('.mobile-hamburger, .mobile-sidebar-overlay, .portal-sidebar-toggle').forEach(function (el) {
                try { el.remove(); } catch (_e) {}
            });
            document.body.classList.remove('remoed-desktop-sidebar-collapsed', 'remoed-portal-sidebar-mounted');
        } catch (_e) {}

        var active = activePageId || getActiveFromPath();

        var navItemsHtml = MENU_ITEMS.filter(function (item) {
            return !item.isLogout;
        }).map(function (item) {
            var activeClass = (item.id === active) ? ' class="active"' : '';
            var dataNav = ' data-nav="' + item.id + '"';
            var badgeOrDot = '';
            if (item.id === 'class-schedule') {
                badgeOrDot = '<span class="remoed-schedule-count-badge" aria-hidden="true"></span>';
            } else if (item.id === 'teaching-fee') {
                badgeOrDot = '<span class="remoed-pending-dot" aria-hidden="true"></span>';
            }
            return '<li title="' + item.label + '"' + activeClass + dataNav + ' onclick="window.location.href=\'' + item.href + '\'">' + item.icon + badgeOrDot + '<span class="menu-label">' + item.label + '</span></li>';
        }).join('');

        var logoutItem = null;
        for (var i = 0; i < MENU_ITEMS.length; i++) {
            if (MENU_ITEMS[i].isLogout) {
                logoutItem = MENU_ITEMS[i];
                break;
            }
        }
        var logoutHtml = logoutItem
            ? '<button type="button" class="sidebar-logout-btn" id="logout-nav" data-nav="logout" data-logout="1" title="' +
              logoutItem.label +
              '">' +
              logoutItem.icon +
              '<span class="menu-label">' +
              logoutItem.label +
              '</span></button>'
            : '';

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
            '        <img id="profile-image" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:none;">' +
            '        <span id="avatar-text">T</span>' +
            '      </div>' +
            '      <span class="remoed-username" id="remoed-username">Hi, Teacher</span>' +
            '    </div>' +
            '  </div>' +
            '  <ul class="remoed-menu">' + navItemsHtml + '</ul>' +
            '  <div class="sidebar-logout-footer">' + logoutHtml + '</div>' +
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
        // Mini-sidebar collapse is handled locally; mobile hamburger/drawer via portal-layout.js.
        queuePortalLayoutMount();
    }

    function queuePortalLayoutMount() {
        if (typeof global.RemoedPortalLayout !== 'undefined' && global.RemoedPortalLayout.mount) {
            global.RemoedPortalLayout.mount();
            return;
        }
        if (document.querySelector('script[data-remoed-portal-layout]')) {
            document.addEventListener('remoed-portal-layout-ready', function once() {
                document.removeEventListener('remoed-portal-layout-ready', once);
                if (global.RemoedPortalLayout && global.RemoedPortalLayout.mount) {
                    global.RemoedPortalLayout.mount();
                }
            });
            return;
        }
        var s = document.createElement('script');
        s.src = 'js/portal-layout.js?v=lb-nav-3';
        s.async = true;
        s.setAttribute('data-remoed-portal-layout', '1');
        s.onload = function () {
            if (global.RemoedPortalLayout && global.RemoedPortalLayout.mount) {
                global.RemoedPortalLayout.mount();
            }
            try {
                document.dispatchEvent(new Event('remoed-portal-layout-ready'));
            } catch (e1) { /* ignore */ }
        };
        document.head.appendChild(s);
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

    function showAvatarLetter(avatarTextEl, profileImageEl) {
        if (profileImageEl) {
            profileImageEl.style.display = 'none';
            profileImageEl.removeAttribute('src');
            profileImageEl.onload = null;
            profileImageEl.onerror = null;
        }
        if (avatarTextEl) avatarTextEl.style.display = '';
    }

    function showAvatarPhoto(profileImageEl, avatarTextEl, url) {
        if (!profileImageEl || !url) {
            showAvatarLetter(avatarTextEl, profileImageEl);
            return;
        }
        profileImageEl.onload = function () {
            profileImageEl.style.display = 'block';
            if (avatarTextEl) avatarTextEl.style.display = 'none';
        };
        profileImageEl.onerror = function () {
            showAvatarLetter(avatarTextEl, profileImageEl);
        };
        profileImageEl.src = url;
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
            var greet =
                (data.profile.nickname && String(data.profile.nickname).trim()) ||
                data.profile.firstName ||
                raw.replace(/^Hi,\s*/i, '') ||
                'Teacher';
            if (usernameEl) usernameEl.textContent = 'Hi, ' + greet;
            if (avatarTextEl) avatarTextEl.textContent = greet[0].toUpperCase();
            var pic = String(data.profile.profilePicture || data.profile.photo || '').trim();
            if (pic && pic !== 'null' && pic !== 'undefined') {
                showAvatarPhoto(profileImageEl, avatarTextEl, pic);
            } else {
                showAvatarLetter(avatarTextEl, profileImageEl);
            }
        }).catch(function () {
            if (usernameEl) usernameEl.textContent = (raw.indexOf('Hi,') === 0) ? raw : 'Hi, ' + raw;
            showAvatarLetter(avatarTextEl, profileImageEl);
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
