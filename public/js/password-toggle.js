/**
 * SVG show/hide control for every password field. No emoji, no "Show" text.
 */
(function (global) {
  'use strict';

  /* Lucide eye / eye-off — https://lucide.dev/icons/eye https://lucide.dev/icons/eye-off */
  var EYE =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"/><circle cx="12" cy="12" r="3"/></svg>';
  var EYE_OFF =
    '<svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"/><path d="M14.084 14.158a3 3 0 0 1-4.242-4.242"/><path d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"/><path d="m2 2 20 20"/></svg>';

  function setIcon(btn, visible) {
    btn.innerHTML = visible ? EYE_OFF : EYE;
    btn.setAttribute('aria-label', visible ? 'Hide password' : 'Show password');
    btn.classList.toggle('is-shown', !!visible);
  }

  function bind(btn, input) {
    if (btn.dataset.remoedPwBound === '1') return;
    btn.dataset.remoedPwBound = '1';
    btn.type = 'button';
    btn.removeAttribute('onclick');
    btn.classList.add('remoed-pw-toggle');
    setIcon(btn, input.type === 'text');
    btn.addEventListener('click', function (e) {
      e.preventDefault();
      var show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      setIcon(btn, show);
    });
  }

  function wrap(input) {
    if (!input || input.dataset.remoedPwToggle === '1') return;
    input.dataset.remoedPwToggle = '1';

    var parent = input.parentElement;
    var existing =
      (parent && parent.querySelector('button.password-toggle, button.pw-toggle, button.remoed-pw-toggle')) ||
      input.nextElementSibling;
    if (existing && existing.tagName === 'BUTTON') {
      bind(existing, input);
      return;
    }

    var wrapEl = document.createElement('div');
    wrapEl.className = 'remoed-pw-wrap';
    input.parentNode.insertBefore(wrapEl, input);
    wrapEl.appendChild(input);
    var btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'remoed-pw-toggle';
    wrapEl.appendChild(btn);
    bind(btn, input);
  }

  function enhance(root) {
    var scope = root && root.querySelectorAll ? root : document;
    scope.querySelectorAll('input[type="password"]').forEach(wrap);
  }

  function boot() {
    enhance(document);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot);
  } else {
    boot();
  }

  global.RemoedPasswordToggle = { enhance: enhance };
})(typeof window !== 'undefined' ? window : globalThis);
