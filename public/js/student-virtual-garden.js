/**
 * Single monthly tree. Species always comes from the server. Care actions grow it.
 */
(function () {
  'use strict';

  var REMO = '/images/remo-green.png';
  var FALLBACK_STAGE = '/images/garden/stage-0-seed.svg?v=stage-p2';
  /** Five tracker steps. Server stages 4 and 5 both map to Big Tree. */
  var TRACKER_STEPS = [
    { key: 'seed', label: 'Seed' },
    { key: 'sprout', label: 'Sprout' },
    { key: 'small-plant', label: 'Small Plant' },
    { key: 'medium-plant', label: 'Medium Plant' },
    { key: 'big-tree', label: 'Big Tree' },
  ];
  var ICON_CHECK =
    '<svg class="vg-tracker-mark" viewBox="0 0 24 24" aria-hidden="true"><path fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round" d="M5 12l5 5L20 7"/></svg>';
  var ICON_LOCK =
    '<svg class="vg-tracker-mark" viewBox="0 0 24 24" aria-hidden="true"><rect x="5" y="11" width="14" height="10" rx="2" fill="none" stroke="currentColor" stroke-width="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>';
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
  var SOUND_KEY = 'remoed_vg_sound';
  var audioCtx = null;
  var themes = null;

  function token() {
    if (window.RemoEdEcoDrops && RemoEdEcoDrops.studentToken) return RemoEdEcoDrops.studentToken();
    try {
      return localStorage.getItem('remoed_student_token') || localStorage.getItem('token') || '';
    } catch (_e) {
      return '';
    }
  }

  function headers() {
    return {
      Authorization: 'Bearer ' + token(),
      'Content-Type': 'application/json',
      'X-Remoed-View': isParentsView() ? 'parent' : 'student',
    };
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
      fertilize: (c.fertilize && c.fertilize.cost) || 2,
    };
  }

  function percentOf(points, target) {
    var t = Math.max(1, Math.floor(Number(target) || 1));
    var p = Math.max(0, Math.floor(Number(points) || 0));
    return Math.min(100, Math.floor((p * 100) / t));
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

  function loadThemes() {
    if (themes) return themes;
    themes = {};
    var el = $('vg-theme-data');
    if (!el) return themes;
    try {
      themes = JSON.parse(el.textContent || '{}') || {};
    } catch (_e) {
      themes = {};
    }
    return themes;
  }

  function themeFor(species) {
    var map = loadThemes();
    return (species && map[species]) || { tint: 'meadow', fact: 'Trees need water, sun, and care to grow.' };
  }

  function applyTheme(tree) {
    var theme = themeFor(tree && tree.species);
    var stage = $('vg-stage');
    if (stage) stage.setAttribute('data-tint', theme.tint || 'meadow');
    var fact = $('vg-fact');
    if (fact) fact.textContent = theme.fact || '';
  }

  function soundOn() {
    try {
      return localStorage.getItem(SOUND_KEY) === 'on';
    } catch (_e) {
      return false;
    }
  }

  function setSoundOn(on) {
    try {
      if (on) localStorage.setItem(SOUND_KEY, 'on');
      else localStorage.removeItem(SOUND_KEY);
    } catch (_e) { /* ignore quota / private mode */ }
    paintMute();
  }

  function paintMute() {
    var btn = $('vg-mute');
    if (!btn) return;
    var on = soundOn();
    btn.setAttribute('aria-pressed', on ? 'true' : 'false');
    btn.textContent = on ? 'Sound on' : 'Sound off';
    btn.setAttribute('aria-label', on ? 'Sound is on. Turn sound off.' : 'Sound is off. Turn sound on.');
  }

  function audio() {
    var AC = window.AudioContext || window.webkitAudioContext;
    if (!AC) return null;
    if (!audioCtx) audioCtx = new AC();
    return audioCtx;
  }

  function beep(freq, start, dur, type, vol) {
    var c = audio();
    if (!c) return;
    var osc = c.createOscillator();
    var gain = c.createGain();
    osc.type = type || 'sine';
    osc.frequency.value = freq;
    var t0 = c.currentTime + start;
    gain.gain.setValueAtTime(0.0001, t0);
    gain.gain.exponentialRampToValueAtTime(vol || 0.1, t0 + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(gain);
    gain.connect(c.destination);
    osc.start(t0);
    osc.stop(t0 + dur + 0.02);
  }

  function playSound(kind) {
    if (!soundOn()) return;
    var c = audio();
    if (!c) return;
    if (c.state === 'suspended' && typeof c.resume === 'function') c.resume();
    if (kind === 'water') {
      beep(880, 0, 0.08, 'sine', 0.08);
      beep(660, 0.09, 0.1, 'sine', 0.07);
      beep(520, 0.2, 0.12, 'triangle', 0.06);
      return;
    }
    if (kind === 'fert') {
      beep(392, 0, 0.12, 'triangle', 0.08);
      beep(494, 0.1, 0.14, 'triangle', 0.07);
      return;
    }
    beep(523, 0, 0.16, 'sine', 0.1);
    beep(659, 0.12, 0.18, 'sine', 0.1);
    beep(784, 0.26, 0.22, 'sine', 0.11);
  }

  function isParentsView() {
    return !document.body.classList.contains('student-kids-mode');
  }

  function paintParents() {
    var box = $('vg-parents');
    var line = $('vg-parents-line');
    if (!box) return;
    box.hidden = !isParentsView();
    if (!line || !current) return;
    loadParentCards();
    var earned = totalEarned();
    var avail = available();
    var spent = Math.max(0, earned - avail);
    line.textContent = 'Your child has earned ' + earned + ' Eco-Drop' + (earned === 1 ? '' : 's') +
      ' so far. ' + avail + (avail === 1 ? ' is' : ' are') + ' still available. ' +
      spent + (spent === 1 ? ' has' : ' have') + ' been used to water or fertilize the garden. ' +
      'Each finished lesson, task, or Play & Learn game adds 1 Eco-Drop.';
  }

  function paintGallery() {
    var wrap = $('vg-gallery');
    var row = $('vg-gallery-row');
    if (!wrap || !row) return;
    wrap.hidden = history.length === 0;
    row.innerHTML = '';
    history.forEach(function (item) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'vg-gallery-card' + (item.monthKey === viewingKey ? ' is-on' : '');
      btn.setAttribute('aria-label', (item.label || item.monthKey) + ', ' + (item.species || 'tree'));
      var img = document.createElement('img');
      var stage = item.finalStage || {};
      img.src = stage.asset || FALLBACK_STAGE;
      img.alt = '';
      var cap = document.createElement('span');
      cap.className = 'vg-gallery-cap';
      cap.textContent = item.label || item.monthKey;
      var name = document.createElement('span');
      name.className = 'vg-gallery-sp';
      name.textContent = item.species || '';
      btn.appendChild(img);
      btn.appendChild(cap);
      btn.appendChild(name);
      btn.addEventListener('click', function () { loadMonth(item.monthKey); });
      row.appendChild(btn);
    });
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
    html += '<img class="vg-cloud vg-cloud-1" src="/images/garden/ambient-cloud.svg" alt="">';
    html += '<img class="vg-cloud vg-cloud-2" src="/images/garden/ambient-cloud.svg" alt="">';
    html += '<img class="vg-cloud vg-cloud-3" src="/images/garden/ambient-cloud.svg" alt="">';
    if (live) {
      html += '<img class="vg-sun" src="/images/garden/ambient-sun.svg" alt="">';
    }
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
    if (amb.rainbow) {
      html += '<img class="vg-blossom vg-blossom-1" src="/images/garden/ambient-blossom.svg" alt="">';
      html += '<img class="vg-fruit" src="/images/garden/ambient-fruit.svg" alt="">';
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
    $('vg-balance').textContent = String(bal);
    if ($('vg-earned')) $('vg-earned').textContent = 'Total earned: ' + totalEarned();
    $('vg-water-btn').textContent = 'Water · ' + costs.water + ' 💧';
    $('vg-fert-btn').textContent = 'Fertilizer · ' + costs.fertilize + ' 💧';
    $('vg-water-btn').setAttribute('aria-label', 'Water the tree, costs ' + costs.water + ' Eco-Drop' + (costs.water === 1 ? '' : 's'));
    $('vg-fert-btn').setAttribute('aria-label', 'Fertilize the tree, costs ' + costs.fertilize + ' Eco-Drops');

    var showActions = live && !grown && !tree.readOnly && !isParentsView();
    $('vg-tend-actions').hidden = !showActions;
    $('vg-grown').hidden = !(live && grown);
    var needWater = showActions && bal < costs.water;
    var needFert = showActions && bal < costs.fertilize;
    $('vg-tend-hint').hidden = !needWater;
    if ($('vg-short-hint')) $('vg-short-hint').hidden = !(needWater || needFert);
    $('vg-water-btn').disabled = inFlight || !showActions || bal < costs.water;
    $('vg-fert-btn').disabled = inFlight || !showActions || bal < costs.fertilize;
    $('vg-tend').classList.toggle('is-readonly', !live);
    $('vg-tend').classList.toggle('is-busy', inFlight);
    $('vg-water-btn').setAttribute('aria-busy', inFlight ? 'true' : 'false');
    $('vg-fert-btn').setAttribute('aria-busy', inFlight ? 'true' : 'false');
    paintParents();
    paintReward(tree);
  }

  function paintReward(tree) {
    var claim = $('vg-claim');
    var plant = $('vg-plant');
    var note = $('vg-reward');
    if (!claim || !plant) return;
    var live = !!(current && current.tree && tree.monthKey === current.tree.monthKey && !tree.readOnly);
    var done = !!(tree.completed || (live && (tree.progressPercent || 0) >= 100));
    claim.hidden = !(live && done && !isParentsView());
    plant.hidden = !(live && done && (tree.sequence || 1) === 1 && !isParentsView());
    if (note) {
      var preview = live && done && current && current.rewardPreview ? current.rewardPreview.message : '';
      note.hidden = !preview;
      note.textContent = preview || '';
    }
  }

  function bubbleText(tree, live) {
    if (!live) return 'This tree is from a past month.';
    if ((tree.progressPercent || 0) >= 100) return 'Your tree is all grown up!';
    if (available() < 1) return 'Finish a game to earn more drops!';
    var next = tree.nextStage;
    if (next) {
      return next.dropsNeeded + ' more growth point' + (next.dropsNeeded === 1 ? '' : 's') + ' to ' + next.name + '.';
    }
    return 'Water your tree to help it grow.';
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
    $('vg-stage-name').textContent = 'Level ' + ((Number(tree.stage.index) || 0) + 1) + ': ' + tree.stage.name;
    $('vg-progress-bar').style.width = (tree.progressPercent || 0) + '%';
    $('vg-progress').setAttribute('aria-valuenow', String(tree.progressPercent || 0));
    $('vg-next-line').textContent = bubbleText(tree, live);
    var label = tree.species + ', ' + tree.stage.name + ', ' + tree.label + (live ? ', current month' : ', past month');
    $('vg-canvas').setAttribute('aria-label', label);
    $('vg-plant').alt = tree.stage.name;
    $('vg-plant').classList.toggle('is-sway', live && !tree.readOnly && !reducedMotion());
    if (!opts.holdPlant) $('vg-plant').src = asset(tree);
    renderAmbient(tree, { static: !live });
    applyTheme(tree);
    paintTracker(tree);
    paintTend(tree);
    paintGallery();
    setArrowState();
  }

  function trackerSlot(stageIndex) {
    return Math.min(4, Math.max(0, Number(stageIndex) || 0));
  }

  function trackerThumb(step, stages, serverIndex) {
    if (step.key === 'big-tree') {
      if (serverIndex >= 5 && stages[5]) return stages[5].asset;
      return (stages[4] && stages[4].asset) || FALLBACK_STAGE;
    }
    var i;
    for (i = 0; i < stages.length; i++) {
      if (stages[i].key === step.key) return stages[i].asset;
    }
    return FALLBACK_STAGE;
  }

  function paintTracker(tree) {
    var list = $('vg-tracker');
    if (!list) return;
    var stages = (current && current.stages) || [];
    var serverIndex = tree && tree.stage ? Number(tree.stage.index) || 0 : 0;
    var nowSlot = trackerSlot(serverIndex);
    var allDone = serverIndex >= 5;
    list.innerHTML = '';
    TRACKER_STEPS.forEach(function (step, i) {
      var li = document.createElement('li');
      var done = allDone || i < nowSlot;
      var currentStep = !allDone && i === nowSlot;
      var locked = !done && !currentStep;
      li.className = 'vg-tracker-item' + (done ? ' is-done' : '') + (currentStep ? ' is-now' : '') + (locked ? ' is-lock' : '');
      if (currentStep) li.setAttribute('aria-current', 'step');
      var img = document.createElement('img');
      img.src = trackerThumb(step, stages, serverIndex);
      img.alt = '';
      var name = document.createElement('span');
      name.className = 'vg-tracker-label';
      name.textContent = step.label;
      var state = document.createElement('span');
      state.className = 'vg-tracker-state';
      if (done) {
        state.innerHTML = ICON_CHECK;
        li.setAttribute('title', step.label + ' — done');
      } else if (locked) {
        state.innerHTML = ICON_LOCK;
        li.setAttribute('title', step.label + ' — locked');
      } else {
        li.setAttribute('title', step.label + ' — now');
      }
      li.appendChild(img);
      li.appendChild(state);
      li.appendChild(name);
      list.appendChild(li);
    });
  }

  function stopFx() {
    $('vg-water').hidden = true;
    $('vg-fert').hidden = true;
    $('vg-unlock').hidden = true;
    $('vg-skip').hidden = true;
    $('vg-ground').classList.remove('is-wet');
    $('vg-progress').classList.remove('is-pop');
    $('vg-plant').classList.remove('is-swap', 'is-bounce');
    $('vg-water').classList.remove('is-play');
    $('vg-fert').classList.remove('is-play');
    playing = false;
    skipFn = null;
  }

  function hideCelebrate() {
    var box = $('vg-celebrate');
    if (!box) return;
    box.hidden = true;
    if ($('vg-confetti')) $('vg-confetti').hidden = true;
  }

  function replayLayer(el) {
    if (!el) return;
    el.classList.remove('is-play');
    void el.offsetWidth;
    el.classList.add('is-play');
  }

  function showCelebrate(tree) {
    var box = $('vg-celebrate');
    var title = $('vg-celebrate-title');
    if (!box || !title || !tree || !tree.stage) return;
    title.textContent = 'Your ' + tree.species + ' grew into a ' + tree.stage.name + '!';
    box.hidden = false;
    var ok = $('vg-celebrate-ok');
    if (ok) ok.focus();
    announce(title.textContent);
  }

  function popProgress() {
    var bar = $('vg-progress');
    bar.classList.remove('is-pop');
    void bar.offsetWidth;
    bar.classList.add('is-pop');
  }

  function playCare(kind, before, after) {
    var upgraded = !!(after && before && after.stage && before.stage && after.stage.index > before.stage.index);
    playSound(upgraded ? 'grow' : (kind === 'water' ? 'water' : 'fert'));
    if (reducedMotion()) {
      $('vg-plant').src = asset(after);
      if (upgraded) showCelebrate(after);
      return Promise.resolve();
    }
    playing = true;
    $('vg-skip').hidden = false;
    $('vg-plant').classList.remove('is-sway');
    var avatar = (current && current.avatarUrl) || REMO;
    if (kind === 'water') {
      $('vg-water-avatar').src = avatar;
      $('vg-water-avatar').alt = avatar === REMO ? 'Remo watering the tree' : 'You watering the tree';
      $('vg-water').hidden = false;
      replayLayer($('vg-water'));
      $('vg-ground').classList.add('is-wet');
      flashRainbow(after);
    } else {
      $('vg-fert-avatar').src = avatar;
      $('vg-fert-avatar').alt = avatar === REMO ? 'Remo fertilizing the tree' : 'You fertilizing the tree';
      $('vg-fert').hidden = false;
      replayLayer($('vg-fert'));
    }
    popProgress();
    glowSun();
    if (upgraded) {
      $('vg-unlock').hidden = false;
      $('vg-confetti').hidden = false;
      replayLayer($('vg-confetti'));
    }

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
        if (upgraded) showCelebrate(after);
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
      growthPoints: (Number(before.growthPoints) || 0) + (action === 'fertilize' ? ((current.care && current.care.fertilize && current.care.fertilize.growthPoints) || 3) : 1),
      monthlyTarget: before.monthlyTarget,
      nextStage: before.nextStage,
    };
    optimistic.progressPercent = percentOf(optimistic.growthPoints, optimistic.monthlyTarget);
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
        paintGallery();
        setArrowState();
      })
      .catch(function (err) {
        $('vg-next-line').textContent = (err && err.message) || 'Garden could not load.';
      });
  }

  $('vg-prev').addEventListener('click', function () { step(-1); });
  $('vg-next').addEventListener('click', function () { step(1); });
  $('vg-skip').addEventListener('click', function () { if (skipFn) skipFn(); });
  function loadParentCards() {
    var box = $('vg-parent-cards');
    if (!box || !isParentsView()) return;
    fetch('/api/garden/parent', { headers: headers(), credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        box.textContent = '';
        if (!body || !body.success) return;
        (body.cards || []).forEach(function (card) {
          var el = document.createElement('section');
          el.className = 'vg-parent-card';
          var title = document.createElement('h3');
          title.textContent = 'Free lessons earned by ' + card.childName + ' this month';
          var big = document.createElement('strong');
          big.textContent = String(card.freeLessonsThisMonth || 0);
          el.appendChild(title);
          el.appendChild(big);
          if (card.zero) {
            var zero = document.createElement('p');
            zero.textContent = card.zeroMessage || 'No free lessons yet this month.';
            el.appendChild(zero);
          }
          (card.breakdown || []).forEach(function (line) {
            var p = document.createElement('p');
            p.textContent = line.label + ': ' + line.credits;
            el.appendChild(p);
          });
          if (card.tree) {
            var progress = document.createElement('p');
            progress.textContent = card.tree.text;
            el.appendChild(progress);
          }
          if (card.eligibilityTip) {
            var tip = document.createElement('p');
            tip.textContent = card.eligibilityTip;
            el.appendChild(tip);
          }
          var unused = document.createElement('p');
          unused.textContent = (card.unusedCredits || 0) + ' unused free lessons'
            + (card.nearestExpiry ? '. Nearest expiry ' + new Date(card.nearestExpiry).toLocaleDateString() : '');
          el.appendChild(unused);
          var book = document.createElement('a');
          book.href = card.bookUrl || 'student-book.html';
          book.textContent = 'Book a free lesson';
          el.appendChild(book);
          var life = card.lifetime || {};
          var totals = document.createElement('p');
          totals.textContent = (life.freeLessons || 0) + ' free lessons · ' + (life.trees || 0) + ' trees · ' + (life.badges || 0) + ' badges';
          el.appendChild(totals);
          var shareRow = document.createElement('p');
          if (!card.sharingEnabled) shareRow.textContent = 'Ask your parent to turn on sharing';
          var toggle = document.createElement('button');
          toggle.type = 'button';
          toggle.textContent = card.sharingEnabled ? 'Sharing on' : 'Turn on sharing';
          toggle.addEventListener('click', function () {
            fetch('/api/garden/parent/sharing', {
              method: 'POST',
              headers: headers(),
              credentials: 'include',
              body: JSON.stringify({
                childUsername: card.childUsername,
                sharingEnabled: !card.sharingEnabled,
                shareDisplay: card.shareDisplay || 'first',
              }),
            }).then(function () { loadParentCards(); });
          });
          el.appendChild(shareRow);
          el.appendChild(toggle);
          box.appendChild(el);
        });
      })
      .catch(function () {});
  }

  function openShare(type, targetId, text) {
    fetch('/api/garden/shares', {
      method: 'POST',
      headers: headers(),
      credentials: 'include',
      body: JSON.stringify({ type: type, targetId: targetId }),
    })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (!body || !body.success) throw new Error((body && body.error) || 'Could not share');
        var url = body.url;
        var payload = { title: 'RemoEd', text: text, url: url };
        if (navigator.share) {
          navigator.share(payload).catch(function () { showShareFallback(url, text); });
          return;
        }
        showShareFallback(url, text);
      })
      .catch(function (err) {
        $('vg-next-line').textContent = (err && err.message) || 'Could not share';
        announce($('vg-next-line').textContent);
      });
  }

  function showShareFallback(url, text) {
    var encoded = encodeURIComponent(url);
    var full = encodeURIComponent(text + ' ' + url);
    var note = 'Only the first name, badge, and month are shown.';
    var links = [
      ['Facebook', 'https://www.facebook.com/sharer/sharer.php?u=' + encoded],
      ['Messenger', 'https://www.facebook.com/dialog/send?link=' + encoded + '&redirect_uri=' + encoded],
      ['WhatsApp', 'https://wa.me/?text=' + full],
      ['X', 'https://twitter.com/intent/tweet?text=' + full],
    ];
    var panel = document.createElement('div');
    panel.className = 'vg-forest';
    var card = document.createElement('div');
    card.className = 'vg-forest-card';
    card.setAttribute('role', 'dialog');
    links.forEach(function (pair) {
      var a = document.createElement('a');
      a.href = pair[1];
      a.target = '_blank';
      a.rel = 'noopener';
      a.textContent = pair[0];
      card.appendChild(a);
      card.appendChild(document.createTextNode(' '));
    });
    var copy = document.createElement('button');
    copy.type = 'button';
    copy.textContent = 'Copy link';
    copy.addEventListener('click', function () {
      if (navigator.clipboard) navigator.clipboard.writeText(url);
      $('vg-next-line').textContent = 'Link copied';
      announce('Link copied');
    });
    var download = document.createElement('a');
    download.href = url + '/card.png?variant=square';
    download.textContent = 'Download image';
    var close = document.createElement('button');
    close.type = 'button';
    close.textContent = 'Close';
    close.addEventListener('click', function () { panel.remove(); });
    var hint = document.createElement('p');
    hint.className = 'vg-share-note';
    hint.textContent = note;
    card.appendChild(copy);
    card.appendChild(download);
    card.appendChild(hint);
    card.appendChild(close);
    panel.appendChild(card);
    document.body.appendChild(panel);
  }

  function printCertificate(treeId) {
    fetch('/api/garden/trees/' + encodeURIComponent(treeId) + '/certificate', { headers: headers(), credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (!body || !body.success || !body.html) throw new Error((body && body.error) || 'Could not open the certificate');
        var win = window.open('', '_blank');
        if (!win) return;
        win.document.write(body.html);
        win.document.close();
      })
      .catch(function (err) {
        $('vg-next-line').textContent = (err && err.message) || 'Could not open the certificate';
      });
  }

  function claimReward() {
    if (!current || !current.tree || !current.tree.id) return;
    fetch('/api/garden/trees/' + encodeURIComponent(current.tree.id) + '/claim', {
      method: 'POST',
      headers: headers(),
      credentials: 'include',
    })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (!body || !body.success) throw new Error((body && body.error) || 'Could not claim');
        var line = body.message || 'Reward saved.';
        if (body.expiresAt && body.grantedCredits) {
          line += ' Use them by ' + new Date(body.expiresAt).toLocaleDateString() + '.';
        }
        if (body.newBadges && body.newBadges.length) {
          line += ' New badge! ' + body.newBadges.map(function (b) { return b.name; }).join(', ');
        }
        $('vg-next-line').textContent = line;
        announce(line);
      })
      .catch(function (err) {
        $('vg-next-line').textContent = (err && err.message) || 'Could not claim';
      });
  }

  function plantBonus() {
    fetch('/api/garden/plant', { method: 'POST', headers: headers(), credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (!body || !body.success || !body.tree) throw new Error((body && body.error) || 'Could not plant');
        current.tree = body.tree;
        showTree(body.tree);
      })
      .catch(function (err) {
        $('vg-next-line').textContent = (err && err.message) || 'Could not plant';
      });
  }

  function openForest() {
    var panel = $('vg-forest-panel');
    fetch('/api/garden/forest', { headers: headers(), credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        if (!body || !body.success) throw new Error((body && body.error) || 'Could not load the forest');
        var totals = body.totals || {};
        $('vg-forest-totals').textContent = (totals.trees || 0) + ' trees · ' + (totals.badges || 0) + ' badges · ' + (totals.freeLessons || 0) + ' free lessons';
        var grid = $('vg-forest-grid');
        grid.textContent = '';
        (body.trees || []).forEach(function (tree) {
          var btn = document.createElement('button');
          btn.type = 'button';
          btn.className = 'vg-forest-tree' + (tree.perfectMonth ? ' is-perfect' : '');
          var label = tree.label + ' · ' + tree.species;
          if (tree.perfectMonth) label += ' · Golden';
          else if (tree.completed) label += ' · Grown';
          else if (tree.unfinished) label += ' · Unfinished';
          btn.textContent = label;
          if (tree.completed) {
            var share = document.createElement('button');
            share.type = 'button';
            share.textContent = 'Share';
            share.addEventListener('click', function (ev) {
              ev.stopPropagation();
              openShare('tree', tree.id, 'I grew a ' + tree.species + ' tree on RemoEd by finishing my lessons! 🌳');
            });
            grid.appendChild(share);
            var cert = document.createElement('button');
            cert.type = 'button';
            cert.textContent = 'Certificate';
            cert.addEventListener('click', function (ev) {
              ev.stopPropagation();
              printCertificate(tree.id);
            });
            grid.appendChild(cert);
          }
          btn.addEventListener('click', function () {
            panel.hidden = true;
            if (current && current.tree && tree.monthKey === current.tree.monthKey) showTree(current.tree);
            else loadMonth(tree.monthKey);
          });
          grid.appendChild(btn);
        });
        if (!(body.trees || []).length) {
          var empty = document.createElement('p');
          empty.textContent = 'Your first tree is growing. Finish it to start a forest.';
          grid.appendChild(empty);
        }
        var badges = $('vg-badge-grid');
        badges.textContent = '';
        (body.badges || []).forEach(function (badge) {
          var card = document.createElement('p');
          card.className = badge.earned ? 'vg-badge' : 'vg-badge is-locked';
          card.textContent = badge.name + (badge.earned ? '' : ' — ' + badge.requirement + (badge.progress ? ' (' + badge.progress + ')' : ''));
          if (badge.earned) {
            var shareBadge = document.createElement('button');
            shareBadge.type = 'button';
            shareBadge.textContent = 'Share';
            shareBadge.addEventListener('click', function () {
              openShare('badge', badge.key, 'I just earned the ' + badge.name + ' badge on RemoEd! 🌳');
            });
            card.appendChild(shareBadge);
          }
          badges.appendChild(card);
        });
        panel.hidden = false;
      })
      .catch(function (err) {
        $('vg-next-line').textContent = (err && err.message) || 'Could not load the forest';
      });
  }

  $('vg-water-btn').addEventListener('click', function () { tend('water'); });
  $('vg-fert-btn').addEventListener('click', function () { tend('fertilize'); });
  if ($('vg-claim')) $('vg-claim').addEventListener('click', claimReward);
  if ($('vg-plant')) $('vg-plant').addEventListener('click', plantBonus);
  if ($('vg-forest')) $('vg-forest').addEventListener('click', openForest);
  if ($('vg-forest-close')) $('vg-forest-close').addEventListener('click', function () { $('vg-forest-panel').hidden = true; });
  if ($('vg-pond')) $('vg-pond').addEventListener('click', function () {
    fetch('/api/garden/decorate', {
      method: 'POST',
      headers: Object.assign({ 'Content-Type': 'application/json' }, headers()),
      credentials: 'include',
      body: JSON.stringify({ itemKey: 'pond', requestId: 'pond-' + Date.now().toString(36) }),
    }).then(function (r) { return r.json(); }).then(function (body) {
      $('vg-next-line').textContent = body && body.success ? 'Pond added.' : ((body && body.error) || 'Could not add a pond');
    });
  });
  $('vg-celebrate-ok').addEventListener('click', hideCelebrate);
  if ($('vg-mute')) {
    $('vg-mute').addEventListener('click', function () { setSoundOn(!soundOn()); });
  }
  paintMute();
  if (window.MutationObserver) {
    new MutationObserver(function () { paintParents(); }).observe(document.body, {
      attributes: true,
      attributeFilter: ['class'],
    });
  }

  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape' && skipFn) {
      skipFn();
      return;
    }
    if (e.key === 'Escape' && $('vg-celebrate') && !$('vg-celebrate').hidden) {
      hideCelebrate();
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
