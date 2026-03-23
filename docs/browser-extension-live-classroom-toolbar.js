/**
 * RemoEd Live Classroom — content script (browser extension)
 *
 * Goals:
 * 1) Detect when the PDF lesson is on the last page (e.g. "12/12").
 * 2) Keep the PDF toolbar + annotation controls visible: force display and
 *    block the `hidden` class from sticking on those nodes.
 *
 * Chrome MV3 manifest.json (example):
 *   "content_scripts": [{
 *     "matches": ["https://YOUR_DOMAIN/*live-classroom*", "http://localhost:*/*live-classroom*"],
 *     "js": ["browser-extension-live-classroom-toolbar.js"],
 *     "run_at": "document_idle"
 *   }]
 *
 * If you need `window.pdfViewerState` (same as the page), use `"world": "MAIN"`
 * (Chrome 111+) on the content script, or inject a <script> into the page.
 */

(function () {
  'use strict';

  var PAGE_INFO_SELECTORS = [
    '#pdf-page-info-custom',
    '#pdf-page-info',
    '.pdf-page-info'
  ];
  var TOOLBAR_SELECTOR = '.pdf-viewer-controls';
  var ANNOTATOR_SELECTOR = '.pdf-annotator-controls';

  /** Parse "7/12" or "7 / 12" from the live classroom PDF footer */
  function parsePageFraction(text) {
    if (!text) return null;
    var m = String(text).trim().match(/^(\d+)\s*\/\s*(\d+)/);
    if (!m) return null;
    return { current: parseInt(m[1], 10), total: parseInt(m[2], 10) };
  }

  function findPageInfoEl() {
    for (var i = 0; i < PAGE_INFO_SELECTORS.length; i++) {
      var el = document.querySelector(PAGE_INFO_SELECTORS[i]);
      if (el) return el;
    }
    return null;
  }

  function collectToolbarRoots() {
    var roots = [];
    document.querySelectorAll(TOOLBAR_SELECTOR).forEach(function (el) {
      roots.push(el);
    });
    document.querySelectorAll(ANNOTATOR_SELECTOR).forEach(function (el) {
      if (roots.indexOf(el) === -1) roots.push(el);
    });
    return roots;
  }

  var lastPageActive = false;

  function forceToolbarVisible(roots) {
    roots.forEach(function (el) {
      if (!el || !el.isConnected) return;
      el.classList.remove('hidden');
      // Prefer flex — matches .pdf-viewer-controls layout in live-classroom
      var isFlexBar =
        el.classList.contains('pdf-viewer-controls') ||
        el.classList.contains('pdf-annotator-controls');
      el.style.setProperty('display', isFlexBar ? 'flex' : 'block', 'important');
      el.style.setProperty('visibility', 'visible', 'important');
      el.style.setProperty('opacity', '1', 'important');
    });
  }

  function releaseToolbarStyles(roots) {
    roots.forEach(function (el) {
      if (!el || !el.isConnected) return;
      el.style.removeProperty('display');
      el.style.removeProperty('visibility');
      el.style.removeProperty('opacity');
    });
  }

  function evaluateAndPatch() {
    var infoEl = findPageInfoEl();
    var frac = infoEl ? parsePageFraction(infoEl.textContent) : null;
    var onLast =
      frac && frac.total > 0 && frac.current === frac.total;

    var roots = collectToolbarRoots();
    if (onLast) {
      lastPageActive = true;
      forceToolbarVisible(roots);
    } else if (lastPageActive && !onLast) {
      lastPageActive = false;
      releaseToolbarStyles(roots);
    }
  }

  /** Watch for class/style mutations that hide the bars while on last page */
  function startGuards(roots) {
    roots.forEach(function (el) {
      if (!el || el.__remoedToolbarGuard) return;
      el.__remoedToolbarGuard = true;
      var obs = new MutationObserver(function () {
        if (!lastPageActive) return;
        var pi = findPageInfoEl();
        var frac = pi ? parsePageFraction(pi.textContent) : null;
        if (frac && frac.current === frac.total) {
          forceToolbarVisible([el]);
        }
      });
      obs.observe(el, {
        attributes: true,
        attributeFilter: ['class', 'style']
      });
    });
  }

  var mo = new MutationObserver(function () {
    evaluateAndPatch();
    if (lastPageActive) {
      startGuards(collectToolbarRoots());
    }
  });

  mo.observe(document.documentElement, {
    childList: true,
    subtree: true,
    characterData: true,
    attributes: true,
    attributeFilter: ['class', 'style']
  });

  // Page info text updates may only touch text nodes
  var infoEl = findPageInfoEl();
  if (infoEl) {
    var textMo = new MutationObserver(evaluateAndPatch);
    textMo.observe(infoEl, { childList: true, characterData: true, subtree: true });
  }

  evaluateAndPatch();
  setInterval(evaluateAndPatch, 1000);
})();
