/**
 * Admin legal document accept / print helpers.
 * Config via window.RemoEdLegalDocConfig:
 *   { fieldKey, acceptUrl, version, title, requireAssignedRole }
 */
(function () {
  function getToken() {
    if (window.RemoedAdminSession && typeof RemoedAdminSession.getAuthToken === 'function') {
      var t = RemoedAdminSession.getAuthToken();
      if (t) return t;
    }
    return (
      localStorage.getItem('remoed_admin_token') ||
      localStorage.getItem('remoed_admin_auth') ||
      localStorage.getItem('adminToken') ||
      localStorage.getItem('token') ||
      ''
    );
  }

  function isAdmin() {
    return localStorage.getItem('userType') === 'admin' || !!getToken();
  }

  function formatDateLong(value) {
    if (!value) return '';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function toInputDate(value) {
    if (!value) return '';
    var d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  function legalNameFromProfile(profile) {
    if (!profile) return '';
    return [profile.firstName, profile.lastName].filter(Boolean).join(' ').trim();
  }

  function roleLabel(r) {
    var m = {
      super_admin: 'Super-Admin',
      admin_hr: 'Admin — HR',
      admin_accounting: 'Admin — Accounting',
      admin_qa: 'Admin — QA',
    };
    return m[r] || r || '';
  }

  function setMessage(text, type) {
    var el = document.getElementById('legal-doc-message');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'legal-doc-message' + (type ? ' legal-doc-message--' + type : '');
  }

  function applySignedState(record, cfg) {
    var statusEl = document.getElementById('legal-doc-status');
    var formEl = document.getElementById('legal-accept-form');
    var signedView = document.getElementById('legal-signed-view');
    var acceptBtn = document.getElementById('legal-accept-btn');
    var effectiveInput = document.getElementById('legal-effective-date');
    var nameInput = document.getElementById('legal-name');
    var roleInput = document.getElementById('legal-assigned-role');
    var acceptCheck = document.getElementById('legal-accept-check');
    var dateExecutedEl = document.getElementById('legal-date-executed');
    var signedNameEl = document.getElementById('legal-signed-name');
    var signedEffectiveEl = document.getElementById('legal-signed-effective');
    var signedRoleEl = document.getElementById('legal-signed-role');

    var signed = !!(record && record.accepted);
    if (statusEl) {
      if (signed) {
        statusEl.className = 'legal-doc-status legal-doc-status--signed';
        statusEl.textContent =
          'Signed on ' +
          formatDateLong(record.acceptedAt) +
          ' by ' +
          (record.legalName || 'Staff');
      } else {
        statusEl.className = 'legal-doc-status legal-doc-status--unsigned';
        statusEl.textContent = 'Unsigned — review, fill, and accept to save your agreement.';
      }
    }

    if (signed) {
      if (formEl) formEl.classList.add('is-locked');
      if (signedView) signedView.hidden = false;
      if (effectiveInput) {
        effectiveInput.value = toInputDate(record.effectiveDate);
        effectiveInput.disabled = true;
      }
      if (nameInput) {
        nameInput.value = record.legalName || '';
        nameInput.disabled = true;
      }
      if (roleInput) {
        roleInput.value = record.assignedRole || '';
        roleInput.disabled = true;
      }
      if (acceptCheck) {
        acceptCheck.checked = true;
        acceptCheck.disabled = true;
      }
      if (acceptBtn) acceptBtn.disabled = true;
      if (dateExecutedEl) dateExecutedEl.textContent = formatDateLong(record.acceptedAt) || '—';
      if (signedNameEl) signedNameEl.textContent = record.legalName || '—';
      if (signedEffectiveEl) signedEffectiveEl.textContent = formatDateLong(record.effectiveDate) || '—';
      if (signedRoleEl) signedRoleEl.textContent = record.assignedRole || '—';
    } else {
      if (formEl) formEl.classList.remove('is-locked');
      if (signedView) signedView.hidden = true;
      if (effectiveInput) effectiveInput.disabled = false;
      if (nameInput) nameInput.disabled = false;
      if (roleInput) roleInput.disabled = false;
      if (acceptCheck) acceptCheck.disabled = false;
      updateAcceptEnabled(cfg);
    }
  }

  function updateAcceptEnabled(cfg) {
    var acceptBtn = document.getElementById('legal-accept-btn');
    if (!acceptBtn) return;
    var effectiveInput = document.getElementById('legal-effective-date');
    var nameInput = document.getElementById('legal-name');
    var roleInput = document.getElementById('legal-assigned-role');
    var acceptCheck = document.getElementById('legal-accept-check');
    var roleOk = !cfg.requireAssignedRole || (roleInput && roleInput.value.trim());
    var ready =
      isAdmin() &&
      !!getToken() &&
      effectiveInput &&
      effectiveInput.value &&
      nameInput &&
      nameInput.value.trim() &&
      roleOk &&
      acceptCheck &&
      acceptCheck.checked &&
      !acceptBtn.dataset.locked;
    acceptBtn.disabled = !ready;
  }

  async function loadProfile(cfg) {
    var token = getToken();
    if (!isAdmin() || !token) {
      setMessage('Log in as an admin to sign this document. You can still read and print it.', 'info');
      var acceptBtn = document.getElementById('legal-accept-btn');
      if (acceptBtn) acceptBtn.disabled = true;
      ['legal-effective-date', 'legal-name', 'legal-assigned-role', 'legal-accept-check'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.disabled = true;
      });
      return;
    }

    try {
      var res = await fetch('/api/admin/me', {
        headers: { Authorization: 'Bearer ' + token },
        credentials: 'include',
      });
      if (!res.ok) throw new Error('Could not load profile');
      var data = await res.json();
      var profile = data.profile || {};
      var record = profile[cfg.fieldKey] || {};

      var nameInput = document.getElementById('legal-name');
      var effectiveInput = document.getElementById('legal-effective-date');
      var roleInput = document.getElementById('legal-assigned-role');
      if (!record.accepted) {
        if (nameInput && !nameInput.value) nameInput.value = legalNameFromProfile(profile);
        if (effectiveInput && !effectiveInput.value) effectiveInput.value = toInputDate(new Date());
        if (roleInput && !roleInput.value) {
          roleInput.value = roleLabel(profile.adminRole) || profile.adminRole || '';
        }
      }
      applySignedState(record, cfg);
      if (record.accepted) {
        var btn = document.getElementById('legal-accept-btn');
        if (btn) btn.dataset.locked = '1';
      }
    } catch (err) {
      console.error(err);
      setMessage('Could not load your signing status. Try refreshing while logged in.', 'error');
    }
  }

  async function submitAccept(cfg) {
    var token = getToken();
    if (!isAdmin() || !token) {
      setMessage('You must be logged in as an admin to sign.', 'error');
      return;
    }
    var effectiveInput = document.getElementById('legal-effective-date');
    var nameInput = document.getElementById('legal-name');
    var roleInput = document.getElementById('legal-assigned-role');
    var acceptCheck = document.getElementById('legal-accept-check');
    if (!acceptCheck || !acceptCheck.checked) {
      setMessage('Please check "I Accept" before signing.', 'error');
      return;
    }
    var legalName = (nameInput && nameInput.value.trim()) || '';
    var effectiveDate = (effectiveInput && effectiveInput.value) || '';
    var assignedRole = (roleInput && roleInput.value.trim()) || '';
    if (!legalName || !effectiveDate) {
      setMessage('Effective date and full legal name are required.', 'error');
      return;
    }
    if (cfg.requireAssignedRole && !assignedRole) {
      setMessage('Assigned role / title is required.', 'error');
      return;
    }

    var acceptBtn = document.getElementById('legal-accept-btn');
    if (acceptBtn) {
      acceptBtn.disabled = true;
      acceptBtn.textContent = 'Saving…';
    }
    setMessage('');

    try {
      var body = { legalName: legalName, effectiveDate: effectiveDate };
      if (cfg.requireAssignedRole) body.assignedRole = assignedRole;
      var res = await fetch(cfg.acceptUrl, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.success) {
        throw new Error(data.error || data.message || 'Failed to save acceptance');
      }
      var record = data[cfg.fieldKey] || {
        accepted: true,
        acceptedAt: new Date().toISOString(),
        effectiveDate: effectiveDate,
        legalName: legalName,
        assignedRole: assignedRole,
        version: cfg.version,
      };
      if (acceptBtn) acceptBtn.dataset.locked = '1';
      applySignedState(record, cfg);
      setMessage('Saved. You can print this page as your signed agreement.', 'success');
    } catch (err) {
      console.error(err);
      setMessage(err.message || 'Failed to save acceptance.', 'error');
      updateAcceptEnabled(cfg);
    } finally {
      if (acceptBtn) acceptBtn.textContent = 'Accept & Sign';
    }
  }

  function init() {
    var cfg = window.RemoEdLegalDocConfig;
    if (!cfg || !cfg.fieldKey || !cfg.acceptUrl) return;

    var effectiveInput = document.getElementById('legal-effective-date');
    var nameInput = document.getElementById('legal-name');
    var roleInput = document.getElementById('legal-assigned-role');
    var acceptCheck = document.getElementById('legal-accept-check');
    var acceptBtn = document.getElementById('legal-accept-btn');
    var printBtn = document.getElementById('legal-print-btn');

    [effectiveInput, nameInput, roleInput, acceptCheck].forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', function () {
        updateAcceptEnabled(cfg);
      });
      el.addEventListener('change', function () {
        updateAcceptEnabled(cfg);
      });
    });
    if (effectiveInput) {
      effectiveInput.addEventListener('change', function () {
        var signedEffectiveEl = document.getElementById('legal-signed-effective');
        var btn = document.getElementById('legal-accept-btn');
        if (signedEffectiveEl && (!btn || !btn.dataset.locked)) {
          signedEffectiveEl.textContent = formatDateLong(effectiveInput.value) || '________________________';
        }
      });
    }

    if (acceptBtn) {
      acceptBtn.addEventListener('click', function (e) {
        e.preventDefault();
        submitAccept(cfg);
      });
    }
    if (printBtn) {
      printBtn.addEventListener('click', function (e) {
        e.preventDefault();
        window.print();
      });
    }

    loadProfile(cfg);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
