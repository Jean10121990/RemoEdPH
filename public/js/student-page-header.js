/**
 * Shared student portal top bar — matches Dashboard:
 * left: icon + page title (black 18px); right: circular profile / notifications / schedule.
 */
(function (global) {
    'use strict';

    // Ensure shared helpers + soft realtime refresh are available
    (function ensureNotifAssets() {
        try {
            if (!document.querySelector('script[src*="remoed-notifications.js"]')) {
                var s = document.createElement('script');
                s.src = '/js/remoed-notifications.js';
                document.head.appendChild(s);
            }
            if (!global.io && !document.querySelector('script[src*="socket.io"]')) {
                var s2 = document.createElement('script');
                s2.src = '/socket.io/socket.io.js';
                document.head.appendChild(s2);
            }
        } catch (_e) {}
    })();

    var SVG = {
        gamepad:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M21 6H3c-1.1 0-2 .9-2 2v8c0 1.1.9 2 2 2h18c1.1 0 2-.9 2-2V8c0-1.1-.9-2-2-2zm-10 7H8v3H6v-3H3v-2h3V8h2v3h3v2zm4.5 2c-.83 0-1.5-.67-1.5-1.5s.67-1.5 1.5-1.5 1.5.67 1.5 1.5-.67 1.5-1.5 1.5zm4-3c-.83 0-1.5-.67-1.5-1.5S18.67 9 19.5 9s1.5.67 1.5 1.5-.67 1.5-1.5 1.5z"/>' +
            '</svg>',
        calendar:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>' +
            '</svg>',
        book:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/>' +
            '</svg>',
        plus:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M19 13h-6v6h-2v-6H5v-2h6V5h2v6h6v2z"/>' +
            '</svg>',
        path:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>' +
            '</svg>',
        chat:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/>' +
            '</svg>',
        person:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>' +
            '</svg>',
        video:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M17 10.5V7c0-.55-.45-1-1-1H4c-.55 0-1 .45-1 1v10c0 .55.45 1 1 1h12c.55 0 1-.45 1-1v-3.5l4 4v-11l-4 4z"/>' +
            '</svg>',
        target:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 18c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm-1-13h2v6h-2zm0 8h2v2h-2z"/>' +
            '</svg>',
        list:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M3 13h2v-2H3v2zm0 4h2v-2H3v2zm0-8h2V7H3v2zm4 4h14v-2H7v2zm0 4h14v-2H7v2zM7 7v2h14V7H7z"/>' +
            '</svg>'
    };

    var ACTION = {
        person:
            '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>' +
            '</svg>',
        bell:
            '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>' +
            '</svg>',
        calendar:
            '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">' +
            '<path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/>' +
            '</svg>'
    };

    /** @type {Record<string, { title: string, icon: string }>} */
    var PAGES = {
        dashboard: { title: 'My Learning Adventure', icon: 'gamepad' },
        schedule: { title: 'My Schedule', icon: 'calendar' },
        games: { title: 'Play & Learn', icon: 'gamepad' },
        journey: { title: 'My Learning Journey', icon: 'path' },
        leaderboard: { title: 'Leaderboard', icon: 'target' },
        book: { title: 'Book a Class', icon: 'plus' },
        classes: { title: 'My Classes', icon: 'list' },
        messages: { title: 'Messages', icon: 'chat' },
        profile: { title: 'Profile', icon: 'person' },
        videos: { title: 'Video Library', icon: 'video' },
        level: { title: 'My Level', icon: 'target' },
        credits: { title: 'Credits & Plans', icon: 'list' }
    };

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    /**
     * @param {string} pageId
     * @param {{ title?: string, icon?: string, skipActions?: boolean }=} opts
     */
    function render(pageId, opts) {
        opts = opts || {};
        var meta = PAGES[pageId] || { title: opts.title || 'RemoEdPH', icon: opts.icon || 'gamepad' };
        var title = opts.title || meta.title;
        var iconKey = opts.icon || meta.icon;
        var iconHtml = SVG[iconKey] || SVG.gamepad;

        var main = document.querySelector('.remoed-main');
        if (!main) return null;

        var existing = main.querySelector(':scope > .nav-header, :scope > .student-page-nav-header');
        if (existing) {
            var h1 = existing.querySelector('.nav-left h1');
            if (h1) {
                h1.innerHTML = iconHtml + '<span class="nav-title-text">' + escapeHtml(title) + '</span>';
            }
            document.body.classList.add('has-student-page-header');
            if (!existing.querySelector('#upcoming-classes-icon')) {
                bindNotificationBell(existing);
            }
            return existing;
        }

        var header = document.createElement('div');
        header.className = 'nav-header student-page-nav-header';
        header.innerHTML =
            '<div class="nav-left">' +
            '  <h1>' +
            iconHtml +
            '<span class="nav-title-text">' +
            escapeHtml(title) +
            '</span></h1>' +
            '</div>' +
            '<div class="nav-right">' +
            '  <div class="nav-icon" onclick="window.location.href=\'student-profile.html\'" title="My Profile">' +
            ACTION.person +
            '  </div>' +
            '  <div class="nav-icon primary" id="notifications-icon" title="Notifications">' +
            ACTION.bell +
            '    <div class="nav-badge" id="notifications-badge" style="display:none;">0</div>' +
            '    <div class="nav-dropdown" id="notifications-dropdown">' +
            '      <div class="nav-dropdown-header"><span>Notifications</span></div>' +
            '      <div class="nav-dropdown-content" id="notifications-dropdown-content">' +
            '        <div class="nav-dropdown-item">Loading…</div>' +
            '      </div>' +
            '    </div>' +
            '  </div>' +
            '  <div class="nav-icon" onclick="window.location.href=\'student-class-table.html\'" title="My Schedule">' +
            ACTION.calendar +
            '  </div>' +
            '</div>';

        var content = main.querySelector('.remoed-content');
        if (content) {
            main.insertBefore(header, content);
        } else {
            main.insertBefore(header, main.firstChild);
        }

        document.body.classList.add('has-student-page-header');
        bindNotificationBell(header);
        return header;
    }

    /** Restyle an existing dashboard-style header title (keep dropdowns). */
    function polishExisting(pageId, opts) {
        opts = opts || {};
        var meta = PAGES[pageId] || { title: 'RemoEdPH', icon: 'gamepad' };
        var title = opts.title || meta.title;
        var iconHtml = SVG[opts.icon || meta.icon] || SVG.gamepad;
        var header = document.querySelector('.remoed-main > .nav-header');
        if (!header) return render(pageId, opts);
        var h1 = header.querySelector('.nav-left h1');
        if (h1) {
            h1.removeAttribute('style');
            h1.innerHTML = iconHtml + '<span class="nav-title-text">' + escapeHtml(title) + '</span>';
        }
        document.body.classList.add('has-student-page-header');
        if (!header.querySelector('#upcoming-classes-icon')) {
            bindNotificationBell(header);
        }
        return header;
    }

    function studentAuthToken() {
        try {
            if (global.RemoedSecurityGuard && typeof global.RemoedSecurityGuard.getToken === 'function') {
                var g = global.RemoedSecurityGuard.getToken();
                if (g) return g;
            }
        } catch (_e) {}
        try {
            return (
                localStorage.getItem('remoed_student_token') ||
                sessionStorage.getItem('remoed_student_token') ||
                localStorage.getItem('remoed_student_auth') ||
                sessionStorage.getItem('remoed_student_auth') ||
                localStorage.getItem('remoed_user_token') ||
                sessionStorage.getItem('remoed_user_token') ||
                localStorage.getItem('token') ||
                ''
            );
        } catch (_e2) {
            return '';
        }
    }

    function bindNotificationBell(header) {
        if (!header) return;
        var icon = header.querySelector('#notifications-icon');
        var dropdown = header.querySelector('#notifications-dropdown');
        var content = header.querySelector('#notifications-dropdown-content');
        var badge = header.querySelector('#notifications-badge');
        if (!icon || !dropdown) return;
        if (icon.getAttribute('data-notif-click') === '1' || header.getAttribute('data-notif-bound') === '1') {
            return;
        }
        icon.setAttribute('data-notif-click', '1');
        header.setAttribute('data-notif-bound', '1');

        function refresh() {
            loadStudentNotifications(content, badge);
        }

        icon.addEventListener('click', function (e) {
            e.preventDefault();
            e.stopPropagation();
            var open = dropdown.classList.toggle('show');
            if (open) refresh();
        });
        dropdown.addEventListener('click', function (e) {
            e.stopPropagation();
            var item = e.target.closest('[data-id]');
            if (!item) return;
            var id = item.getAttribute('data-id');
            if (!id) return;
            var token = studentAuthToken();
            if (!token) return;
            fetch('/api/student/notifications/' + encodeURIComponent(id) + '/mark-read', {
                method: 'PATCH',
                headers: { Authorization: 'Bearer ' + token },
            }).then(function () {
                refresh();
            }).catch(function () {});
        });
        document.addEventListener('click', function (e) {
            if (icon.contains(e.target) || dropdown.contains(e.target)) return;
            dropdown.classList.remove('show');
        });
        refresh();
        setInterval(refresh, 60 * 1000);

        try {
            var uname =
                localStorage.getItem('username') ||
                localStorage.getItem('studentUsername') ||
                '';
            if (window.RemoedNotifications && uname) {
                var sock = window.RemoedNotifications.joinNotificationSocket('student', uname);
                if (sock) sock.on('notification:new', refresh);
            }
        } catch (_e) {}
    }

    function loadStudentNotifications(content, badge) {
        var token = studentAuthToken();
        if (!token || !content) return;
        var dropdown = content.closest('.nav-dropdown') || content.parentElement;
        if (window.RemoedNotifications && window.RemoedNotifications.bindDropdownExtras) {
            window.RemoedNotifications.bindDropdownExtras(dropdown, {
                role: 'student',
                getToken: studentAuthToken,
                onRefresh: function () {
                    loadStudentNotifications(content, badge);
                },
            });
        }
        fetch('/api/student/notifications', {
            headers: { Authorization: 'Bearer ' + token }
        })
            .then(function (r) {
                return r.json();
            })
            .then(function (data) {
                var list =
                    window.RemoedNotifications && window.RemoedNotifications.unwrapList
                        ? window.RemoedNotifications.unwrapList(data)
                        : (data && data.notifications) || [];
                var unread =
                    window.RemoedNotifications && window.RemoedNotifications.badgeCountFromPayload
                        ? window.RemoedNotifications.badgeCountFromPayload(data, list)
                        : data && typeof data.actionableUnreadCount === 'number'
                          ? data.actionableUnreadCount
                          : list.filter(function (n) {
                                return !n.read;
                            }).length;
                if (window.RemoedNotifications && window.RemoedNotifications.setBadge) {
                    window.RemoedNotifications.setBadge(badge, unread);
                } else if (badge) {
                    badge.textContent = String(unread);
                    badge.style.display = unread > 0 ? 'flex' : 'none';
                }
                if (window.RemoedNotifications && window.RemoedNotifications.renderItems) {
                    window.RemoedNotifications.renderItems(content, list, {
                        limit: 12,
                        role: 'student',
                        retentionDays: (data && data.retentionDays) || 31,
                        filter: window.RemoedNotifications.getFilter
                            ? window.RemoedNotifications.getFilter()
                            : 'all',
                    });
                } else if (!list.length) {
                    content.innerHTML = '<div class="nav-dropdown-item">No notifications</div>';
                }
            })
            .catch(function () {
                content.innerHTML = '<div class="nav-dropdown-item">Could not load notifications</div>';
            });
    }

    global.StudentPageHeader = {
        PAGES: PAGES,
        render: render,
        polishExisting: polishExisting
    };
})(typeof window !== 'undefined' ? window : this);
