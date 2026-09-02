/**
 * QA recording for live classroom: low-bitrate WebM, chunked upload.
 * - Teacher records the full classroom tab (for QA); a cropped clone is published
 *   to the student for slide/presentation share (sync behavior unchanged).
 * - Start is gated until the student remote video is live.
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
    studentWaitTimer: null,
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
    /** Full classroom tab stream used by MediaRecorder (not cropped). */
    screenStream: null,
    /** Cropped clone published to student for slides only. */
    studentShareStream: null,
    /** Web Audio context used to mix tab audio + teacher mic into one track */
    recordingAudioContext: null,
    /** Extra getUserMedia({audio}) stream we own — stop on teardown */
    micStreamForRecording: null
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

  /** Student is present when remote video has a live track (teacher view). */
  function isStudentPresent() {
    if (liveUserType() !== 'teacher') return true;
    var remoteV = document.getElementById('remote-video');
    if (!remoteV || !remoteV.srcObject) return false;
    var tracks = remoteV.srcObject.getTracks ? remoteV.srcObject.getTracks() : [];
    return tracks.some(function (t) {
      return t && t.readyState === 'live' && (t.kind === 'video' || t.kind === 'audio');
    });
  }

  function setStartEnabled(enabled) {
    if (!state.btnStart) return;
    if (isRecording()) return;
    state.btnStart.disabled = !enabled;
    state.btnStart.style.opacity = enabled ? '1' : '0.55';
    state.btnStart.style.cursor = enabled ? 'pointer' : 'not-allowed';
  }

  function updateStudentGateUi() {
    if (liveUserType() !== 'teacher') return;
    if (isRecording()) return;
    if (isStudentPresent()) {
      setStartEnabled(true);
      setStatus('Student is in class. Click Start, choose \"This tab\", then continue.');
    } else {
      setStartEnabled(false);
      setStatus('Waiting for student to join before QA recording can start…');
    }
  }

  function startStudentPresenceWatcher() {
    if (state.studentWaitTimer) {
      clearInterval(state.studentWaitTimer);
      state.studentWaitTimer = null;
    }
    updateStudentGateUi();
    state.studentWaitTimer = setInterval(function () {
      updateStudentGateUi();
    }, 1500);
  }

  /** Live mic from the same WebRTC stream as #local-video (teacher). */
  function getTeacherMicStreamFromClassroom() {
    var localV = document.getElementById('local-video');
    if (!localV || !localV.srcObject) return null;
    var ls = localV.srcObject;
    var tracks = ls.getAudioTracks ? ls.getAudioTracks() : [];
    tracks = tracks.filter(function (t) {
      return t && t.readyState !== 'ended';
    });
    if (!tracks.length) return null;
    return new MediaStream(tracks);
  }

  /**
   * If classroom preview has no audio track yet, request mic-only (does not replace WebRTC).
   * Returns { stream, owned } — owned true means caller must stop tracks when done.
   */
  function ensureTeacherMicStreamForRecording() {
    var fromClass = getTeacherMicStreamFromClassroom();
    if (fromClass && fromClass.getAudioTracks().length) {
      return Promise.resolve({ stream: fromClass, owned: false });
    }
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      return Promise.resolve({ stream: null, owned: false });
    }
    return navigator.mediaDevices
      .getUserMedia({ audio: true, video: false })
      .then(function (s) {
        return { stream: s, owned: true };
      })
      .catch(function () {
        return { stream: null, owned: false };
      });
  }

  /**
   * Build one MediaStream: display video + (tab audio + mic mixed when both exist).
   */
  function composeDisplayAndMicStreams(displayStream, micWrap) {
    micWrap = micWrap || {};
    var micStream = micWrap.stream;
    var micStreamOwned = micWrap.owned ? micStream : null;

    var videoTracks = displayStream.getVideoTracks().slice();
    var displayAudioTracks = displayStream.getAudioTracks().slice();
    var micAudioTracks =
      micStream && micStream.getAudioTracks
        ? micStream.getAudioTracks().filter(function (t) {
            return t && t.readyState !== 'ended';
          })
        : [];

    var hadMic = micAudioTracks.length > 0;

    if (!hadMic) {
      var out0 = new MediaStream();
      videoTracks.forEach(function (t) {
        out0.addTrack(t);
      });
      displayAudioTracks.forEach(function (t) {
        out0.addTrack(t);
      });
      return { stream: out0, audioContext: null, micStreamOwned: micStreamOwned, hadMic: false };
    }

    if (displayAudioTracks.length === 0) {
      var out1 = new MediaStream();
      videoTracks.forEach(function (t) {
        out1.addTrack(t);
      });
      micAudioTracks.forEach(function (t) {
        out1.addTrack(t);
      });
      return { stream: out1, audioContext: null, micStreamOwned: micStreamOwned, hadMic: true };
    }

    var Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      var out2 = new MediaStream();
      videoTracks.forEach(function (t) {
        out2.addTrack(t);
      });
      displayAudioTracks.forEach(function (t) {
        out2.addTrack(t);
      });
      micAudioTracks.forEach(function (t) {
        out2.addTrack(t);
      });
      return { stream: out2, audioContext: null, micStreamOwned: micStreamOwned, hadMic: true };
    }

    var ctx = new Ctx();
    var dest = ctx.createMediaStreamDestination();
    try {
      if (displayAudioTracks.length) {
        ctx.createMediaStreamSource(new MediaStream(displayAudioTracks)).connect(dest);
      }
    } catch (e) {
      console.warn('QA recording: tab audio mix failed', e);
    }
    try {
      if (micAudioTracks.length) {
        ctx.createMediaStreamSource(new MediaStream(micAudioTracks)).connect(dest);
      }
    } catch (e2) {
      console.warn('QA recording: microphone mix failed', e2);
    }

    var mixedAudio = dest.stream.getAudioTracks();
    var out3 = new MediaStream();
    videoTracks.forEach(function (t) {
      out3.addTrack(t);
    });
    mixedAudio.forEach(function (t) {
      out3.addTrack(t);
    });
    return { stream: out3, audioContext: ctx, micStreamOwned: micStreamOwned, hadMic: true };
  }

  /** Whole-class/tab recording (teacher): capture the visible classroom as a screen recording. */
  function resolvePresentationCropElement() {
    return (
      document.getElementById('presentation-container') ||
      document.querySelector('.remoed-ppt-stack') ||
      document.querySelector('.remoed-ppt-mount') ||
      document.getElementById('lesson-file-viewer')
    );
  }

  /**
   * Region Capture for STUDENT slide share only: crop a cloned track to the PowerPoint
   * surface. The QA recording stream itself stays full-tab (uncropped).
   */
  function applyRegionCropToDisplayStream(stream) {
    if (!stream) return Promise.resolve(stream);
    var track = stream.getVideoTracks && stream.getVideoTracks()[0];
    if (!track) return Promise.resolve(stream);

    if (typeof track.cropTo !== 'function') {
      console.warn('[QA] Region Capture unsupported (no MediaStreamTrack.cropTo). Student share uses full tab.');
      return Promise.resolve(stream);
    }
    if (typeof window.CropTarget === 'undefined' || typeof window.CropTarget.fromElement !== 'function') {
      console.warn('[QA] CropTarget API unsupported in this browser. Student share uses full tab.');
      return Promise.resolve(stream);
    }

    var el = resolvePresentationCropElement();
    if (!el) {
      console.warn('[QA] No #presentation-container found for CropTarget; student share uses full tab.');
      return Promise.resolve(stream);
    }

    return window.CropTarget.fromElement(el)
      .then(function (cropTarget) {
        return track.cropTo(cropTarget).then(function () {
          console.log('[QA] Region Capture applied to student slide-share clone');
          return stream;
        });
      })
      .catch(function (err) {
        console.warn('[QA] CropTarget failed; student share continues without crop:', err);
        return stream;
      });
  }

  /**
   * Clone video (+ optional audio) from the full-tab capture, crop to slides, publish to student.
   * Does not mutate the original recording stream.
   */
  function publishCroppedSlideShareFromFullTab(fullStream) {
    if (!fullStream) return Promise.resolve(false);
    stopStudentShareStream();

    var fullVideo = fullStream.getVideoTracks && fullStream.getVideoTracks()[0];
    if (!fullVideo) return Promise.resolve(false);

    var clonedVideo;
    try {
      clonedVideo = fullVideo.clone();
    } catch (e) {
      console.warn('[QA] Could not clone video for student slide share:', e);
      return Promise.resolve(false);
    }

    var shareTracks = [clonedVideo];
    var fullAudio = fullStream.getAudioTracks && fullStream.getAudioTracks()[0];
    if (fullAudio) {
      try {
        shareTracks.push(fullAudio.clone());
      } catch (_a) {}
    }

    var shareStream = new MediaStream(shareTracks);
    state.studentShareStream = shareStream;

    return applyRegionCropToDisplayStream(shareStream).then(function (cropped) {
      state.studentShareStream = cropped;
      try {
        if (window.RemoedLiveClassroomWebrtc && typeof window.RemoedLiveClassroomWebrtc.publishScreenShare === 'function') {
          return window.RemoedLiveClassroomWebrtc.publishScreenShare(cropped).then(function () {
            return true;
          });
        }
      } catch (pubErr) {
        console.warn('QA tab-share publish error:', pubErr);
      }
      return false;
    });
  }

  function stopStudentShareStream() {
    if (state.studentShareStream) {
      try {
        state.studentShareStream.getTracks().forEach(function (t) {
          try {
            t.stop();
          } catch (_e) {}
        });
      } catch (e) {}
      state.studentShareStream = null;
    }
  }

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
      // Keep FULL tab for QA recording — do not crop this stream.
      state.screenStream = stream;
      try {
        var vTrack = stream.getVideoTracks && stream.getVideoTracks()[0];
        var label = vTrack && vTrack.label ? String(vTrack.label) : '';
        if (label) {
          setStatus('Captured source: ' + label + '. Recording full classroom; slides stay cropped for student.');
        } else {
          setStatus('Screen capture started. Recording full classroom…');
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

  function teardownRecordingExtras() {
    if (state.recordingAudioContext) {
      try {
        state.recordingAudioContext.close();
      } catch (e) {}
      state.recordingAudioContext = null;
    }
    if (state.micStreamForRecording) {
      try {
        state.micStreamForRecording.getTracks().forEach(function (t) { t.stop(); });
      } catch (e) {}
      state.micStreamForRecording = null;
    }
  }

  function resetAfterStopUi() {
    try {
      if (window.RemoedLiveClassroomWebrtc && typeof window.RemoedLiveClassroomWebrtc.unpublishScreenShare === 'function') {
        window.RemoedLiveClassroomWebrtc.unpublishScreenShare();
      }
    } catch (e) {
      console.warn('QA unpublish screen share:', e);
    }
    stopStudentShareStream();
    if (state.btnStart) {
      state.btnStart.disabled = false;
      state.btnStart.textContent = 'Start';
      state.btnStart.style.opacity = '1';
      state.btnStart.style.cursor = 'pointer';
    }
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
    teardownRecordingExtras();
    updateStudentGateUi();
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

    if (liveUserType() === 'teacher' && !isStudentPresent()) {
      setStatus('Waiting for student to join before QA recording can start…');
      setStartEnabled(false);
      return Promise.reject(new Error('no_student'));
    }

    if (state.btnStart) state.btnStart.disabled = true;
    setStatus('Starting…');
    state.chunkChain = Promise.resolve();

    var chooseStream = function () {
      // Teacher manual start: full-tab capture for QA archive (+ cropped clone for student slides).
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
          setStatus('Recording full classroom screen…');
          var vTrack = got.stream.getVideoTracks && got.stream.getVideoTracks()[0];
          try {
            var maybeLabel = vTrack && vTrack.label ? String(vTrack.label) : '';
            if (maybeLabel && !/live|classroom|remoed/i.test(maybeLabel)) {
              setStatus('Warning: captured source looks different (' + maybeLabel + '). If wrong, Stop then Start and select Live Classroom tab.');
            }
          } catch (e) {}
          if (vTrack) {
            vTrack.onended = function () {
              try {
                if (window.RemoedLiveClassroomWebrtc && typeof window.RemoedLiveClassroomWebrtc.unpublishScreenShare === 'function') {
                  window.RemoedLiveClassroomWebrtc.unpublishScreenShare();
                }
              } catch (_u) {}
              stopStudentShareStream();
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
        if (got.mode !== 'screen_tab') {
          return Promise.resolve(got);
        }
        return ensureTeacherMicStreamForRecording().then(function (micWrap) {
          var composed = composeDisplayAndMicStreams(got.stream, micWrap);
          state.recordingAudioContext = composed.audioContext;
          state.micStreamForRecording = composed.micStreamOwned || null;
          if (!composed.hadMic) {
            setStatus(
              'Tab capture only — microphone not added. Turn on mic in the classroom first, then Stop and Start again.'
            );
          } else if (got.stream.getAudioTracks().length) {
            setStatus('Recording full classroom: tab sound + your microphone (mixed).');
          } else {
            setStatus(
              'Recording full classroom + mic. Enable “Share tab audio” when prompted to also capture lesson video sound.'
            );
          }
          return { stream: composed.stream, mode: got.mode, rawDisplayStream: got.stream };
        });
      })
      .then(function (finalGot) {
        return startSession().then(function (id) {
          return { got: finalGot, id: id };
        });
      })
      .then(function (ctx) {
        state.recordingId = ctx.id;
        if (state.recordingAudioContext && state.recordingAudioContext.state === 'suspended') {
          state.recordingAudioContext.resume().catch(function () {});
        }
        var opts = { videoBitsPerSecond: 280000, audioBitsPerSecond: 64000 };
        if (mimeType) opts.mimeType = mimeType;
        var mr;
        try {
          mr = new MediaRecorder(ctx.got.stream, opts);
        } catch (e1) {
          try {
            mr = mimeType ? new MediaRecorder(ctx.got.stream, { mimeType: mimeType }) : new MediaRecorder(ctx.got.stream);
          } catch (e2) {
            teardownRecordingExtras();
            stopStudentShareStream();
            if (state.screenStream) {
              try {
                state.screenStream.getTracks().forEach(function (t) { t.stop(); });
              } catch (e3) {}
              state.screenStream = null;
            }
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
        // Phase 3: lock Start only after stream init succeeded
        if (state.btnStart) {
          state.btnStart.disabled = true;
          state.btnStart.textContent = 'Recording Active';
          state.btnStart.setAttribute('aria-disabled', 'true');
          state.btnStart.style.opacity = '0.85';
          state.btnStart.style.cursor = 'default';
        }
        if (state.btnStop) {
          state.btnStop.disabled = false;
          state.btnStop.style.opacity = '1';
        }
        setStatus('Recording full classroom… ' + formatTime(0));

        // Student slide share: cropped clone of the same tab (sync path unchanged).
        // QA archive keeps the uncropped full-tab stream above.
        if (ctx.got.mode === 'screen_tab' && state.screenStream) {
          publishCroppedSlideShareFromFullTab(state.screenStream)
            .then(function (ok) {
              if (ok) {
                setStatus('Recording full classroom… Student still receives cropped slides.');
              }
            })
            .catch(function (err) {
              console.warn('QA cropped slide-share publish failed:', err);
            });
        }

        state.tickTimer = setInterval(function () {
          if (!state.startedAt) return;
          var elapsed = (Date.now() - state.startedAt) / 1000;
          setStatus('Recording full classroom… ' + formatTime(elapsed));
        }, 1000);

        state.stopTimer = setTimeout(function () {
          if (state.mediaRecorder && state.mediaRecorder.state === 'recording') {
            setStatus('Max length reached — stopping…');
            state.mediaRecorder.stop();
          }
        }, state.maxMs);
      })
      .catch(function (e) {
        var msg = String((e && e.message) || e || '');
        if (msg.indexOf('no_student') >= 0) {
          setStatus('Waiting for student to join before QA recording can start…');
        } else if (msg.indexOf('no_stream') >= 0 && !silent) {
          setStatus('No classroom stream yet. Start after video is connected.');
        } else {
          setStatus('Start failed: ' + (e.message || e));
        }
        if (state.btnStart) {
          state.btnStart.disabled = false;
          state.btnStart.textContent = 'Start';
          state.btnStart.style.opacity = '1';
          state.btnStart.style.cursor = 'pointer';
        }
        state.recordingId = null;
        state.mediaRecorder = null;
        teardownRecordingExtras();
        stopStudentShareStream();
        if (state.screenStream) {
          try {
            state.screenStream.getTracks().forEach(function (t) { t.stop(); });
          } catch (e2) {}
          state.screenStream = null;
        }
        updateStudentGateUi();
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
    try {
      var existing = document.getElementById('qa-recording-panel');
      if (existing && existing.parentNode) existing.parentNode.removeChild(existing);
    } catch (_e) {}
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

      // Privacy + authority: only teachers can start/see QA recording controls.
      if (liveUserType() !== 'teacher') {
        try {
          var leftover = document.getElementById('qa-recording-panel');
          if (leftover && leftover.parentNode) leftover.parentNode.removeChild(leftover);
        } catch (_e) {}
        window.ClassroomQaRecording = {
          stopAndFinalize: function () { return Promise.resolve(); },
          isRecording: function () { return false; },
          isEnabled: false,
          reason: 'teacher_only'
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
          'Starts only after the student joins. Choose “This tab” + “Share tab audio”. QA saves the full classroom; the student still gets the cropped slide view (sync unchanged).';
      }
      setStatus(
        cfg.enabled
          ? 'Waiting for student… then Start to record the full classroom.'
          : 'QA URL flag on — set CLASSROOM_QA_RECORDING_ENABLED=false on server to disable.'
      );

      state.btnStart.addEventListener('click', function () {
        if (!isStudentPresent()) {
          setStatus('Waiting for student to join before QA recording can start…');
          return;
        }
        startRecording({ silent: false }).catch(function () {});
      });
      if (state.btnStop) {
        state.btnStop.style.display = 'none';
      }

      window.ClassroomQaRecording = {
        stopAndFinalize: stopAndFinalize,
        isRecording: isRecording,
        isEnabled: true,
        isStudentPresent: isStudentPresent,
        startRecording: function () {
          return startRecording({ silent: false });
        }
      };

      startStudentPresenceWatcher();
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