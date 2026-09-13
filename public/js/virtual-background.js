/**
 * Client-side virtual background (blur + image) for WebRTC.
 * Canvas pipeline always applies a visible effect. MediaPipe is optional cutout.
 */
(function (global) {
  'use strict';

  var PRESET_BACKGROUNDS = [
    { id: 'office', label: 'Office', url: '/images/virtual-bg/office.jpg' },
    { id: 'classroom', label: 'Classroom', url: '/images/virtual-bg/classroom.jpg' },
    { id: 'nature', label: 'Nature', url: '/images/virtual-bg/nature.jpg' }
  ];

  function waitForVideo(video, timeoutMs) {
    return new Promise(function (resolve) {
      var done = false;
      function finish() {
        if (done) return;
        done = true;
        resolve(video);
      }
      if (video.videoWidth > 0 && video.readyState >= 2) {
        finish();
        return;
      }
      video.addEventListener('loadeddata', finish, { once: true });
      video.addEventListener('playing', finish, { once: true });
      setTimeout(finish, timeoutMs || 1500);
    });
  }

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (global.SelfieSegmentation) {
        resolve();
        return;
      }
      var existing = document.querySelector('script[data-remoed-vbg-lib="1"]');
      if (existing) {
        if (global.SelfieSegmentation) {
          resolve();
          return;
        }
        existing.addEventListener('load', function () { resolve(); });
        existing.addEventListener('error', function () {
          reject(new Error('Failed to load ' + src));
        });
        return;
      }
      var s = document.createElement('script');
      s.src = src;
      s.async = true;
      s.setAttribute('data-remoed-vbg-lib', '1');
      s.onload = function () { resolve(); };
      s.onerror = function () {
        reject(new Error('Failed to load ' + src));
      };
      document.head.appendChild(s);
    });
  }

  function drawCover(ctx, img, w, h) {
    if (!img) return;
    var iw = img.naturalWidth || img.videoWidth || img.width || w;
    var ih = img.naturalHeight || img.videoHeight || img.height || h;
    if (!iw || !ih) {
      ctx.drawImage(img, 0, 0, w, h);
      return;
    }
    var scale = Math.max(w / iw, h / ih);
    var dw = iw * scale;
    var dh = ih * scale;
    ctx.drawImage(img, (w - dw) / 2, (h - dh) / 2, dw, dh);
  }

  function paintPreset(ctx, id, w, h) {
    if (id === 'classroom') {
      var wall = ctx.createLinearGradient(0, 0, 0, h);
      wall.addColorStop(0, '#f5efe3');
      wall.addColorStop(1, '#e4d3b4');
      ctx.fillStyle = wall;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#2f6b3a';
      ctx.fillRect(w * 0.08, h * 0.12, w * 0.84, h * 0.58);
      ctx.fillStyle = '#1f4d28';
      ctx.fillRect(w * 0.08, h * 0.12, w * 0.84, 10);
      ctx.fillStyle = '#c4a574';
      ctx.fillRect(0, h * 0.78, w, h * 0.22);
      return;
    }
    if (id === 'nature') {
      var sky = ctx.createLinearGradient(0, 0, 0, h);
      sky.addColorStop(0, '#7ec8e3');
      sky.addColorStop(0.55, '#c5e8a8');
      sky.addColorStop(1, '#4c8a3c');
      ctx.fillStyle = sky;
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = '#3d7a32';
      ctx.beginPath();
      ctx.moveTo(0, h * 0.62);
      ctx.quadraticCurveTo(w * 0.3, h * 0.48, w * 0.55, h * 0.64);
      ctx.quadraticCurveTo(w * 0.78, h * 0.76, w, h * 0.58);
      ctx.lineTo(w, h);
      ctx.lineTo(0, h);
      ctx.fill();
      ctx.fillStyle = '#ffe08a';
      ctx.beginPath();
      ctx.arc(w * 0.82, h * 0.18, Math.min(w, h) * 0.08, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    var office = ctx.createLinearGradient(0, 0, w, h);
    office.addColorStop(0, '#dbe3ec');
    office.addColorStop(1, '#8ea0b5');
    ctx.fillStyle = office;
    ctx.fillRect(0, 0, w, h);
    ctx.fillStyle = 'rgba(100,116,139,0.35)';
    ctx.fillRect(0, h * 0.58, w, 18);
    ctx.fillStyle = '#64748b';
    ctx.fillRect(0, h * 0.82, w, h * 0.18);
    ctx.fillStyle = '#cbd5e1';
    ctx.fillRect(w * 0.12, h * 0.18, w * 0.28, h * 0.28);
    ctx.fillRect(w * 0.6, h * 0.18, w * 0.28, h * 0.28);
  }

  function VirtualBackgroundController(options) {
    options = options || {};
    this.getLocalStream = options.getLocalStream || function () {
      return null;
    };
    this.getPeerConnection = options.getPeerConnection || function () {
      return null;
    };
    this.localVideoEl = options.localVideoEl || null;
    this.mode = 'off';
    this.imageUrl = '';
    this.presetId = '';
    this.bgImage = null;
    this.hasMask = false;
    this.maskCanvas = null;
    this.segmentation = null;
    this.segReady = false;
    this.segLoading = false;
    this.sourceVideo = null;
    this.canvas = null;
    this.ctx = null;
    this.outputStream = null;
    this.outputTrack = null;
    this.raf = null;
    this.processing = false;
    this.personCanvas = null;
    this.personCtx = null;
  }

  VirtualBackgroundController.prototype.resolveLocalVideo = function () {
    return this.localVideoEl || document.getElementById('local-video');
  };

  VirtualBackgroundController.prototype.stopPipeline = function () {
    if (this.raf) {
      cancelAnimationFrame(this.raf);
      this.raf = null;
    }
    if (this.outputTrack) {
      try { this.outputTrack.stop(); } catch (_e) {}
      this.outputTrack = null;
    }
    if (this.outputStream) {
      try {
        this.outputStream.getTracks().forEach(function (t) { t.stop(); });
      } catch (_e2) {}
      this.outputStream = null;
    }
    if (this.sourceVideo) {
      try { this.sourceVideo.pause(); } catch (_e3) {}
      try { this.sourceVideo.srcObject = null; } catch (_e4) {}
      this.sourceVideo = null;
    }
    this.canvas = null;
    this.ctx = null;
    this.processing = false;
    this.hasMask = false;
  };

  VirtualBackgroundController.prototype.replaceOutgoingVideoTrack = async function (nextTrack) {
    if (!nextTrack) return;
    var pc = this.getPeerConnection && this.getPeerConnection();
    if (!pc) return;
    var sender = pc.getSenders().find(function (s) {
      return s.track && s.track.kind === 'video';
    });
    if (sender) {
      try {
        await sender.replaceTrack(nextTrack);
      } catch (_e) {}
    }
  };

  VirtualBackgroundController.prototype.loadBackgroundImage = function (url) {
    var self = this;
    return new Promise(function (resolve) {
      if (!url) {
        self.bgImage = null;
        resolve(null);
        return;
      }
      var img = new Image();
      var isBlob = String(url).indexOf('blob:') === 0 || String(url).indexOf('data:') === 0;
      if (!isBlob) {
        try {
          var absolute = new URL(url, global.location && global.location.href).href;
          var origin = global.location && global.location.origin;
          if (origin && absolute.indexOf(origin) !== 0 && /^https?:/i.test(absolute)) {
            img.crossOrigin = 'anonymous';
          }
        } catch (_e) {}
      }
      img.onload = function () {
        self.bgImage = img;
        resolve(img);
      };
      img.onerror = function () {
        self.bgImage = null;
        resolve(null);
      };
      img.src = url;
    });
  };

  VirtualBackgroundController.prototype.maybeStartSegmentation = function () {
    var self = this;
    if (self.segReady || self.segLoading) return;
    self.segLoading = true;
    loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js')
      .then(function () {
        if (!global.SelfieSegmentation) throw new Error('no SelfieSegmentation');
        self.segmentation = new global.SelfieSegmentation({
          locateFile: function (file) {
            return 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/' + file;
          }
        });
        self.segmentation.setOptions({ modelSelection: 1 });
        self.segmentation.onResults(function (results) {
          if (!results || !results.segmentationMask || !self.canvas) return;
          if (!self.maskCanvas) {
            self.maskCanvas = document.createElement('canvas');
          }
          self.maskCanvas.width = self.canvas.width;
          self.maskCanvas.height = self.canvas.height;
          var mctx = self.maskCanvas.getContext('2d');
          mctx.clearRect(0, 0, self.maskCanvas.width, self.maskCanvas.height);
          mctx.drawImage(results.segmentationMask, 0, 0, self.maskCanvas.width, self.maskCanvas.height);
          self.hasMask = true;
        });
        var init = typeof self.segmentation.initialize === 'function'
          ? self.segmentation.initialize()
          : Promise.resolve();
        return init.then(function () {
          self.segReady = true;
          self.segLoading = false;
        });
      })
      .catch(function () {
        self.segLoading = false;
        self.segReady = false;
      });
  };

  VirtualBackgroundController.prototype.ensurePersonLayer = function (w, h) {
    if (!this.personCanvas) {
      this.personCanvas = document.createElement('canvas');
      this.personCtx = this.personCanvas.getContext('2d');
    }
    if (this.personCanvas.width !== w || this.personCanvas.height !== h) {
      this.personCanvas.width = w;
      this.personCanvas.height = h;
    }
    return this.personCtx;
  };

  VirtualBackgroundController.prototype.paintPersonCutout = function (video, w, h) {
    var pctx = this.ensurePersonLayer(w, h);
    pctx.globalCompositeOperation = 'source-over';
    pctx.clearRect(0, 0, w, h);
    pctx.drawImage(this.maskCanvas, 0, 0, w, h);
    pctx.globalCompositeOperation = 'source-in';
    pctx.drawImage(video, 0, 0, w, h);
    pctx.globalCompositeOperation = 'source-over';
    return this.personCanvas;
  };

  VirtualBackgroundController.prototype.paintFrame = function () {
    var ctx = this.ctx;
    var video = this.sourceVideo;
    var canvas = this.canvas;
    if (!ctx || !video || !canvas) return;
    var w = canvas.width;
    var h = canvas.height;
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.globalCompositeOperation = 'source-over';
    ctx.filter = 'none';
    ctx.clearRect(0, 0, w, h);

    if (this.mode === 'blur') {
      ctx.filter = 'blur(18px)';
      ctx.drawImage(video, 0, 0, w, h);
      ctx.filter = 'none';
      if (this.hasMask && this.maskCanvas) {
        ctx.drawImage(this.paintPersonCutout(video, w, h), 0, 0);
      }
    } else if (this.mode === 'image') {
      if (this.bgImage) {
        drawCover(ctx, this.bgImage, w, h);
      } else {
        paintPreset(ctx, this.presetId || 'office', w, h);
      }
      if (this.hasMask && this.maskCanvas) {
        ctx.drawImage(this.paintPersonCutout(video, w, h), 0, 0);
      } else {
        var padX = w * 0.18;
        var padY = h * 0.16;
        var dw = w - padX * 2;
        var dh = h - padY * 1.15;
        ctx.beginPath();
        var r = Math.min(28, dw / 8);
        ctx.moveTo(padX + r, padY);
        ctx.arcTo(padX + dw, padY, padX + dw, padY + dh, r);
        ctx.arcTo(padX + dw, padY + dh, padX, padY + dh, r);
        ctx.arcTo(padX, padY + dh, padX, padY, r);
        ctx.arcTo(padX, padY, padX + dw, padY, r);
        ctx.closePath();
        ctx.clip();
        ctx.drawImage(video, padX, padY, dw, dh);
      }
    } else {
      ctx.drawImage(video, 0, 0, w, h);
    }
    ctx.restore();
  };

  VirtualBackgroundController.prototype.startLoop = function () {
    var self = this;
    var run = function () {
      if (self.mode === 'off' || !self.sourceVideo || !self.ctx) return;
      self.paintFrame();
      if (self.segReady && self.segmentation && self.sourceVideo && !self.processing) {
        self.processing = true;
        Promise.resolve(self.segmentation.send({ image: self.sourceVideo }))
          .catch(function () {})
          .then(function () { self.processing = false; });
      }
      self.raf = requestAnimationFrame(run);
    };
    run();
  };

  VirtualBackgroundController.prototype.ensureCanvasPipeline = async function () {
    var stream = this.getLocalStream();
    if (!stream) throw new Error('No local stream');
    var sourceTrack = stream.getVideoTracks()[0];
    if (!sourceTrack) throw new Error('No video track');

    this.stopPipeline();
    this.sourceVideo = document.createElement('video');
    this.sourceVideo.setAttribute('playsinline', '');
    this.sourceVideo.muted = true;
    this.sourceVideo.playsInline = true;
    this.sourceVideo.autoplay = true;
    this.sourceVideo.srcObject = new MediaStream([sourceTrack]);
    try {
      await this.sourceVideo.play();
    } catch (_e) {}
    await waitForVideo(this.sourceVideo, 1800);

    var vw = this.sourceVideo.videoWidth || 640;
    var vh = this.sourceVideo.videoHeight || 360;
    this.canvas = document.createElement('canvas');
    this.canvas.width = Math.max(320, vw);
    this.canvas.height = Math.max(180, vh);
    this.ctx = this.canvas.getContext('2d', { alpha: false });
    this.outputStream = this.canvas.captureStream(20);
    this.outputTrack = this.outputStream.getVideoTracks()[0];
    this.paintFrame();
    this.startLoop();
    this.maybeStartSegmentation();
  };

  VirtualBackgroundController.prototype.applyMode = async function (mode, imageUrl) {
    this.mode = mode || 'off';
    this.imageUrl = imageUrl || '';
    if (this.imageUrl.indexOf('/images/virtual-bg/') !== -1 && this.imageUrl.indexOf('.svg') !== -1) {
      this.imageUrl = this.imageUrl.replace(/\.svg(\?.*)?$/i, '.jpg');
    }
    this.presetId = '';
    if (/office\.(svg|jpe?g|webp|png)/i.test(this.imageUrl)) this.presetId = 'office';
    else if (/classroom\.(svg|jpe?g|webp|png)/i.test(this.imageUrl)) this.presetId = 'classroom';
    else if (/nature\.(svg|jpe?g|webp|png)/i.test(this.imageUrl)) this.presetId = 'nature';

    var stream = this.getLocalStream();
    if (!stream) return false;
    var videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return false;
    this.localVideoEl = this.resolveLocalVideo();

    if (this.mode === 'off') {
      this.stopPipeline();
      try {
        await videoTrack.applyConstraints({ advanced: [{ backgroundBlur: false }] });
      } catch (_e) {}
      await this.replaceOutgoingVideoTrack(videoTrack);
      if (this.localVideoEl) {
        this.localVideoEl.srcObject = stream;
        this.localVideoEl.style.filter = '';
      }
      return true;
    }

    if (this.mode === 'image' && this.imageUrl) {
      await this.loadBackgroundImage(this.imageUrl);
    }

    await this.ensureCanvasPipeline();
    await this.replaceOutgoingVideoTrack(this.outputTrack);
    if (this.localVideoEl && this.outputStream) {
      this.localVideoEl.srcObject = this.outputStream;
      this.localVideoEl.style.filter = '';
      try {
        await this.localVideoEl.play();
      } catch (_p) {}
    }
    return true;
  };

  VirtualBackgroundController.prototype.getActiveVideoTrack = function () {
    if (this.mode !== 'off' && this.outputTrack) return this.outputTrack;
    var stream = this.getLocalStream();
    return stream ? stream.getVideoTracks()[0] : null;
  };

  function mountSettingsUI(container, controller, options) {
    if (!container || !controller) return;
    options = options || {};
    var storageKey = options.storageKey || 'remoed_vbg_choice';
    var onStatus = typeof options.onStatus === 'function' ? options.onStatus : function () {};
    var deferRestore = !!options.deferRestore;
    container.innerHTML = '';
    container.classList.add('lc-camera-settings');
    if (!options.hideTitle) {
      var title = document.createElement('div');
      title.className = 'lc-camera-settings__title';
      title.textContent = 'Camera background';
      container.appendChild(title);
    }

    var statusEl = document.createElement('div');
    statusEl.className = 'lc-camera-settings__status';
    container.appendChild(statusEl);

    var btnRow = document.createElement('div');
    btnRow.className = 'lc-camera-settings__modes';
    container.appendChild(btnRow);

    function makeBtn(label, mode, extra) {
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'lc-camera-settings__btn';
      b.textContent = label;
      b.dataset.vbgMode = mode;
      if (extra) b.dataset.vbgExtra = extra;
      if (mode === 'image' && extra) {
        b.classList.add('lc-camera-settings__btn--photo');
        b.style.backgroundImage =
          'linear-gradient(180deg, rgba(15,23,42,0.08), rgba(15,23,42,0.62)), url("' + extra + '")';
      }
      btnRow.appendChild(b);
      return b;
    }

    makeBtn('Off', 'off');
    makeBtn('Blur', 'blur');
    PRESET_BACKGROUNDS.forEach(function (p) {
      makeBtn(p.label, 'image', p.url);
    });
    makeBtn('Custom', 'custom');

    var fileInput = document.createElement('input');
    fileInput.type = 'file';
    fileInput.accept = 'image/*';
    fileInput.style.display = 'none';
    fileInput.id = 'vb-custom-file';
    container.appendChild(fileInput);

    function markActive(mode, url) {
      btnRow.querySelectorAll('button').forEach(function (b) {
        var active =
          (mode === 'off' && b.dataset.vbgMode === 'off') ||
          (mode === 'blur' && b.dataset.vbgMode === 'blur') ||
          (mode === 'image' && b.dataset.vbgMode === 'image' && b.dataset.vbgExtra === url) ||
          (mode === 'custom' && b.dataset.vbgMode === 'custom');
        b.classList.toggle('is-active', !!active);
        b.disabled = false;
      });
    }

    function setBusy(busy) {
      btnRow.querySelectorAll('button').forEach(function (b) {
        b.disabled = !!busy;
      });
    }

    function persist(mode, url) {
      try {
        sessionStorage.setItem(storageKey, JSON.stringify({ mode: mode, url: url || '' }));
      } catch (_e) {}
    }

    function setStatus(msg) {
      statusEl.textContent = msg || '';
      if (msg) onStatus(msg);
    }

    async function apply(mode, url, opts) {
      opts = opts || {};
      var stream = controller.getLocalStream && controller.getLocalStream();
      if (!stream || !stream.getVideoTracks().length) {
        if (!opts.silent) setStatus('Turn on your camera first, then try again.');
        return false;
      }
      if (!opts.silent) {
        markActive(mode === 'custom' ? 'custom' : mode, url);
        setStatus('Applying…');
        setBusy(true);
      }
      var ok = false;
      var errMsg = '';
      try {
        if (mode === 'off') ok = !!(await controller.applyMode('off'));
        else if (mode === 'blur') ok = !!(await controller.applyMode('blur'));
        else ok = !!(await controller.applyMode('image', url));
      } catch (err) {
        ok = false;
        errMsg = err && err.message ? String(err.message) : '';
      }
      setBusy(false);
      if (ok) {
        markActive(mode === 'custom' ? 'custom' : mode, url);
        persist(mode === 'custom' ? 'custom' : mode, url || '');
        setStatus(mode === 'off' ? 'Background off' : 'Background applied');
        if (!opts.silent) {
          setTimeout(function () {
            if (/Background/.test(statusEl.textContent)) setStatus('');
          }, 1600);
        }
      } else if (!opts.silent) {
        setStatus(errMsg || 'Could not apply background. Check camera permission and try again.');
      }
      return ok;
    }

    btnRow.querySelectorAll('button[data-vbg-mode]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        var mode = b.dataset.vbgMode;
        if (mode === 'custom') {
          fileInput.click();
          return;
        }
        apply(mode, b.dataset.vbgExtra || '');
      });
    });

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      apply('custom', URL.createObjectURL(file));
    });

    async function restoreSaved() {
      try {
        var saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
        if (saved && saved.mode === 'blur') {
          await apply('blur', '', { silent: true });
        } else if (saved && saved.mode === 'image' && saved.url && String(saved.url).indexOf('blob:') !== 0) {
          await apply('image', saved.url, { silent: true });
        } else if (saved && saved.mode === 'custom' && saved.url && String(saved.url).indexOf('blob:') === 0) {
          markActive('off');
          persist('off', '');
        } else {
          markActive('off');
        }
      } catch (_e2) {
        markActive('off');
      }
    }

    container._remoedRestoreVbg = restoreSaved;
    if (!deferRestore) restoreSaved();
    else markActive('off');
  }

  global.RemoedVirtualBackground = {
    PRESET_BACKGROUNDS: PRESET_BACKGROUNDS,
    create: function (options) {
      return new VirtualBackgroundController(options);
    },
    mountSettingsUI: mountSettingsUI
  };
})(typeof window !== 'undefined' ? window : this);
