const express = require('express');
const crypto = require('crypto');
const Student = require('./models/Student');
const PendingRegistration = require('./models/PendingRegistration');

const router = express.Router();
const PLAN_CREDITS = {
  spark: { credits: 22, label: 'RemoSpark' },
  steady: { credits: 66, label: 'RemoSteady' },
  scholar: { credits: 132, label: 'RemoScholar' },
  summit: { credits: 264, label: 'RemoSummit' }
};

function normalizePlanId(plan) {
  const p = String(plan || '').toLowerCase();
  if (p === '1month') return 'spark';
  if (p === '3months') return 'steady';
  if (p === '6months') return 'scholar';
  if (p === '1year') return 'summit';
  return p;
}

function computeSubscriptionDates(plan) {
  const startDate = new Date();
  const endDate = new Date(startDate);

  switch (String(plan || '').toLowerCase()) {
    case 'spark':
    case '1month':
      endDate.setDate(endDate.getDate() + 22);
      break;
    case 'steady':
    case '3months':
      endDate.setDate(endDate.getDate() + 66);
      break;
    case 'scholar':
    case '6months':
      endDate.setDate(endDate.getDate() + 132);
      break;
    case 'summit':
    case '1year':
      endDate.setDate(endDate.getDate() + 246);
      break;
    default:
      endDate.setDate(endDate.getDate() + 22);
      break;
  }

  return { startDate, endDate };
}

router.post('/paymongo', async (req, res) => {
  try {
    console.log('🔔 [PAYMONGO WEBHOOK] Incoming request');
    console.log('🔔 [PAYMONGO WEBHOOK] Content-Type:', req.get('content-type') || '(none)');
    console.log('🔔 [PAYMONGO WEBHOOK] Signature header present:', !!(req.get('Paymongo-Signature') || req.get('paymongo-signature')));

    const webhookSecret = String(
      process.env.PAYMONGO_WEBHOOK_SECRET ||
      process.env.PAYMONG_WEBOOK_SECRET_KEY ||
      process.env.PAYMONGO_WEBHOOK_SECRET_KEY ||
      ''
    ).trim();
    if (!webhookSecret) {
      console.error('❌ [PAYMONGO WEBHOOK] Missing webhook secret in environment');
      return res.status(200).json({
        received: true,
        processed: false,
        error: 'PayMongo webhook secret is not configured'
      });
    }

    const signatureHeader = String(
      req.get('Paymongo-Signature') ||
      req.get('paymongo-signature') ||
      ''
    ).trim();
    if (!signatureHeader) {
      console.error('❌ [PAYMONGO WEBHOOK] Missing Paymongo-Signature header');
      return res.status(200).json({
        received: true,
        processed: false,
        error: 'Missing Paymongo-Signature header'
      });
    }

    const signatureParts = signatureHeader.split(',').reduce((acc, part) => {
      const [k, v] = part.split('=').map((s) => String(s || '').trim());
      if (k && v) acc[k] = v;
      return acc;
    }, {});
    const timestamp = String(signatureParts.t || '');
    const providedSignature = String(signatureParts.te || signatureParts.v1 || '');
    if (!timestamp || !providedSignature) {
      console.error('❌ [PAYMONGO WEBHOOK] Invalid signature format', {
        hasTimestamp: !!timestamp,
        hasProvidedSignature: !!providedSignature,
        signatureHeader
      });
      return res.status(200).json({
        received: true,
        processed: false,
        error: 'Invalid webhook signature format'
      });
    }

    const rawPayload =
      Buffer.isBuffer(req.body)
        ? req.body.toString('utf8')
        : JSON.stringify(req.body || {});
    console.log('🔔 [PAYMONGO WEBHOOK] Raw payload length:', rawPayload.length);
    const signedPayload = `${timestamp}.${rawPayload}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload)
      .digest('hex');

    const providedBuffer = Buffer.from(providedSignature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const validSignature =
      providedBuffer.length === expectedBuffer.length &&
      crypto.timingSafeEqual(providedBuffer, expectedBuffer);

    if (!validSignature) {
      console.error('❌ [PAYMONGO WEBHOOK] Signature verification failed', {
        timestamp,
        providedPrefix: providedSignature.slice(0, 12),
        expectedPrefix: expectedSignature.slice(0, 12),
        rawPayloadLength: rawPayload.length
      });
      return res.status(200).json({
        received: true,
        processed: false,
        error: 'Webhook signature verification failed'
      });
    }
    console.log('✅ [PAYMONGO WEBHOOK] Signature verified');

    let payload = {};
    try {
      payload = Buffer.isBuffer(req.body) ? JSON.parse(rawPayload) : (req.body || {});
      console.log('📦 [PAYMONGO WEBHOOK] Payload:', JSON.stringify(payload, null, 2));
    } catch (parseError) {
      console.error('❌ [PAYMONGO WEBHOOK] Failed to parse webhook payload', {
        message: parseError.message
      });
      return res.status(200).json({
        received: true,
        processed: false,
        error: 'Invalid JSON payload'
      });
    }

    const eventType = payload?.data?.attributes?.type;
    console.log('🔔 [PAYMONGO WEBHOOK] Event received:', eventType || '(missing type)');
    if (eventType !== 'checkout_session.payment.paid') {
      console.log('ℹ️ [PAYMONGO WEBHOOK] Ignoring non-paid event:', eventType);
      return res.status(200).json({ received: true, processed: false, ignored: true, eventType });
    }

    const eventId = String(payload?.data?.id || '');
    const resource =
      payload?.data?.attributes?.data ||
      payload?.data?.attributes ||
      payload?.data ||
      {};
    const checkoutSessionId = String(resource?.id || '');
    const checkoutAttributes = resource?.attributes || resource || {};
    const metadata = checkoutAttributes?.metadata || {};
    const referenceNumber = checkoutAttributes?.reference_number || '';
    const registrationId = String(metadata.registrationId || referenceNumber || '').trim();
    const planId = normalizePlanId(metadata.planId || metadata.plan || '');
    const payments = Array.isArray(checkoutAttributes?.payments) ? checkoutAttributes.payments : [];
    const paymentId = String(
      payments?.[0]?.id ||
      checkoutAttributes?.payment_intent_id ||
      checkoutSessionId ||
      eventId
    ).trim();
    console.log('🔎 [PAYMONGO WEBHOOK] Parsed identifiers', {
      eventId,
      checkoutSessionId,
      registrationId,
      paymentId,
      planId,
      metadataKeys: Object.keys(metadata || {})
    });

    let pending = null;
    if (registrationId) {
      pending = await PendingRegistration.findOne({ registrationId });
      console.log('🔎 [PAYMONGO WEBHOOK] Lookup by registrationId:', registrationId, 'found:', !!pending);
    }
    if (!pending && checkoutSessionId) {
      pending = await PendingRegistration.findOne({ paymongoCheckoutId: checkoutSessionId });
      console.log('🔎 [PAYMONGO WEBHOOK] Lookup by checkoutSessionId:', checkoutSessionId, 'found:', !!pending);
    }
    if (!pending) {
      console.error('❌ [PAYMONGO WEBHOOK] Pending registration not found', {
        registrationId,
        checkoutSessionId
      });
      return res.status(200).json({
        received: true,
        processed: false,
        error: 'Pending registration not found'
      });
    }

    if (pending.status === 'paid') {
      console.log('ℹ️ [PAYMONGO WEBHOOK] Already processed registration:', pending.registrationId);
      return res.status(200).json({ success: true, message: 'Already processed' });
    }

    const existingUserByEmail = await Student.findOne({ email: pending.email }).lean();
    const existingUserByUsername = await Student.findOne({ username: pending.username }).lean();
    if (existingUserByEmail || existingUserByUsername) {
      // Existing user refill flow: apply credits once per paymentId.
      const existing = await Student.findOne({
        $or: [{ email: pending.email }, { username: pending.username }]
      });
      if (existing && Array.isArray(existing.processedPaymentIds) && existing.processedPaymentIds.includes(paymentId)) {
        console.log('ℹ️ [PAYMONGO WEBHOOK] Duplicate webhook ignored, payment already processed for student', existing._id);
        return res.status(200).json({ received: true, processed: true, duplicate: true });
      }

      const normalizedPlanId = normalizePlanId(planId || pending.plan);
      const planCreditConfig = PLAN_CREDITS[normalizedPlanId] || { credits: 0, label: pending.plan || 'Plan' };
      const creditsToAdd = Number(planCreditConfig.credits || 0);
      const amountPaid = Number(pending.amount || 0);
      const creditTimestamp = new Date();

      const updateExisting = await Student.updateOne(
        { _id: existing._id, processedPaymentIds: { $ne: paymentId } },
        {
          $set: {
            paymentStatus: 'paid',
            paymentMethod: 'bank',
            paymentReference: paymentId,
            paymentPaidAt: creditTimestamp,
            subscriptionStatus: 'active',
            subscriptionPlan: normalizedPlanId || existing.subscriptionPlan || pending.plan
          },
          $inc: {
            creditBalance: creditsToAdd,
            totalCredits: creditsToAdd,
            totalCreditsEarned: creditsToAdd
          },
          $push: {
            processedPaymentIds: paymentId,
            creditHistory: {
              date: creditTimestamp,
              plan: planCreditConfig.label,
              credits: creditsToAdd,
              amountPaid,
              paymentId
            },
            creditTransactions: {
              date: creditTimestamp,
              type: 'purchase',
              plan: normalizedPlanId || pending.plan || '',
              description: `PayMongo refill (${planCreditConfig.label})`,
              credits: creditsToAdd,
              balanceAfter: (existing.creditBalance || 0) + creditsToAdd,
              amountPaid
            }
          }
        }
      );

      pending.status = 'paid';
      pending.paymongoEventId = eventId;
      pending.processedAt = new Date();
      if (checkoutSessionId) pending.paymongoCheckoutId = checkoutSessionId;
      await pending.save();
      console.log('✅ [PAYMONGO WEBHOOK] Existing student refill credited', {
        studentId: existing._id?.toString?.(),
        creditsToAdd,
        paymentId,
        modifiedCount: updateExisting.modifiedCount
      });
      return res.status(200).json({ received: true, processed: true, refill: true });
    }

    const normalizedPlanId = normalizePlanId(planId || pending.plan);
    const planCreditConfig = PLAN_CREDITS[normalizedPlanId] || { credits: 0, label: pending.plan || 'Plan' };
    const creditsToAdd = Number(planCreditConfig.credits || 0);
    const amountPaid = Number(pending.amount || 0);
    const { startDate, endDate } = computeSubscriptionDates(normalizedPlanId || pending.plan);
    const student = new Student({
      username: pending.username,
      email: pending.email,
      password: pending.passwordHash,
      parentName: pending.parentName || '',
      subscriptionPlan: normalizedPlanId || pending.plan,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      subscriptionStatus: 'active',
      paymentStatus: 'paid',
      paymentMethod: 'bank',
      paymentReference: paymentId,
      paymentPaidAt: new Date()
    });

    try {
      await student.save();
      console.log('✅ [PAYMONGO WEBHOOK] Student saved successfully', {
        studentId: student._id?.toString?.(),
        email: student.email,
        username: student.username,
        plan: student.subscriptionPlan
      });

      // Credit allocation via atomic $inc + $push and payment ID marker for idempotency.
      if (creditsToAdd > 0) {
        const creditTimestamp = new Date();
        const creditUpdate = await Student.updateOne(
          {
            _id: student._id,
            processedPaymentIds: { $ne: paymentId }
          },
          {
            $inc: {
              creditBalance: creditsToAdd,
              totalCredits: creditsToAdd,
              totalCreditsEarned: creditsToAdd
            },
            $push: {
              processedPaymentIds: paymentId,
              creditHistory: {
                date: creditTimestamp,
                plan: planCreditConfig.label,
                credits: creditsToAdd,
                amountPaid,
                paymentId
              },
              creditTransactions: {
                date: creditTimestamp,
                type: 'purchase',
                plan: normalizedPlanId || pending.plan || '',
                description: `PayMongo payment (${planCreditConfig.label})`,
                credits: creditsToAdd,
                balanceAfter: creditsToAdd,
                amountPaid
              }
            }
          }
        );
        console.log('✅ [PAYMONGO WEBHOOK] Credit allocation update result', {
          matchedCount: creditUpdate.matchedCount,
          modifiedCount: creditUpdate.modifiedCount,
          creditsToAdd,
          paymentId
        });
      } else {
        await Student.updateOne(
          { _id: student._id, processedPaymentIds: { $ne: paymentId } },
          { $push: { processedPaymentIds: paymentId } }
        );
      }
    } catch (saveError) {
      console.error('❌ [PAYMONGO WEBHOOK] Student save failed', {
        message: saveError.message,
        name: saveError.name,
        code: saveError.code,
        keyPattern: saveError.keyPattern || null,
        keyValue: saveError.keyValue || null
      });
      throw saveError;
    }

    pending.status = 'paid';
    pending.paymongoEventId = eventId;
    pending.processedAt = new Date();
    if (checkoutSessionId) pending.paymongoCheckoutId = checkoutSessionId;
    try {
      await pending.save();
      console.log('✅ [PAYMONGO WEBHOOK] Pending registration marked as paid', pending.registrationId);
    } catch (pendingSaveError) {
      console.error('❌ [PAYMONGO WEBHOOK] Failed to update pending registration status', {
        registrationId: pending.registrationId,
        message: pendingSaveError.message
      });
      throw pendingSaveError;
    }

    console.log('✅ [PAYMONGO WEBHOOK] checkout_session.payment.paid processed successfully');
    return res.status(200).json({ received: true, processed: true });
  } catch (error) {
    console.error('❌ [PAYMONGO WEBHOOK] Unhandled error', {
      message: error.message,
      name: error.name,
      stack: error.stack
    });
    return res.status(200).json({
      received: true,
      processed: false,
      error: error.message || 'Webhook processing failed'
    });
  }
});

module.exports = router;
