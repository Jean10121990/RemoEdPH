/**
 * Student Portal – shared sidebar component.
 * Uses teacher sidebar visual style but keeps student menu/routes.
 */
(function (global) {
    'use strict';

    var SVG_STROKE = 'stroke-width="2"';
    var LS_KEY = 'remoed_student_sidebar_collapsed';

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
        { id: 'dashboard', label: 'Dashboard', href: 'student-dashboard.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="3" y="3" width="18" height="18" rx="4"/></svg>' },
        { id: 'leaderboard', label: 'Leaderboard', href: 'leaderboard.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M8 21h8M12 17v4M7 4h10v4a5 5 0 01-10 0V4z"/><path d="M5 8H3a2 2 0 000 4h2M19 8h2a2 2 0 010 4h-2"/></svg>' },
        { id: 'schedule', label: 'My Schedule', href: 'student-class-table.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="3" y="7" width="18" height="13" rx="2"/><path d="M16 3v4M8 3v4"/></svg>' },
        { id: 'book', label: 'Book Class', href: 'student-book.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/><path d="M8 12h8M12 8v8"/></svg>' },
        { id: 'classes', label: 'My Classes', href: 'student-booking-history.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/></svg>' },
        { id: 'games', label: 'Play & Learn', href: 'student-games-activities.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M6 12h4M8 10v4"/><path d="M15 11h.01M18 13h.01"/><rect x="2" y="7" width="20" height="10" rx="5"/></svg>' },
        { id: 'videos', label: 'Videos', href: 'student-videos.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="2" y="7" width="15" height="10" rx="2"/><path d="M17 10l5-3v10l-5-3z"/></svg>' },
        { id: 'messages', label: 'Messages', href: 'student-messages.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M21 11.5a8.38 8.38 0 01-.9 3.8 8.5 8.5 0 01-7.6 4.7 8.38 8.38 0 01-3.8-.9L3 21l1.9-5.7a8.38 8.38 0 01-.9-3.8 8.5 8.5 0 014.7-7.6 8.38 8.38 0 013.8-.9h.5a8.48 8.48 0 018 8v.5z"/></svg>' },
        { id: 'journey', label: 'My Learning Journey', href: 'student-learning-journey.html', studentOnly: true, icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M4 19h16"/><path d="M6 17l4-14 4 10 4-6 2 10"/><circle cx="8" cy="17" r="2"/><circle cx="12" cy="13" r="2"/><circle cx="16" cy="11" r="2"/><circle cx="18" cy="17" r="2"/></svg>' },
        { id: 'garden', label: 'Virtual Garden', href: 'student-virtual-garden.html', studentOnly: true, icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M12 22v-7"/><path d="M9 18h6"/><path d="M7 14c-2-3 1-7 5-9 4 2 7 6 5 9"/><path d="M12 7c1-3 4-4 4-4s0 3-2 5"/><path d="M12 7c-1-3-4-4-4-4s0 3 2 5"/></svg>' },
        { id: 'profile', label: 'My Profile', href: 'student-profile.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"/></svg>' },
        { id: 'level', label: 'My Level', href: 'student-assessment.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M3 3v18h18"/><path d="M7 12h10M7 8h6M7 16h4"/></svg>' },
        { id: 'credits', label: 'My Credits', href: 'student-credits.html', icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><rect x="2" y="6" width="20" height="12" rx="2"/><path d="M2 10h20M7 14h4"/></svg>' },
        { id: 'logout', label: 'Log out', href: null, icon: '<svg fill="none" stroke="currentColor" ' + SVG_STROKE + ' viewBox="0 0 24 24"><path d="M17 16l4-4m0 0l-4-4m4 4H7"/><path d="M3 12a9 9 0 0118 0 9 9 0 01-18 0z"/></svg>', isLogout: true }
    ];

    var KIDS_NAV = {
        dashboard: 1,
        schedule: 1,
        book: 1,
        games: 1,
        videos: 1,
        journey: 1,
        garden: 1,
    };
    var KIDS_PAGES = {
        'student-dashboard.html': 1,
        'student-class-table.html': 1,
        'student-book.html': 1,
        'student-games-activities.html': 1,
        'student-videos.html': 1,
        'student-learning-journey.html': 1,
        'student-virtual-garden.html': 1
    };
    var MODE_KEY = 'remoed_student_view';
    var KIDS_USED_KEY = 'remoed_kids_mode_used';
    var UNLOCK_KEY = 'remoed_parent_unlocked';

    function readMode() {
        try {
            return localStorage.getItem(MODE_KEY) === 'kids' ? 'kids' : 'parents';
        } catch (e) {
            return 'parents';
        }
    }

    function isKidsMode() {
        return readMode() === 'kids';
    }

    function pageFile() {
        var raw = (window.location.pathname || '').replace(/\\/g, '/');
        var file = raw.split('/').pop() || '';
        if (file.indexOf('?') !== -1) file = file.split('?')[0];
        return file;
    }

    function ensureKidsCss() {
        if (isKidsMode() && !document.getElementById('student-kids-font')) {
            var font = document.createElement('link');
            font.id = 'student-kids-font';
            font.rel = 'stylesheet';
            font.href = 'https://fonts.googleapis.com/css2?family=Nunito:wght@700;800&display=swap';
            document.head.appendChild(font);
        }
        if (document.getElementById('student-kids-mode-css')) return;
        var style = document.createElement('style');
        style.id = 'student-kids-mode-css';
        style.textContent =
            'body.student-kids-mode{font-size:18px;font-family:"Nunito",Trebuchet MS,"Segoe UI",sans-serif;background:#fff7ed;}' +
            'body.student-kids-mode .remoed-main,body.student-kids-mode .remoed-content{' +
            'background:radial-gradient(circle at 8% 10%,rgba(251,191,36,.45),transparent 26%),' +
            'radial-gradient(circle at 92% 6%,rgba(244,114,182,.32),transparent 24%),' +
            'radial-gradient(circle at 88% 92%,rgba(52,211,153,.3),transparent 28%),' +
            'radial-gradient(circle at 6% 88%,rgba(56,189,248,.34),transparent 26%),' +
            'linear-gradient(180deg,#fff7ed 0%,#ecfeff 100%);}' +
            'body.student-kids-mode .menu-label{font-size:1.15rem;font-weight:800;}' +
            'body.student-kids-mode .remoed-menu li{min-height:52px;}' +
            'body.student-kids-mode .nav-title-text{font-size:22px!important;font-weight:800;}' +
            'body.student-kids-mode .nav-header{background:linear-gradient(90deg,#fff7ed,#e0f2fe 55%,#fce7f3);border-bottom:3px solid #fbbf24;}' +
            'body.student-kids-mode .remoed-content,body.student-kids-mode .remoed-section{font-size:1.08rem;}' +
            'body.student-kids-mode button,body.student-kids-mode .btn,body.student-kids-mode a.btn,body.student-kids-mode .dash-btn{font-size:1.05rem;min-height:48px;border-radius:999px;font-weight:800;}' +
            'body.student-kids-mode .sidebar-subtitle{font-weight:800;color:#fde68a!important;}' +
            'body.student-kids-mode nav.remoed-sidebar.remoed-sidebar{background:linear-gradient(180deg,#22d3ee 0%,#3b82f6 48%,#8b5cf6 100%)!important;box-shadow:6px 0 24px rgba(59,130,246,.28)!important;}' +
            'body.student-kids-mode .remoed-sidebar .sidebar-title,body.student-kids-mode .remoed-sidebar .remoed-username,body.student-kids-mode nav.remoed-sidebar .remoed-menu li:not(#logout-nav):not(.active){color:#fff!important;}' +
            'body.student-kids-mode nav.remoed-sidebar .remoed-menu li:not(#logout-nav) svg{stroke:#fff;}' +
            'body.student-kids-mode nav.remoed-sidebar .remoed-menu li{margin:5px 12px;border-radius:18px!important;border-left:0!important;background:rgba(255,255,255,.16);}' +
            'body.student-kids-mode nav.remoed-sidebar .remoed-menu li.active{background:#fff!important;color:#1e3a8a!important;}' +
            'body.student-kids-mode nav.remoed-sidebar .remoed-menu li.active .menu-label,' +
            'body.student-kids-mode nav.remoed-sidebar .remoed-menu li.active .remoed-menu-label{color:#1e3a8a!important;}' +
            'body.student-kids-mode nav.remoed-sidebar .remoed-menu li.active svg{stroke:#1e3a8a!important;color:#1e3a8a!important;}' +
            'body.student-kids-mode [data-nav="dashboard"]{box-shadow:inset 7px 0 0 #fde047;}' +
            'body.student-kids-mode [data-nav="schedule"]{box-shadow:inset 7px 0 0 #fb7185;}' +
            'body.student-kids-mode [data-nav="book"]{box-shadow:inset 7px 0 0 #4ade80;}' +
            'body.student-kids-mode [data-nav="games"]{box-shadow:inset 7px 0 0 #c084fc;}' +
            'body.student-kids-mode [data-nav="videos"]{box-shadow:inset 7px 0 0 #38bdf8;}' +
            'body.student-kids-mode [data-nav="journey"]{box-shadow:inset 7px 0 0 #fb923c;}' +
            'body.student-kids-mode [data-nav="garden"]{box-shadow:inset 7px 0 0 #34d399;}' +
            'body.student-kids-mode .dash-next-class{border:3px solid #fbbf24!important;border-radius:28px!important;background:linear-gradient(135deg,#fff7c2,#e0f2fe 55%,#dcfce7)!important;}' +
            'body.student-kids-mode .dash-next-class__actions .dash-btn--secondary,' +
            'body.student-kids-mode .dash-next-class__actions .dash-btn--green ~ .dash-btn--primary{display:none!important;}' +
            'body.student-kids-mode .dash-stats,' +
            'body.student-kids-mode .dash-home-grid,' +
            'body.student-kids-mode #dash-journey-bar-wrap,' +
            'body.student-kids-mode #welcome-trial-toast,' +
            'body.student-kids-mode #subscription-paywall-overlay,' +
            'body.student-kids-mode #free-lesson-cta,' +
            'body.student-kids-mode #free-plan-upgrade,' +
            'body.student-kids-mode #trial-completed-banner,' +
            'body.student-kids-mode #credits-expiry-banner,' +
            'body.student-kids-mode #post-assessment-enroll-banner,' +
            'body.student-kids-mode #reschedule-section,' +
            'body.student-kids-mode .nav-right > .nav-icon,' +
            'body.student-kids-mode #student-eco-chip-count,' +
            'body.student-kids-mode #menu-eco-badge{display:none!important;}' +
            'body.student-kids-mode .dash-journey-progress{border:3px solid #34d399!important;border-radius:24px!important;background:linear-gradient(135deg,#ecfccb,#fce7f3)!important;}' +
            'body.student-kids-mode .kids-progress{display:grid!important;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px;margin:0 0 1rem;}' +
            'body.student-kids-mode .kids-progress__card{display:flex;flex-direction:column;gap:4px;min-height:110px;padding:14px 16px;border-radius:22px;background:#fff;border:3px solid #fbbf24;color:#1e293b;text-decoration:none;}' +
            'body.student-kids-mode .kids-progress__card:nth-child(2){border-color:#38bdf8;}' +
            'body.student-kids-mode .kids-progress__card:nth-child(3){border-color:#34d399;}' +
            'body.student-kids-mode .kids-progress__card:nth-child(4){border-color:#c084fc;}' +
            'body.student-kids-mode .kids-progress__label{margin:0;font-size:0.85rem;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#64748b;}' +
            'body.student-kids-mode .kids-progress__value{margin:0;font-size:1.7rem;font-weight:800;line-height:1.15;color:#0f172a;}' +
            'body.student-kids-mode .kids-progress__note{margin:0;font-size:0.95rem;font-weight:700;color:#334155;}' +
            '@media(max-width:900px){body.student-kids-mode .kids-progress{grid-template-columns:1fr 1fr;}}' +
            'body.student-kids-mode .kids-play-row{display:grid!important;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px;margin:0 0 1.25rem;}' +
            'body.student-kids-mode .kids-play-row a{display:flex;align-items:center;justify-content:center;min-height:88px;padding:16px;border-radius:24px;color:#1e293b;font-weight:800;text-decoration:none;text-align:center;border:3px solid transparent;}' +
            'body.student-kids-mode .kids-play-row a:nth-child(1){background:#f3e8ff;border-color:#c084fc;}' +
            'body.student-kids-mode .kids-play-row a:nth-child(2){background:#e0f2fe;border-color:#38bdf8;}' +
            'body.student-kids-mode .kids-play-row a:nth-child(3){background:#dcfce7;border-color:#34d399;}' +
            '@media(max-width:768px){body.student-kids-mode .kids-play-row{grid-template-columns:1fr;}}' +
            'body.student-kids-mode .remoed-bottom-nav{background:linear-gradient(90deg,#22d3ee,#8b5cf6);}' +
            'body.student-kids-mode .remoed-bottom-nav__link{color:#fff;font-weight:800;}' +
            '.portal-mode-switch{display:inline-flex;align-items:center;gap:8px;margin-right:6px;}' +
            '.portal-mode-switch span{font-weight:800;font-size:13px;color:#94a3b8;}' +
            '.portal-mode-switch span.is-on{color:#166534;}' +
            '.portal-mode-switch span.is-parent{color:#0369a1;}' +
            '.portal-mode-switch button{width:52px;height:30px;border:none;border-radius:999px;background:#47BC3E;position:relative;cursor:pointer;padding:0;}' +
            '.portal-mode-switch button[aria-checked="true"]{background:#1ca7e7;}' +
            '.portal-mode-switch button i{position:absolute;top:3px;left:3px;width:24px;height:24px;border-radius:50%;background:#fff;display:block;transition:transform .15s ease;}' +
            '.portal-mode-switch button[aria-checked="true"] i{transform:translateX(22px);}' +
            'body.student-kids-mode .portal-mode-switch span{font-size:15px;}';
        document.head.appendChild(style);
    }

    function applyKidsChrome() {
        ensureKidsCss();
        document.body.classList.toggle('student-kids-mode', isKidsMode());
        var sub = document.querySelector('.sidebar-subtitle');
        if (sub) sub.textContent = isKidsMode() ? 'Kids mode' : 'Student Portal';
        var journeySummary = document.getElementById('dash-journey-summary');
        if (journeySummary && journeySummary.getAttribute('data-kids-place')) {
            journeySummary.textContent = isKidsMode()
                ? 'You are in ' + journeySummary.getAttribute('data-kids-place')
                : journeySummary.getAttribute('data-parent-summary') || journeySummary.textContent;
        }
        if (!isKidsMode()) return;
        var file = pageFile();
        if (file && !KIDS_PAGES[file] && (file.indexOf('student-') === 0 || file === 'leaderboard.html')) {
            window.location.replace('student-dashboard.html');
        }
    }

    function studentToken() {
        try {
            return (
                localStorage.getItem('remoed_student_token') ||
                sessionStorage.getItem('remoed_student_token') ||
                localStorage.getItem('token') ||
                ''
            );
        } catch (e) {
            return '';
        }
    }

    function rerenderPortal() {
        applyKidsChrome();
        if (global.StudentSidebar && document.getElementById('student-sidebar-root')) {
            var active = getActiveFromPath();
            global.StudentSidebar.render('student-sidebar-root', active);
        }
        if (global.RemoedPortalLayout && typeof global.RemoedPortalLayout.refreshChrome === 'function') {
            global.RemoedPortalLayout.refreshChrome();
        }
        document.querySelectorAll('.portal-mode-switch button').forEach(function (btn) {
            btn.setAttribute('aria-checked', isKidsMode() ? 'false' : 'true');
        });
        document.querySelectorAll('.portal-mode-kids').forEach(function (el) {
            el.className = 'portal-mode-kids' + (isKidsMode() ? ' is-on' : '');
        });
        document.querySelectorAll('.portal-mode-parents').forEach(function (el) {
            el.className = 'portal-mode-parents' + (isKidsMode() ? '' : ' is-parent');
        });
    }

    function openPinModal(kind) {
        var old = document.getElementById('parent-pin-modal');
        if (old && old.parentNode) old.parentNode.removeChild(old);
        var wrap = document.createElement('div');
        wrap.id = 'parent-pin-modal';
        wrap.style.cssText = 'position:fixed;inset:0;background:rgba(15,23,42,.45);z-index:10060;display:flex;align-items:center;justify-content:center;padding:16px;';
        var card = document.createElement('form');
        card.style.cssText = 'background:#fff;border-radius:16px;max-width:420px;width:100%;box-sizing:border-box;padding:20px;box-shadow:0 12px 40px rgba(0,0,0,.18);overflow:hidden;';
        var title = document.createElement('h2');
        title.style.cssText = 'margin:0 0 8px;font-size:1.35rem;';
        title.textContent = kind === 'setup' ? 'Set a parent PIN' : 'Parents mode';
        var copy = document.createElement('p');
        copy.style.cssText = 'margin:0 0 12px;line-height:1.4;';
        copy.textContent = kind === 'setup'
            ? 'Choose a 4-digit PIN. Your child needs this PIN before Parents mode can open. Kids mode does not need a PIN.'
            : 'Enter the parent PIN to open Parents mode.';
        card.appendChild(title);
        card.appendChild(copy);
        function field(name, label) {
            var lab = document.createElement('label');
            lab.textContent = label;
            lab.style.cssText = 'display:block;font-weight:700;margin:8px 0 4px;';
            var input = document.createElement('input');
            input.name = name;
            input.type = 'password';
            input.inputMode = 'numeric';
            input.pattern = '[0-9]*';
            input.maxLength = 4;
            input.autocomplete = 'off';
            input.required = true;
            input.style.cssText = 'box-sizing:border-box;display:block;width:100%;max-width:100%;font-size:1.4rem;letter-spacing:.2em;padding:10px 12px;border:1px solid #cbd5e1;border-radius:10px;';
            card.appendChild(lab);
            card.appendChild(input);
        }
        field('pin', '4-digit PIN');
        if (kind === 'setup') field('confirm', 'Type the PIN again');
        var msg = document.createElement('p');
        msg.style.cssText = 'min-height:1.2em;color:#991b1b;';
        var row = document.createElement('div');
        row.style.cssText = 'display:flex;flex-wrap:wrap;gap:8px;margin-top:8px;max-width:100%;';
        var save = document.createElement('button');
        save.type = 'submit';
        save.textContent = kind === 'setup' ? 'Save PIN' : 'Open Parents mode';
        save.style.cssText = 'box-sizing:border-box;flex:1 1 auto;min-width:0;max-width:100%;background:#1ca7e7;color:#fff;border:none;border-radius:10px;padding:10px 12px;font-weight:800;cursor:pointer;';
        var cancel = document.createElement('button');
        cancel.type = 'button';
        cancel.textContent = 'Stay in Kids mode';
        cancel.style.cssText = 'box-sizing:border-box;flex:1 1 auto;min-width:0;max-width:100%;background:#e2e8f0;border:none;border-radius:10px;padding:10px 12px;cursor:pointer;';
        cancel.addEventListener('click', function () {
            if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
        });
        row.appendChild(save);
        row.appendChild(cancel);
        card.appendChild(row);
        card.appendChild(msg);
        card.addEventListener('submit', function (ev) {
            ev.preventDefault();
            var pin = card.pin.value.trim();
            var token = studentToken();
            if (!/^\d{4}$/.test(pin)) {
                msg.textContent = 'Use 4 numbers.';
                return;
            }
            save.disabled = true;
            var url = kind === 'setup' ? '/api/student/portal-mode/pin' : '/api/student/portal-mode/verify';
            var body = kind === 'setup' ? { pin: pin, confirm: card.confirm.value.trim() } : { pin: pin };
            fetch(url, {
                method: 'POST',
                credentials: 'include',
                headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            }).then(function (r) {
                return r.json().then(function (j) { return { ok: r.ok, j: j }; });
            }).then(function (res) {
                if (!res.ok || !res.j.success) throw new Error((res.j && res.j.message) || 'Could not check the PIN');
                try {
                    sessionStorage.setItem(UNLOCK_KEY, '1');
                    localStorage.setItem(MODE_KEY, 'parents');
                } catch (e) {}
                if (wrap.parentNode) wrap.parentNode.removeChild(wrap);
                rerenderPortal();
            }).catch(function (err) {
                save.disabled = false;
                msg.textContent = err.message || 'Could not check the PIN';
            });
        });
        wrap.appendChild(card);
        document.body.appendChild(wrap);
        var first = card.querySelector('input');
        if (first) first.focus();
    }

    function requestParentsMode() {
        var token = studentToken();
        fetch('/api/student/portal-mode', {
            credentials: 'include',
            headers: { Authorization: 'Bearer ' + token }
        }).then(function (r) { return r.json(); }).then(function (j) {
            openPinModal(j && j.pinSet ? 'verify' : 'setup');
        }).catch(function () {
            openPinModal('verify');
        });
    }

    function setKidsMode() {
        try {
            localStorage.setItem(MODE_KEY, 'kids');
            localStorage.setItem(KIDS_USED_KEY, '1');
            sessionStorage.removeItem(UNLOCK_KEY);
        } catch (e) {}
        rerenderPortal();
    }

    global.RemoedStudentPortalMode = {
        isKids: isKidsMode,
        mount: function (header) {
            if (!header) return;
            var right = header.querySelector('.nav-right');
            if (!right || right.querySelector('.portal-mode-switch')) return;
            ensureKidsCss();
            var box = document.createElement('div');
            box.className = 'portal-mode-switch';
            box.innerHTML = '<span class="portal-mode-kids">Kids</span><button type="button" role="switch" aria-label="Parents mode or Kids mode"><i></i></button><span class="portal-mode-parents">Parents</span>';
            var btn = box.querySelector('button');
            function paint() {
                var parents = !isKidsMode();
                btn.setAttribute('aria-checked', parents ? 'true' : 'false');
                box.querySelector('.portal-mode-kids').className = 'portal-mode-kids' + (parents ? '' : ' is-on');
                box.querySelector('.portal-mode-parents').className = 'portal-mode-parents' + (parents ? ' is-parent' : '');
            }
            paint();
            btn.addEventListener('click', function () {
                if (isKidsMode()) requestParentsMode();
                else setKidsMode();
            });
            right.insertBefore(box, right.firstChild);
            applyKidsChrome();
        },
        apply: applyKidsChrome
    };

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
            case 'student-messages.html':
                return 'messages';
            case 'student-learning-journey.html':
                return 'journey';
            case 'student-virtual-garden.html':
                return 'garden';
            case 'leaderboard.html':
                return 'leaderboard';
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

    function getBookNavSpec() {
        if (global.RemoedStudentPortalMode && global.RemoedStudentPortalMode.isKids()) {
            return { label: 'Book a Class', href: 'student-book.html' };
        }
        try {
            var raw = localStorage.getItem('studentFreePlan');
            if (raw) {
                var plan = JSON.parse(raw);
                if (plan && plan.isFree === true && (plan.canBookThisMonth === false || plan.sequenceDone === true)) {
                    return { label: 'Subscribe to Book', href: 'student-credits.html' };
                }
            }
        } catch (e) {}
        return { label: 'Book Class', href: 'student-book.html' };
    }

    function escapeLabel(text) {
        return String(text).replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
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
        document.body.classList.toggle('student-sidebar-collapsed', !!collapsed);
        var toggleBtn = nav.querySelector('.sidebar-collapse-toggle');
        if (toggleBtn) {
            toggleBtn.setAttribute('aria-expanded', collapsed ? 'false' : 'true');
            toggleBtn.title = collapsed ? 'Expand sidebar' : 'Collapse sidebar';
            toggleBtn.setAttribute('aria-label', toggleBtn.title);
        }
    }

    function refreshBookNavItem(container) {
        if (!container) return;
        var li = container.querySelector('li[data-nav="book"]');
        if (!li) return;
        var spec = getBookNavSpec();
        var icon = MENU_ITEMS.filter(function (x) { return x.id === 'book'; })[0].icon;
        li.setAttribute('title', spec.label);
        li.innerHTML = icon + '<span class="menu-label">' + escapeLabel(spec.label) + '</span>';
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
            (typeof RemoedUserSession !== 'undefined' && RemoedUserSession.getUserToken && RemoedUserSession.getUserToken()) ||
            localStorage.getItem('remoed_student_token') ||
            sessionStorage.getItem('remoed_student_token') ||
            localStorage.getItem('remoed_student_auth') ||
            sessionStorage.getItem('remoed_student_auth') ||
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

            var imgSrc = String(data.profile.profilePicture || data.profile.photo || '').trim();
            if (imgSrc && imgSrc !== 'null' && imgSrc !== 'undefined' && profileImageEl) {
                profileImageEl.onload = function () {
                    profileImageEl.style.display = 'block';
                    if (avatarTextEl) avatarTextEl.style.display = 'none';
                };
                profileImageEl.onerror = function () {
                    profileImageEl.style.display = 'none';
                    profileImageEl.removeAttribute('src');
                    if (avatarTextEl) avatarTextEl.style.display = '';
                };
                profileImageEl.src = imgSrc;
            } else if (avatarTextEl) {
                if (profileImageEl) {
                    profileImageEl.style.display = 'none';
                    profileImageEl.removeAttribute('src');
                }
                avatarTextEl.style.display = '';
            }

            var acct = data.profile.accountStatus || 'standard';
            try {
                localStorage.setItem('studentAccountStatus', acct);
                localStorage.setItem('studentHasFreeTrial', data.profile.hasFreeTrial ? '1' : '0');
                localStorage.setItem('studentIsSubscribed', data.profile.isSubscribed ? '1' : '0');
                if (data.profile.freePlan) {
                    localStorage.setItem('studentFreePlan', JSON.stringify(data.profile.freePlan));
                }
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

        // Hard cleanup: remove floating chrome toggles so collapse matches teacher (width slide, not off-canvas).
        try {
            var legacy = document.getElementById('sidebarToggle');
            if (legacy) legacy.remove();
            var legacyClose = document.getElementById('sidebarClose');
            if (legacyClose) legacyClose.remove();
            document.querySelectorAll('.mobile-hamburger, .mobile-sidebar-overlay').forEach(function (el) {
                try { el.remove(); } catch (_e) {}
            });
            document.body.classList.remove('remoed-portal-sidebar-mounted', 'remoed-desktop-sidebar-collapsed');
        } catch (_e) {}

        var active = activePageId || getActiveFromPath();
        var showJourney = shouldShowLearningJourneyNav();
        var kids = global.RemoedStudentPortalMode && global.RemoedStudentPortalMode.isKids();
        var navItemsHtml = MENU_ITEMS.filter(function (item) {
            if (item.isLogout) return false;
            if (kids && !KIDS_NAV[item.id]) return false;
            if (item.studentOnly && !showJourney) return false;
            return true;
        }).map(function (item) {
            var activeClass = (item.id === active) ? ' class="active"' : '';
            var dataNav = ' data-nav="' + item.id + '"';
            var label = item.label;
            var bookSpec = null;
            if (item.id === 'book') {
                bookSpec = getBookNavSpec();
                label = bookSpec.label;
            }
            var titleAttr = ' title="' + escapeLabel(label) + '"';
            var inner = item.icon + '<span class="menu-label">' + escapeLabel(label) + '</span>';
            if (item.id === 'garden') {
                inner += '<span class="menu-eco-badge" id="menu-eco-badge" style="display:none;">0</span>';
            }
            if (item.id === 'book') {
                return '<li' + titleAttr + activeClass + dataNav + ' onclick="window.location.href=\'' + bookSpec.href + '\'">' + inner + '</li>';
            }
            return '<li' + titleAttr + activeClass + dataNav + ' onclick="window.location.href=\'' + item.href + '\'">' + inner + '</li>';
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
              escapeLabel(logoutItem.label) +
              '">' +
              logoutItem.icon +
              '<span class="menu-label">' +
              escapeLabel(logoutItem.label) +
              '</span></button>'
            : '';

        container.innerHTML =
            '<nav class="remoed-sidebar student-sidebar">' +
            '  <div class="sidebar-header">' +
            '    <div class="sidebar-header-inner">' +
            '      <img class="sidebar-logo-img" src="images/remoed-logo-new.png" alt="RemoEdPH" onerror="this.src=\'images/remoed-logo.png\'">' +
            '      <div class="sidebar-brand">' +
            '        <div class="sidebar-title">RemoEdPH</div>' +
            '        <div class="sidebar-subtitle">' + (kids ? 'Kids mode' : 'Student Portal') + '</div>' +
            '      </div>' +
            '      <button type="button" class="sidebar-collapse-toggle" aria-label="Collapse sidebar" title="Collapse sidebar">' +
            svgBars() +
            '      </button>' +
            '    </div>' +
            '  </div>' +
            '  <div class="sidebar-user">' +
            '    <div class="sidebar-user-inner">' +
            '      <div id="remoed-avatar"' +
            (kids ? '' : ' onclick="window.location.href=\'student-profile.html\'" style="cursor:pointer;"') +
            '>' +
            '        <img id="profile-image" alt="" style="width:100%;height:100%;border-radius:50%;object-fit:cover;display:none;">' +
            '        <span id="avatar-text">S</span>' +
            '      </div>' +
            '      <span class="remoed-username" id="remoed-username">Hi, Student</span>' +
            '    </div>' +
            '  </div>' +
            '  <ul class="remoed-menu">' + navItemsHtml + '</ul>' +
            '  <div class="sidebar-logout-footer">' + logoutHtml + '</div>' +
            '</nav>';

        injectStudentNoMotionStyles();
        if (global.RemoedStudentPortalMode) global.RemoedStudentPortalMode.apply();

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
                    localStorage.getItem('remoed_student_token') ||
                    sessionStorage.getItem('remoed_student_token') ||
                    localStorage.getItem('remoed_student_auth') ||
                    sessionStorage.getItem('remoed_student_auth') ||
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
                        localStorage.clear();
                        sessionStorage.clear();
                    } catch (e) {}
                    window.location.replace('/login/');
                });
            });
        }

        applyGreetingFromStorage(container);
        loadProfileIntoSidebar(container);
        loadEcoDropBadge(container);
        queuePortalLayoutMount();
        // Mini-sidebar collapse is handled locally (same width animation as teacher); no floating desktop toggle.
    }

    function loadEcoDropBadge(container) {
        try {
            var badge = (container && container.querySelector('#menu-eco-badge')) || document.getElementById('menu-eco-badge');
            var tok =
                (typeof RemoedUserSession !== 'undefined' && RemoedUserSession.getUserToken && RemoedUserSession.getUserToken()) ||
                localStorage.getItem('remoed_student_token') ||
                localStorage.getItem('remoed_student_auth') ||
                localStorage.getItem('studentToken') ||
                localStorage.getItem('token') ||
                '';
            if (!tok) return;
            fetch('/api/student/eco-drops', {
                headers: { Authorization: 'Bearer ' + tok },
                credentials: 'include',
            })
                .then(function (r) {
                    return r.ok ? r.json() : null;
                })
                .then(function (data) {
                    if (!data) return;
                    var n = Number(data.ecoDropsBalance) || 0;
                    if (badge) {
                        badge.textContent = n > 99 ? '99+' : String(n);
                        badge.style.display = 'inline-flex';
                    }
                    if (global.RemoEdEcoDropsBadge && RemoEdEcoDropsBadge.update) {
                        RemoEdEcoDropsBadge.update(n);
                    }
                })
                .catch(function () {});
        } catch (_e) {}
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
        s.src = 'js/portal-layout.js?v=kids-mode-1';
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

    function injectStudentNoMotionStyles() {
        if (document.getElementById('student-no-motion-style')) return;
        var style = document.createElement('style');
        style.id = 'student-no-motion-style';
        /* Do not target nav.remoed-sidebar itself — tablet/desktop rail still uses it. */
        style.textContent = [
            '.student-portal .remoed-sidebar .sidebar-header,',
            '.student-portal .remoed-sidebar .sidebar-header *,',
            '.student-portal .remoed-sidebar .sidebar-user,',
            '.student-portal .remoed-sidebar .sidebar-user *,',
            '.student-portal .remoed-sidebar .remoed-menu li,',
            '.student-portal .remoed-sidebar .remoed-menu li * {',
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

