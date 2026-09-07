/**
 * Shared accept / print helpers for teacher TOS + Privacy Policy pages.
 * Config via window.RemoEdLegalDocConfig before DOMContentLoaded:
 *   { fieldKey, acceptUrl, version, title }
 */
(function () {
  function getToken() {
    return (
      localStorage.getItem('token') ||
      localStorage.getItem('remoedToken') ||
      localStorage.getItem('authToken') ||
      ''
    );
  }

  function isTeacher() {
    return localStorage.getItem('userType') === 'teacher';
  }

  function formatDateLong(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  }

  function toInputDate(value) {
    if (!value) return '';
    const d = new Date(value);
    if (Number.isNaN(d.getTime())) return '';
    return d.toISOString().slice(0, 10);
  }

  function legalNameFromProfile(profile) {
    if (!profile) return '';
    if (profile.fullname && String(profile.fullname).trim()) return String(profile.fullname).trim();
    return [profile.firstName, profile.middleName, profile.lastName]
      .filter(Boolean)
      .join(' ')
      .trim();
  }

  function setMessage(text, type) {
    const el = document.getElementById('legal-doc-message');
    if (!el) return;
    el.textContent = text || '';
    el.className = 'legal-doc-message' + (type ? ' legal-doc-message--' + type : '');
  }

  function applySignedState(record) {
    const statusEl = document.getElementById('legal-doc-status');
    const formEl = document.getElementById('legal-accept-form');
    const signedView = document.getElementById('legal-signed-view');
    const acceptBtn = document.getElementById('legal-accept-btn');
    const effectiveInput = document.getElementById('legal-effective-date');
    const nameInput = document.getElementById('legal-name');
    const acceptCheck = document.getElementById('legal-accept-check');
    const dateExecutedEl = document.getElementById('legal-date-executed');
    const signedNameEl = document.getElementById('legal-signed-name');
    const signedEffectiveEl = document.getElementById('legal-signed-effective');

    const signed = !!(record && record.accepted);
    if (statusEl) {
      if (signed) {
        statusEl.className = 'legal-doc-status legal-doc-status--signed';
        statusEl.textContent =
          'Signed on ' +
          formatDateLong(record.acceptedAt) +
          ' by ' +
          (record.legalName || 'Tutor');
      } else {
        statusEl.className = 'legal-doc-status legal-doc-status--unsigned';
        statusEl.textContent = 'Unsigned — please review, fill, and accept to save your contract.';
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
      if (acceptCheck) {
        acceptCheck.checked = true;
        acceptCheck.disabled = true;
      }
      if (acceptBtn) acceptBtn.disabled = true;
      if (dateExecutedEl) dateExecutedEl.textContent = formatDateLong(record.acceptedAt) || '—';
      if (signedNameEl) signedNameEl.textContent = record.legalName || '—';
      if (signedEffectiveEl) signedEffectiveEl.textContent = formatDateLong(record.effectiveDate) || '—';
    } else {
      if (formEl) formEl.classList.remove('is-locked');
      if (signedView) signedView.hidden = true;
      if (effectiveInput) effectiveInput.disabled = false;
      if (nameInput) nameInput.disabled = false;
      if (acceptCheck) acceptCheck.disabled = false;
      updateAcceptEnabled();
    }
  }

  function updateAcceptEnabled() {
    const acceptBtn = document.getElementById('legal-accept-btn');
    if (!acceptBtn) return;
    const effectiveInput = document.getElementById('legal-effective-date');
    const nameInput = document.getElementById('legal-name');
    const acceptCheck = document.getElementById('legal-accept-check');
    const ready =
      isTeacher() &&
      !!getToken() &&
      effectiveInput &&
      effectiveInput.value &&
      nameInput &&
      nameInput.value.trim() &&
      acceptCheck &&
      acceptCheck.checked &&
      !acceptBtn.dataset.locked;
    acceptBtn.disabled = !ready;
  }

  async function loadProfile(cfg) {
    const token = getToken();
    if (!isTeacher() || !token) {
      setMessage('Log in as a teacher to sign this document. You can still read and print it.', 'info');
      const acceptBtn = document.getElementById('legal-accept-btn');
      if (acceptBtn) acceptBtn.disabled = true;
      ['legal-effective-date', 'legal-name', 'legal-accept-check'].forEach(function (id) {
        const el = document.getElementById(id);
        if (el) el.disabled = true;
      });
      return;
    }

    try {
      const res = await fetch('/api/teacher/profile', {
        headers: { Authorization: 'Bearer ' + token },
      });
      if (!res.ok) throw new Error('Could not load profile');
      const data = await res.json();
      const profile = data.profile || {};
      const record = profile[cfg.fieldKey] || {};

      const nameInput = document.getElementById('legal-name');
      const effectiveInput = document.getElementById('legal-effective-date');
      if (!record.accepted) {
        if (nameInput && !nameInput.value) nameInput.value = legalNameFromProfile(profile);
        if (effectiveInput && !effectiveInput.value) {
          effectiveInput.value = toInputDate(profile.hireDate) || toInputDate(new Date());
        }
      }
      applySignedState(record);
      if (record.accepted) {
        const acceptBtn = document.getElementById('legal-accept-btn');
        if (acceptBtn) acceptBtn.dataset.locked = '1';
      }
    } catch (err) {
      console.error(err);
      setMessage('Could not load your signing status. Try refreshing while logged in.', 'error');
    }
  }

  async function submitAccept(cfg) {
    const token = getToken();
    if (!isTeacher() || !token) {
      setMessage('You must be logged in as a teacher to sign.', 'error');
      return;
    }
    const effectiveInput = document.getElementById('legal-effective-date');
    const nameInput = document.getElementById('legal-name');
    const acceptCheck = document.getElementById('legal-accept-check');
    if (!acceptCheck || !acceptCheck.checked) {
      setMessage('Please check "I Accept" before signing.', 'error');
      return;
    }
    const legalName = (nameInput && nameInput.value.trim()) || '';
    const effectiveDate = (effectiveInput && effectiveInput.value) || '';
    if (!legalName || !effectiveDate) {
      setMessage('Effective date and full legal name are required.', 'error');
      return;
    }

    const acceptBtn = document.getElementById('legal-accept-btn');
    if (acceptBtn) {
      acceptBtn.disabled = true;
      acceptBtn.textContent = 'Saving…';
    }
    setMessage('');

    try {
      const res = await fetch(cfg.acceptUrl, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ legalName, effectiveDate }),
      });
      const data = await res.json().catch(function () {
        return {};
      });
      if (!res.ok || !data.success) {
        throw new Error(data.error || 'Failed to save acceptance');
      }
      const record = data[cfg.fieldKey] || {
        accepted: true,
        acceptedAt: new Date().toISOString(),
        effectiveDate: effectiveDate,
        legalName: legalName,
        version: cfg.version,
      };
      if (acceptBtn) acceptBtn.dataset.locked = '1';
      applySignedState(record);
      setMessage('Saved. You can print this page as your signed contract.', 'success');
    } catch (err) {
      console.error(err);
      setMessage(err.message || 'Failed to save acceptance.', 'error');
      updateAcceptEnabled();
    } finally {
      if (acceptBtn) acceptBtn.textContent = 'Accept & Sign';
    }
  }

  function init() {
    const cfg = window.RemoEdLegalDocConfig;
    if (!cfg || !cfg.fieldKey || !cfg.acceptUrl) return;

    const effectiveInput = document.getElementById('legal-effective-date');
    const nameInput = document.getElementById('legal-name');
    const acceptCheck = document.getElementById('legal-accept-check');
    const acceptBtn = document.getElementById('legal-accept-btn');
    const printBtn = document.getElementById('legal-print-btn');

    [effectiveInput, nameInput, acceptCheck].forEach(function (el) {
      if (!el) return;
      el.addEventListener('input', updateAcceptEnabled);
      el.addEventListener('change', updateAcceptEnabled);
    });
    if (effectiveInput) {
      effectiveInput.addEventListener('change', function () {
        const signedEffectiveEl = document.getElementById('legal-signed-effective');
        const acceptBtn = document.getElementById('legal-accept-btn');
        if (signedEffectiveEl && (!acceptBtn || !acceptBtn.dataset.locked)) {
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
