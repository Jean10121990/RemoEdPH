'use strict';

const express = require('express');
const Affiliate = require('./models/Affiliate');
const {
  verifyAdminApiAuth,
  requireAdmin,
  requireAdminTwoFactorSatisfied,
  requireAdminSessionValid,
} = require('./authMiddleware');
const { roleHas } = require('./services/adminRbac');
const { sendRawEmail } = require('./emailService');

const router = express.Router();
router.use(verifyAdminApiAuth, requireAdmin, requireAdminTwoFactorSatisfied, requireAdminSessionValid);

function peso(n) {
  return '₱' + (Number(n) || 0).toLocaleString('en-PH', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function escHtml(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

function maskAccount(value) {
  const s = String(value || '').replace(/\s+/g, '');
  if (s.length <= 4) return s;
  return '•'.repeat(Math.max(0, s.length - 4)) + s.slice(-4);
}

function hasAccountNumber(row) {
  const n = String((row && row.accountNumber) || '').trim();
  return !!n && n.toUpperCase() !== 'QR';
}

async function requirePayroll(req, res, key) {
  const role = req.user && (req.user.adminRole || 'super_admin');
  if (await roleHas(role, key)) return true;
  res.status(403).json({ success: false, message: 'Accounting payroll access is required' });
  return false;
}

router.get('/', async (req, res) => {
  try {
    if (!(await requirePayroll(req, res, 'acct:payroll_view'))) return;
    const status = String((req.query && req.query.status) || 'requested').toLowerCase();
    const people = await Affiliate.find({ 'withdrawals.0': { $exists: true } })
      .select('name email username withdrawals')
      .lean();
    const rows = [];
    for (const person of people) {
      for (const w of person.withdrawals || []) {
        if (status !== 'all' && String(w.status) !== status) continue;
        rows.push({
          affiliateId: String(person._id),
          withdrawalId: String(w._id),
          name: person.name,
          email: person.email || '',
          username: person.username,
          amountPhp: Number(w.amountPhp) || 0,
          method: w.method || '',
          bankName: w.bankName || '',
          accountName: w.accountName || '',
          accountNumber: w.accountNumber || '',
          hasQr: !!w.qrCode,
          status: w.status,
          requestedAt: w.requestedAt || null,
          paidAt: w.paidAt || null,
          payoutDate: w.payoutDate || '',
        });
      }
    }
    rows.sort((a, b) => new Date(b.requestedAt || 0) - new Date(a.requestedAt || 0));
    res.json({ success: true, withdrawals: rows });
  } catch (err) {
    console.error('GET affiliate payroll:', err);
    res.status(500).json({ success: false, message: 'Could not load affiliate payroll' });
  }
});

// Admin-only: returns the QR image the affiliate uploaded for this payout.
router.get('/:affiliateId/:withdrawalId/qr', async (req, res) => {
  try {
    if (!(await requirePayroll(req, res, 'acct:payroll_view'))) return;
    const affiliate = await Affiliate.findById(req.params.affiliateId).select('withdrawals');
    if (!affiliate) return res.status(404).json({ success: false, message: 'Affiliate not found' });
    const row = (affiliate.withdrawals || []).id(req.params.withdrawalId);
    if (!row || !row.qrCode) return res.status(404).json({ success: false, message: 'No QR code on file' });
    const m = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/=]+)$/.exec(row.qrCode);
    if (!m) return res.status(404).json({ success: false, message: 'QR code is invalid' });
    res.set('Content-Type', m[1]);
    res.set('Cache-Control', 'private, no-store');
    res.set('X-Content-Type-Options', 'nosniff');
    res.send(Buffer.from(m[2], 'base64'));
  } catch (err) {
    console.error('GET affiliate payroll qr:', err);
    res.status(500).json({ success: false, message: 'Could not load the QR code' });
  }
});

router.post('/:affiliateId/:withdrawalId/complete', async (req, res) => {
  try {
    if (!(await requirePayroll(req, res, 'acct:payroll_dispense'))) return;
    const affiliate = await Affiliate.findById(req.params.affiliateId);
    if (!affiliate) return res.status(404).json({ success: false, message: 'Affiliate not found' });
    const row = (affiliate.withdrawals || []).id(req.params.withdrawalId);
    if (!row) return res.status(404).json({ success: false, message: 'Withdrawal not found' });
    if (row.status === 'paid') {
      return res.status(400).json({ success: false, message: 'This payout was already sent' });
    }
    row.status = 'paid';
    row.paidAt = new Date();
    await affiliate.save();
    if (affiliate.email) {
      const when = row.paidAt.toLocaleString('en-PH', { timeZone: 'Asia/Manila' });
      const amount = peso(row.amountPhp);
      const text = [
        `Hello ${affiliate.name},`,
        '',
        `Your affiliate payout of ${amount} was sent on ${when}.`,
        `Method: ${row.method || ''} ${row.bankName || ''}`.trim(),
        hasAccountNumber(row) ? `Account: ${maskAccount(row.accountNumber)}` : 'Sent to the QR code you uploaded.',
        '',
        'It now appears in Transaction history on your affiliate dashboard.',
      ].join('\n');
      const html = `<div style="font-family:Segoe UI,Arial,sans-serif;font-size:14px;color:#0f172a;">
        <h2 style="margin:0 0 12px;">Affiliate payout sent</h2>
        <p>Hello ${escHtml(affiliate.name)},</p>
        <p>Your payout of <strong style="color:#15803d;">${escHtml(amount)}</strong> was sent on ${escHtml(when)}.</p>
        <p>${hasAccountNumber(row) ? 'Account ending ' + escHtml(maskAccount(row.accountNumber)) : 'Sent to the QR code you uploaded'}. It is now in Transaction history on your affiliate dashboard.</p>
      </div>`;
      try {
        await sendRawEmail(affiliate.email, `RemoEd affiliate payout sent — ${amount}`, html, text);
      } catch (mailErr) {
        console.warn('Affiliate payout receipt email failed:', mailErr.message || mailErr);
      }
    }
    res.json({ success: true, paidAt: row.paidAt });
  } catch (err) {
    console.error('POST affiliate payroll complete:', err);
    res.status(500).json({ success: false, message: 'Could not mark the payout sent' });
  }
});

module.exports = router;
