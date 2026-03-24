const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const axios = require('axios');
const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Student = require('./models/Student');
const PendingRegistration = require('./models/PendingRegistration');

const router = express.Router();
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

/**
 * If Authorization: Bearer is present, verify JWT. Student tokens populate req.studentFromToken;
 * teacher tokens return 403. Invalid token returns 401. No/invalid header → next() (guest flow).
 */
function optionalVerifyStudent(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return next();
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return next();
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.studentId) {
      req.studentFromToken = decoded;
    } else if (decoded.teacherId) {
      return res.status(403).json({
        success: false,
        error: 'Please sign in as a student to purchase a plan.'
      });
    }
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session token' });
  }
  next();
}

/** USD → PHP for PayMongo checkout (override via EXCHANGE_RATE_PHP in .env). */
const EXCHANGE_RATE_PHP = parseFloat(process.env.EXCHANGE_RATE_PHP) || 60.03;

/**
 * Daily-rate bundle pricing (USD): total = usdDailyRate × days.
 * Spark 22d, Steady 66d, Scholar 132d, Summit 246d.
 */
const PLAN_PRICING = {
  spark: { name: 'RemoSpark', usdDailyRate: 4.17, days: 22 },
  steady: { name: 'RemoSteady', usdDailyRate: 4.08, days: 66 },
  scholar: { name: 'RemoScholar', usdDailyRate: 4.0, days: 132 },
  summit: { name: 'RemoSummit', usdDailyRate: 3.92, days: 246 }
};
const PLAN_ALIASES = {
  '1month': 'spark',
  '3months': 'steady',
  '6months': 'scholar',
  '1year': 'summit'
};

function normalizePlanId(rawPlan) {
  const key = String(rawPlan || '').toLowerCase();
  return PLAN_ALIASES[key] || key;
}

function planDescription(plan) {
  const planKey = normalizePlanId(plan);
  const cfg = PLAN_PRICING[planKey];
  if (!cfg) return 'RemoEd Subscription Plan';
  return `${cfg.name} Plan`;
}

function computePlanTotals(planId) {
  const planKey = normalizePlanId(planId);
  const cfg = PLAN_PRICING[planKey];
  if (!cfg) return null;

  const usdTotal = Number((cfg.usdDailyRate * cfg.days).toFixed(2));
  const phpTotal = Number((usdTotal * EXCHANGE_RATE_PHP).toFixed(2));
  const amountCentavos = Math.round(phpTotal * 100);

  return {
    planId: planKey,
    planName: cfg.name,
    days: cfg.days,
    usdDailyRate: cfg.usdDailyRate,
    usdTotal,
    phpTotal,
    amountCentavos
  }
}

router.post('/create-link', optionalVerifyStudent, async (req, res) => {
  try {
    const secretKey =
      process.env.PAYMONGO_SECRET_KEY ||
      process.env.PAYMONGO_SECRET_TEST_KEY ||
      process.env.PAYMONGO_SECRET;
    if (!secretKey) {
      return res.status(500).json({
        success: false,
        error: 'PayMongo secret key is not configured (set PAYMONGO_SECRET_KEY or PAYMONGO_SECRET_TEST_KEY)'
      });
    }

    const {
      userId,
      loggedInUserId,
      username,
      email,
      password,
      parentName = '',
      planId,
      plan,
      description,
      referralCode = '',
      success_url,
      cancel_url
    } = req.body || {};

    /** Session checkout: JWT wins; otherwise body userId / loggedInUserId (e.g. post-registration). */
    let effectiveUserId = null;
    if (req.studentFromToken && req.studentFromToken.studentId) {
      effectiveUserId = req.studentFromToken.studentId;
    } else {
      effectiveUserId = userId || loggedInUserId || null;
    }

    const selectedPlanId = normalizePlanId(planId || plan);
    if (!selectedPlanId) {
      return res.status(400).json({ success: false, error: 'planId is required' });
    }

    const totals = computePlanTotals(selectedPlanId);
    if (!totals) {
      return res.status(400).json({ success: false, error: 'Invalid planId. Use spark, steady, scholar, or summit.' });
    }

    const registrationId = crypto.randomBytes(16).toString('hex');
    let resolvedStudent = null;
    let resolvedUsername = String(username || '').trim();
    let resolvedEmail = String(email || '').trim();
    let resolvedParentName = String(parentName || '').trim();
    let passwordHash = '';

    if (effectiveUserId) {
      const sid = String(effectiveUserId).trim();
      if (mongoose.isValidObjectId(sid)) {
        resolvedStudent = await Student.findById(sid);
      }
      if (!resolvedStudent) {
        resolvedStudent = await Student.findOne({
          $or: [{ username: sid }, { email: sid }]
        });
      }
      if (!resolvedStudent) {
        return res.status(404).json({ success: false, error: 'Student not found for provided userId' });
      }

      resolvedUsername = resolvedStudent.username || resolvedUsername;
      resolvedEmail = resolvedStudent.email || resolvedEmail;
      resolvedParentName = resolvedStudent.parentName || resolvedParentName;
      passwordHash = resolvedStudent.password || '';
    } else {
      if (!resolvedUsername || !resolvedEmail || !password) {
        return res.status(400).json({ success: false, error: 'username, email, password, and planId are required' });
      }

      const existingUsername = await Student.findOne({ username: resolvedUsername }).lean();
      if (existingUsername) {
        return res.status(409).json({ success: false, error: 'Username already exists' });
      }
      const existingEmail = await Student.findOne({ email: resolvedEmail }).lean();
      if (existingEmail) {
        return res.status(409).json({ success: false, error: 'Email address already registered' });
      }
      passwordHash = await bcrypt.hash(password, 10);
    }

    const safeSuccessUrl = String(success_url || `${req.protocol}://${req.get('host')}/student-login.html`).trim();
    const safeCancelUrl = String(cancel_url || `${req.protocol}://${req.get('host')}/#plans`).trim();
    const lineItemDescription = String(description || planDescription(selectedPlanId)).trim();

    const studentDisplayName = resolvedStudent
      ? [resolvedStudent.firstName, resolvedStudent.lastName].filter(Boolean).join(' ').trim() ||
        resolvedStudent.username ||
        ''
      : '';

    const paymongoPayload = {
      data: {
        attributes: {
          send_email_receipt: true,
          show_description: true,
          show_line_items: true,
          description: lineItemDescription,
          success_url: safeSuccessUrl,
          cancel_url: safeCancelUrl,
          payment_method_types: ['gcash', 'paymaya', 'card'],
          line_items: [
            {
              currency: 'PHP',
              amount: totals.amountCentavos,
              name: lineItemDescription,
              quantity: 1
            }
          ],
          metadata: {
            registrationId: String(registrationId),
            userId: String(resolvedStudent?._id || effectiveUserId || ''),
            username: resolvedUsername,
            email: resolvedEmail,
            parentName: resolvedParentName,
            student_name: studentDisplayName,
            planId: totals.planId,
            plan: totals.planId,
            usd_total: String(totals.usdTotal),
            exchange_rate_used: String(EXCHANGE_RATE_PHP)
          }
        }
      }
    };

    const authToken = Buffer.from(`${secretKey}:`).toString('base64');
    const paymongoResponse = await axios.post(
      'https://api.paymongo.com/v1/checkout_sessions',
      paymongoPayload,
      {
        headers: {
          Authorization: `Basic ${authToken}`,
          'Content-Type': 'application/json',
          Accept: 'application/json'
        },
        timeout: 15000
      }
    );

    const checkoutData = paymongoResponse.data?.data;
    const checkoutUrl = checkoutData?.attributes?.checkout_url;
    const checkoutId = checkoutData?.id || '';

    if (!checkoutUrl) {
      return res.status(502).json({ success: false, error: 'PayMongo did not return checkout_url' });
    }

    await PendingRegistration.create({
      registrationId,
      username: resolvedUsername,
      email: resolvedEmail,
      passwordHash,
      parentName: resolvedParentName,
      plan: totals.planId,
      amount: totals.phpTotal,
      description: lineItemDescription,
      referralCode: String(referralCode || ''),
      paymongoCheckoutId: checkoutId,
      checkoutUrl,
      status: 'pending'
    });

    return res.json({
      success: true,
      checkout_url: checkoutUrl,
      registrationId,
      pricing: {
        planId: totals.planId,
        usd_total: totals.usdTotal,
        php_total: totals.phpTotal,
        exchange_rate_used: EXCHANGE_RATE_PHP
      }
    });
  } catch (error) {
    const apiError =
      error?.response?.data?.errors?.[0]?.detail ||
      error?.response?.data?.errors?.[0]?.code ||
      error?.message ||
      'Failed to create payment link';
    return res.status(500).json({ success: false, error: apiError });
  }
});

module.exports = router;
