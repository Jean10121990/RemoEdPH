/**
 * Shared MariBank payroll withdraw modal (Teaching Fee + Admin Fee).
 * Body-level overlay; does not use Bootstrap/jQuery.
 */
(function (global) {
  'use strict';

  var MARIBANK_OPEN_URL = 'https://maribank.ph/c/earnfreemoney?referralCode=KB740303';
  var STYLE_ID = 'remoed-payroll-withdraw-css';
  var ROOT_ID = 'remoed-payroll-withdraw-root';

  function ensureStyles() {
    if (document.getElementById(STYLE_ID)) return;
    var s = document.createElement('style');
    s.id = STYLE_ID;
    s.textContent =
      '#' + ROOT_ID + '{display:none;position:fixed;inset:0;background:rgba(15,23,42,0.45);z-index:var(--z-modal,9000);align-items:center;justify-content:center;padding:16px;}' +
      '#' + ROOT_ID + '.open{display:flex;}' +
      '#' + ROOT_ID + ' .pw-panel{background:#fff;border-radius:12px;max-width:440px;width:100%;padding:22px 22px 18px;box-shadow:0 20px 40px rgba(0,0,0,0.2);}' +
      '#' + ROOT_ID + ' .pw-title{margin:0 0 6px;font-size:1.15rem;color:#0f172a;font-weight:700;}' +
      '#' + ROOT_ID + ' .pw-note{font-size:0.82rem;color:#64748b;margin:0 0 14px;line-height:1.4;}' +
      '#' + ROOT_ID + ' label{display:block;font-size:0.85rem;font-weight:600;color:#334155;margin:0 0 4px;}' +
      '#' + ROOT_ID + ' .pw-field{margin-bottom:12px;}' +
      '#' + ROOT_ID + ' input,#' + ROOT_ID + ' select{width:100%;box-sizing:border-box;padding:10px 12px;border:1px solid #cbd5e1;border-radius:8px;font-size:0.9rem;}' +
      '#' + ROOT_ID + ' .pw-hint{font-size:0.78rem;color:#64748b;margin-top:4px;}' +
      '#' + ROOT_ID + ' .pw-amount{display:flex;justify-content:space-between;align-items:center;padding:10px 12px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;margin-bottom:14px;}' +
      '#' + ROOT_ID + ' .pw-amount strong{color:#15803d;font-size:1.1rem;}' +
      '#' + ROOT_ID + ' .pw-actions{display:flex;gap:8px;justify-content:flex-end;margin-top:8px;}' +
      '#' + ROOT_ID + ' .pw-btn{padding:10px 16px;border:none;border-radius:8px;font-weight:600;cursor:pointer;font-size:0.9rem;}' +
      '#' + ROOT_ID + ' .pw-btn-cancel{background:#e2e8f0;color:#334155;}' +
      '#' + ROOT_ID + ' .pw-btn-go{background:#16a34a;color:#fff;}' +
      '#' + ROOT_ID + ' .pw-btn-go:disabled{opacity:0.65;cursor:not-allowed;}' +
      '#' + ROOT_ID + ' a.pw-link{color:#1ca7e7;font-weight:600;}';
    document.head.appendChild(s);
  }

  function ensureRoot() {
    ensureStyles();
    var root = document.getElementById(ROOT_ID);
    if (root) return root;
    root = document.createElement('div');
    root.id = ROOT_ID;
    root.setAttribute('role', 'dialog');
    root.setAttribute('aria-modal', 'true');
    root.innerHTML =
      '<div class="pw-panel" id="pw-panel">' +
      '<h3 class="pw-title">Withdraw earnings</h3>' +
      '<p class="pw-note">Your MariBank details are used for this payout only. RemoEd stores a <strong>masked</strong> reference; Accounting receives full details by email.</p>' +
      '<form id="pw-form">' +
      '<input type="hidden" id="pw-record-id" value="">' +
      '<div class="pw-field"><label for="pw-bank">Payout method</label>' +
      '<select id="pw-bank" required><option value="MariBank" selected>MariBank (Free Instant Transfer)</option></select>' +
      '<div class="pw-hint">RemoEd PH processes all payroll payouts via MariBank. ' +
      '<a class="pw-link" href="' + MARIBANK_OPEN_URL + '" target="_blank" rel="noopener noreferrer">Open MariBank</a></div></div>' +
      '<div class="pw-field"><label for="pw-account-name">Account holder name</label>' +
      '<input type="text" id="pw-account-name" placeholder="e.g. Juan De La Cruz" required autocomplete="name"></div>' +
      '<div class="pw-field"><label for="pw-account-number">MariBank account number or mobile no.</label>' +
      '<input type="text" id="pw-account-number" placeholder="e.g. 0917XXXXXXX or Account No." required autocomplete="off"></div>' +
      '<div class="pw-amount"><span>Total payout</span><strong id="pw-amount">₱0.00</strong></div>' +
      '<p class="pw-limit-note" id="pw-limit-note" hidden style="display:none;margin:0 0 12px;padding:8px 10px;background:#fff7ed;border:1px solid #fdba74;border-radius:8px;color:#9a3412;font-size:0.8rem;line-height:1.4;">' +
      'Note: MariBank maximum daily withdrawal limit is up to ₱50,000. Your payout exceeds this limit, so you may need more than one day (or split transfers) to complete withdrawal.' +
      '</p>' +
      '<div class="pw-actions">' +
      '<button type="button" class="pw-btn pw-btn-cancel" id="pw-cancel">Cancel</button>' +
      '<button type="submit" class="pw-btn pw-btn-go" id="pw-submit">Confirm &amp; Withdraw</button>' +
      '</div></form></div>';
    document.body.appendChild(root);

    root.addEventListener('click', function (e) {
      if (e.target === root) close();
    });
    document.getElementById('pw-cancel').addEventListener('click', close);
    document.getElementById('pw-form').addEventListener('submit', onSubmit);
    document.addEventListener('keydown', function (ev) {
      if (ev.key === 'Escape' && root.classList.contains('open')) close();
    });
    return root;
  }

  var state = {
    recordId: '',
    amount: 0,
    submitUrl: '',
    idField: 'paymentId',
    getToken: null,
    onSuccess: null,
  };

  function peso(n) {
    return '₱' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  }

  function open(opts) {
    opts = opts || {};
    ensureRoot();
    state.recordId = String(opts.recordId || '');
    state.amount = Number(opts.amount) || 0;
    state.submitUrl = String(opts.submitUrl || '');
    state.idField = opts.idField || 'paymentId';
    state.getToken = typeof opts.getToken === 'function' ? opts.getToken : null;
    state.onSuccess = typeof opts.onSuccess === 'function' ? opts.onSuccess : null;

    document.getElementById('pw-record-id').value = state.recordId;
    document.getElementById('pw-amount').textContent = peso(state.amount);
    var limitNote = document.getElementById('pw-limit-note');
    if (limitNote) {
      var overLimit = Number(state.amount) > 50000;
      limitNote.hidden = !overLimit;
      limitNote.style.display = overLimit ? 'block' : 'none';
    }
    document.getElementById('pw-account-name').value = '';
    document.getElementById('pw-account-number').value = '';
    document.getElementById('pw-bank').value = 'MariBank';
    document.getElementById(ROOT_ID).classList.add('open');
  }

  function close() {
    var root = document.getElementById(ROOT_ID);
    if (root) root.classList.remove('open');
    var name = document.getElementById('pw-account-name');
    var num = document.getElementById('pw-account-number');
    if (name) name.value = '';
    if (num) num.value = '';
  }

  async function onSubmit(e) {
    e.preventDefault();
    var btn = document.getElementById('pw-submit');
    var accountName = (document.getElementById('pw-account-name').value || '').trim();
    var accountNumber = (document.getElementById('pw-account-number').value || '').replace(/\s+/g, '').trim();
    if (!state.submitUrl || !state.recordId) {
      alert('Missing payout record.');
      return;
    }
    if (!accountName || !accountNumber) {
      alert('Account name and MariBank account/mobile are required.');
      return;
    }
    var token = state.getToken ? state.getToken() : '';
    if (!token) {
      alert('Please sign in again.');
      return;
    }
    btn.disabled = true;
    btn.textContent = 'Processing…';
    var body = {
      bankName: 'MariBank',
      accountName: accountName,
      accountNumber: accountNumber,
    };
    body[state.idField] = state.recordId;

    try {
      var res = await fetch(state.submitUrl, {
        method: 'POST',
        headers: {
          Authorization: 'Bearer ' + token,
          'Content-Type': 'application/json',
        },
        credentials: 'include',
        body: JSON.stringify(body),
      });
      var data = await res.json().catch(function () { return {}; });
      if (!res.ok || !data.success) {
        throw new Error(data.message || data.error || 'Withdrawal failed');
      }
      alert(data.message || 'Withdrawal submitted.');
      close();
      if (state.onSuccess) state.onSuccess(data);
    } catch (err) {
      alert(err.message || 'An unexpected error occurred.');
    } finally {
      btn.disabled = false;
      btn.textContent = 'Confirm & Withdraw';
    }
  }

  global.RemoedPayrollWithdraw = {
    open: open,
    close: close,
    MARIBANK_OPEN_URL: MARIBANK_OPEN_URL,
  };
})(typeof window !== 'undefined' ? window : this);
