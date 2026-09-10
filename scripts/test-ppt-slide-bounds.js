/**
 * Regression: teacher Prev/Next must never leave the valid slide range.
 * Runs with a minimal DOM stub (no jsdom dependency).
 */
'use strict';

const fs = require('fs');
const path = require('path');
const vm = require('vm');

function createDomStub() {
  const listeners = new Map();

  class Element {
    constructor(tag) {
      this.tagName = String(tag || '').toUpperCase();
      this.children = [];
      this.style = {};
      this.attributes = {};
      this.className = '';
      this.id = '';
      this.hidden = false;
      this.disabled = false;
      this.textContent = '';
      this.innerHTML = '';
      this.title = '';
      this.value = '';
      this.type = '';
      this.src = '';
      this.alt = '';
      this.decoding = '';
      this.width = 800;
      this.height = 600;
      this.parentNode = null;
      this.isConnected = true;
      this._listeners = {};
      this.classList = {
        toggle() {},
        add() {},
        remove() {},
        contains() {
          return false;
        }
      };
    }
    setAttribute(k, v) {
      this.attributes[k] = String(v);
      if (k === 'id') this.id = String(v);
    }
    getAttribute(k) {
      return this.attributes[k] != null ? this.attributes[k] : null;
    }
    appendChild(child) {
      child.parentNode = this;
      this.children.push(child);
      return child;
    }
    addEventListener(type, fn) {
      if (!this._listeners[type]) this._listeners[type] = [];
      this._listeners[type].push(fn);
    }
    removeEventListener() {}
    click() {
      const fns = this._listeners.click || [];
      fns.forEach((fn) => fn({ preventDefault() {}, stopPropagation() {}, target: this }));
    }
    getBoundingClientRect() {
      return { width: 800, height: 600, left: 0, top: 0, right: 800, bottom: 600 };
    }
    getContext() {
      return {
        clearRect() {},
        save() {},
        restore() {},
        beginPath() {},
        moveTo() {},
        lineTo() {},
        stroke() {},
        lineCap: '',
        lineJoin: '',
        lineWidth: 1,
        strokeStyle: ''
      };
    }
    setPointerCapture() {}
  }

  const document = {
    body: new Element('body'),
    createElement(tag) {
      return new Element(tag);
    },
    getElementById() {
      return null;
    },
    addEventListener(type, fn) {
      if (!listeners.has(type)) listeners.set(type, []);
      listeners.get(type).push(fn);
    },
    removeEventListener() {},
    querySelectorAll() {
      return [];
    }
  };

  const window = {
    document,
    location: { origin: 'http://localhost:3000' },
    devicePixelRatio: 1,
    localStorage: {
      getItem() {
        return null;
      }
    },
    addEventListener(type, fn) {
      document.addEventListener(type, fn);
    },
    removeEventListener() {},
    Image: function Image() {
      this.src = '';
      this.decoding = '';
    }
  };
  window.window = window;
  window.globalThis = window;

  return { window, document, Element };
}

function findNavButtons(root) {
  const buttons = [];
  function walk(el) {
    if (!el) return;
    if (el.tagName === 'BUTTON') buttons.push(el);
    (el.children || []).forEach(walk);
  }
  walk(root);
  const prev = buttons.find((b) => b.textContent === '◀');
  const next = buttons.find((b) => b.textContent === '▶');
  const label = (function findLabel(el) {
    if (!el) return null;
    if (el.className === 'remoed-ppt-slide-label') return el;
    for (const c of el.children || []) {
      const hit = findLabel(c);
      if (hit) return hit;
    }
    return null;
  })(root);
  return { prev, next, label };
}

function assert(cond, msg) {
  if (!cond) throw new Error(msg);
}

function runCase(name, material, options, clicks) {
  const { window, document } = createDomStub();
  const code = fs.readFileSync(path.join(__dirname, '../public/js/presentation-overlay.js'), 'utf8');
  vm.runInNewContext(code, window);

  const container = document.createElement('div');
  document.body.appendChild(container);

  const api = window.RemoedPresentationOverlay.mountStackedPresentation(container, Object.assign(
    {
      material,
      isTeacher: true,
      socket: { connected: false, emit() {} },
      room: 'test-room'
    },
    options || {}
  ));

  const { prev, next, label } = findNavButtons(container);
  assert(prev && next && label, name + ': missing nav controls');

  const results = {
    name,
    startLabel: label.textContent,
    after: []
  };

  clicks.forEach((dir) => {
    if (dir === 'next') next.click();
    else prev.click();
    results.after.push({
      dir,
      label: label.textContent,
      index: api.goToSlide ? undefined : undefined,
      disabledNext: next.disabled,
      disabledPrev: prev.disabled
    });
  });

  // Probe internal index via step no-ops and label parse
  const m = String(label.textContent).match(/(\d+)\s*\/\s*(\d+)/);
  assert(m, name + ': expected "N / total" label, got ' + label.textContent);
  const current = Number(m[1]);
  const total = Number(m[2]);
  assert(current >= 1 && current <= total, name + ': current out of range: ' + label.textContent);
  assert(next.disabled === (current >= total), name + ': next disabled mismatch at ' + label.textContent);
  assert(prev.disabled === (current <= 1), name + ': prev disabled mismatch at ' + label.textContent);

  // Spam next beyond end
  for (let i = 0; i < 20; i++) next.click();
  const end = String(label.textContent).match(/(\d+)\s*\/\s*(\d+)/);
  assert(end && Number(end[1]) === Number(end[2]), name + ': after spam next expected last slide, got ' + label.textContent);
  assert(next.disabled === true, name + ': next should be disabled on last slide');

  // Spam prev beyond start
  for (let i = 0; i < 20; i++) prev.click();
  const start = String(label.textContent).match(/(\d+)\s*\/\s*(\d+)/);
  assert(start && Number(start[1]) === 1, name + ': after spam prev expected slide 1, got ' + label.textContent);
  assert(prev.disabled === true, name + ': prev should be disabled on first slide');

  // Walk to end once more and confirm cannot exceed inflated metadata
  for (let i = 0; i < total + 5; i++) next.click();
  const final = String(label.textContent).match(/(\d+)\s*\/\s*(\d+)/);
  assert(final && Number(final[1]) === total && Number(final[2]) === total, name + ': cannot exceed ' + total + ', got ' + label.textContent);

  api.destroy();
  console.log('PASS', name, '→', total, 'slides bounded');
  return results;
}

function main() {
  // Inflated slideCount (10) but only 3 real images — classic overshoot bug.
  runCase(
    'inflated-slideCount-vs-images',
    {
      id: 'm1',
      name: 'Demo.pptx',
      presentationType: 'slide_stack',
      slideCount: 10,
      totalSlides: 10,
      slideUrls: [
        '/uploads/presentations/m1/slides/slide-1.png',
        '/uploads/presentations/m1/slides/slide-2.png',
        '/uploads/presentations/m1/slides/slide-3.png'
      ]
    },
    {},
    ['next', 'next', 'next', 'next', 'prev']
  );

  runCase(
    'exact-slideCount',
    {
      id: 'm2',
      name: 'Exact.pptx',
      presentationType: 'slide_stack',
      slideCount: 2,
      slideUrls: [
        '/uploads/presentations/m2/slides/a.png',
        '/uploads/presentations/m2/slides/b.png'
      ]
    },
    {},
    ['next', 'next', 'prev', 'prev', 'prev']
  );

  runCase(
    'options-totalSlides-inflated',
    {
      id: 'm3',
      name: 'Opts.pptx',
      slideUrls: [
        '/uploads/presentations/m3/slides/1.png',
        '/uploads/presentations/m3/slides/2.png',
        '/uploads/presentations/m3/slides/3.png',
        '/uploads/presentations/m3/slides/4.png'
      ]
    },
    { totalSlides: 99 },
    ['next', 'next', 'next', 'next', 'next']
  );

  console.log('\nAll slide-bound tests passed.');
}

main();
