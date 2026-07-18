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
const { isTokenBlacklisted } = require('./services/jwtBlacklist');
const { normalizePlanId, PLAN_CREDITS } = require('./config/planCredits');
const {
  applyExistingStudentPurchase,
  isPaymongoCheckoutPaid,
  extractPaymentIdFromCheckout,
  summarizeCheckoutPaymentsForLog,
} = require('./services/paymongoCreditApply');

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
  if (isTokenBlacklisted(token)) {
    return res.status(401).json({ success: false, error: 'Session token has been revoked' });
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

/** Require a valid student JWT (for confirm-checkout after PayMongo return). */
function requireVerifyStudent(req, res, next) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ success: false, error: 'Student login required' });
  }
  const token = authHeader.split(' ')[1];
  if (!token) {
    return res.status(401).json({ success: false, error: 'Student login required' });
  }
  if (isTokenBlacklisted(token)) {
    return res.status(401).json({ success: false, error: 'Session token has been revoked' });
  }
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (!decoded.studentId) {
      return res.status(403).json({
        success: false,
        error: 'Please sign in as a student to confirm a plan purchase.',
      });
    }
    req.studentFromToken = decoded;
  } catch (e) {
    return res.status(401).json({ success: false, error: 'Invalid or expired session token' });
  }
  next();
}

function getPaymongoSecretKey() {
  return (
    process.env.PAYMONGO_SECRET_KEY ||
    process.env.PAYMONGO_SECRET_TEST_KEY ||
    process.env.PAYMONGO_SECRET ||
    ''
  );
}

function paymongoAuthHeader(secretKey) {
  return 'Basic ' + Buffer.from(`${secretKey}:`).toString('base64');
}

/** USD → PHP for PayMongo checkout (override via EXCHANGE_RATE_PHP in .env). */
const EXCHANGE_RATE_PHP = parseFloat(process.env.EXCHANGE_RATE_PHP) || 60.03;

/** Base rate: $7 per 25-minute class. Founder Discount: $21/mo (not applied to Starter/spark). */
const USD_PER_CLASS = 7;
const FOUNDER_DISCOUNT_PER_MONTH = 21;

function planDescription(plan) {
  const planKey = normalizePlanId(plan);
  const row = PLAN_CREDITS[planKey];
  if (!row) return 'RemoEd Subscription Plan';
  return `${row.label} Plan`;
}

function computePlanTotals(planId) {
  const planKey = normalizePlanId(planId);
  const row = PLAN_CREDITS[planKey];
  if (!row) return null;

  const lessonCredits = row.credits;
  const months = row.months;
  const usdList = Number((lessonCredits * USD_PER_CLASS).toFixed(2));
  // Starter (spark) has no founder discount so checkout stays $154.
  const usdFounderDiscount =
    planKey === 'spark'
      ? 0
      : Number((FOUNDER_DISCOUNT_PER_MONTH * months).toFixed(2));
  const usdTotal = Number((usdList - usdFounderDiscount).toFixed(2));
  const phpTotal = Number((usdTotal * EXCHANGE_RATE_PHP).toFixed(2));
  const amountCentavos = Math.round(phpTotal * 100);

  return {
    planId: planKey,
    planName: row.label,
    bundleName: row.bundleName,
    months,
    validityMonths: row.validityMonths,
    lessonCredits,
    credits: lessonCredits,
    usdPerClass: USD_PER_CLASS,
    usdList,
    usdFounderDiscount,
    usdTotal,
    usdPerLesson:
      lessonCredits > 0 ? Number((usdTotal / lessonCredits).toFixed(4)) : 0,
    phpTotal,
    amountCentavos,
  };
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
            usd_list: String(totals.usdList),
            usd_founder_discount: String(totals.usdFounderDiscount),
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

/**
 * After PayMongo redirects / student revisits credits, client calls this to apply credits
 * when the webhook never reached the server (common on Dev Tunnel / local).
 */
router.post('/confirm-checkout', requireVerifyStudent, async (req, res) => {
  try {
    const secretKey = getPaymongoSecretKey();
    if (!secretKey) {
      return res.status(500).json({
        success: false,
        error: 'PayMongo secret key is not configured',
      });
    }

    const studentId = String(req.studentFromToken.studentId || '').trim();
    if (!mongoose.isValidObjectId(studentId)) {
      return res.status(400).json({ success: false, error: 'Invalid student session' });
    }

    const student = await Student.findById(studentId);
    if (!student) {
      return res.status(404).json({ success: false, error: 'Student not found' });
    }

    const bodyRegId = String((req.body && req.body.registrationId) || '').trim();
    console.log('[confirm-checkout] start', {
      studentId,
      username: student.username,
      bodyRegId: bodyRegId || '(none)',
    });

    let pending = null;
    if (bodyRegId) {
      pending = await PendingRegistration.findOne({ registrationId: bodyRegId });
      console.log('[confirm-checkout] lookup by registrationId', {
        found: !!pending,
        status: pending?.status || null,
      });
    }

    if (!pending) {
      const candidates = await PendingRegistration.find({
        status: { $in: ['pending', 'paid'] },
        paymongoCheckoutId: { $nin: [null, ''] },
        $or: [{ email: student.email }, { username: student.username }],
      })
        .sort({ createdAt: -1 })
        .limit(10);

      // Prefer newest pending that still needs fulfill; else newest paid (duplicate).
      pending =
        candidates.find((c) => c.status === 'pending') ||
        candidates[0] ||
        null;

      console.log('[confirm-checkout] lookup by student email/username', {
        candidates: candidates.length,
        picked: pending
          ? { registrationId: pending.registrationId, status: pending.status }
          : null,
      });
    }

    if (!pending) {
      console.warn('[confirm-checkout] no pending/paid checkout for student', studentId);
      return res.status(404).json({
        success: false,
        unpaid: true,
        error: 'No pending checkout found to confirm',
      });
    }

    const emailMatch =
      pending.email &&
      student.email &&
      String(pending.email).toLowerCase() === String(student.email).toLowerCase();
    const userMatch =
      pending.username &&
      student.username &&
      String(pending.username).toLowerCase() === String(student.username).toLowerCase();
    if (!emailMatch && !userMatch) {
      console.warn('[confirm-checkout] ownership mismatch', {
        studentId,
        pendingEmail: pending.email,
        pendingUsername: pending.username,
      });
      return res.status(403).json({ success: false, error: 'Checkout does not belong to this student' });
    }

    if (pending.status === 'paid') {
      console.log('[confirm-checkout] pending already paid → duplicate', {
        registrationId: pending.registrationId,
        balance: student.creditBalance,
      });
      return res.json({
        success: true,
        credited: false,
        duplicate: true,
        creditsAdded: 0,
        availableBalance: Math.max(0, Number(student.creditBalance) || 0),
        message: 'Checkout already confirmed',
      });
    }

    const checkoutSessionId = String(pending.paymongoCheckoutId || '').trim();
    if (!checkoutSessionId) {
      return res.status(400).json({ success: false, error: 'Pending checkout has no PayMongo session id' });
    }

    let sessionData;
    try {
      const pmRes = await axios.get(
        `https://api.paymongo.com/v1/checkout_sessions/${encodeURIComponent(checkoutSessionId)}`,
        {
          headers: {
            Authorization: paymongoAuthHeader(secretKey),
            Accept: 'application/json',
          },
          timeout: 15000,
        }
      );
      sessionData = pmRes.data?.data;
    } catch (pmErr) {
      const detail =
        pmErr?.response?.data?.errors?.[0]?.detail ||
        pmErr?.message ||
        'Failed to retrieve PayMongo checkout';
      console.error('[confirm-checkout] PayMongo GET failed', {
        checkoutSessionId,
        detail,
      });
      return res.status(502).json({ success: false, error: detail });
    }

    const snap = summarizeCheckoutPaymentsForLog(sessionData);
    console.log('[confirm-checkout] PayMongo session snapshot', {
      studentId,
      registrationId: pending.registrationId,
      checkoutSessionId,
      ...snap,
      isPaid: isPaymongoCheckoutPaid(sessionData),
    });

    if (!isPaymongoCheckoutPaid(sessionData)) {
      console.log('[confirm-checkout] outcome=unpaid', { checkoutSessionId, snap });
      return res.json({
        success: true,
        credited: false,
        unpaid: true,
        creditsAdded: 0,
        availableBalance: Math.max(0, Number(student.creditBalance) || 0),
        message: 'Payment not confirmed yet at PayMongo',
      });
    }

    const attrs = sessionData.attributes || {};
    const metadata = attrs.metadata || {};
    const metaUid = String(metadata.userId || '').trim();
    if (metaUid && mongoose.isValidObjectId(metaUid) && String(metaUid) !== String(student._id)) {
      console.warn('[confirm-checkout] metadata.userId differs from session student (continuing via email/username ownership)', {
        metaUid,
        studentId: String(student._id),
      });
    }

    const paymongoPaymentId = extractPaymentIdFromCheckout(sessionData);
    const idempotencyKey = String(checkoutSessionId || paymongoPaymentId || pending.registrationId).trim();
    const planId = normalizePlanId(metadata.planId || metadata.plan || pending.plan);

    const applyResult = await applyExistingStudentPurchase({
      student,
      pending,
      planId,
      idempotencyKey,
      paymongoPaymentId,
      checkoutSessionId,
      paymongoEventId: '',
    });

    console.log('[confirm-checkout] apply result', {
      studentId,
      registrationId: pending.registrationId,
      ok: applyResult.ok,
      duplicate: !!applyResult.duplicate,
      credited: !!applyResult.credited,
      creditsAdded: applyResult.creditsAdded,
      availableBalance: applyResult.availableBalance,
      error: applyResult.error || null,
    });

    if (!applyResult.ok && !applyResult.duplicate) {
      return res.status(500).json({
        success: false,
        error: applyResult.error || 'Failed to apply credits',
      });
    }

    const outcome = applyResult.duplicate ? 'duplicate' : 'credited';
    console.log('[confirm-checkout] outcome=' + outcome, {
      creditsAdded: applyResult.creditsAdded || 0,
      availableBalance: applyResult.availableBalance,
    });

    return res.json({
      success: true,
      credited: !!(applyResult.credited && !applyResult.duplicate),
      duplicate: !!applyResult.duplicate,
      creditsAdded: applyResult.creditsAdded || 0,
      availableBalance:
        applyResult.availableBalance != null
          ? applyResult.availableBalance
          : Math.max(0, Number(student.creditBalance) || 0),
    });
  } catch (error) {
    console.error('[confirm-checkout] error', error);
    return res.status(500).json({
      success: false,
      error: error.message || 'Failed to confirm checkout',
    });
  }
});

module.exports = router;
