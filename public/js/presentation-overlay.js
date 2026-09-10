/**
 * Stacked presentation viewer: slide image stack (preferred) or iframe + annotation canvas.
 * - Prefer material.slideUrls (PPTX→PNG) for reliable teacher Prev/Next + student follow.
 * - Fallback: Office/HTML5 iframe when no slide images (toolbar still drives sync).
 * - Draw toggles ON/OFF; strokes sync via Socket.io annotation-sync.
 * - Teacher Prev/Next emit presentation-slide-changed (Office iframe chrome cannot sync).
 */
(function (global) {
  'use strict';

  var pptOverlayState = {};
  /** Applied when a student receives slide sync before the overlay has mounted. */
  var pendingSlideSync = null;

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
      'padding:6px 12px;border-radius:8px;border:1px solid #cbd5e1;background:#fff;cursor:pointer;font-size:0.8rem;' +
      (extra || '')
    );
  }

  function getAuthToken() {
    try {
      if (global.RemoedUserSession && typeof global.RemoedUserSession.getUserToken === 'function') {
        var t = global.RemoedUserSession.getUserToken();
        if (t) return t;
      }
    } catch (_e) {}
    try {
      var ls = global.localStorage;
      if (!ls) return '';
      return (
        ls.getItem('remoed_teacher_token') ||
        ls.getItem('remoed_student_token') ||
        ls.getItem('remoed_user_token') ||
        ls.getItem('teacherToken') ||
        ls.getItem('token') ||
        ''
      );
    } catch (_e2) {
      return '';
    }
  }

  /** Append ?token= for auth-gated /uploads and /api media (img/iframe cannot send Bearer). */
  function withMediaAuth(url) {
    if (!url || typeof url !== 'string') return url;
    if (url.startsWith('data:') || /^blob:/i.test(url)) return url;
    if (/[?&]token=/.test(url)) return url;
    if (!/\/(uploads|api)\//i.test(url) && !/^\/uploads\//i.test(url) && !/^\/api\//i.test(url)) {
      return url;
    }
    var token = getAuthToken();
    if (!token) return url;
    return url + (url.indexOf('?') >= 0 ? '&' : '?') + 'token=' + encodeURIComponent(token);
  }

  function resolveSlideImageUrls(material) {
    if (!material) return [];
    var raw = material.slideUrls;
    if (!Array.isArray(raw) || !raw.length) return [];
    var out = [];
    for (var i = 0; i < raw.length; i++) {
      var u = raw[i];
      if (!u) continue;
      out.push(withMediaAuth(absoluteUrl(String(u))));
    }
    return out;
  }

  function createRewardsMenu() {
    var wrap = document.createElement('div');
    wrap.className = 'lc-rewards-menu';

    var toggle = document.createElement('button');
    toggle.type = 'button';
    toggle.className = 'lc-rewards-toggle';
    toggle.textContent = 'Rewards';
    toggle.title = 'Send a reward animation';
    toggle.setAttribute('aria-expanded', 'false');
    toggle.style.cssText = btnStyle('font-weight:700;');

    var dropdown = document.createElement('div');
    dropdown.className = 'lc-rewards-dropdown';
    dropdown.hidden = true;

    function makeReward(cls, label, title, html) {
      var btn = document.createElement('button');
      btn.type = 'button';
      btn.className = 'action-btn ' + cls;
      btn.title = title;
      btn.setAttribute('aria-label', title);
      if (html) btn.innerHTML = html;
      else btn.textContent = label;
      btn.style.cssText = btnStyle('min-width:36px;width:100%;justify-content:flex-start;');
      dropdown.appendChild(btn);
      return btn;
    }

    makeReward(
      'flag-btn',
      '',
      'Flag reward',
      '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path fill="#666" d="M2 2h2v20H2z"/><path fill="#28a745" d="M4 2v10l10-5L4 2z"/></svg><span style="margin-left:8px">Flag</span>'
    );
    makeReward('cookie-btn', '🍪 Cookie', 'Cookie reward');
    makeReward('star-btn', '⭐ Star', 'Star reward');

    toggle.addEventListener('click', function (e) {
      e.stopPropagation();
      var open = dropdown.hidden;
      dropdown.hidden = !open;
      toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
      wrap.classList.toggle('is-open', open);
    });
    document.addEventListener('click', function () {
      dropdown.hidden = true;
      wrap.classList.remove('is-open');
      toggle.setAttribute('aria-expanded', 'false');
    });

    wrap.appendChild(toggle);
    wrap.appendChild(dropdown);
    return wrap;
  }

  function absoluteUrl(pathOrUrl) {
    if (!pathOrUrl) return '';
    if (/^https?:\/\//i.test(pathOrUrl) || pathOrUrl.startsWith('data:')) return pathOrUrl;
    var base = global.location.origin;
    return pathOrUrl.startsWith('/') ? base + pathOrUrl : base + '/' + pathOrUrl;
  }

  /** Office Online can only fetch publicly reachable HTTPS URLs (not localhost). */
  function officeOnlineCanFetchUrl(src) {
    try {
      var u = new URL(absoluteUrl(src));
      if (u.protocol !== 'https:') return false;
      if (/localhost|127\.0\.0\.1|\.local$|^10\.|^192\.168\.|^172\.(1[6-9]|2\d|3[0-1])\./i.test(u.hostname)) {
        return false;
      }
      return true;
    } catch (_e) {
      return false;
    }
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
    if (!officeOnlineCanFetchUrl(src)) return null;
    return 'https://view.officeapps.live.com/op/embed.aspx?src=' + encodeURIComponent(src);
  }

  /**
   * Build iframe src for live class. Prefer Office Online for public HTTPS PPTX;
   * skip Office Online on localhost (returns null so caller can use PDF preview).
   */
  function buildIframeSrc(material, slideIndex) {
    var src = resolveSourceUrl(material);
    if (!src) return null;
    var idx = Math.max(0, Number(slideIndex) || 0);
    if (isOfficeHosted(src)) {
      try {
        var ou = new URL(src);
        ou.searchParams.set('wdStartOn', String(idx + 1));
        ou.searchParams.set('wdSlideIndex', String(idx + 1));
        return ou.toString();
      } catch (_e) {
        return src;
      }
    }
    if (isPptFileUrl(src)) {
      var embed = buildSecureOfficeEmbedUrl(src);
      if (!embed) return null;
      embed += (embed.indexOf('?') >= 0 ? '&' : '?') + 'wdStartOn=' + encodeURIComponent(String(idx + 1));
      embed += '&wdSlideIndex=' + encodeURIComponent(String(idx + 1));
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
      state.toggleDraw.style.background = state.drawing ? '#dcfce7' : '#fff';
      state.toggleDraw.style.borderColor = state.drawing ? '#47BC3E' : '#cbd5e1';
      state.toggleDraw.textContent = state.drawing ? 'Draw ✓' : 'Draw';
    }
  }

  function resolveTotalSlides(material, options) {
    options = options || {};
    material = material || {};
    var candidates = [
      options.totalSlides,
      options.slideCount,
      options.pageCount,
      material.totalSlides,
      material.slideCount,
      material.pageCount,
      material.numPages,
      material.pages
    ];
    for (var i = 0; i < candidates.length; i++) {
      var n = Number(candidates[i]);
      if (Number.isFinite(n) && n >= 1) return Math.floor(n);
    }
    return null;
  }

  function parseSlideCountFromMessage(data) {
    if (data == null) return null;
    var raw = data;
    if (typeof raw === 'string') {
      try {
        raw = JSON.parse(raw);
      } catch (_e) {
        return null;
      }
    }
    if (typeof raw !== 'object') return null;
    var bags = [raw, raw.Values, raw.data, raw.payload];
    var keys = [
      'totalSlides',
      'slideCount',
      'SlideCount',
      'pageCount',
      'PageCount',
      'numPages',
      'NumPages',
      'TotalSlides'
    ];
    for (var b = 0; b < bags.length; b++) {
      var bag = bags[b];
      if (!bag || typeof bag !== 'object') continue;
      for (var k = 0; k < keys.length; k++) {
        if (bag[keys[k]] == null) continue;
        var n = Number(bag[keys[k]]);
        if (Number.isFinite(n) && n >= 1) return Math.floor(n);
      }
    }
    return null;
  }

  function mountStackedPresentation(container, options) {
    options = options || {};
    var material = options.material || {};
    var materialId = material.id || material.materialId || 'ppt';
    var socket = options.socket;
    var room = options.room;
    var isTeacher = !!options.isTeacher;
    var startIndex = Math.max(0, Number(options.slideIndex) || 0);
    var slideImageUrls = resolveSlideImageUrls(material);
    var useImageStack =
      slideImageUrls.length > 0 ||
      material.presentationType === 'slide_stack' ||
      options.renderMode === 'images';
    var knownTotalSlides = resolveTotalSlides(material, options);
    // Image stack length is authoritative — never allow nav past real PNGs
    // (upload slideCount from PPTX XML can exceed rendered images).
    if (slideImageUrls.length > 0) {
      knownTotalSlides = slideImageUrls.length;
      useImageStack = true;
    }

    container.innerHTML = '';
    container.className = (container.className ? container.className + ' ' : '') + 'remoed-ppt-mount';
    container.style.cssText =
      'width:100%;max-width:100%;position:relative;border-radius:8px;overflow:hidden;background:#f5f5f5;display:flex;flex-direction:column;' +
      'flex:1 1 auto;min-height:0;max-height:100%;height:100%;';
    container.id = 'ppt-container-' + materialId;
    container.setAttribute('data-remoed-render-mode', useImageStack ? 'images' : 'iframe');

    var toolbar = document.createElement('div');
    toolbar.className = 'remoed-ppt-toolbar';
    toolbar.style.cssText =
      'display:flex;flex-wrap:wrap;align-items:center;gap:8px;padding:6px 10px;background:#fff;border-bottom:1px solid #e2e8f0;flex-shrink:0;z-index:3;';

    var titleSpan = document.createElement('span');
    titleSpan.style.cssText =
      'font-weight:600;font-size:0.85rem;color:#334155;max-width:220px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;';
    titleSpan.textContent = material.name || 'Presentation';
    toolbar.appendChild(titleSpan);

    if (!isTeacher) {
      var followBadge = document.createElement('span');
      followBadge.className = 'remoed-ppt-follow-badge';
      followBadge.textContent = 'Following teacher';
      followBadge.title = 'Slides sync automatically with the teacher';
      followBadge.style.cssText =
        'font-size:0.72rem;font-weight:700;color:#166534;background:#dcfce7;border:1px solid #86efac;border-radius:999px;padding:3px 10px;';
      toolbar.appendChild(followBadge);
    }

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

    var prevSlideBtn = null;
    var nextSlideBtn = null;
    var slideLabel = null;
    // Teacher drives navigation; students follow via socket (label only for status).
    var navGroup = document.createElement('div');
    navGroup.className = 'remoed-ppt-nav';
    navGroup.style.cssText = 'display:inline-flex;align-items:center;gap:4px;';

    if (isTeacher) {
      prevSlideBtn = document.createElement('button');
      prevSlideBtn.type = 'button';
      prevSlideBtn.textContent = '◀';
      prevSlideBtn.title = 'Previous slide (syncs students)';
      prevSlideBtn.setAttribute('aria-label', 'Previous slide');
      prevSlideBtn.style.cssText = btnStyle(
        'min-width:36px;font-weight:700;background:#47BC3E;color:#fff;border-color:#2E9A28;'
      );

      nextSlideBtn = document.createElement('button');
      nextSlideBtn.type = 'button';
      nextSlideBtn.textContent = '▶';
      nextSlideBtn.title = 'Next slide (syncs students)';
      nextSlideBtn.setAttribute('aria-label', 'Next slide');
      nextSlideBtn.style.cssText = btnStyle(
        'min-width:36px;font-weight:700;background:#47BC3E;color:#fff;border-color:#2E9A28;'
      );
    }

    slideLabel = document.createElement('span');
    slideLabel.className = 'remoed-ppt-slide-label';
    slideLabel.style.cssText =
      'font-size:0.8rem;font-weight:700;color:#0f172a;min-width:64px;text-align:center;padding:4px 8px;background:#f1f5f9;border-radius:8px;';

    if (prevSlideBtn) navGroup.appendChild(prevSlideBtn);
    navGroup.appendChild(slideLabel);
    if (nextSlideBtn) navGroup.appendChild(nextSlideBtn);
    toolbar.appendChild(navGroup);

    toolbar.appendChild(toggleDraw);
    toolbar.appendChild(colorInput);
    toolbar.appendChild(clearBtn);

    if (isTeacher) {
      toolbar.appendChild(createRewardsMenu());
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
    iframeWrap.style.cssText = 'position:absolute;inset:0;z-index:1;display:flex;align-items:center;justify-content:center;';

    var iframe = null;
    var slideImg = null;
    if (useImageStack) {
      slideImg = document.createElement('img');
      slideImg.id = 'ppt-slide-img-' + materialId;
      slideImg.className = 'remoed-ppt-slide-img';
      slideImg.alt = material.name || 'Slide';
      slideImg.decoding = 'async';
      slideImg.style.cssText =
        'max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;background:#fff;user-select:none;-webkit-user-drag:none;';
      iframeWrap.appendChild(slideImg);
    } else {
      iframe = document.createElement('iframe');
      iframe.id = 'ppt-iframe-' + materialId;
      iframe.setAttribute('allowfullscreen', 'true');
      iframe.setAttribute('allow', 'autoplay; fullscreen');
      iframe.title = material.name || 'Presentation';
      iframe.style.cssText = 'width:100%;height:100%;border:none;background:#fff;display:block;';
      iframeWrap.appendChild(iframe);
    }

    var canvas = document.createElement('canvas');
    canvas.id = 'ppt-annotation-canvas-' + materialId;
    canvas.className = 'remoed-ppt-annotation-canvas';
    canvas.style.cssText =
      'position:absolute;inset:0;z-index:2;width:100%;height:100%;max-width:100%;max-height:100%;touch-action:none;pointer-events:none;';

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
      slideImg: slideImg,
      slideImageUrls: slideImageUrls,
      renderMode: useImageStack ? 'images' : 'iframe',
      strokesBySlide: {},
      activeStroke: null,
      drawing: false,
      toggleDraw: toggleDraw,
      color: colorInput.value,
      size: 4,
      slideIndex: startIndex,
      totalSlides: knownTotalSlides,
      isTeacher: isTeacher
    };
    pptOverlayState[materialId] = state;

    function getMaxIndex() {
      // Prefer concrete asset count over metadata that may be stale/inflated.
      if (state.renderMode === 'images' && state.slideImageUrls && state.slideImageUrls.length) {
        return state.slideImageUrls.length - 1;
      }
      var total = Number(state.totalSlides);
      if (Number.isFinite(total) && total >= 1) return Math.floor(total) - 1;
      return null;
    }

    function clampSlideIndex(index) {
      var i = Math.max(0, Math.floor(Number(index) || 0));
      var maxIdx = getMaxIndex();
      if (maxIdx != null) i = Math.min(i, maxIdx);
      return i;
    }

    function setTotalSlides(total) {
      var n = Number(total);
      if (!Number.isFinite(n) || n < 1) return;
      n = Math.floor(n);
      // Never inflate past the real image stack.
      if (state.renderMode === 'images' && state.slideImageUrls && state.slideImageUrls.length) {
        n = Math.min(n, state.slideImageUrls.length);
      }
      if (state.totalSlides === n) {
        state.slideIndex = clampSlideIndex(state.slideIndex);
        updateSlideLabel();
        return;
      }
      state.totalSlides = n;
      state.slideIndex = clampSlideIndex(state.slideIndex);
      updateSlideLabel();
    }

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

    function updateSlideLabel() {
      state.slideIndex = clampSlideIndex(state.slideIndex);
      var current = state.slideIndex + 1;
      var total = state.totalSlides;
      if (
        state.renderMode === 'images' &&
        state.slideImageUrls &&
        state.slideImageUrls.length &&
        (total == null || total !== state.slideImageUrls.length)
      ) {
        total = state.slideImageUrls.length;
        state.totalSlides = total;
      }
      if (slideLabel) {
        slideLabel.textContent =
          Number.isFinite(total) && total >= 1 ? current + ' / ' + total : 'Slide ' + current;
      }
      if (prevSlideBtn) prevSlideBtn.disabled = state.slideIndex <= 0;
      if (nextSlideBtn) {
        var maxIdx = getMaxIndex();
        var atEnd = maxIdx != null && state.slideIndex >= maxIdx;
        if (maxIdx == null && state._lockedAtEnd) atEnd = true;
        nextSlideBtn.disabled = atEnd;
        nextSlideBtn.title = atEnd ? 'Last slide' : 'Next slide (syncs students)';
      }
      var headerInfo = document.getElementById('pdf-page-info');
      if (headerInfo) {
        headerInfo.textContent =
          Number.isFinite(total) && total >= 1 ? current + ' / ' + total : 'Slide ' + current;
      }
      var customInfo = document.getElementById('pdf-page-info-custom');
      if (customInfo && !(window.pdfViewerState && window.pdfViewerState.pdfDoc)) {
        customInfo.textContent =
          Number.isFinite(total) && total >= 1 ? current + '/' + total : String(current);
      }
    }

    function currentSlideUrl() {
      if (state.renderMode === 'images' && state.slideImageUrls && state.slideImageUrls.length) {
        return state.slideImageUrls[state.slideIndex] || null;
      }
      if (iframe && iframe.src) return iframe.src;
      return null;
    }

    function emitSlideChanged(index, slideUrl) {
      if (!socket || !socket.connected || !isTeacher) return;
      var payload = {
        room: room,
        materialId: materialId,
        currentSlideIndex: index,
        slideIndex: index,
        page: index + 1,
        totalSlides: state.totalSlides,
        slideUrl: slideUrl || currentSlideUrl() || null,
        renderMode: state.renderMode
      };
      socket.emit('presentation-slide-changed', payload);
      socket.emit('slide-changed', payload);
      socket.emit('presenter-sync-update', {
        room: room,
        materialId: materialId,
        page: index + 1,
        slideIndex: index,
        totalSlides: state.totalSlides
      });
    }

    function prefetchAdjacentSlides(index) {
      if (state.renderMode !== 'images' || !state.slideImageUrls) return;
      [index - 1, index + 1].forEach(function (i) {
        if (i < 0 || i >= state.slideImageUrls.length) return;
        var src = state.slideImageUrls[i];
        if (!src) return;
        var img = new Image();
        img.decoding = 'async';
        img.src = src;
      });
    }

    function showUnavailableMessage(detailHtml) {
      iframeWrap.innerHTML =
        '<div style="display:flex;align-items:center;justify-content:center;height:100%;color:#334155;padding:24px;text-align:center;font-family:Segoe UI,sans-serif;">' +
        '<div style="max-width:420px;">' +
        '<p style="font-weight:700;font-size:1.05rem;margin:0 0 8px;">Presentation preview unavailable</p>' +
        (detailHtml || '') +
        '<p style="margin:8px 0 0;color:#94a3b8;font-size:0.9rem;">' +
        escapeHtml(material.name || '') +
        '</p></div></div>';
    }

    function loadIframeAt(index, opts) {
      opts = opts || {};
      var i = clampSlideIndex(index);
      state.slideIndex = i;

      if (state.renderMode === 'images') {
        if (!state.slideImageUrls || !state.slideImageUrls.length) {
          showUnavailableMessage(
            '<p style="margin:0 0 8px;color:#64748b;line-height:1.5;">No converted slide images are available for this lesson yet.</p>'
          );
          return;
        }
        var imgSrc = state.slideImageUrls[i];
        if (!imgSrc) {
          showUnavailableMessage(
            '<p style="margin:0 0 8px;color:#64748b;line-height:1.5;">Slide ' +
              (i + 1) +
              ' is missing from the converted image stack.</p>'
          );
          return;
        }
        if (!opts.keepDraw) setDrawMode(state, false);
        if (!slideImg || !slideImg.isConnected) {
          iframeWrap.innerHTML = '';
          slideImg = document.createElement('img');
          slideImg.id = 'ppt-slide-img-' + materialId;
          slideImg.className = 'remoed-ppt-slide-img';
          slideImg.alt = material.name || 'Slide';
          slideImg.decoding = 'async';
          slideImg.style.cssText =
            'max-width:100%;max-height:100%;width:auto;height:auto;object-fit:contain;display:block;background:#fff;user-select:none;-webkit-user-drag:none;';
          iframeWrap.appendChild(slideImg);
          state.slideImg = slideImg;
        }
        if (slideImg.src !== imgSrc) {
          slideImg.src = imgSrc;
        }
        slideImg.alt = (material.name || 'Slide') + ' — ' + (i + 1);
        prefetchAdjacentSlides(i);
        updateSlideLabel();
        redrawAnnotations(state);
        if (opts.broadcast) emitSlideChanged(i, imgSrc);
        return;
      }

      var src = buildIframeSrc(material, i);
      if (!src) {
        showUnavailableMessage(
          '<p style="margin:0 0 8px;color:#64748b;line-height:1.5;">Microsoft Office Online cannot open PowerPoint files from localhost. RemoEd will convert this lesson to PDF for class.</p>'
        );
        return;
      }
      if (!opts.keepDraw) setDrawMode(state, false);
      // Bust Office cache so wdStartOn is honored when syncing students
      if (opts.forceReload && src.indexOf('view.officeapps.live.com') !== -1) {
        src += (src.indexOf('?') >= 0 ? '&' : '?') + '_remoedSlide=' + (i + 1) + '&_t=' + Date.now();
      }
      if (!iframe || !iframe.isConnected) {
        iframeWrap.innerHTML = '';
        iframe = document.createElement('iframe');
        iframe.id = 'ppt-iframe-' + materialId;
        iframe.setAttribute('allowfullscreen', 'true');
        iframe.setAttribute('allow', 'autoplay; fullscreen');
        iframe.title = material.name || 'Presentation';
        iframe.style.cssText = 'width:100%;height:100%;border:none;background:#fff;display:block;';
        iframeWrap.appendChild(iframe);
        state.iframe = iframe;
      }
      iframe.src = withMediaAuth(src);
      updateSlideLabel();
      redrawAnnotations(state);
      if (opts.broadcast) emitSlideChanged(i, src);
    }

    function loadIframe() {
      loadIframeAt(state.slideIndex, { broadcast: false });
    }

    loadIframe();

    function onFrameMessage(evt) {
      // Image stack does not use Office postMessage; ignore frame events in that mode.
      if (state.renderMode === 'images') return;
      if (!isTeacher || state._applyingRemoteSlide) return;
      // Ignore our own remoed broadcasts echoed back
      if (evt && evt.data && evt.data.source === 'remoed-presentation' && evt.data.fromSync) return;
      // Prefer messages that look like they came from the presentation iframe
      if (iframe && iframe.contentWindow && evt.source && evt.source !== iframe.contentWindow) {
        // Still accept Office/WOPI messages that may bubble via nested frames without matching source
        var origin = String(evt.origin || '');
        if (!/officeapps\.live\.com|office\.com|sharepoint\.com|onedrive\.live\.com|localhost|127\.0\.0\.1/i.test(origin)) {
          if (!(evt.data && evt.data.source === 'remoed-presentation')) return;
        }
      }
      var reportedTotal = parseSlideCountFromMessage(evt && evt.data);
      if (reportedTotal != null) setTotalSlides(reportedTotal);

      var nextIdx = parseSlideIndexFromMessage(evt && evt.data);
      if (nextIdx == null || nextIdx === state.slideIndex) return;

      // Office often wraps past the last slide back to 0 — lock the real total and stop looping.
      if (
        isTeacher &&
        state._expectingPossibleWrap &&
        nextIdx === 0 &&
        state.slideIndex > 0
      ) {
        state._expectingPossibleWrap = false;
        // state.slideIndex is already the invalid/beyond index → true count is that index (1-based)
        setTotalSlides(Math.max(1, state.slideIndex));
        state._lockedAtEnd = true;
        state.slideIndex = clampSlideIndex(state.slideIndex - 1);
        loadIframeAt(state.slideIndex, { broadcast: true, forceReload: true, keepDraw: false });
        return;
      }
      state._expectingPossibleWrap = false;
      state._lockedAtEnd = false;

      nextIdx = clampSlideIndex(nextIdx);
      if (nextIdx === state.slideIndex) {
        updateSlideLabel();
        return;
      }
      state.slideIndex = nextIdx;
      updateSlideLabel();
      redrawAnnotations(state);
      emitSlideChanged(nextIdx, iframe && iframe.src ? iframe.src : null);
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
      stepSlide(delta);
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
      var i = clampSlideIndex(index);
      if (!broadcast && i === state.slideIndex) {
        updateSlideLabel();
        redrawAnnotations(state);
        return;
      }
      if (broadcast && i === state.slideIndex) {
        updateSlideLabel();
        // Re-broadcast so late-joining students catch the current slide
        if (broadcast) emitSlideChanged(i, currentSlideUrl());
        return;
      }
      state._applyingRemoteSlide = !broadcast;
      // Image stack swaps instantly; Office iframe needs forceReload so wdStartOn applies.
      var forceReload = state.renderMode !== 'images';
      loadIframeAt(i, { broadcast: !!broadcast, forceReload: forceReload, keepDraw: false });
      state._applyingRemoteSlide = false;
    }
    state.goToSlide = goToSlide;
    state.setTotalSlides = setTotalSlides;

    function stepSlide(delta) {
      var maxIdx = getMaxIndex();
      var deltaN = Number(delta) || 0;
      if (!deltaN) {
        updateSlideLabel();
        return;
      }
      // Hard stop at bounds — never walk past the last presented slide.
      if (maxIdx == null) {
        // Unknown total (Office iframe): only allow a single speculative step forward;
        // wrap detection locks totalSlides. Still never go below 0.
        if (deltaN < 0 && state.slideIndex <= 0) {
          updateSlideLabel();
          return;
        }
        if (deltaN > 0 && state._lockedAtEnd) {
          updateSlideLabel();
          return;
        }
      } else {
        var next = state.slideIndex + deltaN;
        if (next < 0 || next > maxIdx) {
          state.slideIndex = clampSlideIndex(state.slideIndex);
          updateSlideLabel();
          return;
        }
      }
      var nextIdx = clampSlideIndex(state.slideIndex + deltaN);
      if (nextIdx === state.slideIndex) {
        updateSlideLabel();
        return;
      }
      if (deltaN < 0) state._lockedAtEnd = false;
      // If total is unknown (Office iframe), next wrap message may mean we passed the end
      if (state.renderMode !== 'images' && maxIdx == null && deltaN > 0) {
        state._expectingPossibleWrap = true;
      } else {
        state._expectingPossibleWrap = false;
      }
      goToSlide(nextIdx, true);
    }
    state.stepSlide = stepSlide;

    if (prevSlideBtn) {
      prevSlideBtn.addEventListener('click', function () {
        stepSlide(-1);
      });
    }
    if (nextSlideBtn) {
      nextSlideBtn.addEventListener('click', function () {
        stepSlide(1);
      });
    }
    updateSlideLabel();

    // Prefer PDF preview page count when available (authoritative for PPT→PDF lessons).
    (function discoverTotalFromPreviewPdf() {
      if (state.totalSlides != null) return;
      if (state.renderMode === 'images' && state.slideImageUrls.length) {
        setTotalSlides(state.slideImageUrls.length);
        return;
      }
      var preview =
        material.previewPdfPath ||
        material.convertedPdfUrl ||
        material.previewPdfUrl ||
        (material.presentationType === 'pdf_preview' ? material.data : null);
      if (!preview || typeof global.pdfjsLib === 'undefined') return;
      var url = withMediaAuth(absoluteUrl(String(preview).split('?')[0]));
      if (!url) return;
      try {
        global.pdfjsLib
          .getDocument({ url: url, withCredentials: true })
          .promise.then(function (pdf) {
            if (pdf && pdf.numPages) setTotalSlides(pdf.numPages);
          })
          .catch(function () {});
      } catch (_e) {}
    })();

    // Apply slide sync that arrived before this overlay finished mounting (late student join).
    if (
      pendingSlideSync &&
      (!pendingSlideSync.materialId || String(pendingSlideSync.materialId) === String(materialId))
    ) {
      var pending = pendingSlideSync;
      pendingSlideSync = null;
      var pendingIdx = pending.currentSlideIndex;
      if (pendingIdx == null && pending.slideIndex != null) pendingIdx = pending.slideIndex;
      if (pendingIdx == null && pending.page != null) pendingIdx = Number(pending.page) - 1;
      if (pending.totalSlides != null) setTotalSlides(pending.totalSlides);
      if (pendingIdx != null && isFinite(Number(pendingIdx))) {
        goToSlide(Number(pendingIdx), false);
      }
    } else if (isTeacher && socket && socket.connected) {
      // Announce starting slide so students who already have the material stay aligned.
      emitSlideChanged(state.slideIndex, currentSlideUrl());
    }

    return {
      materialId: materialId,
      renderMode: state.renderMode,
      goToSlide: goToSlide,
      stepSlide: stepSlide,
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
    if (!data) return;
    var idx = data.currentSlideIndex;
    if (idx == null && data.slideIndex != null) idx = data.slideIndex;
    if (idx == null && data.page != null) idx = Number(data.page) - 1;
    if (idx == null || !isFinite(Number(idx))) return;

    var state = data.materialId ? pptOverlayState[data.materialId] : null;
    if (!state) {
      var keys = Object.keys(pptOverlayState);
      if (keys.length === 1) state = pptOverlayState[keys[0]];
    }
    if (!state || typeof state.goToSlide !== 'function') {
      pendingSlideSync = data;
      return;
    }
    if (state.isTeacher) return;
    if (data.totalSlides != null && typeof state.setTotalSlides === 'function') {
      state.setTotalSlides(data.totalSlides);
    }
    // Prefer explicit slideUrl when following an image stack (avoids index/url mismatch).
    if (
      state.renderMode === 'images' &&
      data.slideUrl &&
      state.slideImageUrls &&
      state.slideImageUrls.length
    ) {
      var want = String(data.slideUrl).split('?')[0];
      for (var si = 0; si < state.slideImageUrls.length; si++) {
        if (String(state.slideImageUrls[si]).split('?')[0] === want) {
          idx = si;
          break;
        }
      }
    }
    state.goToSlide(Number(idx), false);
  }

  global.RemoedPresentationOverlay = {
    mountStackedPresentation: mountStackedPresentation,
    handlePresentationInteractionMode: handlePresentationInteractionMode,
    handlePresentationSlideChanged: handlePresentationSlideChanged,
    buildIframeSrc: buildIframeSrc,
    buildSecureOfficeEmbedUrl: buildSecureOfficeEmbedUrl,
    absoluteUrl: absoluteUrl,
    resolveSlideImageUrls: resolveSlideImageUrls
  };
})(typeof window !== 'undefined' ? window : globalThis);
