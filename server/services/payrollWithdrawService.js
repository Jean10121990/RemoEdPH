/**
 * MariBank payroll withdraw helpers (teachers + admins).
 * DB stores masked account only; full details go to Accounting email.
 */

const ALLOWED_BANK = 'MariBank';
const ACCOUNTING_PAYOUT_EMAIL = 'support@remoedph.com';
const MARIBANK_OPEN_URL = 'https://maribank.ph/c/earnfreemoney?referralCode=KB740303';

/** Minimum single MariBank withdraw; below this, amount rolls to the next cut-off. */
const MIN_WITHDRAW_PHP = 100;
/** MariBank daily withdrawal cap (informational + UI gate for split days). */
const MAX_DAILY_WITHDRAW_PHP = 50000;

function normStatus(status) {
  return String(status || '')
    .trim()
    .toUpperCase()
    .replace(/-/g, '_');
}

/** Funds released by Accounting (eligible for Withdraw button). */
function isDisbursed(status) {
  return normStatus(status) === 'DISBURSED';
}

/** Withdrawal submitted; waiting for bank transfer. */
function isWithdrawRequested(status) {
  const s = normStatus(status);
  return s === 'WITHDRAWAL_REQUESTED' || s === 'WITHDRAWALREQUESTED';
}

/**
 * Bank transfer finished (or legacy paid).
 * Legacy teacher Success / admin paid → completed (no Withdraw).
 */
function isCompleted(status) {
  const s = normStatus(status);
  return s === 'COMPLETED' || s === 'SUCCESS' || s === 'PAID';
}

/** Prior-cut-off balance folded into a newer dispense (no longer withdrawable alone). */
function isRolledOver(status) {
  const s = normStatus(status);
  return s === 'ROLLED_OVER' || s === 'ROLLED_TO_NEXT';
}

/** Already released by Accounting (dispense done for this cut-off). */
function isReleased(status) {
  return (
    isDisbursed(status) ||
    isWithdrawRequested(status) ||
    isCompleted(status) ||
    isRolledOver(status)
  );
}

/**
 * Sum DISBURSED rows from earlier cut-offs (not yet withdrawn) to fold into the next dispense.
 * @returns {{ carryForward: number, paymentIds: string[] }}
 */
function collectCarryForwardFromHistory(paymentHistory, currentDuration) {
  const cur = String(currentDuration || '').trim();
  let carryForward = 0;
  const paymentIds = [];
  for (const p of paymentHistory || []) {
    if (!p || !isDisbursed(p.status)) continue;
    const dur = String(p.duration || '').trim();
    if (cur && dur === cur) continue;
    const amt = Number(p.amount);
    if (!Number.isFinite(amt) || amt <= 0) continue;
    carryForward += amt;
    if (p._id) paymentIds.push(String(p._id));
  }
  return { carryForward, paymentIds };
}

function validateWithdrawAmount(amount) {
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, code: 'INVALID_AMOUNT', message: 'Invalid withdrawal amount.' };
  }
  if (n < MIN_WITHDRAW_PHP) {
    return {
      ok: false,
      code: 'BELOW_MIN_WITHDRAW',
      message: `Minimum withdrawable amount is ₱${MIN_WITHDRAW_PHP}. Amounts below ₱${MIN_WITHDRAW_PHP} are added to the next cut-off.`,
    };
  }
  return { ok: true, amount: n };
}

function maskAccount(accountNumber) {
  const raw = String(accountNumber || '').replace(/\s+/g, '');
  if (!raw) return '****';
  if (raw.length <= 4) return '****';
  return '*'.repeat(Math.min(raw.length - 4, 12)) + raw.slice(-4);
}

function validateMariBankWithdrawBody(body) {
  const accountName = String((body && body.accountName) || '').trim();
  const accountNumber = String((body && body.accountNumber) || '').replace(/\s+/g, '').trim();
  const bankName = String((body && body.bankName) || ALLOWED_BANK).trim() || ALLOWED_BANK;

  if (bankName !== ALLOWED_BANK) {
    return { ok: false, message: 'RemoEd PH processes payroll payouts via MariBank only.' };
  }
  if (!accountName || accountName.length < 2) {
    return { ok: false, message: 'Account holder name is required.' };
  }
  if (!accountNumber || accountNumber.length < 6) {
    return { ok: false, message: 'MariBank account number or mobile number is required.' };
  }
  return {
    ok: true,
    bankName: ALLOWED_BANK,
    accountName,
    accountNumber,
    maskedAccountNumber: maskAccount(accountNumber),
  };
}

function peso(n) {
  return '₱' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/**
 * Email full (unmasked) bank details to Accounting. Failures are logged, not thrown soft.
 */
async function sendWithdrawalEmailToAccounting(payload) {
  const {
    roleLabel,
    displayName,
    username,
    email,
    amount,
    periodLabel,
    bankName,
    accountName,
    accountNumber,
  } = payload || {};

  const subject = `Payroll withdrawal — ${roleLabel || 'Payee'} ${displayName || username || ''} — ${peso(amount)}`;
  const text = [
    'A MariBank withdrawal was requested on RemoEd PH.',
    '',
    `Role: ${roleLabel || ''}`,
    `Name: ${displayName || ''}`,
    `Username: ${username || ''}`,
    `Email: ${email || ''}`,
    `Period: ${periodLabel || ''}`,
    `Amount: ${peso(amount)}`,
    `Bank: ${bankName || ALLOWED_BANK}`,
    `Account name: ${accountName || ''}`,
    `Account / mobile (FULL): ${accountNumber || ''}`,
    '',
    'Process the MariBank transfer, then Mark Completed in Accounting Hub.',
    `Open MariBank: ${MARIBANK_OPEN_URL}`,
  ].join('\n');

  const html = `
    <div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;">
      <h2 style="margin:0 0 12px;">MariBank payroll withdrawal</h2>
      <p>A payee submitted a withdrawal request. Full account details below (not stored on RemoEd servers).</p>
      <table style="border-collapse:collapse;width:100%;max-width:520px;">
        <tr><td style="padding:6px 0;color:#64748b;">Role</td><td style="padding:6px 0;font-weight:600;">${esc(roleLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Name</td><td style="padding:6px 0;font-weight:600;">${esc(displayName)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Username</td><td style="padding:6px 0;">${esc(username)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Email</td><td style="padding:6px 0;">${esc(email)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Period</td><td style="padding:6px 0;">${esc(periodLabel)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Amount</td><td style="padding:6px 0;font-weight:700;color:#15803d;">${esc(peso(amount))}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Bank</td><td style="padding:6px 0;">${esc(bankName || ALLOWED_BANK)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Account name</td><td style="padding:6px 0;">${esc(accountName)}</td></tr>
        <tr><td style="padding:6px 0;color:#64748b;">Account / mobile</td><td style="padding:6px 0;font-family:monospace;font-weight:700;">${esc(accountNumber)}</td></tr>
      </table>
      <p style="margin-top:16px;">After transferring, open Accounting Hub → Payment History → <strong>Mark Completed</strong>.</p>
      <p><a href="${MARIBANK_OPEN_URL}" target="_blank" rel="noopener noreferrer">Open MariBank</a></p>
    </div>
  `;

  try {
    const emailService = require('../emailService');
    if (typeof emailService.sendRawEmail === 'function') {
      return await emailService.sendRawEmail(ACCOUNTING_PAYOUT_EMAIL, subject, html, text);
    }
    console.warn('sendRawEmail not available on emailService');
    return { success: false, error: 'sendRawEmail missing' };
  } catch (e) {
    console.error('Payroll withdrawal email failed:', e && e.message);
    return { success: false, error: (e && e.message) || 'email failed' };
  }
}

function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/** UI label for fee / payroll tables */
function uiLifecycleLabel(status) {
  if (isDisbursed(status)) return 'Released — withdraw';
  if (isWithdrawRequested(status)) return 'Processing payout';
  if (isCompleted(status)) return 'Completed';
  if (isRolledOver(status)) return 'Rolled to next cut-off';
  return 'Pending Admin Release';
}

module.exports = {
  ALLOWED_BANK,
  ACCOUNTING_PAYOUT_EMAIL,
  MARIBANK_OPEN_URL,
  MIN_WITHDRAW_PHP,
  MAX_DAILY_WITHDRAW_PHP,
  maskAccount,
  validateMariBankWithdrawBody,
  validateWithdrawAmount,
  collectCarryForwardFromHistory,
  sendWithdrawalEmailToAccounting,
  isDisbursed,
  isWithdrawRequested,
  isCompleted,
  isRolledOver,
  isReleased,
  uiLifecycleLabel,
  normStatus,
};
