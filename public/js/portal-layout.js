/**
 * Phone app chrome for portals using .remoed-main.
 * ≤768: hide the sidebar; titled top bar; 4 tabs + More sheet on document.body.
 * Tablet: narrow icon rail is CSS-only (769–1024px) in mobile-first.css.
 * Live classroom is skipped (owns its Lesson/Camera/Chat dock).
 */
(function (global) {
  'use strict';

  var MQ_MOBILE = '(max-width: 768px)';
  var TAB_COUNT = 4;

  /** Exact 4 bottom-tab destinations per role. Overflow goes in the More sheet. */
  var BOTTOM_TABS = {
    student: ['dashboard', 'book', 'schedule', 'messages'],
    teacher: ['dashboard', 'class-schedule', 'class-configuration', 'messages'],
    admin: ['dashboard', 'messages', 'reports', 'settings']
  };

  var MORE_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
    '<circle cx="6" cy="6" r="1.6"/><circle cx="12" cy="6" r="1.6"/><circle cx="18" cy="6" r="1.6"/>' +
    '<circle cx="6" cy="12" r="1.6"/><circle cx="12" cy="12" r="1.6"/><circle cx="18" cy="12" r="1.6"/>' +
    '<circle cx="6" cy="18" r="1.6"/><circle cx="12" cy="18" r="1.6"/><circle cx="18" cy="18" r="1.6"/>' +
    '</svg>';

  var BACK_SVG =
    '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" aria-hidden="true">' +
    '<path d="M15 18l-6-6 6-6"/>' +
    '</svg>';

  function ensureHeaderActionStyles() {
    if (document.getElementById('remoed-header-actions-css')) return;
    var l = document.createElement('link');
    l.id = 'remoed-header-actions-css';
    l.rel = 'stylesheet';
    l.href = 'css/portal-header-actions.css?v=header-actions-2';
    document.head.appendChild(l);
  }

  /** Move the panel onto document.body so a 40px bell chip cannot shrink it. */
  function setNavDropdownOpen(dropdown, open) {
    if (!dropdown) return false;
    if (!dropdown.__remoedHome) {
      dropdown.__remoedHome = {
        parent: dropdown.parentNode,
        next: dropdown.nextSibling
      };
    }
    if (open) {
      var openEls = document.querySelectorAll('.nav-dropdown.show');
      for (var i = 0; i < openEls.length; i++) {
        if (openEls[i] !== dropdown) setNavDropdownOpen(openEls[i], false);
      }
      if (dropdown.parentNode !== document.body) {
        document.body.appendChild(dropdown);
      }
      dropdown.classList.add('show');
    } else {
      dropdown.classList.remove('show');
      var home = dropdown.__remoedHome;
      if (home && home.parent && dropdown.parentNode !== home.parent) {
        if (home.next && home.next.parentNode === home.parent) {
          home.parent.insertBefore(dropdown, home.next);
        } else {
          home.parent.appendChild(dropdown);
        }
      }
    }
    return !!open;
  }
  global.remoedSetNavDropdownOpen = setNavDropdownOpen;

  function isMobile() {
    return global.matchMedia && global.matchMedia(MQ_MOBILE).matches;
  }

  function appendPreservingScroll(parent, node) {
    var x = global.scrollX || 0;
    var y = global.scrollY || 0;
    parent.appendChild(node);
    if ((global.scrollY || 0) !== y || (global.scrollX || 0) !== x) {
      global.scrollTo(x, y);
    }
  }

  function installScrollSnapGuard() {
    if (!document.body || document.body.getAttribute('data-remoed-scroll-guard') === '1') return;
    document.body.setAttribute('data-remoed-scroll-guard', '1');
    try {
      document.documentElement.style.overflowAnchor = 'none';
      document.body.style.overflowAnchor = 'none';
    } catch (e0) { /* ignore */ }

    var lastY = global.scrollY || 0;
    var restoring = false;
    global.addEventListener(
      'scroll',
      function () {
        if (!isMobile() || restoring) {
          lastY = global.scrollY || 0;
          return;
        }
        var y = global.scrollY || document.documentElement.scrollTop || 0;
        var max = Math.max(
          0,
          (document.documentElement.scrollHeight || 0) - (global.innerHeight || 0)
        );
        var jumpedToEnd =
          max > 120 && y >= max - 4 && lastY < max - 60 && y - lastY > 50;
        if (jumpedToEnd) {
          restoring = true;
          global.scrollTo(0, lastY);
          restoring = false;
          return;
        }
        lastY = y;
      },
      { passive: true }
    );
  }

  function closeMore() {
    document.body.classList.remove('remoed-more-open', 'remoed-drawer-open');
    var moreBtn = document.getElementById('remoed-more-btn');
    if (moreBtn) moreBtn.setAttribute('aria-expanded', 'false');
    var sheet = document.getElementById('remoed-more-sheet');
    if (sheet) sheet.setAttribute('hidden', '');
    document.body.style.overflow = '';
  }

  function openMore() {
    ensureMoreSheet();
    document.body.classList.add('remoed-more-open');
    var moreBtn = document.getElementById('remoed-more-btn');
    if (moreBtn) moreBtn.setAttribute('aria-expanded', 'true');
    var sheet = document.getElementById('remoed-more-sheet');
    if (sheet) sheet.removeAttribute('hidden');
    document.body.style.overflow = 'hidden';
  }

  function toggleMore() {
    if (document.body.classList.contains('remoed-more-open')) {
      closeMore();
    } else {
      openMore();
    }
  }

  /** Back-compat for portal-sidebar-chrome.js — More sheet, not a sidebar drawer. */
  function closeDrawer() {
    closeMore();
  }

  function openDrawer() {
    openMore();
  }

  function toggleDrawer() {
    toggleMore();
  }

  function hrefFromMenuLi(li) {
    if (!li) return null;
    var oc = li.getAttribute('onclick') || '';
    var m = oc.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
    if (m) return m[1];
    m = oc.match(/href\s*=\s*['"]([^'"]+)['"]/);
    if (m) return m[1];
    var a = li.querySelector('a[href]');
    if (a && a.getAttribute('href')) return a.getAttribute('href');
    return null;
  }

  function fullLabelFromMenuLi(li) {
    var lab =
      li.querySelector &&
      (li.querySelector('.remoed-menu-label') || li.querySelector('.menu-label'));
    if (lab && lab.textContent) {
      return lab.textContent.replace(/\s+/g, ' ').trim();
    }
    var text = '';
    li.childNodes.forEach(function (n) {
      if (n.nodeType === 3) text += n.textContent;
    });
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) text = (li.textContent || '').replace(/\s+/g, ' ').trim();
    return text;
  }

  function shortLabel(text) {
    text = (text || '').replace(/\s+/g, ' ').trim();
    if (text.length > 12) return text.slice(0, 11) + '\u2026';
    return text;
  }

  function currentPageBasename() {
    var p = (global.location.pathname || '').replace(/\\/g, '/');
    var seg = p.split('/').pop() || '';
    if (seg.indexOf('?') !== -1) seg = seg.split('?')[0];
    return seg.toLowerCase();
  }

  function hrefBasename(href) {
    if (!href) return '';
    var path = href.split('#')[0].split('?')[0];
    var seg = path.replace(/\\/g, '/').split('/').pop() || '';
    return seg.toLowerCase();
  }

  function portalRoleFromNav(sideNav) {
    if (sideNav && sideNav.classList && sideNav.classList.contains('admin-sidebar')) {
      return 'admin';
    }
    var root = sideNav && sideNav.closest ? sideNav.closest('[id$="-sidebar-root"]') : null;
    var rid = (root && root.id) || '';
    if (rid.indexOf('student') === 0) return 'student';
    if (rid.indexOf('admin') === 0) return 'admin';
    if (rid.indexOf('teacher') === 0) return 'teacher';
    try {
      if (document.body && document.body.classList.contains('student-portal')) return 'student';
      if (document.body && document.body.classList.contains('admin-portal')) return 'admin';
    } catch (e0) { /* ignore */ }
    return 'teacher';
  }

  function collectNavEls(menu) {
    var map = lisByNavId(menu);
    var nav = menu.closest && menu.closest('nav.remoed-sidebar');
    var logout =
      (nav && (nav.querySelector('#logout-nav') || nav.querySelector('[data-nav="logout"]'))) ||
      document.getElementById('logout-nav');
    if (logout && !map.byId.logout) {
      map.all.push(logout);
      map.byId.logout = logout;
    }
    return map;
  }

  function lisByNavId(menu) {
    var all = Array.prototype.slice.call(menu.querySelectorAll('li[data-nav], button[data-nav]'));
    var byId = {};
    all.forEach(function (el) {
      var id = el.getAttribute('data-nav');
      if (id) byId[id] = el;
    });
    return { all: all, byId: byId };
  }

  function pickTabLis(menu, role) {
    var map = lisByNavId(menu);
    var ids = BOTTOM_TABS[role] || BOTTOM_TABS.teacher;
    var picked = [];
    ids.forEach(function (id) {
      var el = map.byId[id];
      if (!el) return;
      if (el.getAttribute('data-logout')) return;
      var href = hrefFromMenuLi(el);
      if (!href) return;
      picked.push(el);
    });
    return picked.slice(0, TAB_COUNT);
  }

  function isLogoutEl(el) {
    return !!(
      el &&
      (el.getAttribute('data-logout') === '1' ||
        el.getAttribute('data-nav') === 'logout' ||
        el.id === 'logout-nav')
    );
  }

  function triggerLogout() {
    closeMore();
    var el =
      document.getElementById('logout-nav') ||
      document.querySelector('[data-nav="logout"]');
    if (el) {
      el.click();
      return;
    }
    try {
      if (global.RemoedUserSession && typeof global.RemoedUserSession.logoutToUnifiedLogin === 'function') {
        global.RemoedUserSession.logoutToUnifiedLogin();
        return;
      }
    } catch (e) { /* ignore */ }
    global.location.replace('/login/');
  }

  function fillLinkFromMenuEl(a, el, opts) {
    opts = opts || {};
    var href = hrefFromMenuLi(el);
    var label = fullLabelFromMenuLi(el);
    var short = opts.short ? shortLabel(label) : label;
    if (href && !isLogoutEl(el)) {
      a.href = href;
    } else {
      a.href = '#';
      a.setAttribute('role', 'button');
    }
    var svg = el.querySelector('svg');
    if (svg) a.appendChild(svg.cloneNode(true));
    var span = document.createElement('span');
    span.className = opts.labelClass || 'remoed-bottom-nav__label';
    span.textContent = short;
    a.appendChild(span);
    return { href: href, label: label };
  }

  function pageMatchesHref(here, href) {
    var base = hrefBasename(href);
    if (!base || !here) return false;
    if (here === base) return true;
    if (here.replace(/^\/+/, '') === base) return true;
    return false;
  }

  function isTabPage(tabLis, here) {
    return tabLis.some(function (el) {
      return pageMatchesHref(here, hrefFromMenuLi(el));
    });
  }

  function buildBottomNav(sideNav) {
    if (document.getElementById('remoed-bottom-nav')) return;
    var menu = sideNav && sideNav.querySelector('.remoed-menu');
    if (!menu) return;

    var role = portalRoleFromNav(sideNav);
    var tabLis = pickTabLis(menu, role);
    var here = currentPageBasename();
    var onTab = isTabPage(tabLis, here);

    var bar = document.createElement('nav');
    bar.id = 'remoed-bottom-nav';
    bar.className = 'remoed-bottom-nav';
    bar.setAttribute('aria-label', 'Primary pages');

    tabLis.forEach(function (el) {
      var a = document.createElement('a');
      a.className = 'remoed-bottom-nav__link';
      var meta = fillLinkFromMenuEl(a, el, { short: true });
      if (pageMatchesHref(here, meta.href)) {
        a.setAttribute('aria-current', 'page');
        a.classList.add('is-active');
      }
      a.addEventListener('click', function () {
        closeMore();
      });
      bar.appendChild(a);
    });

    var moreBtn = document.createElement('button');
    moreBtn.type = 'button';
    moreBtn.id = 'remoed-more-btn';
    moreBtn.className = 'remoed-bottom-nav__link remoed-bottom-nav__more';
    moreBtn.setAttribute('aria-expanded', 'false');
    moreBtn.setAttribute('aria-controls', 'remoed-more-sheet');
    moreBtn.innerHTML = MORE_SVG + '<span class="remoed-bottom-nav__label">More</span>';
    if (!onTab) {
      moreBtn.classList.add('is-active');
      moreBtn.setAttribute('aria-current', 'page');
    }
    moreBtn.addEventListener('click', function (ev) {
      ev.preventDefault();
      toggleMore();
    });
    bar.appendChild(moreBtn);

    appendPreservingScroll(document.body, bar);
    document.body.classList.add('remoed-has-bottom-nav', 'remoed-has-app-shell');
    bar._tabLis = tabLis;
    bar._menu = menu;
    bar._role = role;
  }

  function ensureMoreSheet() {
    var existing = document.getElementById('remoed-more-sheet');
    if (existing) {
      populateMoreSheet(existing);
      return existing;
    }

    var sheet = document.createElement('div');
    sheet.id = 'remoed-more-sheet';
    sheet.className = 'remoed-more-sheet';
    sheet.setAttribute('hidden', '');
    sheet.innerHTML =
      '<div class="remoed-more-sheet__backdrop" data-remoed-more-dismiss="1"></div>' +
      '<div class="remoed-more-sheet__panel" role="dialog" aria-modal="true" aria-labelledby="remoed-more-title">' +
      '  <div class="remoed-more-sheet__grab" aria-hidden="true"></div>' +
      '  <h2 id="remoed-more-title" class="remoed-more-sheet__title">More</h2>' +
      '  <nav class="remoed-more-sheet__list" aria-label="More pages"></nav>' +
      '</div>';
    appendPreservingScroll(document.body, sheet);
    sheet.addEventListener('click', function (ev) {
      if (ev.target && ev.target.getAttribute && ev.target.getAttribute('data-remoed-more-dismiss')) {
        closeMore();
      }
    });
    populateMoreSheet(sheet);
    return sheet;
  }

  function populateMoreSheet(sheet) {
    var list = sheet.querySelector('.remoed-more-sheet__list');
    if (!list) return;
    var bar = document.getElementById('remoed-bottom-nav');
    var menu = (bar && bar._menu) || document.querySelector('nav.remoed-sidebar .remoed-menu');
    if (!menu) return;
    var role = (bar && bar._role) || portalRoleFromNav(document.querySelector('nav.remoed-sidebar'));
    var tabIds = {};
    (BOTTOM_TABS[role] || []).forEach(function (id) {
      tabIds[id] = true;
    });
    var map = collectNavEls(menu);
    var here = currentPageBasename();
    list.innerHTML = '';

    map.all.forEach(function (el) {
      var id = el.getAttribute('data-nav') || '';
      if (tabIds[id] && !isLogoutEl(el)) return;
      var a = document.createElement('a');
      a.className = 'remoed-more-sheet__item';
      if (isLogoutEl(el)) {
        a.classList.add('remoed-more-sheet__item--logout');
        fillLinkFromMenuEl(a, el, { short: false, labelClass: 'remoed-more-sheet__label' });
        a.addEventListener('click', function (ev) {
          ev.preventDefault();
          triggerLogout();
        });
      } else {
        var meta = fillLinkFromMenuEl(a, el, { short: false, labelClass: 'remoed-more-sheet__label' });
        if (pageMatchesHref(here, meta.href)) {
          a.classList.add('is-active');
          a.setAttribute('aria-current', 'page');
        }
        a.addEventListener('click', function () {
          closeMore();
        });
      }
      list.appendChild(a);
    });
  }

  function pageTitleFromChrome(tabLis, here) {
    var headerText = '';
    var titleSpan = document.querySelector(
      '.remoed-main > .nav-header .nav-title-text, .student-page-nav-header .nav-title-text, .teacher-page-nav-header .nav-title-text'
    );
    if (titleSpan && titleSpan.textContent) {
      headerText = titleSpan.textContent.replace(/\s+/g, ' ').trim();
    }
    if (headerText) return headerText;

    var match = null;
    (tabLis || []).forEach(function (el) {
      if (pageMatchesHref(here, hrefFromMenuLi(el))) match = el;
    });
    if (!match) {
      var menu = document.querySelector('nav.remoed-sidebar .remoed-menu');
      if (menu) {
        Array.prototype.slice.call(menu.querySelectorAll('[data-nav]')).some(function (el) {
          if (pageMatchesHref(here, hrefFromMenuLi(el))) {
            match = el;
            return true;
          }
          return false;
        });
      }
    }
    if (match) return fullLabelFromMenuLi(match);

    var doc = (document.title || '').replace(/\s*[—\-]\s*RemoEdPH.*$/i, '').trim();
    return doc || 'RemoEdPH';
  }

  function goBack(tabLis) {
    try {
      if (global.history && global.history.length > 1) {
        global.history.back();
        return;
      }
    } catch (e) { /* ignore */ }
    var first = tabLis && tabLis[0];
    var href = hrefFromMenuLi(first);
    global.location.href = href || 'student-dashboard.html';
  }

  function buildAppTopbar(main, tabLis) {
    var shell = document.getElementById('remoed-mobile-shell');
    if (shell) return shell;

    var here = currentPageBasename();
    var onTab = isTabPage(tabLis, here);
    shell = document.createElement('div');
    shell.id = 'remoed-mobile-shell';
    shell.className = 'remoed-mobile-topbar remoed-app-topbar';

    var back = document.createElement('button');
    back.type = 'button';
    back.id = 'remoed-app-back';
    back.className = 'remoed-app-back';
    back.setAttribute('aria-label', 'Back');
    back.innerHTML = BACK_SVG;
    if (onTab) back.hidden = true;
    back.addEventListener('click', function () {
      goBack(tabLis);
    });

    var title = document.createElement('h1');
    title.id = 'remoed-app-title';
    title.className = 'remoed-app-title';
    title.textContent = pageTitleFromChrome(tabLis, here);

    var actions = document.createElement('div');
    actions.id = 'remoed-app-actions';
    actions.className = 'remoed-app-actions';

    shell.appendChild(back);
    shell.appendChild(title);
    shell.appendChild(actions);
    main.insertBefore(shell, main.firstChild);
    adoptHeaderActions();
    return shell;
  }

  function adoptHeaderActions() {
    var slot = document.getElementById('remoed-app-actions');
    var titleEl = document.getElementById('remoed-app-title');
    if (!slot) return;
    var header = document.querySelector(
      '.remoed-main > .nav-header, .remoed-main > .student-page-nav-header, .remoed-main > .teacher-page-nav-header'
    );
    if (!header) return;
    var right = header.querySelector('.nav-right');
    if (right && right.parentElement !== slot) {
      slot.appendChild(right);
    }
    if (titleEl && !titleEl.getAttribute('data-locked')) {
      var h1 = header.querySelector('.nav-title-text');
      var text = h1 ? h1.textContent.replace(/\s+/g, ' ').trim() : '';
      if (text) titleEl.textContent = text;
    }
    header.classList.add('remoed-nav-header--adopted');
  }

  function watchHeaderAdopt(main) {
    if (!main || main.getAttribute('data-remoed-app-observe') === '1') return;
    main.setAttribute('data-remoed-app-observe', '1');
    var tries = 0;
    var obs = new MutationObserver(function () {
      adoptHeaderActions();
      tries += 1;
      if (document.getElementById('remoed-app-actions') && document.getElementById('remoed-app-actions').childNodes.length) {
        obs.disconnect();
      }
      if (tries > 20) obs.disconnect();
    });
    obs.observe(main, { childList: true, subtree: true });
    setTimeout(function () {
      adoptHeaderActions();
    }, 0);
    setTimeout(function () {
      adoptHeaderActions();
    }, 400);
  }

  function mount() {
    if (!document.body) return;
    if (document.body.classList.contains('page-live-classroom')) return;
    ensureHeaderActionStyles();
    var main = document.querySelector('.remoed-main');
    if (!main) return;

    var nav =
      main.querySelector('nav.remoed-sidebar') ||
      main.querySelector('[id$="-sidebar-root"] nav.remoed-sidebar');

    if (!document.getElementById('remoed-bottom-nav') && nav) {
      buildBottomNav(nav);
    }

    var bar = document.getElementById('remoed-bottom-nav');
    var tabLis = (bar && bar._tabLis) || (nav ? pickTabLis(nav.querySelector('.remoed-menu'), portalRoleFromNav(nav)) : []);

    if (!document.getElementById('remoed-mobile-shell')) {
      buildAppTopbar(main, tabLis);
    } else {
      adoptHeaderActions();
    }

    watchHeaderAdopt(main);
    installScrollSnapGuard();

    if (!document.body.getAttribute('data-remoed-app-keys')) {
      document.body.setAttribute('data-remoed-app-keys', '1');
      document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape') closeMore();
      });
      if (global.matchMedia) {
        global.matchMedia(MQ_MOBILE).addEventListener('change', function (ev) {
          if (!ev.matches) closeMore();
        });
      }
    }
  }

  global.RemoedPortalLayout = {
    mount: mount,
    closeDrawer: closeDrawer,
    openDrawer: openDrawer,
    toggleDrawer: toggleDrawer,
    closeMore: closeMore,
    openMore: openMore,
    toggleMore: toggleMore,
    setNavDropdownOpen: setNavDropdownOpen
  };
})(typeof window !== 'undefined' ? window : this);
