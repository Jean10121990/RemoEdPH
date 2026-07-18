const express = require('express');
const mongoose = require('mongoose');
const { body, validationResult } = require('express-validator');
const Student = require('./models/Student');
const Booking = require('./models/Booking');
const { verifyAdminApiAuth, requireAdmin, verifyToken, requireStudent } = require('./authMiddleware');
const { creditsForPlan } = require('./config/planCredits');
const { consumeReservedCreditForBooking } = require('./services/bookingCreditLedger');
const { buildStudentCreditApiResponse } = require('./services/studentCreditSummary');
const { logAdminAction } = require('./services/adminAudit');

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
  'totalLessonsPurchased',
  'learningJourneyPurchasedByLevel',
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

function bookingEligibleForCreditSpend(booking) {
  if (!booking) return false;
  const st = String(booking.status || '').toLowerCase();
  if (st === 'completed') return true;
  if (booking.finishedAt) return true;
  if (booking.attendance && booking.attendance.classCompleted) return true;
  return false;
}

function bookingOwnedByStudent(booking, student) {
  if (!booking || !student) return false;
  const sid = String(booking.studentId || '');
  return (
    sid === student.username ||
    (student.email && sid === student.email) ||
    sid === String(student._id)
  );
}

/**
 * Finalize one reserved lesson credit after class completion (server-side ledger only).
 * Client sends only bookingId — never a credit amount.
 */
router.post(
  '/spend',
  verifyToken,
  requireStudent,
  rejectClientCreditNumbers,
  [body('bookingId').isMongoId().withMessage('bookingId must be a valid id')],
  async (req, res) => {
    try {
      const errors = validationResult(req);
      if (!errors.isEmpty()) {
        return res.status(400).json({ error: 'Invalid request', details: errors.array() });
      }

      const { bookingId } = req.body;
      const booking = await Booking.findById(bookingId);
      if (!booking) {
        return res.status(404).json({ error: 'Booking not found' });
      }

      const student = req.student;
      if (!bookingOwnedByStudent(booking, student)) {
        return res.status(403).json({ error: 'Access denied' });
      }

      if (!bookingEligibleForCreditSpend(booking)) {
        return res.status(409).json({
          error: 'Class must be marked complete before credits can be finalized.',
        });
      }

      if (booking.creditConsumedAt || booking.creditsFinalized) {
        const fresh = await Student.findById(student._id);
        const summary = buildStudentCreditApiResponse(fresh);
        return res.status(200).json({
          success: true,
          duplicate: true,
          message: 'Credits already finalized for this booking.',
          credits: summary,
        });
      }

      const useTransactions =
        String(process.env.USE_TRANSACTIONS || '').toLowerCase() !== 'false';

      function isTransactionUnsupportedError(error) {
        const msg = String(error && (error.message || error)).toLowerCase();
        return (
          msg.includes('transaction numbers are only allowed') ||
          msg.includes('replica set') ||
          msg.includes('mongos') ||
          msg.includes('does not support transactions')
        );
      }

      if (useTransactions) {
        const session = await mongoose.startSession();
        try {
          await session.withTransaction(async () => {
            booking.$session(session);
            await consumeReservedCreditForBooking(booking, 'Class finished', {
              session,
              actorType: 'student',
              actorId: String(student?._id || ''),
            });
            booking.creditsFinalized = true;
            await booking.save({ session });
          });
        } catch (txnErr) {
          if (isTransactionUnsupportedError(txnErr)) {
            await consumeReservedCreditForBooking(booking, 'Class finished', {
              actorType: 'student',
              actorId: String(student?._id || ''),
            });
            booking.creditsFinalized = true;
            await booking.save();
          } else {
            throw txnErr;
          }
        } finally {
          session.endSession();
        }
      } else {
        await consumeReservedCreditForBooking(booking, 'Class finished', {
          actorType: 'student',
          actorId: String(student?._id || ''),
        });
        booking.creditsFinalized = true;
        await booking.save();
      }

      const fresh = await Student.findById(student._id);
      const summary = buildStudentCreditApiResponse(fresh);

      return res.status(200).json({
        success: true,
        credits: summary,
      });
    } catch (err) {
      console.error('POST /api/credits/spend error:', err);
      return res.status(500).json({ error: 'Server error' });
    }
  }
);

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
          await logAdminAction(req, {
            action: 'admin_credit_grant',
            subjectId: student._id,
            subjectEmail: student.email || '',
            details: {
              duplicate: true,
              planKey: plan.planId,
              planLabel: plan.label,
              idempotencyKey: adminKey,
            },
          });
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
          totalLessonsPurchased: creditsToAdd,
          'learningJourneyPurchasedByLevel.Little Seeds (Age 3)': creditsToAdd,
          'learningJourneyPurchasedByLevel.Sprouts (Age 4)': creditsToAdd,
          'learningJourneyPurchasedByLevel.Saplings (Age 5)': creditsToAdd,
          'learningJourneyPurchasedByLevel.Young Stewards (Age 6)': creditsToAdd,
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

      await logAdminAction(req, {
        action: 'admin_credit_grant',
        subjectId: student._id,
        subjectEmail: student.email || '',
        details: {
          planKey: plan.planId,
          planLabel: plan.label,
          creditsAdded: creditsToAdd,
          note: note || '',
          idempotencyKey: adminKey || null,
          availableBalance: availableAfter,
        },
      });

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
