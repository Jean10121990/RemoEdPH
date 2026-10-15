/**
 * Single monthly tree. Past months are read-only snapshots on this same screen.
 */
(function () {
  'use strict';

  var REMO = '/images/remo-green.png';
  var FALLBACK_STAGE = '/images/garden/stage-0-seed.svg';

  var current = null;
  var history = [];
  var viewingKey = '';
  var cache = {};
  var playing = false;
  var skipFn = null;

  function token() {
    if (window.RemoEdEcoDrops && RemoEdEcoDrops.studentToken) return RemoEdEcoDrops.studentToken();
    try {
      return localStorage.getItem('remoed_student_token') || localStorage.getItem('token') || '';
    } catch (_e) {
      return '';
    }
  }

  function headers() {
    return { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' };
  }

  function $(id) {
    return document.getElementById(id);
  }

  function reducedMotion() {
    return !!(window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches);
  }

  function asset(tree) {
    return (tree && tree.stage && tree.stage.asset) || FALLBACK_STAGE;
  }

  function monthKeys() {
    var keys = history.map(function (t) { return t.monthKey; });
    if (current && current.tree && keys.indexOf(current.tree.monthKey) === -1) keys.push(current.tree.monthKey);
    return keys;
  }

  function setArrowState() {
    var keys = monthKeys();
    var prev = $('vg-prev');
    var next = $('vg-next');
    var show = keys.length > 1;
    prev.hidden = !show;
    next.hidden = !show;
    if (!show) return;
    var i = keys.indexOf(viewingKey);
    prev.disabled = i <= 0;
    next.disabled = i < 0 || i >= keys.length - 1;
  }

  function paint(tree, opts) {
    opts = opts || {};
    var live = !!(current && current.tree && tree.monthKey === current.tree.monthKey);
    viewingKey = tree.monthKey;
    $('vg-month').innerHTML = '';
    $('vg-month').appendChild(document.createTextNode(tree.label + ' · ' + tree.species));
    if (live) {
      var badge = document.createElement('span');
      badge.className = 'vg-now';
      badge.textContent = 'Current';
      $('vg-month').appendChild(badge);
    }
    $('vg-species').textContent = tree.species;
    $('vg-stage-name').textContent = tree.stage.name;
    $('vg-progress-bar').style.width = (tree.progressPercent || 0) + '%';
    $('vg-progress').setAttribute('aria-valuenow', String(tree.progressPercent || 0));
    var next = tree.nextStage;
    $('vg-next-line').textContent = live
      ? (next
        ? next.dropsNeeded + ' more Eco-Drop' + (next.dropsNeeded === 1 ? '' : 's') + ' to ' + next.name
        : 'Fully grown this month. Next month starts a new seed.')
      : 'This tree finished at ' + tree.stage.name + '.';
    var label = tree.species + ', ' + tree.stage.name + ', ' + tree.label + (live ? ', current month' : ', past month');
    $('vg-canvas').setAttribute('aria-label', label);
    $('vg-plant').alt = tree.stage.name;
    if (!opts.holdPlant) $('vg-plant').src = asset(tree);
    setArrowState();
  }

  function markSeen(tree) {
    if (!tree || tree.readOnly) return;
    fetch('/api/garden/seen-stage', {
      method: 'POST',
      headers: headers(),
      credentials: 'include',
      body: JSON.stringify({ monthKey: tree.monthKey, stage: tree.stage.index }),
    }).catch(function () {});
  }

  function stopWater() {
    $('vg-water').hidden = true;
    $('vg-unlock').hidden = true;
    $('vg-skip').hidden = true;
    playing = false;
    skipFn = null;
  }

  function playUnlock(tree) {
    if (playing || !tree || tree.readOnly) return;
    var from = Math.max(0, Number(tree.lastSeenStage) || 0);
    var to = tree.stage.index;
    if (to <= from) {
      markSeen(tree);
      return;
    }
    var stages = (current && current.stages) || [];
    var before = stages[from] || stages[0];
    playing = true;
    $('vg-plant').src = (before && before.asset) || FALLBACK_STAGE;
    $('vg-skip').hidden = false;
    $('vg-skip').focus();

    var avatar = (current && current.avatarUrl) || REMO;
    $('vg-water-avatar').src = avatar;
    $('vg-water-avatar').alt = avatar === REMO ? 'Remo watering the tree' : 'You watering the tree';

    var done = false;
    function finish() {
      if (done) return;
      done = true;
      stopWater();
      $('vg-plant').src = asset(tree);
      if (!reducedMotion()) {
        $('vg-plant').classList.remove('is-swap');
        void $('vg-plant').offsetWidth;
        $('vg-plant').classList.add('is-swap');
      }
      markSeen(tree);
    }
    skipFn = finish;

    if (reducedMotion()) {
      $('vg-unlock').hidden = false;
      setTimeout(finish, 400);
      return;
    }

    $('vg-water').hidden = false;
    $('vg-unlock').hidden = false;
    setTimeout(finish, 2200);
  }

  function showTree(tree) {
    stopWater();
    paint(tree);
    if (!tree.readOnly && (Number(tree.lastSeenStage) || 0) < tree.stage.index) {
      playUnlock(tree);
    } else if (!tree.readOnly) {
      markSeen(tree);
    }
  }

  function loadMonth(monthKey) {
    if (current && current.tree && monthKey === current.tree.monthKey) {
      showTree(current.tree);
      return Promise.resolve(current.tree);
    }
    if (cache[monthKey]) {
      showTree(cache[monthKey]);
      return Promise.resolve(cache[monthKey]);
    }
    return fetch('/api/garden/' + encodeURIComponent(monthKey), {
      headers: headers(),
      credentials: 'include',
    })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (!body || !body.success || !body.tree) throw new Error(body && body.error || 'Could not load that tree');
        cache[monthKey] = body.tree;
        showTree(body.tree);
        return body.tree;
      })
      .catch(function () {
        if (current && current.tree) showTree(current.tree);
      });
  }

  function step(delta) {
    var keys = monthKeys();
    var i = keys.indexOf(viewingKey);
    if (i < 0) return;
    var next = keys[i + delta];
    if (next) loadMonth(next);
  }

  function applyCurrent(data) {
    current = data;
    cache[data.tree.monthKey] = data.tree;
    if (window.RemoEdEcoDropsBadge) {
      RemoEdEcoDropsBadge.update(Number(data.totalEcoDrops) || 0);
    }
    var banner = $('vg-banner');
    if (data.locked) {
      banner.classList.add('is-lock');
      banner.textContent = 'A learning plan adds more lessons — and more Eco-Drops — each month. You can still grow this tree from Play & Learn and your free lessons.';
    }
    if (!viewingKey || viewingKey === data.tree.monthKey) showTree(data.tree);
  }

  function boot() {
    if (!token()) return;
    Promise.all([
      fetch('/api/garden/current', { headers: headers(), credentials: 'include' }).then(function (r) { return r.json(); }),
      fetch('/api/garden/history', { headers: headers(), credentials: 'include' }).then(function (r) { return r.json(); }),
    ]).then(function (pair) {
      var now = pair[0];
      var past = pair[1];
      if (!now || !now.success || !now.tree) throw new Error((now && now.error) || 'Could not load the garden');
      history = (past && past.trees) || [];
      applyCurrent(now);
      if (window.RemoEdEcoDrops) RemoEdEcoDrops.checkAndCelebrate({ preferToast: true });
    }).catch(function (err) {
      $('vg-next-line').textContent = (err && err.message) || 'Garden could not load.';
    });
  }

  $('vg-prev').addEventListener('click', function () { step(-1); });
  $('vg-next').addEventListener('click', function () { step(1); });
  $('vg-skip').addEventListener('click', function () { if (skipFn) skipFn(); });

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && skipFn) {
      skipFn();
      return;
    }
    var tag = e.target && e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
    if (e.key === 'ArrowLeft') step(-1);
    if (e.key === 'ArrowRight') step(1);
  });

  var touchX = null;
  $('vg-stage').addEventListener('touchstart', function (e) {
    if (!e.changedTouches || !e.changedTouches[0]) return;
    touchX = e.changedTouches[0].clientX;
  }, { passive: true });
  $('vg-stage').addEventListener('touchend', function (e) {
    if (touchX == null || !e.changedTouches || !e.changedTouches[0]) return;
    var dx = e.changedTouches[0].clientX - touchX;
    touchX = null;
    if (Math.abs(dx) < 48) return;
    step(dx > 0 ? -1 : 1);
  });

  boot();
})();
