/**
 * Shared teacher portal top bar — same design as student Dashboard header:
 * left: icon + page title (black 18px); right: circular profile / notifications / schedule.
 */
(function (global) {
    'use strict';

    var SVG = {
        home:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>',
        calendar:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>',
        settings:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19.14 12.94c.04-.31.06-.63.06-.94 0-.31-.02-.63-.06-.94l2.03-1.58a.49.49 0 00.12-.61l-1.92-3.32a.49.49 0 00-.59-.22l-2.39.96c-.5-.38-1.03-.7-1.62-.94l-.36-2.54a.484.484 0 00-.48-.41h-3.84c-.24 0-.43.17-.47.41l-.36 2.54c-.59.24-1.13.57-1.62.94l-2.39-.96c-.22-.08-.47 0-.59.22L2.74 8.87c-.12.21-.08.47.12.61l2.03 1.58c-.04.31-.06.63-.06.94s.02.63.06.94l-2.03 1.58a.49.49 0 00-.12.61l1.92 3.32c.12.22.37.29.59.22l2.39-.96c.5.38 1.03.7 1.62.94l.36 2.54c.05.24.24.41.48.41h3.84c.24 0 .44-.17.47-.41l.36-2.54c.59-.24 1.13-.56 1.62-.94l2.39.96c.22.08.47 0 .59-.22l1.92-3.32c.12-.22.07-.47-.12-.61l-2.01-1.58zM12 15.6A3.6 3.6 0 1112 8.4a3.6 3.6 0 010 7.2z"/></svg>',
        book:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M18 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zM6 4h5v8l-2.5-1.5L6 12V4z"/></svg>',
        chart:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M3.5 18.49l6-6.01 4 4L22 6.92l-1.41-1.41-7.09 7.97-4-4L2 16.99z"/></svg>',
        growth:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M16 6l2.29 2.29-4.88 4.88-4-4L2 16.59 3.41 18l6-6 4 4 6.3-6.29L22 12V6z"/></svg>',
        money:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M11.8 10.9c-2.27-.59-3-1.2-3-2.15 0-1.09 1.01-1.85 2.7-1.85 1.78 0 2.44.85 2.5 2.1h2.21c-.07-1.72-1.12-3.3-3.21-3.81V3h-3v2.16c-1.94.42-3.5 1.68-3.5 3.61 0 2.31 1.91 3.46 4.7 4.13 2.5.6 3 1.48 3 2.41 0 .69-.49 1.79-2.7 1.79-2.06 0-2.87-.92-2.98-2.1h-2.2c.12 2.19 1.76 3.42 3.68 3.83V21h3v-2.15c1.95-.37 3.5-1.5 3.5-3.55 0-2.84-2.43-3.81-4.7-4.4z"/></svg>',
        gift:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 6h-2.18c.11-.31.18-.65.18-1 0-1.66-1.34-3-3-3-1.05 0-1.96.54-2.5 1.35l-.5.67-.5-.68C10.96 2.54 10.05 2 9 2 7.34 2 6 3.34 6 5c0 .35.07.69.18 1H4c-1.11 0-1.99.89-1.99 2L2 19c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V8c0-1.11-.89-2-2-2zm-5-2c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zM9 4c.55 0 1 .45 1 1s-.45 1-1 1-1-.45-1-1 .45-1 1-1zm11 15H4v-2h16v2zm0-5H4V8h5.08L7 10.83 8.62 12 12 7.4l3.38 4.6L17 10.83 14.92 8H20v6z"/></svg>',
        chat:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M20 2H4c-1.1 0-2 .9-2 2v18l4-4h14c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2z"/></svg>',
        person:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
        monitor:
            '<svg class="nav-title-icon" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M21 2H3c-1.1 0-2 .9-2 2v12c0 1.1.9 2 2 2h7v2H8v2h8v-2h-2v-2h7c1.1 0 2-.9 2-2V4c0-1.1-.9-2-2-2zm0 14H3V4h18v12z"/></svg>'
    };

    var ACTION = {
        person:
            '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>',
        bell:
            '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.89 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>',
        calendar:
            '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><path d="M19 3h-1V1h-2v2H8V1H6v2H5c-1.11 0-1.99.9-1.99 2L3 19c0 1.1.89 2 2 2h14c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 16H5V8h14v11zM7 10h5v5H7z"/></svg>'
    };

    var PAGES = {
        dashboard: { title: 'Dashboard', icon: 'home' },
        'class-schedule': { title: 'Class Schedule', icon: 'calendar' },
        'class-configuration': { title: 'Class Configuration', icon: 'settings' },
        'device-check': { title: 'Device Check', icon: 'monitor' },
        'lessons-library': { title: 'Lessons Library', icon: 'book' },
        'teaching-fee': { title: 'Teaching Fee', icon: 'money' },
        'referral-rewards': { title: 'Referral Rewards', icon: 'gift' },
        'performance-indicator': { title: 'Performance Indicator', icon: 'chart' },
        'professional-development': { title: 'Career Growth', icon: 'growth' },
        messages: { title: 'Messages', icon: 'chat' },
        profile: { title: 'Profile', icon: 'person' },
        'attendance-analysis': { title: 'Attendance Analysis', icon: 'chart' }
    };

    function escapeHtml(s) {
        return String(s)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function render(pageId, opts) {
        opts = opts || {};
        var meta = PAGES[pageId] || { title: opts.title || 'RemoEdPH', icon: opts.icon || 'home' };
        var title = opts.title || meta.title;
        var iconHtml = SVG[opts.icon || meta.icon] || SVG.home;

        var main = document.querySelector('.remoed-main');
        if (!main) {
            // Some teacher pages omit .remoed-main — wrap sidebar + content
            var content = document.querySelector('.remoed-content');
            var sidebarRoot =
                document.getElementById('teacher-sidebar-root') ||
                document.getElementById('sidebar');
            if (content || sidebarRoot) {
                main = document.createElement('div');
                main.className = 'remoed-main';
                var body = document.body;
                var nodes = [];
                if (sidebarRoot) nodes.push(sidebarRoot);
                // include sibling scripts between sidebar and content
                var cursor = sidebarRoot ? sidebarRoot.nextSibling : body.firstChild;
                while (cursor && cursor !== content) {
                    var next = cursor.nextSibling;
                    if (cursor.nodeType === 1 || (cursor.nodeType === 3 && String(cursor.textContent).trim())) {
                        nodes.push(cursor);
                    }
                    cursor = next;
                }
                if (content) nodes.push(content);
                nodes.forEach(function (n) {
                    main.appendChild(n);
                });
                body.insertBefore(main, body.firstChild);
            }
        }
        if (!main) return null;

        var existing = main.querySelector(':scope > .nav-header, :scope > .teacher-page-nav-header');
        if (existing && !opts.force) {
            var h1e = existing.querySelector('.nav-left h1');
            if (h1e) {
                h1e.removeAttribute('style');
                h1e.innerHTML = iconHtml + '<span class="nav-title-text">' + escapeHtml(title) + '</span>';
            }
            document.body.classList.add('has-teacher-page-header');
            return existing;
        }

        var header = document.createElement('div');
        header.className = 'nav-header teacher-page-nav-header';
        header.innerHTML =
            '<div class="nav-left">' +
            '<h1>' +
            iconHtml +
            '<span class="nav-title-text">' +
            escapeHtml(title) +
            '</span></h1></div>' +
            '<div class="nav-right">' +
            '<div class="nav-icon" onclick="window.location.href=\'teacher-profile.html\'" title="My Profile">' +
            ACTION.person +
            '</div>' +
            '<div class="nav-icon primary" onclick="window.location.href=\'teacher-dashboard.html\'" title="Notifications">' +
            ACTION.bell +
            '</div>' +
            '<div class="nav-icon" onclick="window.location.href=\'teacher-class-table.html\'" title="Class Schedule">' +
            ACTION.calendar +
            '</div></div>';

        var content = main.querySelector('.remoed-content');
        if (content) main.insertBefore(header, content);
        else main.insertBefore(header, main.firstChild);

        document.body.classList.add('has-teacher-page-header');
        return header;
    }

    function polishExisting(pageId, opts) {
        opts = opts || {};
        var meta = PAGES[pageId] || { title: 'Dashboard', icon: 'home' };
        var title = opts.title || meta.title;
        var iconHtml = SVG[opts.icon || meta.icon] || SVG.home;
        var header = document.querySelector('.remoed-main > .nav-header');
        if (!header) return render(pageId, opts);
        var h1 = header.querySelector('.nav-left h1');
        if (h1) {
            h1.removeAttribute('style');
            h1.innerHTML = iconHtml + '<span class="nav-title-text">' + escapeHtml(title) + '</span>';
        }
        document.body.classList.add('has-teacher-page-header');
        return header;
    }

    global.TeacherPageHeader = {
        PAGES: PAGES,
        render: render,
        polishExisting: polishExisting
    };
})(typeof window !== 'undefined' ? window : this);
