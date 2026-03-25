const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Student = require('./models/Student');
const { verifyAdminApiAuth, requireAdmin } = require('./authMiddleware');
const { creditsForPlan } = require('./config/planCredits');

const router = express.Router();

const DISALLOWED_CREDIT_BODY_KEYS = [
  'creditBalance',
  'reservedCredits',
  'delta',
  'amount',
  'credits',
  'creditsToAdd',
  'totalCredits',
  'totalCreditsEarned',
  'usedCredits',
];

function rejectClientCreditNumbers(req, res, next) {
  for (const k of DISALLOWED_CREDIT_BODY_KEYS) {
    if (req.body[k] !== undefined && req.body[k] !== null) {
      return res.status(400).json({
        error: 'Credit amounts are computed on the server only.',
        field: k,
      });
    }
  }
  next();
}

router.post(
  '/update',
  verifyAdminApiAuth,
  requireAdmin,
  rejectClientCreditNumbers,
  [
    body('operation').equals('grant_plan').withMessage('operation must be grant_plan'),
    body('planKey').trim().notEmpty().withMessage('planKey is required'),
    body('studentEmail').optional({ values: 'falsy' }).isEmail().normalizeEmail(),
    body('studentId').optional({ values: 'falsy' }).isMongoId(),
    body('note').optional({ values: 'falsy' }).trim().isLength({ max: 500 }),
    body('idempotencyKey').optional({ values: 'falsy' }).trim().isLength({ min: 8, max: 128 }),
  ],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Invalid request', details: errors.array() });
      }

      const { planKey, studentEmail, studentId, note, idempotencyKey } = req.body;

      if (!studentEmail && !studentId) {
        return res.status(400).json({ error: 'studentEmail or studentId is required' });
      }

      const plan = creditsForPlan(planKey);
      if (!plan || !plan.credits) {
        return res.status(400).json({ error: 'Invalid planKey' });
      }

      let student = null;
      if (studentId && mongoose.isValidObjectId(studentId)) {
        student = await Student.findById(studentId);
      }
      if (!student && studentEmail) {
        student = await Student.findOne({ email: studentEmail });
      }

      if (!student) {
        return res.status(404).json({ error: 'Student not found' });
      }

      const adminKey = idempotencyKey ? `admin-grant:${idempotencyKey}` : null;
      if (adminKey) {
        const ids = Array.isArray(student.processedPaymentIds) ? student.processedPaymentIds : [];
        if (ids.includes(adminKey)) {
          return res.json({
            success: true,
            duplicate: true,
            message: 'This grant was already applied.',
            studentId: String(student._id),
          });
        }
      }

      const creditsToAdd = plan.credits;
      const now = new Date();
      const pool = Math.max(0, Number(student.creditBalance) || 0);
      const reserved = Math.max(0, Number(student.reservedCredits) || 0);
      const balanceAfterPool = pool + creditsToAdd;
      const availableAfter = Math.max(balanceAfterPool - reserved, 0);
      const historyPaymentId = adminKey || `admin:${plan.planId}:${Date.now()}`;

      const update = {
        $inc: {
          creditBalance: creditsToAdd,
          totalCreditsEarned: creditsToAdd,
        },
        $push: {
          creditHistory: {
            date: now,
            plan: plan.label,
            credits: creditsToAdd,
            amountPaid: 0,
            paymentId: historyPaymentId,
            entryType: 'purchase',
            balanceAfter: balanceAfterPool,
          },
          creditTransactions: {
            date: now,
            type: 'adjustment',
            plan: plan.label,
            description: note || 'Admin credit grant',
            credits: creditsToAdd,
            balanceAfter: availableAfter,
            amountPaid: 0,
          },
        },
      };

      if (adminKey) {
        update.$push.processedPaymentIds = adminKey;
      }

      await Student.updateOne({ _id: student._id }, update);

      return res.json({
        success: true,
        studentId: String(student._id),
        planId: plan.planId,
        creditsAdded: creditsToAdd,
        availableBalance: availableAfter,
      });
    } catch (err) {
      console.error('POST /api/credits/update error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

module.exports = router;
