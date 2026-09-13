/**
 * Client-side virtual background (blur + static image) for WebRTC.
 * Uses MediaPipe SelfieSegmentation when available.
 */
(function (global) {
  'use strict';

  var PRESET_BACKGROUNDS = [
    { id: 'office', label: 'Office', url: '/images/virtual-bg/office.svg' },
    { id: 'classroom', label: 'Classroom', url: '/images/virtual-bg/classroom.svg' },
    { id: 'nature', label: 'Nature', url: '/images/virtual-bg/nature.svg' }
  ];

  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      if (global.SelfieSegmentation) {
        resolve();
        return;
      }
      var existing = document.querySelector('script[data-remoed-vbg-lib="1"]');
      if (existing) {
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

  async function loadBlurLibs() {
    if (global.SelfieSegmentation) return;
    await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/selfie_segmentation.js');
    if (!global.SelfieSegmentation) {
      throw new Error('SelfieSegmentation not available after script load');
    }
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
    this.bgImage = null;
    this.blurModelReady = false;
    this.blurSegmentation = null;
    this.blurSourceVideo = null;
    this.blurCanvas = null;
    this.blurCtx = null;
    this.blurOutputStream = null;
    this.blurOutputTrack = null;
    this.blurAnimationFrame = null;
    this.blurProcessing = false;
    this.nativeBlurLast = false;
  }

  VirtualBackgroundController.prototype.stopPipeline = function () {
    if (this.blurAnimationFrame) {
      cancelAnimationFrame(this.blurAnimationFrame);
      this.blurAnimationFrame = null;
    }
    if (this.blurOutputTrack) {
      try {
        this.blurOutputTrack.stop();
      } catch (_e) {}
      this.blurOutputTrack = null;
    }
    if (this.blurOutputStream) {
      try {
        this.blurOutputStream.getTracks().forEach(function (t) {
          t.stop();
        });
      } catch (_e2) {}
      this.blurOutputStream = null;
    }
    if (this.blurSourceVideo) {
      try {
        this.blurSourceVideo.pause();
      } catch (_e3) {}
      this.blurSourceVideo.srcObject = null;
      this.blurSourceVideo = null;
    }
    this.blurCanvas = null;
    this.blurCtx = null;
    this.blurProcessing = false;
  };

  VirtualBackgroundController.prototype.replaceOutgoingVideoTrack = async function (nextTrack) {
    if (!nextTrack) return;
    var pc = this.getPeerConnection();
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
    return new Promise(function (resolve, reject) {
      if (!url) {
        self.bgImage = null;
        resolve(null);
        return;
      }
      var img = new Image();
      // crossOrigin breaks same-origin SVGs / static files without CORS headers
      var absolute;
      try {
        absolute = new URL(url, global.location && global.location.href).href;
      } catch (_e) {
        absolute = url;
      }
      var origin = global.location && global.location.origin;
      var isBlob = String(url).indexOf('blob:') === 0 || String(url).indexOf('data:') === 0;
      var isSameOrigin = origin && absolute.indexOf(origin) === 0;
      if (!isBlob && !isSameOrigin && /^https?:/i.test(absolute)) {
        img.crossOrigin = 'anonymous';
      }
      img.onload = function () {
        self.bgImage = img;
        resolve(img);
      };
      img.onerror = function () {
        reject(new Error('Could not load background image'));
      };
      img.src = url;
    });
  };

  VirtualBackgroundController.prototype.ensurePipeline = async function () {
    await loadBlurLibs();
    var stream = this.getLocalStream();
    if (!stream) throw new Error('No local stream');
    var sourceTrack = stream.getVideoTracks()[0];
    if (!sourceTrack) throw new Error('No video track');

    var self = this;
    if (!this.blurModelReady) {
      this.blurSegmentation = new global.SelfieSegmentation({
        locateFile: function (file) {
          return 'https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation/' + file;
        }
      });
      this.blurSegmentation.setOptions({ modelSelection: 1 });
      this.blurSegmentation.onResults(function (results) {
        if (!self.blurCtx || !self.blurCanvas || !self.blurSourceVideo) return;
        var w = self.blurCanvas.width;
        var h = self.blurCanvas.height;
        var src = results && results.image ? results.image : self.blurSourceVideo;
        self.blurCtx.save();
        self.blurCtx.clearRect(0, 0, w, h);
        self.blurCtx.drawImage(results.segmentationMask, 0, 0, w, h);
        self.blurCtx.globalCompositeOperation = 'source-in';
        self.blurCtx.filter = 'none';
        self.blurCtx.drawImage(src, 0, 0, w, h);
        self.blurCtx.globalCompositeOperation = 'destination-over';
        if (self.mode === 'image' && self.bgImage) {
          self.blurCtx.filter = 'none';
          var img = self.bgImage;
          var scale = Math.max(w / img.width, h / img.height);
          var iw = img.width * scale;
          var ih = img.height * scale;
          self.blurCtx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
        } else {
          self.blurCtx.filter = 'blur(16px)';
          self.blurCtx.drawImage(src, 0, 0, w, h);
        }
        self.blurCtx.restore();
      });
      if (typeof this.blurSegmentation.initialize === 'function') {
        try {
          await this.blurSegmentation.initialize();
        } catch (_initErr) {}
      }
      this.blurModelReady = true;
    }

    this.stopPipeline();
    this.blurSourceVideo = document.createElement('video');
    this.blurSourceVideo.muted = true;
    this.blurSourceVideo.playsInline = true;
    this.blurSourceVideo.autoplay = true;
    this.blurSourceVideo.srcObject = new MediaStream([sourceTrack]);
    await this.blurSourceVideo.play().catch(function () {});

    var vw = Math.max(320, this.blurSourceVideo.videoWidth || 640);
    var vh = Math.max(180, this.blurSourceVideo.videoHeight || 360);
    this.blurCanvas = document.createElement('canvas');
    this.blurCanvas.width = vw;
    this.blurCanvas.height = vh;
    this.blurCtx = this.blurCanvas.getContext('2d', { alpha: false });
    this.blurOutputStream = this.blurCanvas.captureStream(15);
    this.blurOutputTrack = this.blurOutputStream.getVideoTracks()[0];

    var run = async function () {
      if (self.mode === 'off' || !self.blurSegmentation || !self.blurSourceVideo) return;
      if (self.blurCtx && self.blurCanvas && self.blurSourceVideo.readyState >= 2) {
        self.blurCtx.save();
        self.blurCtx.globalCompositeOperation = 'source-over';
        self.blurCtx.filter = 'none';
        self.blurCtx.drawImage(self.blurSourceVideo, 0, 0, self.blurCanvas.width, self.blurCanvas.height);
        self.blurCtx.restore();
      }
      if (!self.blurProcessing) {
        self.blurProcessing = true;
        try {
          await self.blurSegmentation.send({ image: self.blurSourceVideo });
        } catch (_e) {}
        self.blurProcessing = false;
      }
      self.blurAnimationFrame = requestAnimationFrame(run);
    };
    run();
  };

  VirtualBackgroundController.prototype.applyMode = async function (mode, imageUrl) {
    this.mode = mode || 'off';
    if (imageUrl) this.imageUrl = imageUrl;
    var stream = this.getLocalStream();
    if (!stream) return false;
    var videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return false;

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
      try {
        await this.loadBackgroundImage(this.imageUrl);
      } catch (e) {
        console.warn('Virtual background image failed', e);
        return false;
      }
    }

    try {
      await this.ensurePipeline();
      this.nativeBlurLast = false;
      await this.replaceOutgoingVideoTrack(this.blurOutputTrack);
      if (this.localVideoEl && this.blurOutputStream) {
        this.localVideoEl.srcObject = this.blurOutputStream;
        this.localVideoEl.style.filter = '';
      }
      return true;
    } catch (e1) {
      console.warn('Virtual background pipeline failed', e1);
      if (this.mode === 'blur') {
        try {
          await videoTrack.applyConstraints({ advanced: [{ backgroundBlur: true }] });
          this.nativeBlurLast = true;
          this.stopPipeline();
          await this.replaceOutgoingVideoTrack(videoTrack);
          if (this.localVideoEl) {
            this.localVideoEl.srcObject = stream;
            this.localVideoEl.style.filter = '';
          }
          return true;
        } catch (_e2) {
          // Last-resort local preview so the control still feels responsive
          this.stopPipeline();
          if (this.localVideoEl) {
            this.localVideoEl.srcObject = stream;
            this.localVideoEl.style.filter = 'blur(6px)';
          }
          return true;
        }
      }
      // Image mode without MediaPipe: still show background in local preview canvas
      if (this.mode === 'image' && this.bgImage) {
        try {
          await this.ensureSimpleImagePreview(videoTrack, stream);
          return true;
        } catch (_e3) {}
      }
      return false;
    }
  };

  /** Fallback when MediaPipe is unavailable: composite bg + live video for local + outbound. */
  VirtualBackgroundController.prototype.ensureSimpleImagePreview = async function (videoTrack, stream) {
    this.stopPipeline();
    var self = this;
    this.blurSourceVideo = document.createElement('video');
    this.blurSourceVideo.muted = true;
    this.blurSourceVideo.playsInline = true;
    this.blurSourceVideo.autoplay = true;
    this.blurSourceVideo.srcObject = new MediaStream([videoTrack]);
    await this.blurSourceVideo.play().catch(function () {});

    var vw = Math.max(320, this.blurSourceVideo.videoWidth || 640);
    var vh = Math.max(180, this.blurSourceVideo.videoHeight || 360);
    this.blurCanvas = document.createElement('canvas');
    this.blurCanvas.width = vw;
    this.blurCanvas.height = vh;
    this.blurCtx = this.blurCanvas.getContext('2d', { alpha: false });
    this.blurOutputStream = this.blurCanvas.captureStream(15);
    this.blurOutputTrack = this.blurOutputStream.getVideoTracks()[0];

    var run = function () {
      if (self.mode !== 'image' || !self.blurCtx || !self.blurCanvas || !self.blurSourceVideo) return;
      var w = self.blurCanvas.width;
      var h = self.blurCanvas.height;
      self.blurCtx.save();
      self.blurCtx.clearRect(0, 0, w, h);
      if (self.bgImage) {
        var img = self.bgImage;
        var scale = Math.max(w / img.width, h / img.height);
        var iw = img.width * scale;
        var ih = img.height * scale;
        self.blurCtx.drawImage(img, (w - iw) / 2, (h - ih) / 2, iw, ih);
      }
      // Soft person stand-in without segmentation: center video slightly smaller
      var pad = 0.12;
      var dw = w * (1 - pad * 2);
      var dh = h * (1 - pad * 2);
      self.blurCtx.drawImage(self.blurSourceVideo, pad * w, pad * h, dw, dh);
      self.blurCtx.restore();
      self.blurAnimationFrame = requestAnimationFrame(run);
    };
    run();
    await this.replaceOutgoingVideoTrack(this.blurOutputTrack);
    if (this.localVideoEl && this.blurOutputStream) {
      this.localVideoEl.srcObject = this.blurOutputStream;
      this.localVideoEl.style.filter = '';
    }
  };

  VirtualBackgroundController.prototype.getActiveVideoTrack = function () {
    if (this.mode !== 'off' && this.blurOutputTrack) return this.blurOutputTrack;
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
    // Title lives on the modal header when used in classroom modal
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
        else if (mode === 'image' || mode === 'custom') ok = !!(await controller.applyMode('image', url));
      } catch (err) {
        ok = false;
        errMsg = err && err.message ? String(err.message) : '';
      }
      setBusy(false);
      if (ok) {
        markActive(mode === 'custom' ? 'custom' : mode, url);
        persist(mode === 'custom' ? 'custom' : mode, url || '');
        setStatus(mode === 'off' ? '' : 'Background applied');
        if (!opts.silent && mode !== 'off') {
          setTimeout(function () {
            if (statusEl.textContent === 'Background applied') setStatus('');
          }, 1600);
        }
      } else if (!opts.silent) {
        setStatus(errMsg || 'Could not apply background. Check camera permission and try again.');
      }
      return ok;
    }

    function onModeClick(mode, url) {
      if (mode === 'custom') {
        fileInput.click();
        return;
      }
      apply(mode, url || '');
    }

    btnRow.querySelectorAll('button[data-vbg-mode]').forEach(function (b) {
      b.addEventListener('click', function (e) {
        e.preventDefault();
        e.stopPropagation();
        onModeClick(b.dataset.vbgMode, b.dataset.vbgExtra || '');
      });
    });

    fileInput.addEventListener('change', function () {
      var file = fileInput.files && fileInput.files[0];
      if (!file) return;
      var objectUrl = URL.createObjectURL(file);
      apply('custom', objectUrl);
    });

    async function restoreSaved() {
      try {
        var saved = JSON.parse(sessionStorage.getItem(storageKey) || 'null');
        if (saved && saved.mode === 'blur') {
          await apply('blur', '', { silent: true });
        } else if (saved && saved.mode === 'image' && saved.url && String(saved.url).indexOf('blob:') !== 0) {
          await apply('image', saved.url, { silent: true });
        } else if (saved && saved.mode === 'custom' && saved.url && String(saved.url).indexOf('blob:') === 0) {
          // blob URLs die on reload — reset
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

    if (!deferRestore) {
      restoreSaved();
    } else {
      markActive('off');
    }
  }

  global.RemoedVirtualBackground = {
    PRESET_BACKGROUNDS: PRESET_BACKGROUNDS,
    create: function (options) {
      return new VirtualBackgroundController(options);
    },
    mountSettingsUI: mountSettingsUI
  };
})(typeof window !== 'undefined' ? window : this);
