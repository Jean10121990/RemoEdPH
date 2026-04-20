/**
 * Mobile nav: hamburger + drawer + bottom quick links for portals using .remoed-main.
 * Bottom bar: 5 links chosen per role (students always prioritize Book Class when shown).
 * Tablet: narrow icon rail is CSS-only (769–1024px) in mobile-first.css.
 */
(function (global) {
  'use strict';

  var MQ_MOBILE = '(max-width: 768px)';
  var BOTTOM_NAV_COUNT = 5;

  /** Order = priority for the 5 slots; remaining visible menu items fill in DOM order after. */
  var BOTTOM_NAV_PRIORITY = {
    student: [
      'dashboard',
      'book',
      'schedule',
      'classes',
      'videos',
      'games',
      'profile',
      'level',
      'credits',
      'journey'
    ],
    teacher: [
      'dashboard',
      'class-schedule',
      'class-configuration',
      'messages',
      'profile',
      'lessons-library',
      'teaching-fee',
      'device-check',
      'referral-rewards',
      'performance-indicator',
      'professional-development'
    ],
    admin: [
      'dashboard',
      'hr-hub',
      'qa-hub',
      'accounting-hub',
      'messages',
      'announcements',
      'reports',
      'videos',
      'profile-settings',
      'settings',
      'super-monitor'
    ]
  };

  function isMobile() {
    return global.matchMedia && global.matchMedia(MQ_MOBILE).matches;
  }

  function closeDrawer() {
    document.body.classList.remove('remoed-drawer-open');
    var btn = document.getElementById('remoed-nav-toggle');
    if (btn) btn.setAttribute('aria-expanded', 'false');
    var branded = document.getElementById('sidebarToggle');
    if (branded) branded.setAttribute('aria-expanded', 'false');
    document.body.style.overflow = '';
  }

  function openDrawer() {
    document.body.classList.add('remoed-drawer-open');
    var btn = document.getElementById('remoed-nav-toggle');
    if (btn) btn.setAttribute('aria-expanded', 'true');
    var branded = document.getElementById('sidebarToggle');
    if (branded) branded.setAttribute('aria-expanded', 'true');
    document.body.style.overflow = 'hidden';
  }

  function toggleDrawer() {
    if (document.body.classList.contains('remoed-drawer-open')) {
      closeDrawer();
    } else {
      openDrawer();
    }
  }

  function hrefFromMenuLi(li) {
    var oc = li.getAttribute('onclick') || '';
    var m = oc.match(/location\.href\s*=\s*['"]([^'"]+)['"]/);
    if (m) return m[1];
    m = oc.match(/href\s*=\s*['"]([^'"]+)['"]/);
    if (m) return m[1];
    return null;
  }

  function labelFromMenuLi(li) {
    var lab = li.querySelector && li.querySelector('.remoed-menu-label');
    if (lab && lab.textContent) {
      var t = lab.textContent.replace(/\s+/g, ' ').trim();
      if (t.length > 14) return t.slice(0, 13) + '\u2026';
      return t;
    }
    var text = '';
    li.childNodes.forEach(function (n) {
      if (n.nodeType === 3) text += n.textContent;
    });
    text = text.replace(/\s+/g, ' ').trim();
    if (!text) text = li.textContent.replace(/\s+/g, ' ').trim();
    if (text.length > 14) return text.slice(0, 13) + '\u2026';
    return text;
  }

  function ensureMenuItemTitles() {
    document.querySelectorAll('.remoed-menu li').forEach(function (li) {
      if (li.getAttribute('title')) return;
      var t = li.textContent.replace(/\s+/g, ' ').trim();
      if (t) li.setAttribute('title', t);
    });
  }

  function currentPageBasename() {
    var p = (global.location.pathname || '').replace(/\\/g, '/');
    var seg = p.split('/').pop() || '';
    if (seg.indexOf('?') !== -1) seg = seg.split('?')[0];
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
    } catch (e0) { /* ignore */ }
    return 'teacher';
  }

  function pickBottomNavLis(menu, role) {
    var all = Array.prototype.slice.call(menu.querySelectorAll('li[data-nav]')).filter(function (li) {
      return !li.getAttribute('data-logout');
    });
    if (all.length === 0) return [];

    var byId = {};
    all.forEach(function (li) {
      var id = li.getAttribute('data-nav');
      if (id) byId[id] = li;
    });

    var priority = BOTTOM_NAV_PRIORITY[role] || BOTTOM_NAV_PRIORITY.teacher;
    var picked = [];
    var used = {};

    priority.forEach(function (id) {
      if (picked.length >= BOTTOM_NAV_COUNT) return;
      var li = byId[id];
      if (!li || used[id]) return;
      var href = hrefFromMenuLi(li);
      if (!href) return;
      picked.push(li);
      used[id] = true;
    });

    all.forEach(function (li) {
      if (picked.length >= BOTTOM_NAV_COUNT) return;
      var id = li.getAttribute('data-nav');
      if (!id || used[id]) return;
      var href = hrefFromMenuLi(li);
      if (!href) return;
      picked.push(li);
      used[id] = true;
    });

    return picked.slice(0, BOTTOM_NAV_COUNT);
  }

  function buildBottomNav(main, sideNav) {
    if (document.getElementById('remoed-bottom-nav')) return;
    var menu = sideNav.querySelector('.remoed-menu');
    if (!menu) return;

    var role = portalRoleFromNav(sideNav);
    var items = pickBottomNavLis(menu, role);
    if (items.length === 0) return;

    var bar = document.createElement('nav');
    bar.id = 'remoed-bottom-nav';
    bar.className = 'remoed-bottom-nav';
    bar.setAttribute('aria-label', 'Primary pages');

    var here = currentPageBasename();

    items.forEach(function (li) {
      var href = hrefFromMenuLi(li);
      if (!href) return;
      var a = document.createElement('a');
      a.className = 'remoed-bottom-nav__link';
      a.href = href;
      var base = href.split('/').pop().split('?')[0].toLowerCase();
      if (base && here === base) {
        a.setAttribute('aria-current', 'page');
        a.classList.add('is-active');
      }
      var svg = li.querySelector('svg');
      if (svg) {
        a.appendChild(svg.cloneNode(true));
      }
      var span = document.createElement('span');
      span.className = 'remoed-bottom-nav__label';
      span.textContent = labelFromMenuLi(li);
      a.appendChild(span);
      a.addEventListener('click', function () {
        if (isMobile()) closeDrawer();
      });
      bar.appendChild(a);
    });

    if (!bar.firstChild) return;

    document.body.appendChild(bar);
    document.body.classList.add('remoed-has-bottom-nav');
  }

  function wireMenuClose(main) {
    var menu = main.querySelector('.remoed-menu');
    if (!menu || menu.getAttribute('data-remoed-drawer-close') === '1') return;
    menu.setAttribute('data-remoed-drawer-close', '1');
    menu.addEventListener('click', function (ev) {
      var li = ev.target.closest('li');
      if (!li || !menu.contains(li)) return;
      if (isMobile()) closeDrawer();
    });
  }

  function mount() {
    if (!document.body) return;
    if (document.body.classList.contains('page-live-classroom')) return;
    var main = document.querySelector('.remoed-main');
    if (!main || document.getElementById('remoed-mobile-shell')) return;

    var shell = document.createElement('div');
    shell.id = 'remoed-mobile-shell';
    shell.className = 'remoed-mobile-topbar';
    shell.innerHTML =
      '<button type="button" class="remoed-nav-toggle" id="remoed-nav-toggle" aria-expanded="false" aria-controls="remoed-drawer-nav">' +
      '<span class="remoed-nav-toggle-bars" aria-hidden="true"></span>' +
      '<span class="remoed-sr-only">Open menu</span></button>';

    main.insertBefore(shell, main.firstChild);

    var backdrop = document.createElement('div');
    backdrop.className = 'remoed-nav-backdrop';
    backdrop.id = 'remoed-nav-backdrop';
    backdrop.setAttribute('aria-hidden', 'true');
    // Keep backdrop inside .remoed-main (before sidebar) so z-index stacks with the drawer, not above the whole main.
    var sidebarRoot = main.querySelector('[id$="-sidebar-root"]');
    if (sidebarRoot) {
      main.insertBefore(backdrop, sidebarRoot);
    } else {
      main.appendChild(backdrop);
    }

    var nav =
      main.querySelector('nav.remoed-sidebar') ||
      main.querySelector('[id$="-sidebar-root"] nav.remoed-sidebar');
    if (nav && !nav.id) nav.id = 'remoed-drawer-nav';

    document.getElementById('remoed-nav-toggle').addEventListener('click', toggleDrawer);
    backdrop.addEventListener('click', closeDrawer);

    if (global.matchMedia) {
      global.matchMedia(MQ_MOBILE).addEventListener('change', function (ev) {
        if (!ev.matches) closeDrawer();
      });
    }

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape') closeDrawer();
    });

    wireMenuClose(main);
    ensureMenuItemTitles();
    buildBottomNav(main, nav);
  }

  global.RemoedPortalLayout = {
    mount: mount,
    closeDrawer: closeDrawer,
    openDrawer: openDrawer,
    toggleDrawer: toggleDrawer
  };
})(typeof window !== 'undefined' ? window : this);
