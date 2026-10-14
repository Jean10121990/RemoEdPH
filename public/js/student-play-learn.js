/**
 * Play & Learn (student-games-activities.html).
 * Home lists CATEGORIES; each category lists its games; a game runs on the play stage.
 * To add a game: add an entry to a category's `games` (id, title, line, cover, rounds, start).
 * To add a category: add an entry to CATEGORIES. Routes: #/ , #/<category> , #/<category>/<game>.
 */
(function () {
  'use strict';

  var W = window.RemoedPlayWords;
  var app = document.getElementById('pl-app');
  if (!W || !app) return;

  /* ---------- helpers ---------- */

  function esc(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  }

  function icon(name) {
    return window.RemoedLucide ? window.RemoedLucide.svg(name) : '';
  }

  function shuffle(list) {
    var a = list.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(Math.random() * (i + 1));
      var t = a[i]; a[i] = a[j]; a[j] = t;
    }
    return a;
  }

  function sample(list, n, exclude) {
    return shuffle(list.filter(function (x) { return !exclude || exclude.indexOf(x) === -1; })).slice(0, n);
  }

  var timers = [];
  var cleanups = [];

  function later(fn, ms) {
    var id = setTimeout(fn, ms);
    timers.push(id);
    return id;
  }

  function onLeave(fn) {
    cleanups.push(fn);
  }

  function leaveStage() {
    timers.forEach(clearTimeout);
    timers = [];
    cleanups.splice(0).forEach(function (fn) {
      try { fn(); } catch (e) { /* ignore */ }
    });
    Voice.stop();
  }

  /* ---------- narrator ---------- */

  var Voice = (function () {
    var synth = window.speechSynthesis || null;
    var chosen = null;
    var PREFERRED = ['Samantha', 'Google US English', 'Microsoft Aria', 'Microsoft Jenny', 'Microsoft Zira', 'Karen', 'Moira'];

    function pickVoice() {
      if (!synth) return;
      var voices = synth.getVoices() || [];
      for (var i = 0; i < PREFERRED.length; i++) {
        for (var j = 0; j < voices.length; j++) {
          if (voices[j].name.indexOf(PREFERRED[i]) !== -1) { chosen = voices[j]; return; }
        }
      }
      chosen = voices.filter(function (v) { return /^en(-|_)US/i.test(v.lang); })[0] ||
        voices.filter(function (v) { return /^en/i.test(v.lang); })[0] || null;
    }

    if (synth) {
      pickVoice();
      if (typeof synth.addEventListener === 'function') synth.addEventListener('voiceschanged', pickVoice);
    }

    function say(text, opts) {
      opts = opts || {};
      return new Promise(function (resolve) {
        var fallback = setTimeout(resolve, 900 + String(text).length * 85);
        if (!synth) return;
        try {
          synth.cancel();
          var u = new SpeechSynthesisUtterance(text);
          if (chosen) u.voice = chosen;
          u.lang = chosen ? chosen.lang : 'en-US';
          u.rate = opts.rate || 0.85;
          u.pitch = opts.pitch || 1.15;
          u.onend = function () { clearTimeout(fallback); resolve(); };
          u.onerror = function () { clearTimeout(fallback); resolve(); };
          synth.speak(u);
        } catch (e) {
          clearTimeout(fallback);
          resolve();
        }
      });
    }

    function stop() {
      if (synth) try { synth.cancel(); } catch (e) { /* ignore */ }
    }

    return { say: say, stop: stop, available: !!synth };
  })();

  /* ---------- sound effects (Web Audio, no files) ---------- */

  var Sfx = (function () {
    var ctx = null;

    function ac() {
      if (!ctx) {
        var C = window.AudioContext || window.webkitAudioContext;
        if (!C) return null;
        ctx = new C();
      }
      if (ctx.state === 'suspended') ctx.resume();
      return ctx;
    }

    function tone(f1, f2, dur, type, vol, delay) {
      var c = ac();
      if (!c) return;
      var t = c.currentTime + (delay || 0);
      var o = c.createOscillator();
      var g = c.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f1, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(30, f2), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(vol || 0.2, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(c.destination);
      o.start(t); o.stop(t + dur + 0.05);
    }

    return {
      unlock: function () { ac(); },
      pop: function () { tone(900, 180, 0.12, 'triangle', 0.3); },
      yes: function () { tone(660, 660, 0.12, 'sine', 0.18); tone(880, 880, 0.12, 'sine', 0.18, 0.11); tone(1320, 1320, 0.22, 'sine', 0.16, 0.22); },
      no: function () { tone(320, 200, 0.22, 'sine', 0.14); },
      boing: function () { tone(180, 520, 0.18, 'sine', 0.22); tone(520, 260, 0.2, 'sine', 0.16, 0.16); },
      chomp: function () { tone(220, 110, 0.09, 'square', 0.08); tone(220, 110, 0.09, 'square', 0.08, 0.16); tone(220, 110, 0.09, 'square', 0.08, 0.32); },
      tada: function () { tone(523, 523, 0.14, 'triangle', 0.18); tone(659, 659, 0.14, 'triangle', 0.18, 0.12); tone(784, 784, 0.14, 'triangle', 0.18, 0.24); tone(1047, 1047, 0.4, 'triangle', 0.2, 0.36); }
    };
  })();

  /** Little stars that burst out of an element. */
  function burst(target, count) {
    var host = document.body;
    var r = target.getBoundingClientRect();
    var cx = r.left + r.width / 2;
    var cy = r.top + r.height / 2;
    var colors = ['#fdd835', '#ff7eb6', '#00aeef', '#7ed957', '#ffa726', '#b388ff'];
    for (var i = 0; i < (count || 12); i++) {
      var s = document.createElement('span');
      s.className = 'pl-spark';
      var ang = (Math.PI * 2 * i) / (count || 12) + Math.random() * 0.4;
      var dist = 60 + Math.random() * 70;
      s.style.left = cx + 'px';
      s.style.top = cy + 'px';
      s.style.setProperty('--dx', Math.cos(ang) * dist + 'px');
      s.style.setProperty('--dy', Math.sin(ang) * dist + 'px');
      s.style.background = colors[i % colors.length];
      host.appendChild(s);
      setTimeout(function (el) { return function () { el.remove(); }; }(s), 900);
    }
  }

  /* ---------- games ---------- */

  function startBubbles(ctx) {
    var pool = W.words.slice();
    var order = shuffle(pool).slice(0, ctx.rounds);
    var round = 0;
    var locked = false;
    var target = null;

    function sayPrompt() {
      ctx.prompt('Pop the ' + target.word + '!');
      return Voice.say('Pop the ' + target.word + '!');
    }

    function next() {
      if (round >= ctx.rounds) return ctx.finish();
      target = order[round];
      var count = Math.min(3 + Math.floor(round / 2), ctx.stage.clientWidth < 560 ? 4 : 6);
      var dur = Math.max(11 - round * 1.1, 5.5);
      var options = shuffle([target].concat(sample(pool, count - 1, [target])));
      var lag = shuffle(options.map(function (_, i) { return i; }));
      var html = '<div class="pl-bubble-field">';
      options.forEach(function (w, i) {
        var x = ((i + 0.5) / count) * 100;
        var delay = -(((lag[i] + 0.35) / count) * dur);
        html += '<button type="button" class="pl-bubble" data-id="' + esc(w.id) + '" aria-label="' + esc(w.word) + '"' +
          ' style="--x:' + x.toFixed(1) + '%;--dur:' + dur.toFixed(2) + 's;--delay:' + delay.toFixed(2) + 's;--sway:' + (2.2 + Math.random() * 1.6).toFixed(2) + 's">' +
          '<span class="pl-bubble-inner"><img class="pl-bubble-pic" src="' + esc(w.img) + '" alt="" draggable="false">' +
          '<img class="pl-bubble-shell" src="' + esc(W.pieces.bubble) + '" alt="" draggable="false"></span></button>';
      });
      html += '</div>';
      ctx.stage.innerHTML = html;
      locked = false;
      sayPrompt();
    }

    ctx.stage.addEventListener('click', function (e) {
      var b = e.target.closest('.pl-bubble');
      if (!b || locked) return;
      if (b.getAttribute('data-id') === target.id) {
        locked = true;
        b.classList.add('is-popped');
        Sfx.pop();
        burst(b, 14);
        later(Sfx.yes, 120);
        ctx.win();
        Voice.say('Yes! ' + target.word + '!');
        round++;
        later(next, 1500);
      } else {
        b.classList.remove('is-wobble');
        void b.offsetWidth;
        b.classList.add('is-wobble');
        Sfx.no();
        Voice.say('Oops! Find the ' + target.word + '.');
      }
    });

    ctx.onHear(sayPrompt);
    next();
  }

  function startMystery(ctx) {
    var order = shuffle(W.words).slice(0, ctx.rounds);
    var round = 0;
    var current = null;
    var recognizer = null;
    var SR = window.SpeechRecognition || window.webkitSpeechRecognition;

    function stopMic() {
      if (recognizer) {
        try { recognizer.abort(); } catch (e) { /* ignore */ }
        recognizer = null;
      }
    }
    onLeave(stopMic);

    function sayPrompt() {
      if (!current || !current.opened) {
        ctx.prompt('What is inside? Tap the gift!');
        return Voice.say('What is inside? Tap the gift!');
      }
      ctx.prompt('It\u2019s ' + W.withArticle(current.word) + '!');
      return Voice.say('It\u2019s ' + W.withArticle(current.word) + '!');
    }

    function next() {
      stopMic();
      if (round >= ctx.rounds) return ctx.finish();
      current = { word: order[round], opened: false };
      var w = current.word;
      ctx.stage.innerHTML =
        '<div class="pl-mystery">' +
          '<button type="button" class="pl-gift is-shaking" aria-label="Open the gift">' +
            '<img src="' + esc(W.pieces.gift) + '" alt="" draggable="false">' +
          '</button>' +
          '<div class="pl-reveal" hidden>' +
            '<img class="pl-reveal-pic" src="' + esc(w.img) + '" alt="' + esc(w.word) + '" draggable="false">' +
            '<div class="pl-word">' + esc(w.word) + '</div>' +
            '<div class="pl-actions">' +
              '<button type="button" class="pl-btn pl-btn--sky" data-act="say">' + icon('volume-2') + '<span>Say it</span></button>' +
              (SR ? '<button type="button" class="pl-btn pl-btn--pink" data-act="mic">' + icon('mic') + '<span>My turn</span></button>' : '') +
              '<button type="button" class="pl-btn pl-btn--green" data-act="next">' + icon('arrow-right') + '<span>Next</span></button>' +
            '</div>' +
            '<p class="pl-mic-note" aria-live="polite"></p>' +
          '</div>' +
        '</div>';
      sayPrompt();
    }

    function openGift(btn) {
      if (current.opened) return;
      current.opened = true;
      btn.classList.remove('is-shaking');
      btn.classList.add('is-opening');
      Sfx.tada();
      burst(btn, 16);
      later(function () {
        btn.hidden = true;
        var rv = ctx.stage.querySelector('.pl-reveal');
        rv.hidden = false;
        ctx.win();
        sayPrompt().then(function () {
          if (current && current.opened) Voice.say('Can you say ' + current.word.word + '?');
        });
      }, 520);
    }

    function listen(btn) {
      var note = ctx.stage.querySelector('.pl-mic-note');
      var word = current.word.word.toLowerCase();
      stopMic();
      Voice.stop();
      try {
        recognizer = new SR();
      } catch (e) {
        note.textContent = 'Say it out loud with me: ' + current.word.word + '!';
        return;
      }
      recognizer.lang = 'en-US';
      recognizer.interimResults = false;
      recognizer.maxAlternatives = 5;
      btn.classList.add('is-listening');
      note.textContent = 'Listening\u2026 say "' + current.word.word + '"';
      var heard = false;
      recognizer.onresult = function (ev) {
        heard = true;
        var ok = false;
        for (var i = 0; i < ev.results.length; i++) {
          for (var j = 0; j < ev.results[i].length; j++) {
            var t = String(ev.results[i][j].transcript || '').toLowerCase();
            if (t.indexOf(word) !== -1 || t.indexOf(word.split(' ')[0]) !== -1 || t.indexOf(word.slice(0, 3)) !== -1) ok = true;
          }
        }
        if (ok) {
          note.textContent = 'Great job! You said ' + current.word.word + '!';
          Sfx.yes();
          burst(btn, 12);
          Voice.say('Great job!');
        } else {
          note.textContent = 'Good try! Let\u2019s say it together: ' + current.word.word + '.';
          Voice.say('Good try! Let\u2019s say it together. ' + current.word.word + '.', { rate: 0.75 });
        }
      };
      recognizer.onerror = function () {
        if (!heard) {
          note.textContent = 'That\u2019s okay! Say it out loud with me: ' + current.word.word + '.';
          Voice.say(current.word.word, { rate: 0.7 });
        }
      };
      recognizer.onend = function () {
        btn.classList.remove('is-listening');
        recognizer = null;
      };
      try { recognizer.start(); } catch (e) { btn.classList.remove('is-listening'); }
    }

    ctx.stage.addEventListener('click', function (e) {
      var gift = e.target.closest('.pl-gift');
      if (gift) return openGift(gift);
      var act = e.target.closest('[data-act]');
      if (!act) return;
      var a = act.getAttribute('data-act');
      if (a === 'say') {
        stopMic();
        Voice.say(current.word.word, { rate: 0.7 });
      } else if (a === 'mic') {
        listen(act);
      } else if (a === 'next') {
        round++;
        next();
      }
    });

    ctx.onHear(sayPrompt);
    next();
  }

  function startMonster(ctx) {
    var foods = W.inGroup('food');
    var round = 0;
    var target = null;
    var busy = false;
    var last = null;

    function sayPrompt() {
      var line = 'I\u2019m hungry for ' + W.withArticle(target) + '!';
      ctx.prompt(line);
      var bubble = ctx.stage.querySelector('.pl-monster-says');
      if (bubble) bubble.textContent = line;
      return Voice.say(line, { pitch: 1.35 });
    }

    function next() {
      if (round >= ctx.rounds) return ctx.finish();
      target = sample(foods, 1, last ? [last] : null)[0];
      last = target;
      var tray = shuffle([target].concat(sample(foods, 2, [target])));
      var html =
        '<div class="pl-feed">' +
          '<div class="pl-monster">' +
            '<div class="pl-monster-says"></div>' +
            '<img class="pl-monster-pic" src="' + esc(W.pieces.monster) + '" alt="Friendly monster" draggable="false">' +
          '</div>' +
          '<div class="pl-tray">';
      tray.forEach(function (w) {
        html += '<button type="button" class="pl-food" data-id="' + esc(w.id) + '" aria-label="' + esc(w.word) + '">' +
          '<img src="' + esc(w.img) + '" alt="" draggable="false"></button>';
      });
      html += '</div><p class="pl-hint">Drag the food to the monster\u2019s mouth, or tap it.</p></div>';
      ctx.stage.innerHTML = html;
      busy = false;
      sayPrompt();
    }

    function mouthPoint() {
      var pic = ctx.stage.querySelector('.pl-monster-pic');
      var r = pic.getBoundingClientRect();
      return { x: r.left + r.width * 0.5, y: r.top + r.height * 0.5, rect: r };
    }

    /** `rest` is the food's box before any drag transform. */
    function feed(el, rest) {
      busy = true;
      var id = el.getAttribute('data-id');
      var m = mouthPoint();
      var monster = ctx.stage.querySelector('.pl-monster');
      if (id === target.id) {
        var dx = m.x - (rest.left + rest.width / 2);
        var dy = m.y - (rest.top + rest.height / 2);
        el.classList.add('is-eaten');
        el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(.2)';
        later(function () {
          monster.classList.add('is-chomp');
          Sfx.chomp();
          burst(monster.querySelector('.pl-monster-pic'), 14);
        }, 380);
        later(Sfx.yes, 900);
        ctx.win();
        ctx.prompt('Yum yum! Thank you!');
        Voice.say('Yum yum! Thank you for the ' + target.word + '!', { pitch: 1.35 });
        round++;
        later(next, 2100);
      } else {
        el.classList.add('is-returning');
        el.style.transform = '';
        monster.classList.remove('is-no');
        void monster.offsetWidth;
        monster.classList.add('is-no');
        Sfx.no();
        Voice.say('No, thank you! I want ' + W.withArticle(target) + '.', { pitch: 1.35 });
        later(function () {
          el.classList.remove('is-returning');
          busy = false;
        }, 450);
      }
    }

    var drag = null;

    ctx.stage.addEventListener('pointerdown', function (e) {
      var el = e.target.closest('.pl-food');
      if (!el || busy || el.classList.contains('is-eaten')) return;
      e.preventDefault();
      drag = { el: el, id: e.pointerId, x: e.clientX, y: e.clientY, moved: false, rest: el.getBoundingClientRect() };
      try { el.setPointerCapture(e.pointerId); } catch (err) { /* ignore */ }
      el.classList.add('is-dragging');
    });

    ctx.stage.addEventListener('pointermove', function (e) {
      if (!drag || e.pointerId !== drag.id) return;
      var dx = e.clientX - drag.x;
      var dy = e.clientY - drag.y;
      if (Math.abs(dx) + Math.abs(dy) > 8) drag.moved = true;
      drag.el.style.transform = 'translate(' + dx + 'px,' + dy + 'px) scale(1.12)';
      var m = mouthPoint().rect;
      var over = e.clientX > m.left && e.clientX < m.right && e.clientY > m.top && e.clientY < m.bottom;
      ctx.stage.querySelector('.pl-monster').classList.toggle('is-open', over);
    });

    function endDrag(e) {
      if (!drag || e.pointerId !== drag.id) return;
      var d = drag;
      drag = null;
      d.el.classList.remove('is-dragging');
      var monster = ctx.stage.querySelector('.pl-monster');
      monster.classList.remove('is-open');
      if (!d.moved) {
        d.el.style.transform = '';
        return feed(d.el, d.rest);
      }
      var m = mouthPoint().rect;
      var pad = 30;
      var over = e.clientX > m.left - pad && e.clientX < m.right + pad && e.clientY > m.top - pad && e.clientY < m.bottom + pad;
      if (over) {
        feed(d.el, d.rest);
      } else {
        d.el.classList.add('is-returning');
        d.el.style.transform = '';
        later(function () { d.el.classList.remove('is-returning'); }, 420);
      }
    }

    ctx.stage.addEventListener('pointerup', endDrag);
    ctx.stage.addEventListener('pointercancel', endDrag);

    ctx.onHear(sayPrompt);
    next();
  }

  // Spots in the room picture: x = center %, b = bottom edge % from the top, w = width % of the room.
  var ROOM_SPOTS = [
    { x: 15, b: 66, w: 10 },
    { x: 26.5, b: 58, w: 7.5 },
    { x: 39.5, b: 52, w: 7 },
    { x: 56, b: 52, w: 7 },
    { x: 51, b: 83, w: 11 },
    { x: 33, b: 90, w: 10 },
    { x: 81.5, b: 45.5, w: 5.8 },
    { x: 81.5, b: 69, w: 5.8 },
    { x: 86, b: 97, w: 11 },
    { x: 61, b: 72, w: 8 }
  ];
  var ROOM_THINGS = ['cat', 'dog', 'duck', 'ball', 'car', 'teddy', 'shoe', 'hat'];

  function startHide(ctx) {
    var things = ROOM_THINGS.map(W.byId);
    var spots = shuffle(ROOM_SPOTS).slice(0, things.length);
    var order = shuffle(things).slice(0, ctx.rounds);
    var round = 0;
    var busy = false;
    var target = null;

    var html = '<div class="pl-room-scroll"><div class="pl-room" style="background-image:url(\'' + esc(W.pieces.room) + '\')">';
    things.forEach(function (w, i) {
      var s = spots[i];
      html += '<button type="button" class="pl-hide" data-id="' + esc(w.id) + '" aria-label="' + esc(w.word) + '"' +
        ' style="left:' + s.x + '%;top:' + s.b + '%;width:' + s.w + '%;--d:' + (i * 0.37).toFixed(2) + 's">' +
        '<img src="' + esc(w.img) + '" alt="" draggable="false"></button>';
    });
    html += '</div></div><p class="pl-hint pl-hint--room">Swipe the room to look around.</p>';
    ctx.stage.innerHTML = html;

    var scroller = ctx.stage.querySelector('.pl-room-scroll');
    if (scroller.scrollWidth > scroller.clientWidth) {
      scroller.scrollLeft = (scroller.scrollWidth - scroller.clientWidth) / 2;
    }

    function sayPrompt() {
      ctx.prompt('Find the ' + target.word + '!');
      return Voice.say('Find the ' + target.word + '!');
    }

    function next() {
      if (round >= ctx.rounds) return ctx.finish();
      target = order[round];
      busy = false;
      sayPrompt();
    }

    ctx.stage.addEventListener('click', function (e) {
      var el = e.target.closest('.pl-hide');
      if (!el || busy) return;
      var w = W.byId(el.getAttribute('data-id'));
      if (w.id === target.id) {
        busy = true;
        el.classList.remove('is-found');
        void el.offsetWidth;
        el.classList.add('is-found', 'is-done');
        Sfx.boing();
        burst(el, 12);
        later(Sfx.yes, 300);
        ctx.win();
        ctx.prompt(w.sound + ' You found the ' + w.word + '!');
        Voice.say(w.sound + ' You found the ' + w.word + '!');
        round++;
        later(next, 2200);
      } else {
        el.classList.remove('is-wiggle');
        void el.offsetWidth;
        el.classList.add('is-wiggle');
        Sfx.no();
        Voice.say('That\u2019s the ' + w.word + '. Find the ' + target.word + '!');
      }
    });

    ctx.onHear(sayPrompt);
    next();
  }

  /* ---------- catalog ---------- */

  var CATEGORIES = [
    {
      id: 'vocabulary-listening',
      title: 'Vocabulary and Listening',
      line: 'Listen to the word, then find the picture!',
      tone: 'sky',
      games: [
        { id: 'pop-the-bubbles', title: 'Pop the Bubbles', line: 'Pop the bubble with the word you hear.', cover: 'duck', tone: 'sky', rounds: 6, start: startBubbles },
        { id: 'mystery-box', title: 'Mystery Box', line: 'Open the gift and say the word.', coverImg: W.pieces.gift, tone: 'pink', rounds: 6, start: startMystery },
        { id: 'feed-the-monster', title: 'Feed the Monster', line: 'Give the hungry monster the right food.', coverImg: W.pieces.monster, tone: 'purple', rounds: 5, start: startMonster },
        { id: 'hide-and-seek', title: 'Hide and Seek', line: 'Find the toy or pet hiding in the room.', cover: 'cat', tone: 'green', rounds: 5, start: startHide }
      ]
    }
  ];

  function coverOf(game) {
    if (game.coverImg) return game.coverImg;
    var w = W.byId(game.cover);
    return w ? w.img : W.pieces.remo;
  }

  function findCategory(id) {
    for (var i = 0; i < CATEGORIES.length; i++) if (CATEGORIES[i].id === id) return CATEGORIES[i];
    return null;
  }

  function findGame(cat, id) {
    for (var i = 0; i < cat.games.length; i++) if (cat.games[i].id === id) return cat.games[i];
    return null;
  }

  /* ---------- views ---------- */

  function renderHome() {
    var html =
      '<section class="pl-hero">' +
        '<img class="pl-hero-remo" src="' + esc(W.pieces.remo) + '" alt="" draggable="false">' +
        '<div><h1 class="pl-title">Play &amp; Learn</h1><p class="pl-sub">Pick a game group and start playing!</p></div>' +
      '</section>' +
      '<div class="pl-cat-list">';
    CATEGORIES.forEach(function (cat) {
      html += '<a class="pl-cat pl-tone-' + esc(cat.tone) + '" href="#/' + esc(cat.id) + '">' +
        '<div class="pl-cat-art">';
      cat.games.slice(0, 4).forEach(function (g) {
        html += '<span class="pl-cat-thumb pl-tone-' + esc(g.tone) + '"><img src="' + esc(coverOf(g)) + '" alt="" draggable="false"></span>';
      });
      html += '</div><div class="pl-cat-body"><h2>' + esc(cat.title) + '</h2><p>' + esc(cat.line) + '</p>' +
        '<span class="pl-chip">' + cat.games.length + ' games</span></div>' +
        '<span class="pl-cat-go" aria-hidden="true">' + icon('arrow-right') + '</span></a>';
    });
    html += '<div class="pl-cat pl-cat--soon" aria-hidden="true"><div class="pl-cat-body"><h2>More games coming soon</h2><p>New game groups will appear here.</p></div></div>';
    html += '</div>';
    app.innerHTML = html;
  }

  function renderCategory(cat) {
    var html =
      '<div class="pl-bar">' +
        '<a class="pl-back" href="#/">' + icon('arrow-left') + '<span>All games</span></a>' +
      '</div>' +
      '<section class="pl-cat-head pl-tone-' + esc(cat.tone) + '"><h1 class="pl-title">' + esc(cat.title) + '</h1><p class="pl-sub">' + esc(cat.line) + '</p></section>' +
      '<div class="pl-game-grid">';
    cat.games.forEach(function (g) {
      html += '<a class="pl-game pl-tone-' + esc(g.tone) + '" href="#/' + esc(cat.id) + '/' + esc(g.id) + '">' +
        '<span class="pl-game-art"><img src="' + esc(coverOf(g)) + '" alt="" draggable="false"></span>' +
        '<span class="pl-game-title">' + esc(g.title) + '</span>' +
        '<span class="pl-game-line">' + esc(g.line) + '</span>' +
        '<span class="pl-play">' + icon('play') + '<span>Play</span></span></a>';
    });
    html += '</div>';
    app.innerHTML = html;
  }

  function renderGame(cat, game) {
    var stars = '';
    for (var i = 0; i < game.rounds; i++) stars += '<span class="pl-star">' + icon('star') + '</span>';
    app.innerHTML =
      '<div class="pl-bar pl-bar--game">' +
        '<a class="pl-back" href="#/' + esc(cat.id) + '">' + icon('arrow-left') + '<span>Back</span></a>' +
        '<h1 class="pl-game-name">' + esc(game.title) + '</h1>' +
        '<div class="pl-stars" aria-label="Stars">' + stars + '</div>' +
      '</div>' +
      '<div class="pl-prompt-row">' +
        '<button type="button" class="pl-hear" aria-label="Hear it again">' + icon('volume-2') + '</button>' +
        '<p class="pl-prompt"></p>' +
      '</div>' +
      '<div class="pl-stage pl-tone-' + esc(game.tone) + '" data-game="' + esc(game.id) + '"></div>';

    var stage = app.querySelector('.pl-stage');
    var promptEl = app.querySelector('.pl-prompt');
    var starEls = app.querySelectorAll('.pl-star');
    var hear = null;
    var won = 0;

    app.querySelector('.pl-hear').addEventListener('click', function () {
      Sfx.unlock();
      if (hear) hear();
    });

    var ctx = {
      stage: stage,
      rounds: game.rounds,
      prompt: function (text) { promptEl.textContent = text; },
      onHear: function (fn) { hear = fn; },
      win: function () {
        if (starEls[won]) starEls[won].classList.add('is-on');
        won++;
      },
      finish: function () {
        hear = function () { return Voice.say('You did it! Great job!'); };
        promptEl.textContent = 'You did it!';
        stage.innerHTML =
          '<div class="pl-finish">' +
            '<img class="pl-finish-remo" src="' + esc(W.pieces.remo) + '" alt="" draggable="false">' +
            '<h2>You did it!</h2>' +
            '<p>You got ' + won + ' stars.</p>' +
            '<div class="pl-actions">' +
              '<button type="button" class="pl-btn pl-btn--green" data-again>' + icon('rotate-ccw') + '<span>Play again</span></button>' +
              '<a class="pl-btn pl-btn--sky" href="#/' + esc(cat.id) + '">' + icon('gamepad-2') + '<span>More games</span></a>' +
            '</div>' +
          '</div>';
        Sfx.tada();
        burst(stage.querySelector('.pl-finish-remo'), 20);
        Voice.say('You did it! Great job!');
        stage.querySelector('[data-again]').addEventListener('click', function () { route(); });
      }
    };

    promptEl.textContent = 'Tap Start to play!';
    stage.innerHTML =
      '<div class="pl-start">' +
        '<img src="' + esc(coverOf(game)) + '" alt="" draggable="false">' +
        '<p>' + esc(game.line) + '</p>' +
        '<button type="button" class="pl-btn pl-btn--big pl-btn--green">' + icon('play') + '<span>Start</span></button>' +
      '</div>';
    stage.querySelector('.pl-start .pl-btn').addEventListener('click', function () {
      Sfx.unlock();
      stage.innerHTML = '';
      game.start(ctx);
    }, { once: true });
  }

  /* ---------- routing ---------- */

  function route() {
    leaveStage();
    var parts = (location.hash || '').replace(/^#\/?/, '').split('/').filter(Boolean);
    var cat = parts[0] ? findCategory(parts[0]) : null;
    var game = cat && parts[1] ? findGame(cat, parts[1]) : null;
    // Each view gets a fresh node so game listeners never pile up.
    var fresh = app.cloneNode(false);
    app.parentNode.replaceChild(fresh, app);
    app = fresh;
    if (game) renderGame(cat, game);
    else if (cat) renderCategory(cat);
    else renderHome();
    app.setAttribute('data-view', game ? 'game' : cat ? 'category' : 'home');
    var scroller = document.querySelector('.remoed-main');
    if (scroller && scroller.scrollTop > 0) scroller.scrollTop = 0;
    if (document.scrollingElement) document.scrollingElement.scrollTop = 0;
  }

  window.addEventListener('hashchange', route);
  window.addEventListener('pagehide', leaveStage);
  route();
})();
