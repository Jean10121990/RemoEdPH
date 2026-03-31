/**
 * Shared spotlight tour for Teacher / Student / Admin portals.
 * Requires menu items to use data-nav="<id>" on each <li> (see sidebar JS).
 */
(function (global) {
  'use strict';

  function escapeHtml(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/"/g, '&quot;');
  }

  function formatContent(text) {
    return escapeHtml(text).replace(/\n/g, '<br>');
  }

  function PortalTour(options) {
    this.currentStep = 0;
    this.tourSteps = options.steps || [];
    this.tourActive = false;
    this.storageKey = options.storageKey || 'portalTourCompleted';
    this.accent = options.accent || '#667eea';
    this.accentRgb = options.accentRgb || '102, 126, 234';
    this.portalLabel = options.portalLabel || 'portal';
    this.welcomeMessage = options.welcomeMessage || '';
  }

  PortalTour.prototype.startTour = function () {
    if (this.tourActive) {
      this.endTour();
      return;
    }
    this.tourActive = true;
    this.currentStep = 0;
    global.__activePortalTour = this;
    this.showStep(0);
    this.createOverlay();
  };

  PortalTour.prototype.createOverlay = function () {
    var existing = document.getElementById('tour-overlay');
    if (existing) existing.remove();
    var overlay = document.createElement('div');
    overlay.id = 'tour-overlay';
    overlay.style.cssText =
      'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.45);z-index:9998;pointer-events:none;';
    document.body.appendChild(overlay);
  };

  PortalTour.prototype.showStep = function (stepIndex) {
    if (stepIndex >= this.tourSteps.length) {
      this.endTour();
      return;
    }

    var step = this.tourSteps[stepIndex];
    var element = document.querySelector(step.element);

    if (!element) {
      this.currentStep = stepIndex + 1;
      var self = this;
      setTimeout(function () {
        self.showStep(self.currentStep);
      }, 200);
      return;
    }

    var existingTooltip = document.getElementById('tour-tooltip');
    if (existingTooltip) existingTooltip.remove();
    var existingHighlight = document.getElementById('tour-highlight');
    if (existingHighlight) existingHighlight.remove();

    var rect = element.getBoundingClientRect();
    var highlight = document.createElement('div');
    highlight.id = 'tour-highlight';
    var accent = this.accent;
    highlight.style.cssText =
      'position:fixed;top:' +
      (rect.top - 5) +
      'px;left:' +
      (rect.left - 5) +
      'px;width:' +
      (rect.width + 10) +
      'px;height:' +
      (rect.height + 10) +
      'px;border:3px solid ' +
      accent +
      ';border-radius:8px;background:rgba(' +
      this.accentRgb +
      ',0.12);z-index:9999;pointer-events:none;box-shadow:0 0 0 9999px rgba(0,0,0,0.52);';
    document.body.appendChild(highlight);

    var tooltip = document.createElement('div');
    tooltip.id = 'tour-tooltip';
    var position = step.position || 'right';
    var top;
    var left;
    var scrollY = window.scrollY || window.pageYOffset;
    if (position === 'right') {
      top = rect.top + scrollY;
      left = rect.right + 16;
    } else if (position === 'left') {
      top = rect.top + scrollY;
      left = rect.left - 340;
    } else if (position === 'top') {
      top = rect.top + scrollY - 12;
      left = rect.left;
    } else {
      top = rect.bottom + scrollY + 12;
      left = rect.left;
    }

    var maxW = Math.min(380, window.innerWidth - 24);
    tooltip.style.cssText =
      'position:absolute;top:' +
      top +
      'px;left:' +
      Math.max(12, Math.min(left, window.innerWidth - maxW - 12)) +
      'px;max-width:' +
      maxW +
      'px;width:' +
      maxW +
      'px;background:#fff;border-radius:12px;padding:18px 18px 14px;box-shadow:0 12px 32px rgba(0,0,0,0.18);z-index:10000;border:1px solid rgba(0,0,0,0.06);';

    var titleHtml = escapeHtml(step.title);
    var contentHtml = formatContent(step.content);

    tooltip.innerHTML =
      '<h3 style="margin:0 0 10px 0;color:' +
      accent +
      ';font-size:1.1rem;line-height:1.35;">' +
      titleHtml +
      '</h3>' +
      '<p style="margin:0 0 16px 0;color:#475069;font-size:0.92rem;line-height:1.55;">' +
      contentHtml +
      '</p>' +
      '<div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:8px;">' +
      '<span style="color:#94a3b8;font-size:0.8rem;">Step ' +
      (stepIndex + 1) +
      ' of ' +
      this.tourSteps.length +
      '</span>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;">' +
      (stepIndex > 0
        ? '<button type="button" id="tour-prev" style="padding:8px 14px;border:2px solid ' +
          accent +
          ';background:#fff;color:' +
          accent +
          ';border-radius:8px;cursor:pointer;font-weight:600;font-size:0.88rem;">Back</button>'
        : '') +
      '<button type="button" id="tour-next" style="padding:8px 16px;background:' +
      accent +
      ';color:#fff;border:none;border-radius:8px;cursor:pointer;font-weight:600;font-size:0.88rem;">' +
      (stepIndex === this.tourSteps.length - 1 ? 'Finish' : 'Next') +
      '</button></div></div>';

    document.body.appendChild(tooltip);

    element.scrollIntoView({ behavior: 'smooth', block: 'center' });

    var self = this;
    setTimeout(function () {
      var nextBtn = document.getElementById('tour-next');
      if (nextBtn) {
        var newNext = nextBtn.cloneNode(true);
        nextBtn.parentNode.replaceChild(newNext, nextBtn);
        newNext.addEventListener('click', function () {
          if (stepIndex === self.tourSteps.length - 1) {
            self.endTour();
            return;
          }
          var h = document.getElementById('tour-highlight');
          if (h) h.remove();
          self.currentStep = stepIndex + 1;
          self.showStep(self.currentStep);
        });
      }
      if (stepIndex > 0) {
        var prevBtn = document.getElementById('tour-prev');
        if (prevBtn) {
          var newPrev = prevBtn.cloneNode(true);
          prevBtn.parentNode.replaceChild(newPrev, prevBtn);
          newPrev.addEventListener('click', function () {
            var h2 = document.getElementById('tour-highlight');
            if (h2) h2.remove();
            self.currentStep = stepIndex - 1;
            self.showStep(self.currentStep);
          });
        }
      }
    }, 50);
  };

  PortalTour.prototype.endTour = function () {
    this.tourActive = false;
    if (global.__activePortalTour === this) global.__activePortalTour = null;
    ['tour-overlay', 'tour-highlight', 'tour-tooltip'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
    document.querySelectorAll('[id^="tour-"]').forEach(function (el) {
      el.remove();
    });
    try {
      localStorage.setItem(this.storageKey, 'true');
    } catch (e) {}
  };

  PortalTour.prototype.cleanup = function () {
    this.endTour();
  };

  function cleanupTourElements() {
    ['tour-overlay', 'tour-highlight', 'tour-tooltip'].forEach(function (id) {
      var el = document.getElementById(id);
      if (el) el.remove();
    });
  }

  function attachTourUI(tourInstance, options) {
    options = options || {};
    var btnLabel = options.buttonLabel || '📍 Portal guide';
    var skipIfCompleted = options.skipIfCompleted !== false;

    var existing = document.getElementById('tour-button');
    if (existing) existing.remove();

    var tourButton = document.createElement('button');
    tourButton.id = 'tour-button';
    tourButton.type = 'button';
    tourButton.textContent = btnLabel;
    tourButton.setAttribute('aria-label', 'Start guided tour of this portal');
    tourButton.style.cssText =
      'position:fixed;bottom:20px;right:20px;padding:12px 20px;background:linear-gradient(135deg,' +
      (tourInstance.accent || '#667eea') +
      ' 0%, #764ba2 100%);color:#fff;border:none;border-radius:999px;cursor:pointer;font-weight:600;font-size:0.92rem;box-shadow:0 4px 16px rgba(0,0,0,0.2);z-index:1000;transition:transform 0.2s ease;max-width:calc(100vw - 40px);';

    tourButton.addEventListener('click', function () {
      tourInstance.startTour();
    });
    tourButton.addEventListener('mouseenter', function () {
      tourButton.style.transform = 'scale(1.04)';
    });
    tourButton.addEventListener('mouseleave', function () {
      tourButton.style.transform = 'scale(1)';
    });
    document.body.appendChild(tourButton);

    var completed = false;
    try {
      completed = localStorage.getItem(tourInstance.storageKey) === 'true';
    } catch (e) {}

    var welcomeConfirm = options.welcomeConfirm !== false;
    if (!completed && skipIfCompleted && tourInstance.welcomeMessage && welcomeConfirm) {
      setTimeout(function () {
        if (confirm(tourInstance.welcomeMessage)) {
          tourInstance.startTour();
        }
      }, 900);
    }
  }

  global.PortalTour = PortalTour;
  global.portalTourCleanup = cleanupTourElements;
  global.portalTourAttach = attachTourUI;

  document.addEventListener('keydown', function (e) {
    if (e.key !== 'Escape') return;
    var t = global.__activePortalTour;
    if (t && t.tourActive) t.endTour();
  });
})(typeof window !== 'undefined' ? window : this);
