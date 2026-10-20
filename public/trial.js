(function () {
  'use strict';

  var THEMES = {
    fruits: [['apple', '🍎'], ['banana', '🍌'], ['mango', '🥭'], ['orange', '🍊']],
    animals: [['cat', '🐱'], ['dog', '🐶'], ['bird', '🐦'], ['fish', '🐠']],
    snacks: [['cookie', '🍪'], ['juice', '🧃'], ['bread', '🍞'], ['cheese', '🧀']]
  };
  var LABELS = ['Welcome', 'Simon', 'Learn', 'Play', 'Say it', 'Check', 'Bye'];
  var SIMON = ['Clap', 'Jump', 'Touch your nose'];
  var step = 0;
  var paid = false;
  var childName = 'friend';
  var theme = 'fruits';
  var words = THEMES.fruits;
  var cursor = 0;
  var misses = 0;
  var phase = 'bubbles';
  var report = null;

  function $(id) { return document.getElementById(id); }

  var reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  var audioOn = true;
  try { if (sessionStorage.getItem('trialSound') === '0') audioOn = false; } catch (e) {}

  function token() {
    try {
      var keys = ['remoed_student_token', 'remoed_student_auth', 'remoed_user_token', 'token'];
      var stores = [localStorage, sessionStorage];
      var i, j, v;
      for (i = 0; i < stores.length; i++) {
        for (j = 0; j < keys.length; j++) {
          v = stores[i].getItem(keys[j]);
          if (v) return v;
        }
      }
      return '';
    } catch (e) { return ''; }
  }

  function scene(name) { document.body.setAttribute('data-scene', name); }

  function speak(text) {
    var bubble = $('bubble');
    if (bubble) bubble.textContent = text;
    var mascot = $('mascot');
    if (mascot) mascot.classList.add('is-talking');
    if (!window.speechSynthesis || !audioOn) {
      if (mascot) setTimeout(function () { mascot.classList.remove('is-talking'); }, 600);
      return;
    }
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.8;
    u.pitch = 1.15;
    u.onend = function () { if (mascot) mascot.classList.remove('is-talking'); };
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  function beep(ok) {
    if (!audioOn || reduce) return;
    try {
      var Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return;
      var ctx = beep.ctx || (beep.ctx = new Ctx());
      var o = ctx.createOscillator();
      var g = ctx.createGain();
      o.type = 'sine';
      o.frequency.value = ok ? 640 : 200;
      g.gain.value = 0.06;
      o.connect(g);
      g.connect(ctx.destination);
      o.start();
      o.frequency.linearRampToValueAtTime(ok ? 880 : 160, ctx.currentTime + 0.12);
      g.gain.linearRampToValueAtTime(0.0001, ctx.currentTime + 0.2);
      o.stop(ctx.currentTime + 0.22);
    } catch (e) {}
  }

  function celebrate() {
    beep(true);
    var mascot = $('mascot');
    if (mascot) {
      mascot.classList.remove('is-jump');
      void mascot.offsetWidth;
      mascot.classList.add('is-jump');
    }
    var toast = $('toast');
    if (toast) {
      toast.textContent = 'Great job!';
      toast.classList.remove('show');
      void toast.offsetWidth;
      toast.classList.add('show');
    }
    if (reduce) return;
    var box = $('confetti');
    if (box) {
      box.textContent = '';
      var colors = ['#0A7FD4', '#1FA324', '#FFE82E', '#FF5C8A'];
      for (var i = 0; i < 14; i++) {
        var bit = document.createElement('i');
        bit.style.left = (Math.random() * 100) + '%';
        bit.style.background = colors[i % 4];
        bit.style.animationDelay = (Math.random() * 0.2) + 's';
        box.appendChild(bit);
      }
    }
    var star = document.createElement('div');
    star.className = 'flyer';
    star.textContent = '⭐';
    star.style.left = '50%';
    star.style.top = '55%';
    var target = document.querySelector('.bar button.is-on');
    var dx = 0;
    var dy = -180;
    if (target && target.getBoundingClientRect) {
      var r = target.getBoundingClientRect();
      dx = r.left - window.innerWidth / 2;
      dy = r.top - window.innerHeight * 0.55;
    }
    star.style.setProperty('--dx', dx + 'px');
    star.style.setProperty('--dy', dy + 'px');
    document.body.appendChild(star);
    setTimeout(function () { star.remove(); }, 700);
  }

  function miss(node) {
    beep(false);
    if (node) {
      node.classList.remove('wobble');
      void node.offsetWidth;
      node.classList.add('wobble');
    }
  }

  function colorful(text) {
    var colors = ['#0A7FD4', '#1FA324', '#FFE82E', '#FF5C8A', '#1B2447'];
    return String(text).split('').map(function (ch, i) {
      var safe = ch.replace(/&/g, '&amp;').replace(/</g, '&lt;');
      if (ch === ' ') return ' ';
      return '<span style="color:' + colors[i % colors.length] + ';animation-delay:' + (i * 40) + 'ms">' + safe + '</span>';
    }).join('');
  }

  function authHeaders() {
    return { Authorization: 'Bearer ' + token(), 'Content-Type': 'application/json' };
  }

  function showError(err) {
    var status = err && err.status;
    var text = (err && err.message) || 'Something went wrong';
    if (status === 409) text = 'This child already used the free trial.';
    if (status === 410) text = 'This trial has expired.';
    $('msg').textContent = text;
    if (status === 409 || status === 410) {
      $('stage').innerHTML = '<p>' + text + '</p><p><a class="plan" href="index.html#plans">Choose a plan</a></p>';
    }
  }

  function paintBar() {
    var bar = $('bar');
    bar.textContent = '';
    LABELS.forEach(function (label, i) {
      var b = document.createElement('button');
      b.type = 'button';
      var done = i < step && (i <= 2 || paid);
      b.textContent = done ? '✓' : '★';
      b.title = label;
      b.setAttribute('aria-label', label);
      if (done) b.className = 'is-done';
      if (i === step) b.className = 'is-on';
      if (i > 2 && !paid) b.className = (b.className + ' is-lock').trim();
      b.addEventListener('click', function () {
        if (i > 2 && !paid) return;
        if (i <= 2 || paid) openStep(i);
      });
      bar.appendChild(b);
    });
  }

  function stage(html) {
    var el = $('stage');
    el.innerHTML = html;
    el.classList.remove('is-in');
    if (!reduce) requestAnimationFrame(function () { el.classList.add('is-in'); });
  }

  function saveStep() {
    return window.Trial.save().catch(showError);
  }

  function openStep(n) {
    step = n;
    cursor = 0;
    misses = 0;
    phase = 'bubbles';
    scene(n === 6 ? 'bye' : 'hello');
    paintBar();
    if (n === 0) return welcome();
    if (n === 1) return simon();
    if (n === 2) return learn();
    if (n === 3) return play();
    if (n === 4) return sayIt();
    if (n === 5) return check();
    return goodbye();
  }

  function welcome() {
    speak('Hi, ' + childName + '! How do you feel?');
    stage('<p class="big wave">' + colorful('Hi, ' + childName + '!') + '</p><p>How do you feel?</p><div class="row" id="moods"></div>');
    [['Happy', '😊'], ['Sleepy', '😴'], ['Excited', '🤩']].forEach(function (pair) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tap mood';
      b.innerHTML = '<span class="emoji">' + pair[1] + '</span><span>' + pair[0] + '</span>';
      b.addEventListener('click', function () {
        b.classList.add('is-picked');
        celebrate();
        saveStep().then(function () { openStep(1); });
      });
      $('moods').appendChild(b);
    });
  }

  function simon() {
    var cmd = SIMON[cursor];
    speak('Simon says ' + cmd);
    stage('<p>Simon says</p><p class="big">' + cmd + '</p><button type="button" class="tap green" id="done">Done!</button>');
    $('done').addEventListener('click', function () {
      window.Trial.recordAnswer(cmd, true);
      cursor += 1;
      saveStep().then(function () {
        if (cursor < SIMON.length) simon();
        else openStep(2);
      });
    });
  }

  function learn() {
    var pair = words[cursor];
    speak(pair[0]);
    speak(pair[0]);
    stage('<button type="button" class="tap" id="pic"><span class="big">' + pair[1] + '</span><br>' + pair[0] + '</button><div><button type="button" class="tap blue" id="next">Next</button></div>');
    $('pic').addEventListener('click', function () { speak(pair[0]); });
    $('next').addEventListener('click', function () {
      window.Trial.recordAnswer(pair[0], true);
      cursor += 1;
      saveStep().then(function () {
        if (cursor < words.length) learn();
        else showReport(false);
      });
    });
  }

  function choices(correctWord) {
    var opts = words.slice();
    var html = '<div class="row" id="opts"></div>';
    return html;
  }

  function play() {
    var pair = words[cursor];
    var title = phase === 'bubbles' ? 'Pop the bubble that says ' + pair[0] : 'Feed the food that is ' + pair[0];
    speak(title);
    var monster = phase === 'feed' ? '<div class="monster" id="monster" aria-hidden="true"><span class="mouth"></span></div>' : '';
    stage('<p>' + title + '</p>' + monster + '<div class="row" id="opts"></div>');
    var mouth = $('monster');
    words.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tap ' + (phase === 'bubbles' ? 'bubble' : 'food');
      b.textContent = item[1];
      b.dataset.word = item[0];
      b.draggable = true;
      b.addEventListener('dragstart', function () { if (mouth) mouth.classList.add('is-open'); });
      b.addEventListener('dragend', function () { if (mouth) mouth.classList.remove('is-open'); });
      b.addEventListener('click', function () {
        var ok = item[0] === pair[0];
        window.Trial.recordAnswer(pair[0], ok);
        if (!ok) {
          misses += 1;
          miss(b);
          $('msg').textContent = 'Try again';
          if (misses >= 2) {
            var nodes = $('opts').querySelectorAll('button');
            nodes.forEach(function (node) {
              if (node.dataset.word === pair[0]) node.classList.add('pulse');
            });
          }
          return;
        }
        misses = 0;
        $('msg').textContent = '';
        if (phase === 'bubbles') b.classList.add('pop');
        if (mouth) mouth.classList.add('is-chomp');
        celebrate();
        cursor += 1;
        if (cursor >= words.length && phase === 'bubbles') {
          cursor = 0;
          phase = 'feed';
          saveStep().then(play);
          return;
        }
        if (cursor >= words.length) {
          saveStep().then(function () { openStep(4); });
          return;
        }
        saveStep().then(play);
      });
      $('opts').appendChild(b);
    });
  }

  function sayIt() {
    var pair = words[cursor];
    speak('Say ' + pair[0]);
    stage('<p class="big">' + pair[1] + '</p><p>Say ' + pair[0] + '</p><button type="button" class="tap green" id="said">I said it!</button>');
    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (Rec) {
      try {
        var rec = new Rec();
        rec.lang = 'en-US';
        rec.onresult = function () { doneSpoke(); };
        rec.onerror = function () {};
        rec.start();
      } catch (e) {}
    }
    function doneSpoke() {
      window.Trial.recordSpoke(pair[0]);
      cursor += 1;
      saveStep().then(function () {
        if (cursor < words.length) sayIt();
        else openStep(5);
      });
    }
    $('said').addEventListener('click', doneSpoke);
  }

  function check() {
    var pair = words[cursor];
    speak('Which one is ' + pair[0] + '?');
    stage('<p>Which one is ' + pair[0] + '?</p><div class="row" id="opts"></div>');
    words.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tap';
      b.textContent = item[1];
      b.addEventListener('click', function () {
        var ok = item[0] === pair[0];
        window.Trial.recordAnswer(pair[0], ok);
        if (!ok) {
          miss(b);
          $('msg').textContent = 'Try again';
          return;
        }
        $('msg').textContent = '';
        celebrate();
        cursor += 1;
        saveStep().then(function () {
          if (cursor < words.length) check();
          else openStep(6);
        });
      });
      $('opts').appendChild(b);
    });
  }

  function goodbye() {
    scene('bye');
    stage('<div class="cert"><p>You did it!</p><p class="big wave">' + colorful(childName) + '</p><p class="stickers"><span>⭐</span><span>⭐</span><span>⭐</span></p><video controls poster="" aria-label="Teacher greeting"><p>Teacher greeting</p></video></div>');
    celebrate();
    window.Trial.finish().then(function (data) {
      report = data.report;
      showReport(true);
    }).catch(showError);
  }

  function showReport(afterPaid) {
    window.Trial.finish().then(function (data) {
      report = data.report || report || {};
      scene('report');
      var practice = (report.needsPractice || []).join(', ') || 'None';
      stage(
        '<h2>Parent report</h2>' +
        '<div class="tiles">' +
        '<div class="tile">Words learned<b>' + (report.wordsLearned || 0) + '</b></div>' +
        '<div class="tile">First try<b>' + (report.correctFirstTry || 0) + '</b></div>' +
        '<div class="tile">Minutes<b>' + (report.minutes || 0) + '</b></div>' +
        '</div>' +
        '<p>Needs practice: ' + practice + '</p>' +
        '<div class="gate-card"><label>Type the number 7 to choose a plan <input id="gate" inputmode="numeric" maxlength="1"></label>' +
        '<div class="row"><button type="button" class="tap blue" id="plans">Choose a plan</button>' +
        '<a class="plan' + (paid ? '' : ' disabled') + '" id="book" href="student-book.html">Book your first live lesson</a></div></div>' +
        (paid && !afterPaid ? '<button type="button" class="tap green" id="more">Continue the lesson</button>' : '')
      );
      if (!paid) $('book').setAttribute('aria-disabled', 'true');
      $('plans').addEventListener('click', function () {
        if ($('gate').value.trim() !== '7') {
          $('msg').textContent = 'Ask a parent to type 7.';
          return;
        }
        window.location.href = 'index.html#plans';
      });
      var more = $('more');
      if (more) more.addEventListener('click', function () { openStep(3); });
    }).catch(showError);
  }

  function boot() {
    if (!token()) {
      window.location.href = '/login/';
      return;
    }
    fetch('/api/student/profile', { headers: authHeaders(), credentials: 'include' })
      .then(function (r) { return r.json(); })
      .then(function (body) {
        var profile = body && body.profile;
        if (profile) {
          childName = profile.firstName || profile.nickname || 'friend';
          paid = !!(profile.freePlan && profile.freePlan.isFree === false);
        }
        var saved = '';
        try { saved = sessionStorage.getItem('trialId') || ''; } catch (e) {}
        if (saved && window.Trial.resume) {
          return window.Trial.resume(saved).then(function () { openStep(0); });
        }
        return pickTheme();
      })
      .catch(showError);
  }

  function pickTheme() {
    stage('<p>Pick a theme</p><div class="row" id="themes"></div>');
    ['fruits', 'animals', 'snacks'].forEach(function (name) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tap blue';
      b.textContent = name;
      b.addEventListener('click', function () {
        theme = name;
        words = THEMES[name];
        window.Trial.start('', theme).then(function () { openStep(0); }).catch(showError);
      });
      $('themes').appendChild(b);
    });
    paintBar();
  }

  var soundBtn = $('sound');
  if (soundBtn) {
    function paintSound() {
      soundBtn.textContent = audioOn ? 'Sound on' : 'Sound off';
      soundBtn.setAttribute('aria-label', audioOn ? 'Sound on' : 'Sound off');
    }
    paintSound();
    soundBtn.addEventListener('click', function () {
      audioOn = !audioOn;
      try { sessionStorage.setItem('trialSound', audioOn ? '1' : '0'); } catch (e) {}
      if (!audioOn && window.speechSynthesis) window.speechSynthesis.cancel();
      paintSound();
    });
  }

  paintBar();
  boot();
})();
