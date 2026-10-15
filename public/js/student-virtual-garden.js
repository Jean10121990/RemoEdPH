/**
 * Single monthly tree. Species always comes from the server. Care actions grow it.
 */
(function () {
  'use strict';

  var REMO = '/images/remo-green.png';
  var FALLBACK_STAGE = '/images/garden/stage-0-seed.svg';
  var AMBIENT_CAP = { butterflies: 3, bees: 2, birds: 2 };
  var AMBIENT_CAP_MOBILE = { butterflies: 2, bees: 1, birds: 1 };

  var current = null;
  var history = [];
  var viewingKey = '';
  var cache = {};
  var playing = false;
  var skipFn = null;
  var inFlight = false;
  var rainbowTimer = null;

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

  function isMobile() {
    return !!(window.matchMedia && window.matchMedia('(max-width: 768px)').matches);
  }

  var ridSeq = 0;
  function requestId() {
    if (window.crypto && typeof window.crypto.randomUUID === 'function') return window.crypto.randomUUID();
    ridSeq += 1;
    return 'care-' + Date.now() + '-' + ridSeq;
  }

  function asset(tree) {
    return (tree && tree.stage && tree.stage.asset) || FALLBACK_STAGE;
  }

  function careCosts() {
    var c = (current && current.care) || {};
    return {
      water: (c.water && c.water.cost) || 1,
      fertilize: (c.fertilize && c.fertilize.cost) || 3,
    };
  }

  function available() {
    if (!current) return 0;
    if (current.availableDrops != null) return Math.max(0, Number(current.availableDrops) || 0);
    return Math.max(0, Number(current.totalEcoDrops) || 0);
  }

  function totalEarned() {
    return current && current.totalEarned != null ? Math.max(0, Number(current.totalEarned) || 0) : available();
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

  function announce(text) {
    var live = $('vg-live');
    if (!live) return;
    live.textContent = '';
    live.textContent = text;
  }

  function syncHeader(n, animate) {
    if (window.RemoEdEcoDropsBadge) {
      RemoEdEcoDropsBadge.update(Math.max(0, Number(n) || 0), { animate: !!animate });
    }
  }

  function ambientFor(tree) {
    if (tree && tree.stage && tree.stage.ambient) return tree.stage.ambient;
    var stages = (current && current.stages) || [];
    var idx = tree && tree.stage ? tree.stage.index : 0;
    return (stages[idx] && stages[idx].ambient) || { butterflies: 0, bees: 0, birds: 0, rainbow: false };
  }

  function cap(n, kind) {
    var limits = isMobile() ? AMBIENT_CAP_MOBILE : AMBIENT_CAP;
    return Math.min(Math.max(0, Number(n) || 0), limits[kind] || 0);
  }

  function renderAmbient(tree, opts) {
    opts = opts || {};
    var layer = $('vg-ambient');
    if (!layer) return;
    var live = !!(current && current.tree && tree.monthKey === current.tree.monthKey);
    var amb = ambientFor(tree);
    var staticScene = !live || reducedMotion() || !!opts.static;
    var html = '';
    html += '<img class="vg-sun" src="/images/garden/ambient-sun.svg" alt="">';
    if (amb.rainbow || opts.rainbowFlash) {
      html += '<img class="vg-rainbow' + (opts.rainbowFlash && !amb.rainbow ? ' is-flash' : '') + '" src="/images/garden/ambient-rainbow.svg" alt="">';
    }
    var i;
    var butterflies = cap(amb.butterflies, 'butterflies');
    for (i = 0; i < butterflies; i++) {
      html += '<img class="vg-bug vg-butterfly vg-butterfly-' + (i + 1) + '" src="/images/garden/ambient-butterfly.svg" alt="">';
    }
    var bees = cap(amb.bees, 'bees');
    for (i = 0; i < bees; i++) {
      html += '<img class="vg-bug vg-bee vg-bee-' + (i + 1) + '" src="/images/garden/ambient-bee.svg" alt="">';
    }
    var birds = cap(amb.birds, 'birds');
    for (i = 0; i < birds; i++) {
      html += '<img class="vg-bug vg-bird vg-bird-' + (i + 1) + '" src="/images/garden/ambient-bird.svg" alt="">';
    }
    if (tree.stage && tree.stage.key === 'fully-grown') {
      html += '<img class="vg-blossom vg-blossom-1" src="/images/garden/ambient-blossom.svg" alt="">';
      html += '<img class="vg-blossom vg-blossom-2" src="/images/garden/ambient-blossom.svg" alt="">';
    }
    layer.innerHTML = html;
    layer.classList.toggle('is-static', staticScene);
  }

  function flashRainbow(tree) {
    if (reducedMotion() || (tree.readOnly)) return;
    renderAmbient(tree, { rainbowFlash: true });
    clearTimeout(rainbowTimer);
    rainbowTimer = setTimeout(function () {
      renderAmbient(tree);
    }, 2200);
  }

  function glowSun() {
    var sun = document.querySelector('.vg-sun');
    if (!sun || reducedMotion()) return;
    sun.classList.remove('is-glow');
    void sun.offsetWidth;
    sun.classList.add('is-glow');
  }

  function paintTend(tree) {
    var live = !!(current && current.tree && tree.monthKey === current.tree.monthKey);
    var costs = careCosts();
    var bal = available();
    var grown = live && (tree.progressPercent || 0) >= 100;
    $('vg-balance').textContent = live
      ? 'Balance: ' + bal + ' · Total earned: ' + totalEarned()
      : 'This month’s tree is a snapshot.';
    $('vg-water-btn').textContent = 'Water · ' + costs.water + ' 💧';
    $('vg-fert-btn').textContent = 'Fertilizer · ' + costs.fertilize + ' 💧';
    $('vg-water-btn').setAttribute('aria-label', 'Water the tree, costs ' + costs.water + ' Eco-Drop' + (costs.water === 1 ? '' : 's'));
    $('vg-fert-btn').setAttribute('aria-label', 'Fertilize the tree, costs ' + costs.fertilize + ' Eco-Drops');

    var showActions = live && !grown && !tree.readOnly;
    $('vg-tend-actions').hidden = !showActions;
    $('vg-grown').hidden = !(live && grown);
    var needHint = showActions && bal < costs.water;
    $('vg-tend-hint').hidden = !needHint;

    $('vg-water-btn').disabled = inFlight || !showActions || bal < costs.water;
    $('vg-fert-btn').disabled = inFlight || !showActions || bal < costs.fertilize;
    $('vg-tend').classList.toggle('is-readonly', !live);
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
    $('vg-species').textContent = tree.species || '';
    $('vg-stage-name').textContent = tree.stage.name;
    $('vg-progress-bar').style.width = (tree.progressPercent || 0) + '%';
    $('vg-progress').setAttribute('aria-valuenow', String(tree.progressPercent || 0));
    var next = tree.nextStage;
    $('vg-next-line').textContent = live
      ? (next
        ? next.dropsNeeded + ' more growth point' + (next.dropsNeeded === 1 ? '' : 's') + ' to ' + next.name
        : 'Fully grown this month. Next month starts a new seed.')
      : 'This tree finished at ' + tree.stage.name + '.';
    var label = tree.species + ', ' + tree.stage.name + ', ' + tree.label + (live ? ', current month' : ', past month');
    $('vg-canvas').setAttribute('aria-label', label);
    $('vg-plant').alt = tree.stage.name;
    if (!opts.holdPlant) $('vg-plant').src = asset(tree);
    renderAmbient(tree, { static: !live });
    paintTend(tree);
    setArrowState();
  }

  function stopFx() {
    $('vg-water').hidden = true;
    $('vg-fert').hidden = true;
    $('vg-unlock').hidden = true;
    $('vg-skip').hidden = true;
    $('vg-ground').classList.remove('is-wet');
    $('vg-plant').classList.remove('is-swap', 'is-bounce');
    playing = false;
    skipFn = null;
  }

  function playCare(kind, before, after) {
    if (reducedMotion()) {
      $('vg-plant').src = asset(after);
      if (after.stage.index > before.stage.index) {
        $('vg-unlock').hidden = false;
        setTimeout(function () { $('vg-unlock').hidden = true; }, 800);
      }
      return Promise.resolve();
    }
    playing = true;
    $('vg-skip').hidden = false;
    var avatar = (current && current.avatarUrl) || REMO;
    if (kind === 'water') {
      $('vg-water-avatar').src = avatar;
      $('vg-water-avatar').alt = avatar === REMO ? 'Remo watering the tree' : 'You watering the tree';
      $('vg-water').hidden = false;
      $('vg-ground').classList.add('is-wet');
      flashRainbow(after);
    } else {
      $('vg-fert-avatar').src = avatar;
      $('vg-fert-avatar').alt = avatar === REMO ? 'Remo fertilizing the tree' : 'You fertilizing the tree';
      $('vg-fert').hidden = false;
    }
    glowSun();
    if (after.stage.index > before.stage.index) $('vg-unlock').hidden = false;

    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        $('vg-plant').src = asset(after);
        $('vg-plant').classList.remove('is-bounce');
        void $('vg-plant').offsetWidth;
        $('vg-plant').classList.add('is-bounce');
        stopFx();
        resolve();
      }
      skipFn = finish;
      setTimeout(finish, kind === 'fertilize' ? 1800 : 2200);
    });
  }

  function showTree(tree) {
    stopFx();
    paint(tree);
  }

  function applyWallet(payload, animate) {
    if (!current || !payload) return;
    if (payload.availableDrops != null) current.availableDrops = payload.availableDrops;
    if (payload.totalEcoDrops != null && payload.availableDrops == null) current.availableDrops = payload.totalEcoDrops;
    if (payload.totalEarned != null) current.totalEarned = payload.totalEarned;
    current.totalEcoDrops = current.availableDrops;
    syncHeader(available(), animate);
  }

  function applyTree(tree) {
    if (!tree) return;
    if (current && current.tree && tree.monthKey === current.tree.monthKey) current.tree = tree;
    cache[tree.monthKey] = tree;
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
    syncHeader(available(), false);
    var banner = $('vg-banner');
    if (data.locked) {
      banner.classList.add('is-lock');
      banner.textContent = 'A learning plan adds more lessons — and more Eco-Drops — each month. You can still grow this tree from Play & Learn and your free lessons.';
    } else {
      banner.classList.remove('is-lock');
      banner.textContent = 'Finish lessons, tasks, and Play & Learn games to earn Eco-Drops, then use them to water and fertilize your tree.';
    }
    if (!viewingKey || viewingKey === data.tree.monthKey) showTree(data.tree);
  }

  function friendlyError(code, fallback) {
    if (code === 'INSUFFICIENT_DROPS') return 'You need more Eco-Drops. Finish a lesson, task, or Play & Learn game.';
    if (code === 'TREE_COMPLETE') return 'This tree is already fully grown.';
    if (code === 'READ_ONLY_TREE') return 'Past trees cannot be watered.';
    if (code === 'FERTILIZER_LIMIT') return 'Fertilizer can be used once per stage.';
    return fallback || 'Could not tend the tree.';
  }

  function tend(action) {
    if (inFlight || !current || !current.tree) return;
    if (current.tree.readOnly || (current.tree.progressPercent || 0) >= 100) return;
    var costs = careCosts();
    var cost = action === 'fertilize' ? costs.fertilize : costs.water;
    if (available() < cost) {
      $('vg-tend-hint').hidden = false;
      announce('You need more Eco-Drops.');
      return;
    }

    var before = current.tree;
    var snapshot = {
      availableDrops: available(),
      totalEarned: totalEarned(),
      tree: before,
    };
    inFlight = true;
    paintTend(before);

    current.availableDrops = snapshot.availableDrops - cost;
    current.totalEcoDrops = current.availableDrops;
    var optimistic = {
      monthKey: before.monthKey,
      label: before.label,
      species: before.species,
      isCurrent: true,
      readOnly: false,
      stage: before.stage,
      progressPercent: before.progressPercent,
      growthPoints: (Number(before.growthPoints) || 0) + (action === 'fertilize' ? 2 : 1),
      monthlyTarget: before.monthlyTarget,
      nextStage: before.nextStage,
    };
    paint(optimistic, { holdPlant: true });
    syncHeader(available(), true);

    fetch('/api/garden/care', {
      method: 'POST',
      headers: headers(),
      credentials: 'include',
      body: JSON.stringify({ action: action, requestId: requestId() }),
    })
      .then(function (r) { return r.json().then(function (body) { return { ok: r.ok, body: body }; }); })
      .then(function (res) {
        var body = res.body || {};
        if (!res.ok || !body.success) {
          throw Object.assign(new Error(friendlyError(body.code, body.error)), { code: body.code });
        }
        applyWallet(body, true);
        if (body.tree) {
          applyTree(body.tree);
          return playCare(action, before, body.tree).then(function () {
            showTree(body.tree);
            var msg = action === 'fertilize' ? 'Fertilizer applied.' : 'Watered the tree.';
            if (body.unlockedStage) msg += ' Stage unlocked: ' + body.unlockedStage.name + '!';
            announce(msg);
          });
        }
        showTree(current.tree);
      })
      .catch(function (err) {
        current.availableDrops = snapshot.availableDrops;
        current.totalEarned = snapshot.totalEarned;
        current.totalEcoDrops = snapshot.availableDrops;
        applyTree(snapshot.tree);
        showTree(snapshot.tree);
        syncHeader(available(), true);
        var line = (err && err.message) || 'Could not tend the tree.';
        $('vg-next-line').textContent = line;
        announce(line);
        if (err && err.code === 'INSUFFICIENT_DROPS') $('vg-tend-hint').hidden = false;
      })
      .then(function () {
        inFlight = false;
        if (current && current.tree) paintTend(current.tree);
      });
  }

  function boot() {
    if (!token()) return;
    fetch('/api/garden/current', { headers: headers(), credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (now) {
        if (!now || !now.success || !now.tree) throw new Error((now && now.error) || 'Could not load the garden');
        applyCurrent(now);
        if (window.RemoEdEcoDrops) RemoEdEcoDrops.checkAndCelebrate({ preferToast: true });
        return fetch('/api/garden/history', { headers: headers(), credentials: 'include' }).then(function (r) { return r.json(); });
      })
      .then(function (past) {
        history = (past && past.trees) || [];
        setArrowState();
      })
      .catch(function (err) {
        $('vg-next-line').textContent = (err && err.message) || 'Garden could not load.';
      });
  }

  $('vg-prev').addEventListener('click', function () { step(-1); });
  $('vg-next').addEventListener('click', function () { step(1); });
  $('vg-skip').addEventListener('click', function () { if (skipFn) skipFn(); });
  $('vg-water-btn').addEventListener('click', function () { tend('water'); });
  $('vg-fert-btn').addEventListener('click', function () { tend('fertilize'); });

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

  document.addEventListener('visibilitychange', function () {
    document.body.classList.toggle('vg-paused', document.hidden);
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
