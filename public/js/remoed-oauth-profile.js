/**
 * Connected accounts UI for student/teacher profile settings.
 */
(function (global) {
  'use strict';

  function authHeader() {
    var token = '';
    try {
      if (global.RemoEdAuthToken && typeof global.RemoEdAuthToken.getStudentToken === 'function') {
        token = global.RemoEdAuthToken.getStudentToken() || global.RemoEdAuthToken.getTeacherToken() || '';
      }
    } catch (_e) {}
    if (!token) {
      try {
        token =
          localStorage.getItem('remoed_student_token') ||
          sessionStorage.getItem('remoed_student_token') ||
          localStorage.getItem('remoed_teacher_token') ||
          sessionStorage.getItem('remoed_teacher_token') ||
          localStorage.getItem('token') ||
          '';
      } catch (_e2) {}
    }
    return token ? { Authorization: 'Bearer ' + token } : {};
  }

  function escapeText(s) {
    return String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }

  function mount(opts) {
    opts = opts || {};
    var listEl = document.getElementById(opts.listId || 'oauth-providers-list');
    var actionsEl = document.getElementById(opts.actionsId || 'oauth-link-actions');
    var setWrap = document.getElementById(opts.setPasswordWrapId || 'oauth-set-password-wrap');
    var setBtn = document.getElementById(opts.setPasswordBtnId || 'oauth-set-password-btn');
    var setInput = document.getElementById(opts.setPasswordInputId || 'oauth-new-password');
    if (!listEl || !actionsEl) return;

    function paint(data) {
      var providers = (data && data.providers) || [];
      var available = (data && data.available) || {};
      var hasPassword = !!(data && data.hasPassword);

      if (!providers.length) {
        listEl.textContent = 'No social accounts linked yet.';
      } else {
        listEl.innerHTML = providers
          .map(function (p) {
            return (
              '<div style="display:flex;align-items:center;justify-content:space-between;gap:8px;margin:6px 0;padding:8px 10px;border:1px solid #e2e8f0;border-radius:10px;">' +
              '<span><strong>' +
              escapeText(p.provider) +
              '</strong> · ' +
              escapeText(p.email || '') +
              '</span>' +
              '<button type="button" class="cancel-btn oauth-unlink-btn" data-provider="' +
              escapeText(p.provider) +
              '">Unlink</button></div>'
            );
          })
          .join('');
      }

      actionsEl.innerHTML = '';
      ['google', 'facebook'].forEach(function (prov) {
        if (!available[prov]) return;
        var linked = providers.some(function (p) {
          return p.provider === prov;
        });
        if (linked) return;
        var a = document.createElement('a');
        a.className = 'save-btn';
        a.href = '/api/auth/oauth/' + prov + '/link';
        a.textContent = 'Link ' + (prov === 'google' ? 'Google' : 'Facebook');
        a.style.textDecoration = 'none';
        a.style.display = 'inline-flex';
        a.style.alignItems = 'center';
        a.addEventListener('click', function (e) {
          e.preventDefault();
          fetch('/api/auth/oauth/' + prov + '/link?format=json', {
            method: 'GET',
            headers: Object.assign({ Accept: 'application/json' }, authHeader()),
            credentials: 'same-origin',
          })
            .then(function (r) {
              return r.json().then(function (body) {
                return { ok: r.ok, body: body };
              });
            })
            .then(function (res) {
              if (!res.ok || !res.body || !res.body.url) {
                throw new Error((res.body && res.body.message) || 'Could not start linking.');
              }
              window.location.href = res.body.url;
            })
            .catch(function (err) {
              alert((err && err.message) || 'Could not start linking.');
            });
        });
        actionsEl.appendChild(a);
      });

      if (setWrap) setWrap.hidden = hasPassword;

      listEl.querySelectorAll('.oauth-unlink-btn').forEach(function (btn) {
        btn.addEventListener('click', function () {
          var provider = btn.getAttribute('data-provider');
          if (!provider) return;
          if (!window.confirm('Unlink ' + provider + ' from this account?')) return;
          fetch('/api/auth/oauth/me/unlink', {
            method: 'POST',
            headers: Object.assign(
              { 'Content-Type': 'application/json', Accept: 'application/json' },
              authHeader()
            ),
            credentials: 'same-origin',
            body: JSON.stringify({ provider: provider }),
          })
            .then(function (r) {
              return r.json().then(function (body) {
                return { ok: r.ok, body: body };
              });
            })
            .then(function (res) {
              if (!res.ok) throw new Error((res.body && res.body.message) || 'Unlink failed');
              paint(res.body);
            })
            .catch(function (err) {
              alert((err && err.message) || 'Unlink failed');
            });
        });
      });
    }

    fetch('/api/auth/oauth/me/providers', {
      headers: Object.assign({ Accept: 'application/json' }, authHeader()),
      credentials: 'same-origin',
    })
      .then(function (r) {
        return r.json().then(function (body) {
          return { ok: r.ok, body: body };
        });
      })
      .then(function (res) {
        if (!res.ok) {
          listEl.textContent = (res.body && res.body.message) || 'Could not load connected accounts.';
          return;
        }
        paint(res.body);
      })
      .catch(function () {
        listEl.textContent = 'Could not load connected accounts.';
      });

    if (setBtn && setInput) {
      setBtn.addEventListener('click', function () {
        var pw = String(setInput.value || '');
        fetch('/api/auth/oauth/me/set-password', {
          method: 'POST',
          headers: Object.assign(
            { 'Content-Type': 'application/json', Accept: 'application/json' },
            authHeader()
          ),
          credentials: 'same-origin',
          body: JSON.stringify({ newPassword: pw }),
        })
          .then(function (r) {
            return r.json().then(function (body) {
              return { ok: r.ok, body: body };
            });
          })
          .then(function (res) {
            if (!res.ok) throw new Error((res.body && res.body.message) || 'Could not save password');
            alert(res.body.message || 'Password saved.');
            setInput.value = '';
            return fetch('/api/auth/oauth/me/providers', {
              headers: Object.assign({ Accept: 'application/json' }, authHeader()),
              credentials: 'same-origin',
            }).then(function (r) {
              return r.json();
            });
          })
          .then(function (body) {
            if (body && body.success) paint(body);
          })
          .catch(function (err) {
            alert((err && err.message) || 'Could not save password');
          });
      });
    }
  }

  global.RemoEdOAuthProfile = { mount: mount };
})(window);
