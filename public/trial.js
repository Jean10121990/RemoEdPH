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

  function speak(text) {
    if (!window.speechSynthesis) return;
    var u = new SpeechSynthesisUtterance(text);
    u.lang = 'en-US';
    u.rate = 0.8;
    u.pitch = 1.15;
    window.speechSynthesis.cancel();
    window.speechSynthesis.speak(u);
  }

  function token() {
    try {
      return localStorage.getItem('remoed_student_token') || sessionStorage.getItem('remoed_student_token') || '';
    } catch (e) { return ''; }
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
      b.textContent = String(i + 1);
      b.title = label;
      b.setAttribute('aria-label', label);
      if (i === step) b.className = 'is-on';
      if (i > 2 && !paid) b.className = (b.className + ' is-lock').trim();
      b.addEventListener('click', function () {
        if (i > 2 && !paid) return;
        if (i <= 2 || paid) openStep(i);
      });
      bar.appendChild(b);
    });
  }

  function stage(html) { $('stage').innerHTML = html; }

  function saveStep() {
    return window.Trial.save().catch(showError);
  }

  function openStep(n) {
    step = n;
    cursor = 0;
    misses = 0;
    phase = 'bubbles';
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
    speak('Hi, ' + childName + '!');
    stage('<p class="big">Hi, ' + childName + '!</p><p>How do you feel?</p><div class="row" id="moods"></div>');
    [['Happy', '😊'], ['Sleepy', '😴'], ['Excited', '🤩']].forEach(function (pair) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tap';
      b.textContent = pair[1] + ' ' + pair[0];
      b.addEventListener('click', function () {
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
    stage('<p>' + title + '</p><div class="row" id="opts"></div>');
    words.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tap';
      b.textContent = item[1];
      b.dataset.word = item[0];
      b.addEventListener('click', function () {
        var ok = item[0] === pair[0];
        window.Trial.recordAnswer(pair[0], ok);
        if (!ok) {
          misses += 1;
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
          $('msg').textContent = 'Try again';
          return;
        }
        $('msg').textContent = '';
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
    stage('<p>You did it, ' + childName + '!</p><p>Stickers: ⭐⭐⭐</p><video controls poster="" aria-label="Teacher greeting"><p>Teacher greeting</p></video>');
    window.Trial.finish().then(function (data) {
      report = data.report;
      showReport(true);
    }).catch(showError);
  }

  function showReport(afterPaid) {
    window.Trial.finish().then(function (data) {
      report = data.report || report || {};
      var practice = (report.needsPractice || []).join(', ') || 'None';
      stage(
        '<h2>Parent report</h2>' +
        '<p>Words learned: ' + (report.wordsLearned || 0) + '</p>' +
        '<p>Correct on first try: ' + (report.correctFirstTry || 0) + '</p>' +
        '<p>Needs practice: ' + practice + '</p>' +
        '<p>Minutes: ' + (report.minutes || 0) + '</p>' +
        '<label>Type the number 7 to choose a plan <input id="gate" inputmode="numeric" maxlength="1" style="min-height:48px;font-size:1.2rem;width:64px"></label>' +
        '<div class="row"><button type="button" class="tap blue" id="plans">Choose a plan</button>' +
        '<a class="plan' + (paid ? '' : ' disabled') + '" id="book" href="student-book.html">Book your first live lesson</a></div>' +
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

  paintBar();
  boot();
})();
