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
  var listenGen = 0;
  var stopCam = function () {};
  var teacherVoice = null;
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
    u.rate = 0.92;
    u.pitch = 1.2;
    if (teacherVoice) u.voice = teacherVoice;
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
    var note = $('msg');
    if (note) note.textContent = text;
  }

  function paintBar() {
    var bar = $('bar');
    bar.textContent = '';
    LABELS.forEach(function (label, i) {
      var b = document.createElement('button');
      b.type = 'button';
      var done = i < step;
      b.textContent = done ? '✓' : '★';
      b.title = label;
      b.setAttribute('aria-label', label);
      if (done) b.className = 'is-done';
      if (i === step) b.className = 'is-on';
      b.addEventListener('click', function () { openStep(i); });
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
    var note = $('msg');
    if (note) note.textContent = '';
    listenGen += 1;
    stopCam();
    stopCam = function () {};
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

  function fingerOnNose(lm) {
    var nose = lm[0];
    var leftEye = lm[2];
    var rightEye = lm[5];
    if (!nose || !leftEye || !rightEye) return false;
    var eyeLine = (leftEye.y + rightEye.y) / 2;
    var noseSpan = pointDist(nose, leftEye);
    if (noseSpan < 0.02) noseSpan = 0.08;
    var shoulder = lm[11] && lm[12] ? pointDist(lm[11], lm[12]) : noseSpan * 3;
    if (shoulder < 0.05) shoulder = 0.2;
    var reach = Math.max(noseSpan * 1.45, shoulder * 0.28);
    var tips = [lm[15], lm[16], lm[17], lm[18], lm[19], lm[20], lm[21], lm[22]].filter(Boolean);
    var i;
    for (i = 0; i < tips.length; i++) {
      var tip = tips[i];
      if (tip.y < eyeLine - noseSpan * 0.35) continue;
      var toNose = pointDist(tip, nose);
      if (toNose > reach) continue;
      var toEyes = Math.min(pointDist(tip, leftEye), pointDist(tip, rightEye));
      if (tip.y < eyeLine && toNose >= toEyes) continue;
      return true;
    }
    return false;
  }

  function pointDist(a, b) {
    var dx = a.x - b.x;
    var dy = a.y - b.y;
    return Math.sqrt(dx * dx + dy * dy);
  }

  function simon() {
    var cmd = SIMON[cursor];
    var gen = listenGen;
    var passed = false;
    var pose = null;
    var stream = null;
    var timer = 0;
    var seen = 0;
    var baselineHip = null;
    var handsApart = false;
    var noseHits = 0;
    speak('Simon says ' + cmd);
    stage('<p>Simon says</p><p class="big">' + cmd + '</p><video id="cam" class="cam" autoplay playsinline muted></video><p class="heard" id="heard">Starting the camera…</p><button type="button" class="tap blue" id="done">Try the camera</button>');
    var video = $('cam');
    function finishCam() {
      if (timer) cancelAnimationFrame(timer);
      timer = 0;
      if (stream) stream.getTracks().forEach(function (track) { track.stop(); });
      stream = null;
    }
    stopCam = finishCam;
    function pass() {
      if (passed || gen !== listenGen) return;
      passed = true;
      finishCam();
      window.Trial.recordAnswer(cmd, true);
      celebrate();
      cursor += 1;
      saveStep().then(function () {
        if (gen !== listenGen) return;
        if (cursor < SIMON.length) simon();
        else openStep(2);
      });
    }
    function watch() {
      if (passed || gen !== listenGen) return;
      if (pose && video && video.readyState >= 2) {
        var result = null;
        try { result = pose.detectForVideo(video, performance.now()); } catch (e) {}
        var lm = result && result.landmarks && result.landmarks[0];
        if (lm && lm[0] && cmd === 'Touch your nose') {
          if (fingerOnNose(lm)) {
            noseHits += 1;
            if ($('heard')) $('heard').textContent = 'I see your hand. Hold it on your nose.';
            if (noseHits >= 3) pass();
          } else if (noseHits > 0) {
            noseHits -= 1;
          }
        } else if (lm && lm[0] && lm[15] && lm[16] && lm[11] && lm[12]) {
          var shoulder = pointDist(lm[11], lm[12]) || 0.2;
          if (cmd === 'Clap') {
            var hands = pointDist(lm[15], lm[16]);
            if (hands > shoulder * 0.9) handsApart = true;
            if (handsApart && hands < shoulder * 0.45) pass();
          } else if (cmd === 'Jump' && lm[23] && lm[24]) {
            var hip = (lm[23].y + lm[24].y) / 2;
            seen += 1;
            if (seen < 10) baselineHip = hip;
            else if (baselineHip != null && baselineHip - hip > 0.06) pass();
          }
        }
      }
      timer = requestAnimationFrame(watch);
    }
    function startCam() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        if ($('heard')) $('heard').textContent = 'This browser needs a camera.';
        return;
      }
      navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false }).then(function (next) {
        if (gen !== listenGen) {
          next.getTracks().forEach(function (track) { track.stop(); });
          return;
        }
        finishCam();
        stream = next;
        stopCam = finishCam;
        video.srcObject = next;
        return video.play().then(function () {
          return import('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14');
        });
      }).then(function (vision) {
        if (!vision || gen !== listenGen) return null;
        return vision.FilesetResolver.forVisionTasks('https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm').then(function (files) {
          return vision.PoseLandmarker.createFromOptions(files, {
            baseOptions: {
              modelAssetPath: 'https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/latest/pose_landmarker_lite.task',
              delegate: 'CPU'
            },
            runningMode: 'VIDEO',
            numPoses: 1
          });
        });
      }).then(function (landmarker) {
        if (!landmarker || gen !== listenGen) return;
        pose = landmarker;
        if ($('heard')) $('heard').textContent = 'Camera on. ' + cmd + '!';
        watch();
      }).catch(function () {
        if (gen !== listenGen) return;
        if ($('heard')) $('heard').textContent = 'Allow the camera so we can see you ' + cmd.toLowerCase() + '.';
      });
    }
    $('done').addEventListener('click', startCam);
    startCam();
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
        else openStep(3);
      });
    });
  }

  function choices(correctWord) {
    var opts = words.slice();
    var html = '<div class="row" id="opts"></div>';
    return html;
  }

  function advancePlay() {
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
  }

  function markTry(pair, item, node, mouth) {
    var ok = item[0] === pair[0];
    window.Trial.recordAnswer(pair[0], ok);
    if (!ok) {
      misses += 1;
      miss(node);
      $('msg').textContent = 'Try again';
      if (misses >= 2) {
        var nodes = $('opts').querySelectorAll('button');
        nodes.forEach(function (el) {
          if (el.dataset.word === pair[0]) el.classList.add('pulse');
        });
      }
      return;
    }
    misses = 0;
    $('msg').textContent = '';
    if (phase === 'bubbles') node.classList.add('pop');
    if (mouth) mouth.classList.add('is-chomp');
    celebrate();
    advancePlay();
  }

  function dragFood(node, item, pair, mouth) {
    node.addEventListener('pointerdown', function (ev) {
      if (ev.button !== undefined && ev.button !== 0) return;
      ev.preventDefault();
      var ghost = node.cloneNode(true);
      ghost.classList.add('dragging');
      ghost.style.left = (ev.clientX - 54) + 'px';
      ghost.style.top = (ev.clientY - 54) + 'px';
      document.body.appendChild(ghost);
      function move(e) {
        ghost.style.left = (e.clientX - 54) + 'px';
        ghost.style.top = (e.clientY - 54) + 'px';
        if (!mouth) return;
        var box = mouth.getBoundingClientRect();
        var near = e.clientX > box.left - 36 && e.clientX < box.right + 36 && e.clientY > box.top - 36 && e.clientY < box.bottom + 48;
        mouth.classList.toggle('is-open', near);
      }
      function up(e) {
        document.removeEventListener('pointermove', move);
        document.removeEventListener('pointerup', up);
        ghost.remove();
        if (mouth) mouth.classList.remove('is-open');
        if (!mouth) return;
        var box = mouth.getBoundingClientRect();
        var hit = e.clientX >= box.left - 28 && e.clientX <= box.right + 28 && e.clientY >= box.top - 28 && e.clientY <= box.bottom + 40;
        if (!hit) return;
        markTry(pair, item, node, mouth);
      }
      document.addEventListener('pointermove', move);
      document.addEventListener('pointerup', up);
    });
  }

  function play() {
    var pair = words[cursor];
    var feeding = phase === 'feed';
    var pets = theme === 'animals';
    var title = !feeding ? 'Pop the ' + pair[0] : (pets ? 'Take the ' + pair[0] + ' home' : 'Drag the ' + pair[0] + ' to the mouth');
    speak(title);
    var monster = '';
    if (feeding && pets) monster = '<div class="home" id="monster" aria-label="Home"></div>';
    else if (feeding) monster = '<div class="monster" id="monster" aria-hidden="true"><span class="mouth"></span></div>';
    stage('<p>' + title + '</p>' + monster + '<div class="row" id="opts"></div>');
    var mouth = $('monster');
    words.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tap ' + (feeding ? 'food' : 'bubble');
      b.innerHTML = '<span class="emoji">' + item[1] + '</span><span class="word">' + item[0] + '</span>';
      b.dataset.word = item[0];
      if (feeding) dragFood(b, item, pair, mouth);
      else b.addEventListener('click', function () { markTry(pair, item, b, null); });
      $('opts').appendChild(b);
    });
  }

  function saidWord(transcript, word) {
    var heard = String(transcript || '').toLowerCase();
    var want = String(word || '').toLowerCase();
    if (!want || heard.indexOf(want) === -1) {
      return heard.split(/[^a-z]+/).indexOf(want) !== -1;
    }
    return true;
  }

  function sayIt() {
    var pair = words[cursor];
    var passed = false;
    var gen = listenGen;
    speak('Say ' + pair[0]);
    stage('<p class="big">' + pair[1] + '</p><p>Say ' + pair[0] + '</p><p class="heard" id="heard">Listening…</p><button type="button" class="tap green" id="said">Listen</button>');
    var Rec = window.SpeechRecognition || window.webkitSpeechRecognition;
    var rec = null;
    function stopRec() {
      if (!rec) return;
      try { rec.onend = function () {}; rec.stop(); } catch (e) {}
    }
    function wrong(text) {
      if (gen !== listenGen) return;
      $('msg').textContent = 'Try again';
      var heard = $('heard');
      if (heard) heard.textContent = text ? ('I heard “' + text + '”. Say ' + pair[0] + '.') : ('Say ' + pair[0] + '.');
      miss($('said'));
    }
    function accept() {
      if (passed || gen !== listenGen) return;
      passed = true;
      stopRec();
      window.Trial.recordSpoke(pair[0]);
      celebrate();
      cursor += 1;
      saveStep().then(function () {
        if (cursor < words.length) sayIt();
        else openStep(5);
      });
    }
    function listen() {
      if (passed) return;
      if (!Rec) {
        var heard = $('heard');
        if (heard) heard.textContent = 'Use Chrome so we can hear “' + pair[0] + '”.';
        return;
      }
      try {
        stopRec();
        rec = new Rec();
        rec.lang = 'en-US';
        rec.interimResults = false;
        rec.maxAlternatives = 5;
        rec.onresult = function (ev) {
          var last = '';
          var i, j;
          for (i = 0; i < ev.results.length; i++) {
            for (j = 0; j < ev.results[i].length; j++) {
              last = ev.results[i][j].transcript || '';
              if (saidWord(last, pair[0])) { accept(); return; }
            }
          }
          wrong(last);
        };
        rec.onnomatch = function () { wrong(''); };
        rec.onerror = function (ev) {
          if (ev && ev.error === 'no-speech') return;
          wrong('');
        };
        rec.onend = function () {
          if (!passed && gen === listenGen) {
            try { rec.start(); } catch (e) {}
          }
        };
        rec.start();
        var line = $('heard');
        if (line) line.textContent = 'Listening… say ' + pair[0];
      } catch (e) {
        wrong('');
      }
    }
    $('said').addEventListener('click', listen);
    listen();
  }

  function check() {
    var pair = words[cursor];
    speak('Which one is ' + pair[0] + '?');
    stage('<p>Which one is ' + pair[0] + '?</p><div class="row" id="opts"></div>');
    words.forEach(function (item) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'tap choice';
      var pic = document.createElement('span');
      pic.className = 'emoji';
      pic.textContent = item[1];
      b.appendChild(pic);
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
    stage('<div class="cert"><p>You did it!</p><p class="big wave">' + colorful(childName) + '</p><p class="stickers"><span>⭐</span><span>⭐</span><span>⭐</span></p></div>');
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
        '<div class="row"><a class="plan" id="plans" href="/student-credits.html">Choose a plan</a>' +
        '<a class="plan" id="book" href="/student-book.html">Book a class</a></div>' +
        (paid && !afterPaid ? '<button type="button" class="tap green" id="more">Continue the lesson</button>' : '')
      );
      var more = $('more');
      if (more) more.addEventListener('click', function () { openStep(3); });
      var plans = $('plans');
      var book = $('book');
      if (plans) plans.addEventListener('click', function () { window.location.href = '/student-credits.html'; });
      if (book) book.addEventListener('click', function () { window.location.href = '/student-book.html'; });
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
        return fetch('/api/trials/mine', { headers: authHeaders(), credentials: 'include' })
          .then(function (r) { return r.json(); })
          .then(function (mine) {
            var id = mine && mine.trial && mine.trial.trialId;
            if (id && window.Trial.resume) {
              return window.Trial.resume(id).then(function () { pickTheme(); });
            }
            try { sessionStorage.removeItem('trialId'); } catch (e) {}
            return pickTheme();
          });
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

  function chooseTeacherVoice() {
    if (!window.speechSynthesis) return;
    var list = window.speechSynthesis.getVoices() || [];
    var en = list.filter(function (voice) { return /^en/i.test(voice.lang || ''); });
    var warm = /female|woman|aria|jenny|sonia|libby|samantha|victoria|zira|susan|karen|moira|fiona|linda|hazel/i;
    var male = /male|david|mark|guy|daniel|george|rishi/i;
    teacherVoice = en.filter(function (voice) { return warm.test(voice.name) && !male.test(voice.name); })[0]
      || en.filter(function (voice) { return !male.test(voice.name); })[0]
      || en[0]
      || null;
  }
  if (window.speechSynthesis) {
    chooseTeacherVoice();
    window.speechSynthesis.addEventListener('voiceschanged', chooseTeacherVoice);
  }

  paintBar();
  boot();
})();
