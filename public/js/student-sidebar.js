/**
 * Student Portal – shared sidebar component.
 * Uses teacher sidebar visual style but keeps student menu/routes.
 */
(function (global) {
    'use strict';

    var SVG_STROKE = 'stroke-width="2"';

    var MENU_ITEMS = [
        { id: 'dashboard', label: 'My Home', href: 'student-dashboard.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>' },
        { id: 'schedule', label: 'My Schedule', href: 'student-class-table.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 3v4M8 3v4"/></svg>' },
        { id: 'book', label: 'Book a Class', href: 'student-book.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>' },
        { id: 'classes', label: 'My Classes', href: 'student-booking-history.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
        { id: 'games', label: 'Play & Learn', href: 'student-games-activities.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M6 12h4M8 10v4"/><path d="M15 11h.01M18 13h.01"/><rect x="2" y="7" width="20" height="10" rx="5"/></svg>' },
<<<<<<< HEAD
=======
        { id: 'videos', label: 'Watch Videos', href: 'student-watch-videos.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M23 7l-7 5 7 5V7z"/><rect x="1" y="5" width="15" height="14" rx="2" ry="2"/></svg>' },
>>>>>>> 50700b36e828b653968685fb464adca59f1fbdcc
        { id: 'profile', label: 'My Profile', href: 'student-profile.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>' },
        { id: 'level', label: 'My Level', href: 'student-assessment.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 12h10M7 8h6M7 16h4"/></svg>' },
        { id: 'credits', label: 'My Credits', href: 'student-credits.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20M7 14h4"/></svg>' },
        { id: 'logout', label: 'Exit', href: null, icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7"/><path d="M3 12a9 9 0 0118 0 9 9 0 01-18 0z"/></svg>', isLogout: true }
    ];

    function getActiveFromPath() {
        var path = (window.location.pathname || '').replace(/^\//, '') || window.location.href;
        if (path.indexOf('student-dashboard') !== -1) return 'dashboard';
        if (path.indexOf('student-class-table') !== -1) return 'schedule';
        if (path.indexOf('student-booking-history') !== -1) return 'classes';
        if (path.indexOf('student-book') !== -1) return 'book';
        if (path.indexOf('student-games-activities') !== -1) return 'games';
<<<<<<< HEAD
=======
        if (path.indexOf('student-watch-videos') !== -1) return 'videos';
>>>>>>> 50700b36e828b653968685fb464adca59f1fbdcc
        if (path.indexOf('student-profile') !== -1) return 'profile';
        if (path.indexOf('student-assessment') !== -1) return 'level';
        if (path.indexOf('student-credits') !== -1) return 'credits';
        return null;
    }

    function baseNameFromStorage() {
        var raw = localStorage.getItem('studentUsername') || localStorage.getItem('username') || 'Student';
        var cleaned = String(raw).replace(/^Hi,\s*/i, '').trim();
        return cleaned || 'Student';
    }

    function applyGreetingFromStorage(container) {
        var name = baseNameFromStorage();
        var usernameEl = container.querySelector('#remoed-username');
        var avatarTextEl = container.querySelector('#avatar-text');
        if (usernameEl) usernameEl.textContent = 'Hi, ' + name;
        if (avatarTextEl) avatarTextEl.textContent = (name[0] || 'S').toUpperCase();
    }

    function loadProfileIntoSidebar(container) {
        var token = localStorage.getItem('studentToken') || localStorage.getItem('token');
        if (!token) return;

        var usernameEl = container.querySelector('#remoed-username');
        var avatarTextEl = container.querySelector('#avatar-text');
        var profileImageEl = container.querySelector('#profile-image');
        var fallbackName = baseNameFromStorage();

        fetch('/api/student/profile', {
            method: 'GET',
            headers: { 'Authorization': 'Bearer ' + token }
        }).then(function (r) { return r.ok ? r.json() : null; }).then(function (data) {
            if (!data || !data.profile) return;
            var firstName = (data.profile.firstName || fallbackName || 'Student').trim();
            if (usernameEl) usernameEl.textContent = 'Hi, ' + firstName;
            if (avatarTextEl) avatarTextEl.textContent = (firstName[0] || 'S').toUpperCase();

            var imgSrc = data.profile.profilePicture || data.profile.photo || '';
            if (imgSrc && profileImageEl) {
                profileImageEl.src = imgSrc;
                profileImageEl.style.display = 'block';
                if (avatarTextEl) avatarTextEl.style.display = 'none';
            } else if (avatarTextEl) {
                avatarTextEl.style.display = '';
            }
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
        var menuHtml = MENU_ITEMS.map(function (item) {
            var activeClass = (item.id === active && !item.isLogout) ? ' class="active"' : '';
            var idAttr = item.id === 'logout' ? ' id="logout-nav"' : '';
            if (item.isLogout) {
                return '<li' + idAttr + activeClass + ' data-logout="1">' + item.icon + item.label + '</li>';
            }
            return '<li' + activeClass + ' onclick="window.location.href=\'' + item.href + '\'">' + item.icon + item.label + '</li>';
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

<<<<<<< HEAD
=======
        injectStudentNoMotionStyles();

>>>>>>> 50700b36e828b653968685fb464adca59f1fbdcc
        var logoutLi = container.querySelector('#logout-nav');
        if (logoutLi) {
            logoutLi.addEventListener('click', function () {
                localStorage.removeItem('studentToken');
                localStorage.removeItem('studentId');
                localStorage.removeItem('studentUsername');
                localStorage.removeItem('token');
                localStorage.removeItem('username');
                localStorage.removeItem('userType');
                window.location.href = 'student-login.html';
            });
        }

        applyGreetingFromStorage(container);
        loadProfileIntoSidebar(container);
    }

<<<<<<< HEAD
=======
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

>>>>>>> 50700b36e828b653968685fb464adca59f1fbdcc
    global.StudentSidebar = {
        render: render,
        MENU_ITEMS: MENU_ITEMS,
        applyGreetingFromStorage: applyGreetingFromStorage
    };
})(typeof window !== 'undefined' ? window : this);

