/**
 * Shared Eco-Drop celebration toast/modal for student portal.
 */
(function (global) {
  'use strict';

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
      'background:linear-gradient(135deg,#ecfdf5,#dbeafe);border:2px solid #34d399;border-radius:16px;' +
      'padding:14px 18px;box-shadow:0 12px 32px rgba(15,23,42,.18);z-index:var(--z-toast,500);' +
      'max-width:min(420px,calc(100vw - 24px));opacity:0;pointer-events:none;transition:opacity .35s,transform .35s;}' +
      '#eco-drop-toast.show{opacity:1;pointer-events:auto;transform:translateX(-50%) translateY(0);}' +
      '#eco-drop-toast strong{display:block;font-size:1.05rem;color:#065f46;margin-bottom:4px;}' +
      '#eco-drop-toast p{margin:0;font-size:.9rem;color:#334155;}' +
      '#eco-drop-toast a{color:#0284c7;font-weight:600;}' +
      '#eco-drop-modal{position:fixed;inset:0;display:none;align-items:center;justify-content:center;' +
      'z-index:var(--z-modal,450);padding:16px;}' +
      '#eco-drop-modal.show{display:flex;}' +
      '#eco-drop-modal .eco-backdrop{position:absolute;inset:0;background:rgba(15,23,42,.45);}' +
      '#eco-drop-modal .eco-panel{position:relative;background:#fff;border-radius:20px;padding:24px 22px;' +
      'max-width:400px;width:100%;text-align:center;box-shadow:0 20px 48px rgba(15,23,42,.25);' +
      'animation:ecoPop .45s ease;}' +
      '@keyframes ecoPop{from{transform:scale(.86);opacity:0}to{transform:scale(1);opacity:1}}' +
      '#eco-drop-modal .eco-drop-icon{font-size:2.5rem;margin-bottom:8px;}' +
      '#eco-drop-modal h3{margin:0 0 8px;color:#065f46;font-size:1.25rem;}' +
      '#eco-drop-modal p{margin:0 0 16px;color:#475569;}' +
      '#eco-drop-modal .eco-actions{display:flex;gap:8px;justify-content:center;flex-wrap:wrap;}' +
      '#eco-drop-modal .eco-btn{border:none;border-radius:999px;padding:10px 16px;font-weight:600;cursor:pointer;}' +
      '#eco-drop-modal .eco-btn-primary{background:#00aeef;color:#fff;}' +
      '#eco-drop-modal .eco-btn-secondary{background:#e2e8f0;color:#334155;}';
    document.head.appendChild(s);
  }

  function ackCelebration() {
    var tok = studentToken();
    if (!tok) return Promise.resolve();
    return fetch('/api/student/garden?ackCelebration=1', {
      headers: { Authorization: 'Bearer ' + tok },
      credentials: 'include',
    }).catch(function () {});
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
    el.innerHTML =
      '<div class="eco-backdrop" data-eco-close></div>' +
      '<div class="eco-panel">' +
      '<div class="eco-drop-icon" aria-hidden="true">💧</div>' +
      '<h3>+' +
      n +
      ' Eco-Drop' +
      (n === 1 ? '' : 's') +
      ' Earned!</h3>' +
      '<p>Visit your Virtual Garden to nurture your plants.</p>' +
      '<div class="eco-actions">' +
      '<a class="eco-btn eco-btn-primary" href="student-virtual-garden.html" style="text-decoration:none;display:inline-block;">Open Virtual Garden</a>' +
      '<button type="button" class="eco-btn eco-btn-secondary" data-eco-close>Nice!</button>' +
      '</div></div>';
    document.body.appendChild(el);
    function close() {
      el.classList.remove('show');
      setTimeout(function () {
        try {
          el.remove();
        } catch (_e) {}
      }, 200);
      ackCelebration();
    }
    el.querySelectorAll('[data-eco-close]').forEach(function (btn) {
      btn.addEventListener('click', close);
    });
  }

  function showToast(count) {
    ensureStyles();
    var n = Math.max(1, Number(count) || 1);
    var el = document.getElementById('eco-drop-toast');
    if (!el) {
      el = document.createElement('div');
      el.id = 'eco-drop-toast';
      document.body.appendChild(el);
    }
    el.innerHTML =
      '<strong>+' +
      n +
      ' Eco-Drop' +
      (n === 1 ? '' : 's') +
      ' Earned! 💧</strong>' +
      '<p>Visit your <a href="student-virtual-garden.html">Virtual Garden</a> to nurture your plants.</p>';
    el.classList.add('show');
    ackCelebration();
    setTimeout(function () {
      el.classList.remove('show');
    }, 6000);
  }

  /**
   * Fetch pending celebration and show modal (preferred) or toast.
   * @param {{ preferToast?: boolean }=} opts
   */
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
          if (opts.preferToast) showToast(n);
          else showModal(n);
        }
        if (typeof opts.onBalance === 'function') {
          opts.onBalance(Number(data.ecoDropsBalance) || 0);
        }
        return data;
      })
      .catch(function () {
        return null;
      });
  }

  global.RemoEdEcoDrops = {
    checkAndCelebrate: checkAndCelebrate,
    showModal: showModal,
    showToast: showToast,
    ackCelebration: ackCelebration,
    studentToken: studentToken,
  };
})(typeof window !== 'undefined' ? window : this);
