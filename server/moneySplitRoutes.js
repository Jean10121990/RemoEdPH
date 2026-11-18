'use strict';

const express = require('express');
const {
  verifyAdminApiAuth,
  requireAdmin,
  requireAdminTwoFactorSatisfied,
  requireAdminSessionValid,
  requirePermission,
} = require('./authMiddleware');
const { monthlySplit } = require('./growth/moneySplit');

const router = express.Router();

function amount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n < 0 || n > 1e12) return null;
  return n;
}

router.get(
  '/',
  verifyAdminApiAuth,
  requireAdmin,
  requireAdminTwoFactorSatisfied,
  requireAdminSessionValid,
  requirePermission('acct:payroll_view'),
  (req, res) => {
    const grossPhp = amount(req.query.gross);
    const teachersPhp = amount(req.query.teachers);
    const affiliatesPhp = amount(req.query.affiliates);
    if (grossPhp == null || teachersPhp == null || affiliatesPhp == null) {
      return res.status(400).json({ success: false, error: 'Enter amounts that are zero or more.' });
    }
    res.json({
      success: true,
      note: 'Partners 2%, growth 5%, charity 5%, buffer 5%, operations ₱6,400. Profit is what remains.',
      split: monthlySplit({ grossPhp, teachersPhp, affiliatesPhp }),
    });
  }
);

module.exports = router;
