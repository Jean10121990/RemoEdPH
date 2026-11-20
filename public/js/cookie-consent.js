/**
 * Public cookie choice for the Meta pixel. Accept stores remoed_cookie_consent=accepted.
 * Reject stores rejected and leaves the pixel unloaded.
 */
(function () {
  var KEY = 'remoed_cookie_consent';

  function read() {
    try {
      return localStorage.getItem(KEY) || '';
    } catch (e) {
      return '';
    }
  }

  function write(value) {
    try {
      localStorage.setItem(KEY, value);
    } catch (e) {}
    window.dispatchEvent(new CustomEvent('remoed:cookie-consent', { detail: { value: value } }));
  }

  function hide(bar) {
    if (bar && bar.parentNode) bar.parentNode.removeChild(bar);
  }

  function show() {
    if (read() === 'accepted' || read() === 'rejected') return;
    if (document.getElementById('remoed-cookie-banner')) return;
    var style = document.createElement('style');
    style.textContent =
      '#remoed-cookie-banner{position:fixed;left:16px;right:16px;bottom:16px;z-index:80;display:flex;gap:12px;flex-wrap:wrap;align-items:center;justify-content:space-between;max-width:880px;margin:0 auto;padding:14px 16px;background:#fff;color:#1E3A5F;border:1px solid #d7e6f2;border-radius:14px;box-shadow:0 10px 30px rgba(15,23,42,.12);font:600 14px/1.45 Quicksand,sans-serif}' +
      '#remoed-cookie-banner p{margin:0;flex:1 1 280px}' +
      '#remoed-cookie-banner a{color:#0b7cbe}' +
      '#remoed-cookie-banner .remoed-cookie-actions{display:flex;gap:8px}' +
      '#remoed-cookie-banner button{border:0;border-radius:999px;padding:8px 14px;font:700 14px Quicksand,sans-serif;cursor:pointer}' +
      '#remoed-cookie-accept{background:#00aeef;color:#fff}' +
      '#remoed-cookie-reject{background:#e8f4fb;color:#1E3A5F}';
    document.head.appendChild(style);
    var bar = document.createElement('div');
    bar.id = 'remoed-cookie-banner';
    bar.setAttribute('role', 'dialog');
    bar.setAttribute('aria-label', 'Cookie choice');
    bar.innerHTML =
      '<p>RemoEd PH uses a cookie to remember this choice. Accept also allows the Meta advertising pixel on this public page. The pixel does not receive a child\'s name, age, or email. <a href="/site-privacy.html">Privacy Policy</a></p>' +
      '<div class="remoed-cookie-actions"><button type="button" id="remoed-cookie-reject">Reject</button><button type="button" id="remoed-cookie-accept">Accept</button></div>';
    document.body.appendChild(bar);
    document.getElementById('remoed-cookie-accept').addEventListener('click', function () {
      write('accepted');
      hide(bar);
    });
    document.getElementById('remoed-cookie-reject').addEventListener('click', function () {
      write('rejected');
      hide(bar);
    });
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', show);
  else show();
})();
