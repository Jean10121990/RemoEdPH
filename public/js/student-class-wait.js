/**
 * Student waiting room: overlay + mini-game + looping watch animation
 * until the teacher is in the live classroom.
 */
(function (global) {
  'use strict';

  var overlay = null;
  var pollTimer = null;
  var raf = 0;
  var teacherHere = false;
  var score = 0;
  var orbs = [];
  var watchT = 0;

  function token() {
    try {
      if (global.RemoedAuthToken && RemoedAuthToken.getStudentToken) {
        return RemoedAuthToken.getStudentToken();
      }
    } catch (_e) {}
    try {
      return localStorage.getItem('remoed_student_token') || sessionStorage.getItem('remoed_student_token') || '';
    } catch (_e2) {
      return '';
    }
  }

  function roomFromUrl() {
    try {
      var q = new URLSearchParams(global.location.search || '');
      return q.get('room') || q.get('classroomId') || '';
    } catch (_e) {
      return '';
    }
  }

  function isStudent() {
    try {
      var q = new URLSearchParams(global.location.search || '');
      var t = String(q.get('type') || q.get('userType') || '').toLowerCase();
      if (t === 'teacher' || t === 'admin') return false;
      if (t === 'student') return true;
    } catch (_e) {}
    try {
      var ut = String(localStorage.getItem('userType') || localStorage.getItem('userRole') || '').toLowerCase();
      return ut !== 'teacher' && ut !== 'admin';
    } catch (_e2) {
      return true;
    }
  }

  function setStatus(text) {
    var el = document.getElementById('lc-wait-status');
    if (el) el.textContent = text;
  }

  function hideOverlay() {
    teacherHere = true;
    if (pollTimer) {
      clearInterval(pollTimer);
      pollTimer = null;
    }
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    if (overlay) {
      overlay.hidden = true;
      overlay.setAttribute('hidden', '');
      document.body.classList.remove('lc-student-waiting');
    }
  }

  function showOverlay() {
    overlay = document.getElementById('lc-student-waiting');
    if (!overlay) return;
    overlay.hidden = false;
    overlay.removeAttribute('hidden');
    document.body.classList.add('lc-student-waiting');
    setStatus('Waiting for your teacher…');
    startPlay();
  }

  function spawnOrb(w, h) {
    orbs.push({
      x: 24 + Math.random() * Math.max(40, w - 48),
      y: -20 - Math.random() * 80,
      r: 14 + Math.random() * 16,
      vy: 1.2 + Math.random() * 1.8,
      hue: 95 + Math.random() * 40,
    });
  }

  function startPlay() {
    var game = document.getElementById('lc-wait-game');
    var watch = document.getElementById('lc-wait-watch');
    if (!game || !watch) return;
    var gctx = game.getContext('2d');
    var wctx = watch.getContext('2d');
    score = 0;
    orbs = [];
    var scoreEl = document.getElementById('lc-wait-score');

    function sizeCanvas(c) {
      var r = c.getBoundingClientRect();
      var dpr = Math.min(2, global.devicePixelRatio || 1);
      var w = Math.max(120, Math.floor(r.width * dpr));
      var h = Math.max(120, Math.floor(r.height * dpr));
      if (c.width !== w) c.width = w;
      if (c.height !== h) c.height = h;
      return { w: c.width, h: c.height, dpr: dpr };
    }

    game.onclick = function (ev) {
      var rect = game.getBoundingClientRect();
      var dpr = game.width / Math.max(1, rect.width);
      var x = (ev.clientX - rect.left) * dpr;
      var y = (ev.clientY - rect.top) * dpr;
      for (var i = orbs.length - 1; i >= 0; i--) {
        var o = orbs[i];
        var dx = o.x - x;
        var dy = o.y - y;
        if (dx * dx + dy * dy <= (o.r + 8) * (o.r + 8)) {
          orbs.splice(i, 1);
          score += 1;
          if (scoreEl) scoreEl.textContent = String(score);
        }
      }
    };

    function tick() {
      if (teacherHere) return;
      var gs = sizeCanvas(game);
      var ws = sizeCanvas(watch);
      watchT += 0.016;
      wctx.clearRect(0, 0, ws.w, ws.h);
      var grd = wctx.createLinearGradient(0, 0, ws.w, ws.h);
      grd.addColorStop(0, '#d9f7ff');
      grd.addColorStop(0.5, '#e8fce3');
      grd.addColorStop(1, '#fff6c8');
      wctx.fillStyle = grd;
      wctx.fillRect(0, 0, ws.w, ws.h);
      for (var k = 0; k < 8; k++) {
        var px = (ws.w * 0.12 * k + watchT * (18 + k * 4)) % (ws.w + 80) - 40;
        var py = ws.h * 0.25 + Math.sin(watchT * 0.8 + k) * 28 + k * 18;
        wctx.beginPath();
        wctx.fillStyle = 'rgba(71,188,62,' + (0.18 + (k % 3) * 0.08) + ')';
        wctx.arc(px, py, 22 + (k % 4) * 8, 0, Math.PI * 2);
        wctx.fill();
      }

      gctx.clearRect(0, 0, gs.w, gs.h);
      gctx.fillStyle = '#0b3d2e';
      gctx.globalAlpha = 0.06;
      gctx.fillRect(0, 0, gs.w, gs.h);
      gctx.globalAlpha = 1;
      if (orbs.length < 7 && Math.random() < 0.06) spawnOrb(gs.w, gs.h);
      orbs.forEach(function (o) {
        o.y += o.vy;
        gctx.beginPath();
        gctx.fillStyle = 'hsl(' + o.hue + ' 70% 48%)';
        gctx.arc(o.x, o.y, o.r, 0, Math.PI * 2);
        gctx.fill();
        gctx.fillStyle = '#fff';
        gctx.beginPath();
        gctx.arc(o.x - o.r * 0.25, o.y - o.r * 0.25, o.r * 0.22, 0, Math.PI * 2);
        gctx.fill();
      });
      orbs = orbs.filter(function (o) {
        return o.y - o.r < gs.h + 10;
      });
      raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
  }

  function setMode(mode) {
    var gameWrap = document.getElementById('lc-wait-game-wrap');
    var watchWrap = document.getElementById('lc-wait-watch-wrap');
    var gameBtn = document.getElementById('lc-wait-tab-game');
    var watchBtn = document.getElementById('lc-wait-tab-watch');
    var playGame = mode !== 'watch';
    if (gameWrap) gameWrap.hidden = !playGame;
    if (watchWrap) watchWrap.hidden = playGame;
    if (gameBtn) gameBtn.classList.toggle('is-active', playGame);
    if (watchBtn) watchBtn.classList.toggle('is-active', !playGame);
  }

  async function checkRoom() {
    var room = roomFromUrl();
    if (!room || teacherHere) return;
    try {
      var headers = { Accept: 'application/json' };
      var t = token();
      if (t) headers.Authorization = 'Bearer ' + t;
      var res = await fetch('/api/signaling/room-status?room=' + encodeURIComponent(room), { headers: headers, credentials: 'same-origin' });
      if (!res.ok) return;
      var data = await res.json();
      if (data && data.teacherPresent) {
        setStatus('Teacher is here — joining class…');
        setTimeout(hideOverlay, 600);
      }
    } catch (_e) {}
  }

  function bootOverlay() {
    if (!isStudent()) return;
    overlay = document.getElementById('lc-student-waiting');
    if (!overlay) return;
    showOverlay();
    setMode('game');
    var gameBtn = document.getElementById('lc-wait-tab-game');
    var watchBtn = document.getElementById('lc-wait-tab-watch');
    if (gameBtn) gameBtn.addEventListener('click', function () { setMode('game'); });
    if (watchBtn) watchBtn.addEventListener('click', function () { setMode('watch'); });
    checkRoom();
    pollTimer = setInterval(checkRoom, 3000);
  }

  function bootStandalone() {
    var host = document.getElementById('waiting-play-host');
    if (!host) return;
    if (!document.getElementById('lc-wait-game')) {
      host.innerHTML =
        '<div class="lc-wait-toolbar">' +
        '<button type="button" class="lc-wait-tab is-active" id="lc-wait-tab-game">Play</button>' +
        '<button type="button" class="lc-wait-tab" id="lc-wait-tab-watch">Watch</button>' +
        '<span class="lc-wait-score-label">Stars <strong id="lc-wait-score">0</strong></span>' +
        '</div>' +
        '<div id="lc-wait-game-wrap" class="lc-wait-canvas-wrap"><canvas id="lc-wait-game"></canvas><p class="lc-wait-hint">Tap the falling stars!</p></div>' +
        '<div id="lc-wait-watch-wrap" class="lc-wait-canvas-wrap" hidden><canvas id="lc-wait-watch"></canvas><p class="lc-wait-hint">A calm loop while you wait.</p></div>';
    }
    startPlay();
    setMode('game');
    var gameBtn = document.getElementById('lc-wait-tab-game');
    var watchBtn = document.getElementById('lc-wait-tab-watch');
    if (gameBtn) gameBtn.addEventListener('click', function () { setMode('game'); });
    if (watchBtn) watchBtn.addEventListener('click', function () { setMode('watch'); });
  }

  function onReady() {
    if (document.getElementById('lc-student-waiting')) bootOverlay();
    else bootStandalone();
    if (global.RemoedLucide) RemoedLucide.fillAll(document);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', onReady);
  else onReady();

  global.RemoedStudentWait = {
    setTeacherPresent: function (present) {
      if (present) {
        setStatus('Teacher is here — joining class…');
        setTimeout(hideOverlay, 400);
      }
    },
    hide: hideOverlay,
  };
})(typeof window !== 'undefined' ? window : globalThis);
