/**
 * Stacked presentation viewer: responsive iframe (bottom) + annotation canvas (top).
 * - Default: Interact (canvas pointer-events: none) so clicks/audio reach the PPT iframe.
 * - Draw toggles ON/OFF for teacher and student; strokes sync via Socket.io annotation-sync.
 * - Native PowerPoint/Office chrome handles slide navigation (no custom Prev/Next).
 */
(function (global) {
  'use strict';

  var pptOverlayState = {};

  function escapeHtml(s) {
    if (s == null) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function btnStyle(extra) {
    return (
      'padding:6px 12px;border-radius:6px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-size:0.8rem;' +
      (extra || '')
    );
  }

  function absoluteUrl(pathOrUrl) {
    if (!pathOrUrl) return '';
    if (/^https?:\/\//i.test(pathOrUrl) || pathOrUrl.startsWith('data:')) return pathOrUrl;
    var base = global.location.origin;
    return pathOrUrl.startsWith('/') ? base + pathOrUrl : base + '/' + pathOrUrl;
  }

  function resolveSourceUrl(material) {
    if (!material) return null;
    var pType = material.presentationType || 'file';
    if (pType === 'office_embed' && material.embedUrl) return material.embedUrl;
    if (material.html5EntryUrl) return absoluteUrl(material.html5EntryUrl);
    if (material.fileUrl) return absoluteUrl(material.fileUrl);
    var data = material.data || '';
    if (!data) return null;
    if (data.startsWith('data:')) return null;
    return absoluteUrl(data);
  }

  function isOfficeHosted(url) {
    return /officeapps\.live\.com|onedrive\.live\.com|sharepoint\.com/i.test(String(url || ''));
  }

  function isPptFileUrl(url) {
    return /\.(ppt|pptx)(\?|#|$)/i.test(String(url || ''));
  }

  /** Read-only Office Online embed URL (no direct .pptx download). */
  function buildSecureOfficeEmbedUrl(fileUrlOrPath) {
    var src = absoluteUrl(fileUrlOrPath);
    if (!src || src.startsWith('data:')) return null;
    if (isOfficeHosted(src)) return src;
    return 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(src);
  }

  /**
   * Build iframe src for live class. Prefer Office Online for PPTX so native chrome
   * (including bottom nav) works; HTML5 packages use same-origin URL.
   * Optional slideIndex (0-based) maps to Office wdStartOn / #slide=N.
   */
  function buildIframeSrc(material, slideIndex) {
    var src = resolveSourceUrl(material);
    if (!src) return null;
    var idx = Math.max(0, Number(slideIndex) || 0);
    if (isOfficeHosted(src)) {
      try {
        var ou = new URL(src);
        if (idx > 0) ou.searchParams.set('wdStartOn', String(idx + 1));
        else ou.searchParams.delete('wdStartOn');
        return ou.toString();
      } catch (_e) {
        return src;
      }
    }
    if (isPptFileUrl(src)) {
      // Native PPT/PPTX via Microsoft Office Online embed (absolute origin + encodeURIComponent).
      var embed = buildSecureOfficeEmbedUrl(src);
      if (!embed) return src;
      if (idx > 0) embed += (embed.indexOf('?') >= 0 ? '&' : '?') + 'wdStartOn=' + encodeURIComponent(String(idx + 1));
      return embed;
    }
    if (idx > 0) {
      var hashBase = src.split('#')[0];
      return hashBase + '#slide=' + (idx + 1);
    }
    return src;
  }

  /** Extract a 0-based slide index from Office / WOPI / custom postMessage payloads. */
  function parseSlideIndexFromMessage(data) {
    if (data == null) return null;
    var raw = data;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (_e) {
        var m = String(data).match(/(?:slide|page|index)[^\d]{0,12}(\d+)/i);
        if (!m) return null;
        var parsed = parseInt(m[1], 10);
        return parsed >= 1 ? parsed - 1 : 0;
      }
    }
    if (typeof raw !== 'object') return null;

    if (raw.source === 'remoed-presentation') {
      if (typeof raw.index === 'number') return Math.max(0, raw.index);
      if (typeof raw.currentSlideIndex === 'number') return Math.max(0, raw.currentSlideIndex);
      if (typeof raw.slide === 'number') return Math.max(0, raw.slide - 1);
    }

    function asIndex(v, oneBasedHint) {
      if (typeof v !== 'number' || !isFinite(v) || v < 0) return null;
      var n = Math.floor(v);
      if (oneBasedHint && n >= 1) return n - 1;
      return n;
    }

    var oneBased =
      raw.page != null ||
      raw.Page != null ||
      (raw.Values && (raw.Values.PageNumber != null || raw.Values.page != null)) ||
      /page|slide/i.test(String(raw.MessageId || raw.messageId || raw.event || ''));

    var bags = [raw, raw.Values, raw.data, raw.payload];
    var keys = [
      'currentSlideIndex',
      'slideIndex',
      'SlideIndex',
      'CurrentSlideIndex',
      'page',
      'Page',
      'PageNumber',
      'slide',
      'Slide',
      'index',
      'Index'
    ];
    for (var b = 0; b < bags.length; b++) {
      var bag = bags[b];
      if (!bag || typeof bag !== 'object') continue;
      for (var k = 0; k < keys.length; k++) {
        if (bag[keys[k]] == null) continue;
        var hint = oneBased || /page|slide/i.test(keys[k]);
        var idx = asIndex(Number(bag[keys[k]]), hint && Number(bag[keys[k]]) >= 1);
        if (idx != null) return idx;
      }
    }
    return null;
  }

  function getNormalizedPos(evt, canvas) {
    var rect = canvas.getBoundingClientRect();
    if (!rect.width || !rect.height) return { x: 0, y: 0 };
    return {
      x: Math.min(1, Math.max(0, (evt.clientX - rect.left) / rect.width)),
      y: Math.min(1, Math.max(0, (evt.clientY - rect.top) / rect.height))
    };
  }

  function redrawAnnotations(state) {
    var canvas = state.canvas;
    var ctx = state.ctx;
    if (!canvas || !ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    var strokes = (state.strokesBySlide && state.strokesBySlide[state.slideIndex]) || [];
    strokes.forEach(function (stroke) {
      if (!stroke || !stroke.points || stroke.points.length < 2) return;
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = (stroke.size || 4) * (state.outputScale || 1);
      ctx.strokeStyle = stroke.color || '#ff3b30';
      ctx.beginPath();
      stroke.points.forEach(function (pt, idx) {
        var x = pt.x * canvas.width;
        var y = pt.y * canvas.height;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
      ctx.restore();
    });
  }

  function setDrawMode(state, drawing) {
    state.drawing = !!drawing;
    if (state.canvas) {
      state.canvas.style.pointerEvents = state.drawing ? 'auto' : 'none';
    }
    if (state.toggleDraw) {
      state.toggleDraw.classList.toggle('active', state.drawing);
      state.toggleDraw.setAttribute('aria-pressed', state.drawing ? 'true' : 'false');
      state.toggleDraw.style.background = state.drawing ? '#dbeafe' : '#fff';
      state.toggleDraw.style.borderColor = state.drawing ? '#1ca7e7' : '#cbd5e1';
      state.toggleDraw.textContent = state.drawing ? 'Draw ✓' : 'Draw';
    }
  }

  function mountStackedPresentation(container, options) {
    options = options || {};
    var material = options.material || {};
    var materialId = material.id || material.materialId || 'ppt';
    var socket = options.socket;
    var room = options.room;
    var isTeacher = !!options.isTeacher;
    var startIndex = Math.max(0, Number(options.slideIndex) || 0);

    container.innerHTML = '';
    container.className = (container.className ? container.className + ' ' : '') + 'remoed-ppt-mount';
    container.style.cssText =
      'width:100%;max-width:100%;position:relative;border-radius:8px;overflow:hidden;background:#f5f5f5;display:flex;flex-direction:column;' +
      'flex:1 1 auto;min-height:0;max-height:100%;height:100%;';
    container.id = 'ppt-container-' + materialId;

    var toolbar = document.createElement('div');
    toolbar.className = 'remoed-ppt-toolbar';
    toolbar.style.cssText =
      'display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 10px;background:#fff;border-bottom:1px solid #e2e8f0;flex-shrink:0;z-index:3;';

    var titleSpan = document.createElement('span');
    titleSpan.style.cssText =
      'font-weight:600;font-size:0.85rem;color:#334155;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    titleSpan.textContent = material.name || 'Presentation';
    toolbar.appendChild(titleSpan);

    var toggleDraw = document.createElement('button');
    toggleDraw.type = 'button';
    toggleDraw.id = 'ppt-draw-toggle-' + materialId;
    toggleDraw.textContent = 'Draw';
    toggleDraw.title = 'Toggle drawing overlay (off = click through to presentation)';
    toggleDraw.setAttribute('aria-pressed', 'false');
    toggleDraw.style.cssText = btnStyle('margin-left:auto;');

    var colorInput = document.createElement('input');
    colorInput.type = 'color';
    colorInput.value = isTeacher ? '#ff3b30' : '#2563eb';
    colorInput.title = 'Pen color';
    colorInput.style.cssText = 'width:32px;height:32px;border:none;background:transparent;cursor:pointer;';

    var clearBtn = document.createElement('button');
    clearBtn.type = 'button';
    clearBtn.textContent = 'Clear';
    clearBtn.style.cssText = btnStyle('border-color:#fecaca;background:#fef2f2;color:#b91c1c;');

    toolbar.appendChild(toggleDraw);
    toolbar.appendChild(colorInput);
    toolbar.appendChild(clearBtn);

    if (isTeacher) {
      var flagBtn = document.createElement('button');
      flagBtn.type = 'button';
      flagBtn.className = 'action-btn flag-btn';
      flagBtn.innerHTML =
        '<svg viewBox="0 0 24 24" width="18" height="18" style="display:block;margin:0 auto" aria-hidden="true"><path fill="#666" d="M2 2h2v20H2z"/><path fill="#28a745" d="M4 2v10l10-5L4 2z"/></svg>';
      flagBtn.title = 'Flag reward';
      flagBtn.style.cssText = btnStyle('min-width:36px;padding:4px 8px;');

      var cookieBtn = document.createElement('button');
      cookieBtn.type = 'button';
      cookieBtn.className = 'action-btn cookie-btn';
      cookieBtn.textContent = '🍪';
      cookieBtn.title = 'Cookie reward';
      cookieBtn.style.cssText = btnStyle('min-width:36px;');

      var starBtn = document.createElement('button');
      starBtn.type = 'button';
      starBtn.className = 'action-btn star-btn';
      starBtn.textContent = '⭐';
      starBtn.title = 'Star reward';
      starBtn.style.cssText = btnStyle('min-width:36px;');

      toolbar.appendChild(flagBtn);
      toolbar.appendChild(cookieBtn);
      toolbar.appendChild(starBtn);
    }

    var stack = document.createElement('div');
    stack.className = 'remoed-ppt-stack';
    stack.id = 'presentation-container';
    stack.setAttribute('data-remoed-presentation-surface', '1');
    stack.style.cssText =
      'position:relative;width:100%;flex:1 1 auto;min-height:0;max-height:100%;background:#0f172a;' +
      'display:flex;align-items:center;justify-content:center;overflow:hidden;';

    var iframeWrap = document.createElement('div');
    iframeWrap.className = 'remoed-ppt-iframe-wrap';
    iframeWrap.style.cssText = 'position:absolute;inset:0;z-index:1;';

    var iframe = document.createElement('iframe');
    iframe.id = 'ppt-iframe-' + materialId;
    iframe.setAttribute('allowfullscreen', 'true');
    iframe.setAttribute('allow', 'autoplay; fullscreen');
    iframe.title = material.name || 'Presentation';
    iframe.style.cssText = 'width:100%;height:100%;border:none;background:#fff;display:block;';

    var canvas = document.createElement('canvas');
    canvas.id = 'ppt-annotation-canvas-' + materialId;
    canvas.className = 'remoed-ppt-annotation-canvas';
    canvas.style.cssText =
      'position:absolute;inset:0;z-index:2;width:100%;height:100%;max-width:100%;max-height:100%;touch-action:none;pointer-events:none;';

    iframeWrap.appendChild(iframe);
    stack.appendChild(iframeWrap);
    stack.appendChild(canvas);
    container.appendChild(toolbar);
    container.appendChild(stack);

    var ctx = canvas.getContext('2d');
    var state = {
      materialId: materialId,
      material: material,
      canvas: canvas,
      ctx: ctx,
      iframe: iframe,
      strokesBySlide: {},
      activeStroke: null,
      drawing: false,
      toggleDraw: toggleDraw,
      color: colorInput.value,
      size: 4,
      slideIndex: startIndex,
      isTeacher: isTeacher
    };
    pptOverlayState[materialId] = state;

    function resizeCanvas() {
      var rect = stack.getBoundingClientRect();
      if (!rect.width || !rect.height) return;
      var dpr = Math.min(window.devicePixelRatio || 1, 2);
      var cssW = Math.floor(rect.width);
      var cssH = Math.floor(rect.height);
      canvas.width = Math.floor(cssW * dpr);
      canvas.height = Math.floor(cssH * dpr);
      canvas.style.width = cssW + 'px';
      canvas.style.height = cssH + 'px';
      state.outputScale = dpr;
      redrawAnnotations(state);
    }
    resizeCanvas();
    global.addEventListener('resize', resizeCanvas);
    if (typeof ResizeObserver !== 'undefined') {
      try {
        var ro = new ResizeObserver(resizeCanvas);
        ro.observe(stack);
        state._resizeObserver = ro;
      } catch (_e) {}
    }

    setDrawMode(state, false);

    function emitAnnotation(payload) {
      if (!socket || !socket.connected) return;
      socket.emit(
        'annotation-sync',
        Object.assign(
          {
            room: room,
            materialId: materialId,
            page: state.slideIndex + 1,
            fromRole: isTeacher ? 'teacher' : 'student'
          },
          payload
        )
      );
    }

    function emitSlideChanged(index, slideUrl) {
      if (!socket || !socket.connected || !isTeacher) return;
      var payload = {
        room: room,
        materialId: materialId,
        currentSlideIndex: index,
        slideUrl: slideUrl || null
      };
      socket.emit('presentation-slide-changed', payload);
      socket.emit('slide-changed', payload);
    }

    function loadIframeAt(index, opts) {
      opts = opts || {};
      var i = Math.max(0, Number(index) || 0);
      state.slideIndex = i;
      var src = buildIframeSrc(material, i);
      if (!src) {
        iframeWrap.innerHTML =
          '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#94a3b8;padding:24px;text-align:center;">' +
          '<div><p style="font-weight:600;">No presentation URL</p><p>' +
          escapeHtml(material.name || '') +
          '</p></div></div>';
        return;
      }
      if (!opts.keepDraw) setDrawMode(state, false);
      // Bust Office cache so wdStartOn is honored when syncing students
      if (opts.forceReload && src.indexOf('view.officeapps.live.com') !== -1) {
        src += (src.indexOf('?') >= 0 ? '&' : '?') + '_remoedSlide=' + (i + 1) + '&_t=' + Date.now();
      }
      if (iframe.src !== src) iframe.src = src;
      else if (opts.forceReload) iframe.src = src;
      redrawAnnotations(state);
      if (opts.broadcast) emitSlideChanged(i, src);
    }

    function loadIframe() {
      loadIframeAt(state.slideIndex, { broadcast: false });
    }

    loadIframe();

    function onFrameMessage(evt) {
      if (!isTeacher || state._applyingRemoteSlide) return;
      // Ignore our own remoed broadcasts echoed back
      if (evt && evt.data && evt.data.source === 'remoed-presentation' && evt.data.fromSync) return;
      // Prefer messages that look like they came from the presentation iframe
      if (iframe.contentWindow && evt.source && evt.source !== iframe.contentWindow) {
        // Still accept Office/WOPI messages that may bubble via nested frames without matching source
        var origin = String(evt.origin || '');
        if (!/officeapps\.live\.com|office\.com|sharepoint\.com|onedrive\.live\.com|localhost|127\.0\.0\.1/i.test(origin)) {
          if (!(evt.data && evt.data.source === 'remoed-presentation')) return;
        }
      }
      var nextIdx = parseSlideIndexFromMessage(evt && evt.data);
      if (nextIdx == null || nextIdx === state.slideIndex) return;
      state.slideIndex = nextIdx;
      redrawAnnotations(state);
      emitSlideChanged(nextIdx, iframe.src || null);
    }
    global.addEventListener('message', onFrameMessage);
    state._onFrameMessage = onFrameMessage;

    // Fallback when Office iframe has focus but does not post slide events:
    // teacher can use PageUp/PageDown / [ ] while the classroom page is focused.
    function onTeacherKeyNav(e) {
      if (!isTeacher || state.drawing || state._applyingRemoteSlide) return;
      var t = e.target;
      if (t && (t.tagName === 'INPUT' || t.tagName === 'TEXTAREA' || t.isContentEditable)) return;
      var delta = 0;
      if (e.key === 'PageDown' || e.key === ']' || e.key === 'ArrowRight') delta = 1;
      else if (e.key === 'PageUp' || e.key === '[' || e.key === 'ArrowLeft') delta = -1;
      else return;
      // Only when the presentation container is in the DOM (lesson tab)
      if (!container.isConnected) return;
      e.preventDefault();
      goToSlide(Math.max(0, state.slideIndex + delta), true);
    }
    global.addEventListener('keydown', onTeacherKeyNav);
    state._onTeacherKeyNav = onTeacherKeyNav;

    toggleDraw.addEventListener('click', function () {
      setDrawMode(state, !state.drawing);
    });
    colorInput.addEventListener('input', function () {
      state.color = colorInput.value;
    });
    clearBtn.addEventListener('click', function () {
      state.strokesBySlide[state.slideIndex] = [];
      redrawAnnotations(state);
      emitAnnotation({ action: 'clear-page', page: state.slideIndex + 1 });
    });

    canvas.addEventListener('pointerdown', function (e) {
      if (!state.drawing) return;
      e.preventDefault();
      state.activeStroke = {
        tool: 'pen',
        color: state.color,
        size: state.size,
        points: [getNormalizedPos(e, canvas)],
        fromRole: isTeacher ? 'teacher' : 'student'
      };
      canvas.setPointerCapture(e.pointerId);
    });
    canvas.addEventListener('pointermove', function (e) {
      if (!state.activeStroke || !state.drawing) return;
      e.preventDefault();
      var pt = getNormalizedPos(e, canvas);
      state.activeStroke.points.push(pt);
      var pts = state.activeStroke.points;
      if (pts.length < 2) return;
      var prev = pts[pts.length - 2];
      ctx.save();
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';
      ctx.lineWidth = (state.activeStroke.size || 4) * (state.outputScale || 1);
      ctx.strokeStyle = state.activeStroke.color;
      ctx.beginPath();
      ctx.moveTo(prev.x * canvas.width, prev.y * canvas.height);
      ctx.lineTo(pt.x * canvas.width, pt.y * canvas.height);
      ctx.stroke();
      ctx.restore();
    });
    function finishStroke() {
      if (!state.activeStroke) return;
      if (!state.strokesBySlide[state.slideIndex]) state.strokesBySlide[state.slideIndex] = [];
      state.strokesBySlide[state.slideIndex].push(state.activeStroke);
      emitAnnotation({ action: 'stroke', page: state.slideIndex + 1, stroke: state.activeStroke });
      state.activeStroke = null;
      redrawAnnotations(state);
    }
    canvas.addEventListener('pointerup', finishStroke);
    canvas.addEventListener('pointercancel', function () {
      state.activeStroke = null;
    });
    canvas.addEventListener('pointerleave', finishStroke);

    function goToSlide(index, broadcast) {
      state._applyingRemoteSlide = !broadcast;
      loadIframeAt(index, { broadcast: !!broadcast, forceReload: true, keepDraw: false });
      state._applyingRemoteSlide = false;
    }
    state.goToSlide = goToSlide;

    return {
      materialId: materialId,
      goToSlide: goToSlide,
      setMode: function (mode) {
        setDrawMode(state, mode === 'draw');
      },
      handleRemoteAnnotation: function (data) {
        if (!data || (data.materialId && data.materialId !== materialId)) return;
        var pageIdx =
          typeof data.page === 'number' ? Math.max(0, data.page - 1) : state.slideIndex;
        if (!state.strokesBySlide[pageIdx]) state.strokesBySlide[pageIdx] = [];
        if (data.action === 'stroke' && data.stroke) {
          state.strokesBySlide[pageIdx].push(data.stroke);
          if (pageIdx === state.slideIndex) redrawAnnotations(state);
        } else if (data.action === 'clear-page') {
          state.strokesBySlide[pageIdx] = [];
          if (pageIdx === state.slideIndex) redrawAnnotations(state);
        } else if (data.action === 'clear-all') {
          state.strokesBySlide = {};
          redrawAnnotations(state);
        } else if (data.action === 'full-sync' && Array.isArray(data.strokes)) {
          state.strokesBySlide[pageIdx] = data.strokes.slice();
          if (pageIdx === state.slideIndex) redrawAnnotations(state);
        }
      },
      destroy: function () {
        delete pptOverlayState[materialId];
        global.removeEventListener('resize', resizeCanvas);
        if (state._onFrameMessage) global.removeEventListener('message', state._onFrameMessage);
        if (state._onTeacherKeyNav) global.removeEventListener('keydown', state._onTeacherKeyNav);
        if (state._resizeObserver) {
          try {
            state._resizeObserver.disconnect();
          } catch (_e2) {}
        }
      }
    };
  }

  function handlePresentationInteractionMode(data) {
    if (!data || !data.materialId) return;
    var state = pptOverlayState[data.materialId];
    if (!state) return;
    setDrawMode(state, data.mode === 'draw');
  }

  function handlePresentationSlideChanged(data) {
    if (!data || data.currentSlideIndex == null) return;
    var state = data.materialId ? pptOverlayState[data.materialId] : null;
    if (!state) {
      var keys = Object.keys(pptOverlayState);
      if (keys.length === 1) state = pptOverlayState[keys[0]];
    }
    if (!state || typeof state.goToSlide !== 'function') return;
    state.goToSlide(Number(data.currentSlideIndex));
  }

  global.RemoedPresentationOverlay = {
    mountStackedPresentation: mountStackedPresentation,
    handlePresentationInteractionMode: handlePresentationInteractionMode,
    handlePresentationSlideChanged: handlePresentationSlideChanged,
    buildIframeSrc: buildIframeSrc,
    buildSecureOfficeEmbedUrl: buildSecureOfficeEmbedUrl,
    absoluteUrl: absoluteUrl
  };
})(typeof window !== 'undefined' ? window : globalThis);
