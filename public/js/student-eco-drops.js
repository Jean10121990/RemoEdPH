/**
 * Shared Eco-Drop UI for the student portal:
 * - applyAward(result): call with the `ecoDrop` object a completion endpoint returns
 *   (games, lesson checks). Updates the top bar right away and shows a short toast.
 * - checkAndCelebrate(): pop-up for lesson drops earned while the student was away.
 */
(function (global) {
  'use strict';

  var DROP_SVG =
    '<svg viewBox="0 0 24 24" width="40" height="40" fill="#38bdf8" stroke="#0284c7" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
    '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 5 13 5 15a7 7 0 0 0 7 7z"/></svg>';

  function studentToken() {
    try {
      if (global.RemoEdLessonProgress && typeof global.RemoEdLessonProgress.authToken === 'function') {
        var t0 = global.RemoEdLessonProgress.authToken();
        if (t0) return t0;
      }
    } catch (_e0) {}
    return (
      localStorage.getItem('remoed_student_token') ||
      localStorage.getItem('remoed_student_auth') ||
      localStorage.getItem('studentToken') ||
      localStorage.getItem('token') ||
      ''
    );
  }

  function ensureStyles() {
    if (document.getElementById('eco-drop-celebration-css')) return;
    var s = document.createElement('style');
    s.id = 'eco-drop-celebration-css';
    s.textContent =
      '#eco-drop-toast{position:fixed;left:50%;bottom:88px;transform:translateX(-50%) translateY(20px);' +
      'display:flex;align-items:center;gap:12px;' +
      'background:linear-gradient(135deg,#ecfdf5,#dbeafe);border:2px solid #34d399;border-radius:16px;' +
      'padding:12px 16px;box-shadow:0 12px 32px rgba(15,23,42,.18);z-index:var(--z-toast,9500);' +
      'max-width:min(420px,calc(100vw - 24px));opacity:0;pointer-events:none;transition:opacity .35s,transform .35s;}' +
      '#eco-drop-toast.show{opacity:1;pointer-events:auto;transform:translateX(-50%) translateY(0);}' +
      '#eco-drop-toast svg{flex:none;width:32px;height:32px;}' +
      '#eco-drop-toast strong{display:block;font-size:1.05rem;color:#065f46;margin-bottom:2px;}' +
      '#eco-drop-toast p{margin:0;font-size:.9rem;color:#334155;}' +
      '#eco-drop-toast a{color:#0284c7;font-weight:600;}' +
      '#eco-drop-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
      'z-index:var(--z-modal,9000);padding:16px;}' +
      '#eco-drop-modal.show{display:flex;}' +
      '#eco-drop-modal .eco-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.45);}' +
      '#eco-drop-modal .eco-panel{position:relative;background:#fff;border-radius:20px;padding:24px 22px;' +
      'max-width:400px;width:100%;text-align:center;box-shadow:0 20px 48px rgba(15,23,42,.25);' +
      'animation:ecoPop .45s ease;}' +
      '@keyframes ecoPop{from{transform:scale(.86);opacity:0}to{transform:scale(1);opacity:1}}' +
      '@media (prefers-reduced-motion:reduce){#eco-drop-modal .eco-panel{animation:none}#eco-drop-toast{transition:opacity .2s}}' +
      '#eco-drop-modal .eco-drop-icon{margin-bottom:8px;}' +
      '#eco-drop-modal h3{margin:0 0 8px;color:#065f46;font-size:1.25rem;}' +
      '#eco-drop-modal p{margin:0 0 16px;color:#475569;}' +
      '#eco-drop-modal .eco-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;}' +
      '#eco-drop-modal .eco-btn{border:none;border-radius:999px;padding:10px 16px;font-weight:600;cursor:pointer;min-height:44px;}' +
      '#eco-drop-modal .eco-btn-primary{background:#00aeef;color:#fff;}' +
      '#eco-drop-modal .eco-btn-secondary{background:#e2e8f0;color:#334155;}';
    document.head.appendChild(s);
  }

  function ackCelebration() {
    var tok = studentToken();
    if (!tok) return Promise.resolve();
    return fetch('/api/student/eco-drops/ack', {
      method: 'POST',
      headers: { Authorization: 'Bearer ' + tok },
      credentials: 'include',
    }).catch(function () {});
  }

  function plural(n) {
    return n + ' Eco-Drop' + (n === 1 ? '' : 's');
  }

  function showModal(count) {
    ensureStyles();
    var n = Math.max(1, Number(count) || 1);
    var existing = document.getElementById('eco-drop-modal');
    if (existing) existing.remove();
    var el = document.createElement('div');
    el.id = 'eco-drop-modal';
    el.className = 'show';
    el.setAttribute('role', 'dialog');
    el.setAttribute('aria-modal', 'true');
    el.setAttribute('aria-labelledby', 'eco-drop-modal-title');
    el.innerHTML =
      '<div class="eco-backdrop" data-eco-close></div>' +
      '<div class="eco-panel">' +
      '<div class="eco-drop-icon">' + DROP_SVG + '</div>' +
      '<h3 id="eco-drop-modal-title">+' + plural(n) + ' Earned!</h3>' +
      '<p>Great class! Visit your Virtual Garden to see your tree grow.</p>' +
      '<div class="eco-actions">' +
      '<a class="eco-btn eco-btn-primary" href="student-virtual-garden.html" style="text-decoration:none;display:inline-flex;align-items:center;">Open Virtual Garden</a>' +
      '<button type="button" class="eco-btn eco-btn-secondary" data-eco-close>Nice!</button>' +
      '</div></div>';
    document.body.appendChild(el);
    var closeBtn = el.querySelector('button[data-eco-close]');
    if (closeBtn) closeBtn.focus();
    function close() {
      el.classList.remove('show');
      document.removeEventListener('keydown', onKey);
      setTimeout(function () {
        try {
          el.remove();
        } catch (_e) {}
      }, 200);
      ackCelebration();
    }
    function onKey(e) {
      if (e.key === 'Escape') close();
    }
    document.addEventListener('keydown', onKey);
    el.querySelectorAll('[data-eco-close]').forEach(function (btn) {
      btn.addEventListener('click', close);
    });
  }

  var toastTimer = null;

  /** @param {string} title @param {string} line plain text (no HTML) */
  function showToast(title, line) {
    ensureStyles();
    var el = document.getElementById('eco-drop-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'eco-drop-toast';
      el.setAttribute('role', 'status');
      el.setAttribute('aria-live', 'polite');
      document.body.appendChild(el);
    }
    el.innerHTML = DROP_SVG + '<div><strong></strong><p></p></div>';
    el.querySelector('strong').textContent = title;
    var p = el.querySelector('p');
    p.textContent = line + ' ';
    var a = document.createElement('a');
    a.href = 'student-virtual-garden.html';
    a.textContent = 'Open garden';
    p.appendChild(a);
    el.classList.add('show');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      el.classList.remove('show');
    }, 6000);
  }

  /**
   * @param {{ awarded: boolean, totalEcoDrops: number, stageBefore?: {index:number,name:string}, stageAfter?: {index:number,name:string} }|null} result
   */
  function applyAward(result) {
    if (!result || typeof result !== 'object') return;
    if (global.RemoEdEcoDropsBadge && typeof global.RemoEdEcoDropsBadge.update === 'function') {
      global.RemoEdEcoDropsBadge.update(Number(result.totalEcoDrops) || 0, { animate: !!result.awarded });
    }
    if (!result.awarded) return;
    var grew = result.stageAfter && result.stageBefore && result.stageAfter.index > result.stageBefore.index;
    showToast(
      '+1 Eco-Drop!',
      grew ? 'Your tree grew to ' + String(result.stageAfter.name) + '!' : 'Your tree drank it up.'
    );
  }

  /** Lesson drops earned while away (teacher finished the class). */
  function checkAndCelebrate(opts) {
    opts = opts || {};
    var tok = studentToken();
    if (!tok) return Promise.resolve(null);
    return fetch('/api/student/eco-drops', {
      headers: { Authorization: 'Bearer ' + tok },
      credentials: 'include',
    })
      .then(function (r) {
        return r.ok ? r.json() : null;
      })
      .then(function (data) {
        if (!data) return null;
        var n = Number(data.pendingCelebration) || 0;
        if (n > 0) {
          if (opts.preferToast) {
            showToast('+' + plural(n) + ' Earned!', 'From your class.');
            ackCelebration();
          } else {
            showModal(n);
          }
        }
        if (typeof opts.onBalance === 'function') {
          opts.onBalance(Number(data.totalEcoDrops) || 0);
        }
        return data;
      })
      .catch(function () {
        return null;
      });
  }

  global.RemoEdEcoDrops = {
    applyAward: applyAward,
    checkAndCelebrate: checkAndCelebrate,
    showModal: showModal,
    showToast: showToast,
    ackCelebration: ackCelebration,
    studentToken: studentToken,
  };
})(typeof window !== 'undefined' ? window : this);
