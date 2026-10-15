/**
 * Short QA spiels for Classroom SOS, by tier. Click copies the line (and can fill a chat box).
 * Used by admin-incidents.html and the observer SOS box in live-classroom.html.
 */
(function () {
  var SPIELS = {
    1: [
      'teacher lost internet, please wait a moment.',
      'teacher has a power outage, please wait a moment.',
      'we are fixing a technical issue, please stay in class.',
      'please refresh the page and join again.',
      'teacher is back. Class will continue now.',
      'class cannot continue today. We will help you rebook.'
    ],
    2: [
      'please ask a parent or guardian to sit with the child.',
      'class is paused until an adult joins, please wait.',
      'we are calling the parent now, please wait a moment.',
      'thank you, an adult is here. Class will continue now.',
      'no adult joined, so class is ending. We will contact the parent.'
    ],
    3: [
      'class is paused for safety, please wait.',
      'please turn off your camera and mic now.',
      'only the enrolled student and parent may be in class.',
      'teacher, please leave the class now. QA will message you.',
      'class has ended for safety. We will contact the parent.'
    ]
  };

  /** Fixed QA persona per tier, used in every spiel for that tier. */
  var TIER_NAMES = { 1: 'Joy', 2: 'Carl', 3: 'Renz' };

  var cachedName = '';

  function displayName(raw) {
    var s = String(raw || '').trim();
    if (!s) return 'Admin';
    s = s.split('@')[0].split(/[\s._-]+/)[0] || s;
    return s.charAt(0).toUpperCase() + s.slice(1);
  }

  function fallbackName() {
    try { return displayName(localStorage.getItem('adminUsername') || ''); } catch (_e) { return 'Admin'; }
  }

  function loadName(token) {
    if (cachedName) return Promise.resolve(cachedName);
    if (!token) return Promise.resolve(fallbackName());
    return fetch('/api/admin/me', { headers: { Authorization: 'Bearer ' + token } })
      .then(function (r) { return r.ok ? r.json() : null; })
      .then(function (data) {
        var p = data && data.profile;
        cachedName = displayName((p && (p.firstName || p.username)) || '') || fallbackName();
        return cachedName;
      })
      .catch(function () { return fallbackName(); });
  }

  function lines(tier, name) {
    var t = SPIELS[Number(tier)] ? Number(tier) : 1;
    return SPIELS[t].map(function (rest) {
      return 'This is QA Tier ' + t + ' - ' + (TIER_NAMES[t] || name || 'Admin') + ', ' + rest;
    });
  }

  function copyText(text) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(text).catch(function () { return legacyCopy(text); });
    }
    return Promise.resolve(legacyCopy(text));
  }

  function legacyCopy(text) {
    var ta = document.createElement('textarea');
    ta.value = text;
    ta.setAttribute('readonly', '');
    ta.style.cssText = 'position:fixed;top:-1000px;opacity:0;';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); } catch (_e) {}
    ta.remove();
  }

  /**
   * @param {HTMLElement} container
   * @param {{ tier: number, name: string, onPick?: function(string): void }} opts
   */
  function render(container, opts) {
    if (!container) return;
    var o = opts || {};
    container.textContent = '';
    lines(o.tier, o.name).forEach(function (text) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'sos-spiel';
      btn.textContent = text;
      btn.title = 'Click to copy';
      btn.addEventListener('click', function () {
        copyText(text).then(function () {
          if (typeof o.onPick === 'function') o.onPick(text);
          var old = btn.getAttribute('data-copied');
          if (old) return;
          btn.setAttribute('data-copied', '1');
          btn.classList.add('is-copied');
          setTimeout(function () {
            btn.removeAttribute('data-copied');
            btn.classList.remove('is-copied');
          }, 1500);
        });
      });
      container.appendChild(btn);
    });
  }

  window.RemoEdQaSpiels = { lines: lines, render: render, loadName: loadName };
})();
