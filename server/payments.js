const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcrypt');
const axios = require('axios');
const Student = require('./models/Student');
const PendingRegistration = require('./models/PendingRegistration');

const router = express.Router();
const EXCHANGE_RATE_PHP = 60.03;
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

router.post('/create-link', async (req, res) => {
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

    if (userId) {
      resolvedStudent = await Student.findOne({
        $or: [
          { _id: String(userId) },
          { username: String(userId) },
          { email: String(userId) }
        ]
      });
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
            registrationId,
            userId: String(resolvedStudent?._id || userId || ''),
            username: resolvedUsername,
            email: resolvedEmail,
            parentName: resolvedParentName,
            planId: totals.planId,
            plan: totals.planId,
            usd_total: totals.usdTotal,
            exchange_rate_used: EXCHANGE_RATE_PHP
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
