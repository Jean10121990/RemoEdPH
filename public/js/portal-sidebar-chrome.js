/**
 * Portal sidebar chrome: fixed #sidebarToggle (all viewports), #sidebarClose (mobile drawer).
 * Desktop: body.remoed-desktop-sidebar-collapsed — sidebar off-canvas; content full width.
 * Mobile: toggles body.remoed-drawer-open via RemoedPortalLayout (uses existing backdrop).
 */
(function (global) {
  'use strict';

  var MQ_MOBILE = '(max-width: 768px)';

  function isMobile() {
    return global.matchMedia && global.matchMedia(MQ_MOBILE).matches;
  }

  function svgBars() {
    return (
      '<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<path d="M4 6h16M4 12h16M4 18h16"/>' +
      '</svg>'
    );
  }

  function svgTimes() {
    return (
      '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" aria-hidden="true">' +
      '<path d="M18 6L6 18M6 6l12 12"/>' +
      '</svg>'
    );
  }

  function closeAllMobile() {
    if (global.RemoedPortalLayout && typeof global.RemoedPortalLayout.closeDrawer === 'function') {
      global.RemoedPortalLayout.closeDrawer();
    } else {
      document.body.classList.remove('remoed-drawer-open');
      document.body.style.overflow = '';
    }
    var t = document.getElementById('sidebarToggle');
    if (t) t.setAttribute('aria-expanded', 'false');
  }

  function openMobile() {
    if (global.RemoedPortalLayout && typeof global.RemoedPortalLayout.openDrawer === 'function') {
      global.RemoedPortalLayout.openDrawer();
    } else {
      document.body.classList.add('remoed-drawer-open');
      document.body.style.overflow = 'hidden';
    }
    var t = document.getElementById('sidebarToggle');
    if (t) t.setAttribute('aria-expanded', 'true');
  }

  function openDesktop() {
    document.body.classList.remove('remoed-desktop-sidebar-collapsed');
    var t = document.getElementById('sidebarToggle');
    if (t) t.setAttribute('aria-expanded', 'true');
  }

  function closeDesktop() {
    document.body.classList.add('remoed-desktop-sidebar-collapsed');
    var t = document.getElementById('sidebarToggle');
    if (t) t.setAttribute('aria-expanded', 'false');
  }

  function isDesktopOpen() {
    return !document.body.classList.contains('remoed-desktop-sidebar-collapsed');
  }

  function isMobileDrawerOpen() {
    return document.body.classList.contains('remoed-drawer-open');
  }

  function dispatchResize() {
    try {
      global.dispatchEvent(new Event('resize'));
    } catch (e) {
      /* ignore */
    }
  }

  function onToggleClick(ev) {
    ev.preventDefault();
    ev.stopPropagation();
    if (isMobile()) {
      if (isMobileDrawerOpen()) {
        closeAllMobile();
      } else {
        openMobile();
      }
    } else {
      if (isDesktopOpen()) {
        closeDesktop();
      } else {
        openDesktop();
      }
    }
    dispatchResize();
  }

  function mount() {
    if (document.getElementById('sidebarToggle')) return;

    var main = document.querySelector('.remoed-main');
    if (!main) return;
    var root = main.querySelector('[id$="-sidebar-root"]');
    if (!root) return;
    var nav = root.querySelector('nav.remoed-sidebar');
    if (!nav) return;

    document.body.classList.add('remoed-portal-sidebar-mounted');
    var isStudentPortal = document.body.classList.contains('student-portal');
    /* Teacher desktop: sidebar starts collapsed behind the green toggle. Student: rail stays open on desktop. */
    if (!isMobile() && !isStudentPortal) {
      document.body.classList.add('remoed-desktop-sidebar-collapsed');
    }

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.id = 'sidebarToggle';
    toggle.className = 'portal-sidebar-toggle';
    toggle.setAttribute('aria-label', 'Toggle navigation menu');
    toggle.setAttribute('aria-expanded', 'false');
    toggle.setAttribute('aria-controls', root.id || 'portal-sidebar-root');
    toggle.innerHTML = svgBars();
    document.body.appendChild(toggle);

    toggle.addEventListener('click', onToggleClick);

    var headerInner = nav.querySelector('.sidebar-header-inner');
    if (headerInner && !document.getElementById('sidebarClose')) {
      headerInner.style.position = 'relative';
      var closeBtn = document.createElement('button');
      closeBtn.type = 'button';
      closeBtn.id = 'sidebarClose';
      closeBtn.className = 'portal-sidebar-close';
      closeBtn.setAttribute('aria-label', 'Close menu');
      closeBtn.innerHTML = svgTimes();
      headerInner.appendChild(closeBtn);
      closeBtn.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        closeAllMobile();
        dispatchResize();
      });
    }

    function syncAriaFromBody() {
      var tgl = document.getElementById('sidebarToggle');
      if (!tgl) return;
      if (isMobile()) {
        tgl.setAttribute('aria-expanded', isMobileDrawerOpen() ? 'true' : 'false');
      } else {
        tgl.setAttribute('aria-expanded', isDesktopOpen() ? 'true' : 'false');
      }
    }

    if (global.matchMedia) {
      global.matchMedia(MQ_MOBILE).addEventListener('change', function (ev) {
        if (ev.matches) {
          document.body.classList.remove('remoed-desktop-sidebar-collapsed');
          if (global.RemoedPortalLayout && global.RemoedPortalLayout.closeDrawer) {
            global.RemoedPortalLayout.closeDrawer();
          }
        } else {
          closeAllMobile();
          if (document.body.classList.contains('student-portal')) {
            document.body.classList.remove('remoed-desktop-sidebar-collapsed');
          } else {
            document.body.classList.add('remoed-desktop-sidebar-collapsed');
          }
        }
        syncAriaFromBody();
        dispatchResize();
      });
    }

    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && isMobile() && isMobileDrawerOpen()) {
        closeAllMobile();
        dispatchResize();
      }
    });

    syncAriaFromBody();
    dispatchResize();
  }

  function queueMount() {
    mount();
  }

  global.RemoedPortalSidebarChrome = {
    mount: mount,
    queueMount: queueMount,
    closeAllMobile: closeAllMobile,
    openMobile: openMobile
  };
})(typeof window !== 'undefined' ? window : this);
