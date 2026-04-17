/**
 * Student Portal – shared sidebar component.
 * Uses teacher sidebar visual style but keeps student menu/routes.
 */
(function (global) {
    'use strict';

    var SVG_STROKE = 'stroke-width="2"';

    var MENU_ITEMS = [
        { id: 'dashboard', label: 'Dashboard', href: 'student-dashboard.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>' },
        { id: 'schedule', label: 'My Schedule', href: 'student-class-table.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 3v4M8 3v4"/></svg>' },
        { id: 'book', label: 'Book Class', href: 'student-book.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>' },
        { id: 'classes', label: 'My Classes', href: 'student-booking-history.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
        { id: 'games', label: 'Play & Learn', href: 'student-games-activities.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M6 12h4M8 10v4"/><path d="M15 11h.01M18 13h.01"/><rect x="2" y="7" width="20" height="10" rx="5"/></svg>' },
        { id: 'videos', label: 'Videos', href: 'student-videos.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="2" y="7" width="15" height="10" rx="2"/><path d="M17 10l5-3v10l-5-3z"/></svg>' },
        { id: 'journey', label: 'My Learning Journey', href: 'student-learning-journey.html', studentOnly: true, icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M4 19h16"/><path d="M6 17l4-14 4 10 4-6 2 10"/><circle cx="8" cy="17" r="2"/><circle cx="12" cy="13" r="2"/><circle cx="16" cy="11" r="2"/><circle cx="18" cy="17" r="2"/></svg>' },
        { id: 'profile', label: 'My Profile', href: 'student-profile.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>' },
        { id: 'level', label: 'My Level', href: 'student-assessment.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 12h10M7 8h6M7 16h4"/></svg>' },
        { id: 'credits', label: 'My Credits', href: 'student-credits.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20M7 14h4"/></svg>' },
        { id: 'logout', label: 'Exit', href: null, icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7"/><path d="M3 12a9 9 0 0118 0 9 9 0 01-18 0z"/></svg>', isLogout: true }
    ];

    function getActiveFromPath() {
        var raw = (window.location.pathname || '').replace(/\\/g, '/');
        var file = raw.split('/').pop() || '';
        if (file.indexOf('?') !== -1) file = file.split('?')[0];
        if (file.indexOf('#') !== -1) file = file.split('#')[0];
        if (!file && window.location.href) {
            try {
                file = decodeURIComponent((window.location.href.split('/').pop() || '').split('?')[0].split('#')[0]);
            } catch (e) {
                file = '';
            }
        }
        switch (file) {
            case 'student-dashboard.html':
                return 'dashboard';
            case 'student-class-table.html':
                return 'schedule';
            case 'student-booking-history.html':
                return 'classes';
            case 'student-book.html':
                return 'book';
            case 'student-games-activities.html':
                return 'games';
            case 'student-videos.html':
                return 'videos';
            case 'student-learning-journey.html':
                return 'journey';
            case 'student-profile.html':
                return 'profile';
            case 'student-assessment.html':
                return 'level';
            case 'student-credits.html':
                return 'credits';
            default:
                return null;
        }
    }

    /** My Learning Journey: only for logged-in students (explicit nav visibility). */
    function shouldShowLearningJourneyNav() {
        try {
            var ut = localStorage.getItem('userType');
            if (ut === 'student') return true;
            if (ut == null || ut === '') return true;
            return false;
        } catch (e) {
            return true;
        }
    }

    function baseNameFromStorage() {
        var raw =
            localStorage.getItem('studentUsername') ||
            localStorage.getItem('username') ||
            localStorage.getItem('remoedUsername') ||
            '';
        var cleaned = String(raw).replace(/^Hi,\s*/i, '').trim();
        return cleaned || 'Student';
    }

    function readStoredSubscribed() {
        try {
            if (localStorage.getItem('studentIsSubscribed') === '1') return true;
            var ps = localStorage.getItem('studentPaymentStatus');
            var ss = localStorage.getItem('studentSubscriptionStatus');
            return ps === 'paid' && ss === 'active';
        } catch (e) {
            return false;
        }
    }

    function getBookNavSpec() {
        var acct = 'standard';
        try {
            acct = localStorage.getItem('studentAccountStatus') || 'standard';
        } catch (e) {}
        if (acct === 'trial_completed' && !readStoredSubscribed()) {
            return { label: 'Subscribe to Book', href: 'index.html#plans' };
        }
        return { label: 'Book Class', href: 'student-book.html' };
    }

    function refreshBookNavItem(container) {
        if (!container) return;
        var li = container.querySelector('li[data-nav="book"]');
        if (!li) return;
        var spec = getBookNavSpec();
        var icon = MENU_ITEMS.filter(function (x) { return x.id === 'book'; })[0].icon;
        li.innerHTML = icon + spec.label;
        li.onclick = function () {
            window.location.href = spec.href;
        };
    }

    function applyGreetingFromStorage(container) {
        var name = baseNameFromStorage();
        var usernameEl = container.querySelector('#remoed-username');
        var avatarTextEl = container.querySelector('#avatar-text');
        if (usernameEl) usernameEl.textContent = 'Hi, ' + name;
        if (avatarTextEl) avatarTextEl.textContent = (name[0] || 'S').toUpperCase();
    }

    function loadProfileIntoSidebar(container) {
        var token =
            localStorage.getItem('remoed_user_token') ||
            sessionStorage.getItem('remoed_user_token') ||
            localStorage.getItem('studentToken') ||
            localStorage.getItem('token');
        if (!token) return;

        var usernameEl = container.querySelector('#remoed-username');
        var avatarTextEl = container.querySelector('#avatar-text');
        var profileImageEl = container.querySelector('#profile-image');
        var fallbackName = baseNameFromStorage();

        fetch('/api/student/profile', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token }
        }).then(function (r) { return r.ok ? r.json() : null;         }).then(function (data) {
            if (!data || !data.profile) return;
            var fn = (data.profile.firstName || '').trim();
            var un = (data.profile.username || '').trim();
            var display = fn || un || fallbackName || 'Student';
            if (usernameEl) usernameEl.textContent = 'Hi, ' + display;
            if (avatarTextEl) avatarTextEl.textContent = (display[0] || 'S').toUpperCase();

            var imgSrc = data.profile.profilePicture || data.profile.photo || '';
            if (imgSrc && profileImageEl) {
                profileImageEl.src = imgSrc;
                profileImageEl.style.display = 'block';
                if (avatarTextEl) avatarTextEl.style.display = 'none';
            } else if (avatarTextEl) {
                avatarTextEl.style.display = '';
            }

            var acct = data.profile.accountStatus || 'standard';
            try {
                localStorage.setItem('studentAccountStatus', acct);
                localStorage.setItem('studentHasFreeTrial', data.profile.hasFreeTrial ? '1' : '0');
                localStorage.setItem('studentIsSubscribed', data.profile.isSubscribed ? '1' : '0');
                localStorage.setItem('studentPaymentStatus', data.profile.paymentStatus || 'unpaid');
                localStorage.setItem('studentSubscriptionStatus', data.profile.subscriptionStatus || 'pending');
            } catch (e) {}
            refreshBookNavItem(container);
        }).catch(function () {
            if (usernameEl) usernameEl.textContent = 'Hi, ' + fallbackName;
        });
    }

    function render(containerIdOrElement, activePageId) {
        var container = typeof containerIdOrElement === 'string'
            ? document.getElementById(containerIdOrElement)
            : containerIdOrElement;
        if (!container) return;

        var active = activePageId || getActiveFromPath();
        var showJourney = shouldShowLearningJourneyNav();
        var menuHtml = MENU_ITEMS.filter(function (item) {
            if (item.studentOnly && !showJourney) return false;
            return true;
        }).map(function (item) {
            var activeClass = (item.id === active && !item.isLogout) ? ' class="active"' : '';
            var idAttr = item.id === 'logout' ? ' id="logout-nav"' : '';
            var dataNav = ' data-nav="' + item.id + '"';
            if (item.isLogout) {
                return '<li' + idAttr + activeClass + dataNav + ' data-logout="1">' + item.icon + item.label + '</li>';
            }
            if (item.id === 'book') {
                var spec = getBookNavSpec();
                return '<li' + activeClass + dataNav + ' onclick="window.location.href=\'' + spec.href + '\'">' + item.icon + spec.label + '</li>';
            }
            return '<li' + activeClass + dataNav + ' onclick="window.location.href=\'' + item.href + '\'">' + item.icon + item.label + '</li>';
        }).join('');

        container.innerHTML =
            '<nav class="remoed-sidebar">' +
            '  <div class="sidebar-header">' +
            '    <div class="sidebar-header-inner">' +
            '      <img class="sidebar-logo-img" src="images/remoed-logo.png" alt="RemoEdPH" onerror="this.src=\'remoed-logo.png\'">' +
            '      <div>' +
            '        <div class="sidebar-title">RemoEdPH</div>' +
            '        <div class="sidebar-subtitle">Student Portal</div>' +
            '      </div>' +
            '    </div>' +
            '  </div>' +
            '  <div class="sidebar-user">' +
            '    <div class="sidebar-user-inner">' +
            '      <div id="remoed-avatar" onclick="window.location.href=\'student-profile.html\'" style="cursor:pointer;">' +
            '        <img id="profile-image" src="" alt="Profile" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:none;">' +
            '        <span id="avatar-text">S</span>' +
            '      </div>' +
            '      <span class="remoed-username" id="remoed-username">Hi, Student</span>' +
            '    </div>' +
            '  </div>' +
            '  <ul class="remoed-menu">' + menuHtml + '</ul>' +
            '</nav>';

        injectStudentNoMotionStyles();

        var logoutLi = container.querySelector('#logout-nav');
        if (logoutLi) {
            logoutLi.addEventListener('click', function () {
                var token =
                    localStorage.getItem('remoed_user_token') ||
                    sessionStorage.getItem('remoed_user_token') ||
                    localStorage.getItem('studentToken') ||
                    localStorage.getItem('token') ||
                    '';
                var opts = { method: 'POST', credentials: 'include' };
                if (token) {
                    opts.headers = { Authorization: 'Bearer ' + token };
                }
                fetch('/api/logout', opts).catch(function () {}).finally(function () {
                    try {
                        localStorage.removeItem('remoed_user_token');
                        sessionStorage.removeItem('remoed_user_token');
                        localStorage.removeItem('studentToken');
                        localStorage.removeItem('studentId');
                        localStorage.removeItem('studentUsername');
                        localStorage.removeItem('token');
                        localStorage.removeItem('username');
                        localStorage.removeItem('userType');
                        localStorage.removeItem('studentAccountStatus');
                        localStorage.removeItem('studentHasFreeTrial');
                        localStorage.removeItem('studentIsSubscribed');
                        localStorage.removeItem('studentPaymentStatus');
                        localStorage.removeItem('studentSubscriptionStatus');
                    } catch (e) {}
                    window.location.replace('/login/');
                });
            });
        }

        applyGreetingFromStorage(container);
        loadProfileIntoSidebar(container);
    }

    function injectStudentNoMotionStyles() {
        if (document.getElementById('student-no-motion-style')) return;
        var style = document.createElement('style');
        style.id = 'student-no-motion-style';
        style.textContent = [
            '.student-portal .remoed-sidebar, .student-portal .remoed-sidebar * {',
            '  animation: none !important;',
            '  transition: none !important;',
            '}',
            '.student-portal .remoed-menu li:hover, .student-portal .remoed-menu li.active {',
            '  transform: none !important;',
            '}',
            '#safe-content-badge, .safe-content-badge {',
            '  display: none !important;',
            '  visibility: hidden !important;',
            '}'
        ].join('\n');
        document.head.appendChild(style);
    }

    global.StudentSidebar = {
        render: render,
        MENU_ITEMS: MENU_ITEMS,
        applyGreetingFromStorage: applyGreetingFromStorage,
        refreshBookNavItem: refreshBookNavItem,
        getBookNavSpec: getBookNavSpec,
        loadProfileIntoSidebar: loadProfileIntoSidebar
    };

    try {
        var creditsBc = typeof BroadcastChannel !== 'undefined' ? new BroadcastChannel('remoed-credits') : null;
        if (creditsBc) {
            creditsBc.onmessage = function (ev) {
                if (!ev.data || ev.data.type !== 'credits-updated') return;
                var root = document.getElementById('student-sidebar-root');
                if (root) loadProfileIntoSidebar(root);
            };
        }
    } catch (e) { /* ignore */ }
})(typeof window !== 'undefined' ? window : this);

