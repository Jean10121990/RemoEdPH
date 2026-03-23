/**
 * QA recording for live classroom: low-bitrate WebM, chunked upload.
 * - When server flag is on (or ?qaRecord=1), teachers auto-start when a stream is available.
 * - live-classroom "Finish" calls ClassroomQaRecording.stopAndFinalize() before closing WebRTC.
 * See docs/CLASSROOM_RECORDING.md
 */
(function () {
  'use strict';

  var state = {
    recordingId: null,
    mediaRecorder: null,
    stopTimer: null,
    tickTimer: null,
    startedAt: 0,
    chunkChain: Promise.resolve(),
    autoStartTried: false,
    panel: null,
    statusEl: null,
    btnStart: null,
    btnStop: null,
    cfg: null,
    roomId: '',
    bookingId: '',
    maxMs: 25 * 60 * 1000,
    chunkMs: 20000,
    screenStream: null
  };

  function getParam(name) {
    try {
      var q = new URLSearchParams(window.location.search || '');
      return q.get(name) || q.get(name.toLowerCase());
    } catch (e) {
      return null;
    }
  }

  function authHeaders() {
    var token = localStorage.getItem('token');
    if (!token) return null;
    return { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' };
  }

  function formatTime(sec) {
    var s = Math.max(0, Math.floor(sec || 0));
    var m = Math.floor(s / 60);
    var r = s % 60;
    return m + ':' + (r < 10 ? '0' : '') + r;
  }

  function loadConfig() {
    return fetch('/api/classroom-recording/config', { cache: 'no-store' }).then(function (r) {
      if (!r.ok) return { enabled: false, maxDurationMinutes: 25, retentionDays: 7 };
      return r.json();
    });
  }

  function shouldActivate(cfg) {
    return !!(cfg && (cfg.enabled || getParam('qaRecord') === '1' || getParam('qaRecording') === '1'));
  }

  function liveUserType() {
    return (window.__liveClassroomUserType || localStorage.getItem('userType') || '').toLowerCase();
  }

  function setStatus(t) {
    if (state.statusEl) state.statusEl.textContent = t;
  }

  /** Prefer remote peer; if alone in class, fall back to local camera. */
  function getRecordableStream() {
    var remoteV = document.getElementById('remote-video');
    if (remoteV && remoteV.srcObject) {
      var rs = remoteV.srcObject;
      if (rs.getTracks && rs.getTracks().length) {
        return { stream: rs, mode: 'remote' };
      }
    }
    var localV = document.getElementById('local-video');
    if (localV && localV.srcObject) {
      var ls = localV.srcObject;
      if (ls.getTracks && ls.getTracks().length) {
        return { stream: ls, mode: 'local_fallback' };
      }
    }
    return null;
  }

  /** Whole-class/tab recording (teacher): capture the visible classroom as a screen recording. */
  function getScreenRecordableStream() {
    if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
      return Promise.reject(new Error('Screen capture not supported in this browser'));
    }
    return navigator.mediaDevices.getDisplayMedia({
      video: {
        frameRate: { ideal: 10, max: 15 },
        displaySurface: 'browser'
      },
      audio: true,
      preferCurrentTab: true,
      selfBrowserSurface: 'include',
      surfaceSwitching: 'exclude'
    }).then(function (stream) {
      state.screenStream = stream;
      try {
        var vTrack = stream.getVideoTracks && stream.getVideoTracks()[0];
        var label = vTrack && vTrack.label ? String(vTrack.label) : '';
        if (label) {
          setStatus('Captured source: ' + label + '. If wrong, Stop then Start and choose \"This tab\".');
        } else {
          setStatus('Screen capture started. Confirm you selected \"This tab (Live Classroom)\".');
        }
      } catch (e) {}
      return { stream: stream, mode: 'screen_tab' };
    });
  }

  function pickMime() {
    var c = ['video/webm;codecs=vp8,opus', 'video/webm;codecs=vp8', 'video/webm'];
    for (var i = 0; i < c.length; i++) {
      if (typeof MediaRecorder !== 'undefined' && MediaRecorder.isTypeSupported(c[i])) return c[i];
    }
    return '';
  }

  function queueChunk(blob) {
    if (!state.recordingId || !blob || blob.size === 0) return;
    var h = authHeaders();
    state.chunkChain = state.chunkChain.then(function () {
      return fetch('/api/classroom-recording/session/' + state.recordingId + '/chunk', {
        method: 'PUT',
        headers: {
          Authorization: h.Authorization,
          'Content-Type': 'application/octet-stream'
        },
        body: blob
      }).then(function (r) {
        if (!r.ok) return r.text().then(function (t) { throw new Error(t || 'Chunk upload failed'); });
      });
    }).catch(function (err) {
      console.warn('QA chunk upload:', err);
    });
  }

  function startSession() {
    var h = authHeaders();
    return fetch('/api/classroom-recording/session', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        roomId: String(state.roomId),
        bookingId: state.bookingId || undefined
      })
    }).then(function (r) {
      return r.json().then(function (j) {
        if (!r.ok || !j.success || !j.recordingId) {
          throw new Error((j && j.message) || 'Could not start recording session');
        }
        return j.recordingId;
      });
    });
  }

  function completeSession(durationSec) {
    var rid = state.recordingId;
    var mime = state.mediaRecorder && state.mediaRecorder.mimeType ? state.mediaRecorder.mimeType : 'video/webm';
    var h = authHeaders();
    return fetch('/api/classroom-recording/session/' + rid + '/complete', {
      method: 'POST',
      headers: h,
      body: JSON.stringify({
        durationSec: durationSec != null ? durationSec : null,
        mimeType: mime
      })
    }).then(function (r) {
      return r.text().then(function (txt) {
        if (!r.ok) {
          var msg = txt;
          try {
            msg = JSON.parse(txt).message || txt;
          } catch (e) {}
          throw new Error(msg || 'Complete failed');
        }
      });
    });
  }

  function abortSession() {
    var id = state.recordingId;
    state.recordingId = null;
    if (!id) return Promise.resolve();
    var h = authHeaders();
    return fetch('/api/classroom-recording/session/' + id + '/abort', {
      method: 'POST',
      headers: h
    }).catch(function () {});
  }

  function cleanupTimers() {
    if (state.stopTimer) {
      clearTimeout(state.stopTimer);
      state.stopTimer = null;
    }
    if (state.tickTimer) {
      clearInterval(state.tickTimer);
      state.tickTimer = null;
    }
  }

  function resetAfterStopUi() {
    if (state.btnStart) state.btnStart.disabled = false;
    if (state.btnStop) {
      state.btnStop.disabled = true;
      state.btnStop.style.opacity = '0.6';
    }
    state.recordingId = null;
    state.mediaRecorder = null;
    state.chunkChain = Promise.resolve();
    if (state.screenStream) {
      try {
        state.screenStream.getTracks().forEach(function (t) { t.stop(); });
      } catch (e) {}
      state.screenStream = null;
    }
  }

  /**
   * Start MediaRecorder. options.silent — no alert on missing stream (for poller).
   */
  function startRecording(options) {
    options = options || {};
    var silent = !!options.silent;

    var mimeType = pickMime();
    if (!mimeType && typeof MediaRecorder === 'undefined') {
      setStatus('Recording not supported in this browser.');
      return Promise.reject(new Error('no_mediarecorder'));
    }

    if (state.btnStart) state.btnStart.disabled = true;
    setStatus('Starting…');
    state.chunkChain = Promise.resolve();

    var chooseStream = function () {
      // Teacher manual start uses screen/tab capture for whole-class view.
      if (liveUserType() === 'teacher' && !silent) {
        setStatus('Pick \"This tab\" to record the full classroom screen...');
        return getScreenRecordableStream().catch(function (e) {
          setStatus('Screen capture not allowed. Falling back to classroom video stream.');
          var fallback = getRecordableStream();
          if (!fallback) throw e;
          return fallback;
        });
      }
      // Silent/auto or student: no permission prompt; use classroom streams.
      var got = getRecordableStream();
      if (!got) throw new Error('no_stream');
      return Promise.resolve(got);
    };

    return chooseStream()
      .then(function (got) {
        if (!got) throw new Error('no_stream');
        if (got.mode === 'local_fallback') {
          setStatus('Recording local camera (no remote stream available yet).');
        } else if (got.mode === 'screen_tab') {
          setStatus('Recording whole classroom screen…');
          var vTrack = got.stream.getVideoTracks && got.stream.getVideoTracks()[0];
          try {
            var maybeLabel = vTrack && vTrack.label ? String(vTrack.label) : '';
            if (maybeLabel && !/live|classroom|remoed/i.test(maybeLabel)) {
              setStatus('Warning: captured source looks different (' + maybeLabel + '). If wrong, Stop then Start and select Live Classroom tab.');
            }
          } catch (e) {}
          if (vTrack) {
            vTrack.onended = function () {
              if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
                setStatus('Screen share stopped — finishing recording…');
                state.mediaRecorder.stop();
              }
            };
          }
        }
        return got;
      })
      .then(function (got) {
        return startSession().then(function (id) { return { got: got, id: id }; });
      })
      .then(function (ctx) {
        state.recordingId = ctx.id;
        var opts = { videoBitsPerSecond: 280000, audioBitsPerSecond: 48000 };
        if (mimeType) opts.mimeType = mimeType;
        var mr;
        try {
          mr = new MediaRecorder(ctx.got.stream, opts);
        } catch (e1) {
          try {
            mr = mimeType ? new MediaRecorder(ctx.got.stream, { mimeType: mimeType }) : new MediaRecorder(ctx.got.stream);
          } catch (e2) {
            return abortSession().then(function () {
              throw e2;
            });
          }
        }
        state.mediaRecorder = mr;
        state.startedAt = Date.now();

        mr.ondataavailable = function (ev) {
          if (!ev.data || ev.data.size === 0) return;
          queueChunk(ev.data);
        };
        mr.onerror = function (ev) {
          console.warn('MediaRecorder error', ev);
        };
        mr.onstop = function () {
          cleanupTimers();
          var dur = (Date.now() - state.startedAt) / 1000;
          state.chunkChain
            .then(function () {
              return completeSession(dur);
            })
            .then(function () {
              setStatus('Saved. Admin → Lesson recordings.');
            })
            .catch(function (e) {
              setStatus('Finalize failed: ' + (e.message || e));
            })
            .then(function () {
              resetAfterStopUi();
            });
        };

        mr.start(state.chunkMs);
        if (state.btnStop) {
          state.btnStop.disabled = false;
          state.btnStop.style.opacity = '1';
        }
        setStatus('Recording… ' + formatTime(0));

        state.tickTimer = setInterval(function () {
          if (!state.startedAt) return;
          var elapsed = (Date.now() - state.startedAt) / 1000;
          setStatus('Recording… ' + formatTime(elapsed));
        }, 1000);

        state.stopTimer = setTimeout(function () {
          if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
            setStatus('Max length reached — stopping…');
            state.mediaRecorder.stop();
          }
        }, state.maxMs);
      })
      .catch(function (e) {
        if (String(e && e.message || '').indexOf('no_stream') >= 0 && !silent) {
          setStatus('No classroom stream yet. Start after video is connected.');
        } else {
          setStatus('Start failed: ' + (e.message || e));
        }
        if (state.btnStart) state.btnStart.disabled = false;
        state.recordingId = null;
        state.mediaRecorder = null;
        throw e;
      });
  }

  /** Call from Finish before closing peer connection. Waits for last chunk + complete. */
  function stopAndFinalize() {
    var mr = state.mediaRecorder;
    if (!mr || mr.state !== 'recording') {
      return Promise.resolve();
    }
    setStatus('Saving recording…');
    return new Promise(function (resolve) {
      var settled = false;
      function safeResolve() {
        if (settled) return;
        settled = true;
        resolve();
      }
      mr.onstop = function () {
        cleanupTimers();
        var dur = (Date.now() - state.startedAt) / 1000;
        state.chunkChain
          .then(function () {
            return completeSession(dur);
          })
          .then(function () {
            setStatus('Saved. Admin → Lesson recordings.');
          })
          .catch(function (e) {
            console.warn('QA finalize:', e);
            setStatus('Finalize failed: ' + (e.message || e));
          })
          .then(function () {
            resetAfterStopUi();
            safeResolve();
          });
      };
      try {
        mr.stop();
      } catch (e) {
        console.warn('QA stop:', e);
        safeResolve();
      }
      setTimeout(safeResolve, 45000);
    });
  }

  function isRecording() {
    return !!(state.mediaRecorder && state.mediaRecorder.state === 'recording');
  }

  function buildPanel() {
    var wrap = document.createElement('div');
    wrap.id = 'qa-recording-panel';
    wrap.setAttribute(
      'style',
      [
        'position:fixed',
        'bottom:12px',
        'left:12px',
        'z-index:8500',
        'max-width:300px',
        'padding:10px 12px',
        'border-radius:10px',
        'background:rgba(15,23,42,0.92)',
        'color:#e2e8f0',
        'font:12px/1.4 system-ui,Segoe UI,sans-serif',
        'box-shadow:0 8px 24px rgba(0,0,0,0.35)',
        'border:1px solid rgba(148,163,184,0.35)'
      ].join(';')
    );
    wrap.innerHTML =
      '<div style="font-weight:700;margin-bottom:6px;color:#93c5fd;">QA lesson recording</div>' +
      '<div id="qa-rec-status" style="opacity:0.9;margin-bottom:8px;">…</div>' +
      '<div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center;">' +
      '<button type="button" id="qa-rec-start" style="padding:6px 12px;border:none;border-radius:6px;background:#2563eb;color:#fff;font-weight:600;cursor:pointer;">Start</button>' +
      '</div>' +
      '<div id="qa-rec-hint" style="margin-top:8px;font-size:11px;opacity:0.75;"></div>';
    document.body.appendChild(wrap);
    return wrap;
  }

  function main() {
    return loadConfig().then(function (cfg) {
      state.cfg = cfg;
      if (!shouldActivate(cfg)) {
        window.ClassroomQaRecording = {
          stopAndFinalize: function () { return Promise.resolve(); },
          isRecording: function () { return false; },
          isEnabled: false
        };
        return;
      }

      if (!authHeaders()) {
        window.ClassroomQaRecording = {
          stopAndFinalize: function () { return Promise.resolve(); },
          isRecording: function () { return false; },
          isEnabled: true,
          reason: 'no_token'
        };
        return;
      }

      state.roomId =
        getParam('room') || getParam('classroomId') || getParam('classroomid') || 'default-room';
      state.bookingId = getParam('bookingId') || getParam('bookingid') || '';
      state.maxMs = (Number(cfg.maxDurationMinutes) || 25) * 60 * 1000;

      state.panel = buildPanel();
      state.statusEl = state.panel.querySelector('#qa-rec-status');
      state.btnStart = state.panel.querySelector('#qa-rec-start');
      state.btnStop = state.panel.querySelector('#qa-rec-stop');
      var hint = state.panel.querySelector('#qa-rec-hint');
      if (hint) {
        hint.textContent =
          liveUserType() === 'teacher'
            ? 'Teachers: click Start and choose \"This tab (Live Classroom)\". If wrong tab is captured, Stop then Start again.'
            : 'Students: use Start when the teacher is visible, or rely on your school’s policy.';
      }
      setStatus(
        cfg.enabled
          ? 'Ready. Teacher Start will capture the full classroom screen.'
          : 'QA URL flag on — set CLASSROOM_QA_RECORDING_ENABLED=false on server to disable.'
      );

      state.btnStart.addEventListener('click', function () {
        startRecording({ silent: false }).catch(function () {});
      });
      if (state.btnStop) {
        state.btnStop.style.display = 'none';
      }

      window.ClassroomQaRecording = {
        stopAndFinalize: stopAndFinalize,
        isRecording: isRecording,
        isEnabled: true,
        startRecording: function () {
          return startRecording({ silent: false });
        }
      };

      // Teachers should choose the tab/window explicitly for screen recording.
      if (liveUserType() === 'teacher') {
        setStatus('Click Start, choose \"This tab\", then continue class.');
      } else {
        setStatus('Click Start when remote video is connected.');
      }
    });
  }

  window.ClassroomQaRecording = window.ClassroomQaRecording || {
    stopAndFinalize: function () { return Promise.resolve(); },
    isRecording: function () { return false; },
    isEnabled: false
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', function () {
      main().catch(function (e) {
        console.warn('classroom-qa-recording:', e);
      });
    });
  } else {
    main().catch(function (e) {
      console.warn('classroom-qa-recording:', e);
    });
  }
})();
