const express = require('express');
const crypto = require('crypto');
const Student = require('./models/Student');
const PendingRegistration = require('./models/PendingRegistration');
const PaymongoWebhookEvent = require('./models/PaymongoWebhookEvent');

const router = express.Router();
const {
  PLAN_CREDITS,
  normalizePlanId,
  getPlanDurationMonths,
} = require('./config/planCredits');

/** True if any idempotency key is already stored on the student (PayMongo retries / alternate ids). */
function paymongoKeysOverlap(processedIds, keys) {
  const arr = Array.isArray(processedIds) ? processedIds : [];
  const ks = [...new Set(keys.filter(Boolean))];
  return ks.some((k) => arr.includes(k));
}

/**
 * Atomic filter: processedPaymentIds must not intersect guard keys (prevents double-credit).
 * @param {string[]} guardKeys
 */
function paymongoNotYetProcessedFilter(guardKeys) {
  const keys = [...new Set(guardKeys.filter(Boolean))];
  if (keys.length === 0) {
    return { _id: { $exists: false } };
  }
  return {
    $expr: {
      $eq: [
        { $size: { $setIntersection: [{ $ifNull: ['$processedPaymentIds', []] }, keys] } },
        0
      ]
    }
  };
}

async function markPaymongoWebhookEventProcessed(eventId, eventType) {
  const id = String(eventId || '').trim();
  if (!id) return;
  try {
    await PaymongoWebhookEvent.create({
      eventId: id,
      eventType: String(eventType || 'checkout_session.payment.paid'),
    });
  } catch (e) {
    if (e.code !== 11000) {
      console.warn('[PAYMONGO WEBHOOK] Event ledger write:', e.message);
    }
  }
}

/**
 * PayMongo nests the checkout session under event.data.attributes.data.
 * Metadata may live on data.attributes.metadata (JSON:API resource shape).
 */
function extractCheckoutSessionContext(payload) {
  const eventAttrs = payload?.data?.attributes || {};
  const inner = eventAttrs.data;
  let checkoutSessionId = '';
  let checkoutAttributes = {};
  let metadata = {};

  if (inner && typeof inner === 'object') {
    if (inner.attributes && (inner.type === 'checkout_session' || inner.id)) {
      checkoutSessionId = String(inner.id || '');
      checkoutAttributes = inner.attributes || {};
      metadata = checkoutAttributes.metadata || {};
    } else if (inner.id) {
      checkoutSessionId = String(inner.id || '');
      checkoutAttributes = inner.attributes || inner;
      metadata = checkoutAttributes.metadata || {};
    }
  }

  if (!checkoutSessionId && payload?.data?.id && payload?.data?.type === 'checkout_session') {
    checkoutSessionId = String(payload.data.id || '');
    checkoutAttributes = payload.data.attributes || {};
    metadata = checkoutAttributes.metadata || {};
  }

  return {
    eventType: String(eventAttrs.type || ''),
    checkoutSessionId,
    checkoutAttributes,
    metadata: metadata && typeof metadata === 'object' ? metadata : {}
  };
}

function computeSubscriptionDates(plan) {
  const startDate = new Date();
  const endDate = new Date(startDate);
  const months = getPlanDurationMonths(plan);
  endDate.setMonth(endDate.getMonth() + months);
  return { startDate, endDate };
}

async function handlePaymongoWebhook(req, res) {
  const sendAck = (extra = {}) => {
    if (!res.headersSent) {
      return res.status(200).json({ received: true, ...extra });
    }
  };

  const rejectWebhook = (status, message) => {
    if (!res.headersSent) {
      return res.status(status).json({ error: message });
    }
  };

  try {
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('📥 [PAYMONGO WEBHOOK] POST /api/webhooks/paymongo');
    console.log('📥 [PAYMONGO WEBHOOK] Content-Type:', req.get('content-type') || '(none)');
    try {
      if (Buffer.isBuffer(req.body)) {
        const s = req.body.toString('utf8');
        console.log('📥 [PAYMONGO WEBHOOK] req.body is Buffer, length:', req.body.length);
        console.log(
          '📥 [PAYMONGO WEBHOOK] req.body as string (PayMongo payload):',
          s.length > 12000 ? s.slice(0, 12000) + '\n... [truncated]' : s
        );
      } else {
        console.log('📥 [PAYMONGO WEBHOOK] req.body JSON:', JSON.stringify(req.body, null, 2));
      }
      if (req.rawBody && Buffer.isBuffer(req.rawBody)) {
        console.log('📥 [PAYMONGO WEBHOOK] req.rawBody length:', req.rawBody.length);
      }
    } catch (bodyLogErr) {
      console.error('📥 [PAYMONGO WEBHOOK] Failed to log body:', bodyLogErr.message);
    }

    console.log('🔔 [PAYMONGO WEBHOOK] Signature header present:', !!(req.get('Paymongo-Signature') || req.get('paymongo-signature')));

    const webhookSecret = String(
      process.env.PAYMONGO_WEBHOOK_SECRET ||
      process.env.PAYMONG_WEBOOK_SECRET_KEY ||
      process.env.PAYMONGO_WEBHOOK_SECRET_KEY ||
      ''
    ).trim();
    if (!webhookSecret) {
      console.error('❌ [PAYMONGO WEBHOOK] Missing PAYMONGO_WEBHOOK_SECRET in environment');
      return rejectWebhook(503, 'Webhook signing is not configured');
    }

    const signatureHeader = String(
      req.get('Paymongo-Signature') ||
      req.get('paymongo-signature') ||
      ''
    ).trim();
    if (!signatureHeader) {
      console.error('❌ [PAYMONGO WEBHOOK] Missing Paymongo-Signature / paymongo-signature header');
      return rejectWebhook(401, 'Missing Paymongo-Signature header');
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
      return rejectWebhook(401, 'Invalid webhook signature format');
    }

    const tsNum = Number(timestamp);
    if (!Number.isFinite(tsNum)) {
      return rejectWebhook(401, 'Invalid webhook timestamp');
    }
    const maxSkew = Number(process.env.PAYMONGO_WEBHOOK_MAX_SKEW_SEC || 300);
    const skewSec = Math.abs(Math.floor(Date.now() / 1000) - tsNum);
    if (skewSec > maxSkew) {
      console.error('❌ [PAYMONGO WEBHOOK] Timestamp outside allowed window', { skewSec, maxSkew });
      return rejectWebhook(401, 'Webhook timestamp outside allowed window');
    }

    const bodyBuffer = Buffer.isBuffer(req.rawBody) ? req.rawBody : req.body;
    const rawPayload = Buffer.isBuffer(bodyBuffer)
      ? bodyBuffer.toString('utf8')
      : JSON.stringify(req.body || {});
    console.log('🔔 [PAYMONGO WEBHOOK] HMAC input: bodyBuffer is Buffer:', Buffer.isBuffer(bodyBuffer), '| rawPayload length:', rawPayload.length);
    if (!Buffer.isBuffer(bodyBuffer)) {
      console.error(
        '❌ [PAYMONGO WEBHOOK] WARNING: No Buffer body for HMAC. Use express.raw on /api/webhooks BEFORE bodyParser.json(). ' +
          'Signature verification will likely fail.'
      );
    }
    const signedPayload = `${timestamp}.${rawPayload}`;
    const expectedSignature = crypto
      .createHmac('sha256', webhookSecret)
      .update(signedPayload, 'utf8')
      .digest('hex');

    const providedBuffer = Buffer.from(providedSignature, 'utf8');
    const expectedBuffer = Buffer.from(expectedSignature, 'utf8');
    const lengthMatch = providedBuffer.length === expectedBuffer.length;
    let validSignature = false;
    try {
      validSignature = lengthMatch && crypto.timingSafeEqual(providedBuffer, expectedBuffer);
    } catch (sigErr) {
      console.error('❌ [PAYMONGO WEBHOOK] timingSafeEqual threw (unexpected):', sigErr.message);
      validSignature = false;
    }

    if (!validSignature) {
      console.error('❌ [PAYMONGO WEBHOOK] SIGNATURE VERIFICATION FAILED — request will NOT be processed', {
        timestamp,
        bodyIsBuffer: Buffer.isBuffer(req.body),
        rawPayloadLength: rawPayload.length,
        providedSigChars: providedSignature.length,
        expectedSigHexChars: expectedSignature.length,
        bufferLengthMatch: lengthMatch,
        providedPrefix: providedSignature.slice(0, 24),
        expectedPrefix: expectedSignature.slice(0, 24),
        hint: 'Confirm PAYMONGO_WEBHOOK_SECRET matches the signing secret in PayMongo Dashboard for this URL.'
      });
      return rejectWebhook(401, 'Webhook signature verification failed');
    }
    console.log('✅ [PAYMONGO WEBHOOK] Signature verified (HMAC SHA-256 OK, secret from PAYMONGO_WEBHOOK_SECRET)');

    let payload = {};
    try {
      payload = Buffer.isBuffer(bodyBuffer) ? JSON.parse(rawPayload) : (req.body || {});
      const serialized = JSON.stringify(payload, null, 2);
      if (serialized.length > 12000) {
        console.log('📦 [PAYMONGO WEBHOOK] Payload (truncated for logs):\n', serialized.slice(0, 12000) + '\n... [truncated]');
      } else {
        console.log('📦 [PAYMONGO WEBHOOK] Parsed JSON payload:\n', serialized);
      }
    } catch (parseError) {
      console.error('❌ [PAYMONGO WEBHOOK] Failed to parse webhook payload', {
        message: parseError.message,
        rawHead: String(rawPayload).slice(0, 400)
      });
      return rejectWebhook(400, 'Invalid JSON payload');
    }

    const ctx = extractCheckoutSessionContext(payload);
    const eventType = ctx.eventType || payload?.data?.attributes?.type;
    console.log('🔔 [PAYMONGO WEBHOOK] Event type:', eventType || '(missing type)');

    const paymongoEventId = String(payload?.data?.id || '').trim();
    if (eventType === 'checkout_session.payment.paid' && paymongoEventId) {
      const already = await PaymongoWebhookEvent.findOne({ eventId: paymongoEventId }).lean();
      if (already) {
        console.log('ℹ️ [PAYMONGO WEBHOOK] Duplicate event id (already processed):', paymongoEventId);
        return res.status(200).json({ received: true, duplicateEvent: true });
      }
    }

    if (eventType !== 'checkout_session.payment.paid') {
      console.log(
        'ℹ️ [PAYMONGO WEBHOOK] Not checkout_session.payment.paid — skipping DB logic. eventType=',
        eventType
      );
      return sendAck({ processed: false, ignored: true, eventType });
    }

    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
    console.log('✅ [PAYMONGO WEBHOOK] checkout_session.payment.paid — EVENT RECEIVED (will run DB logic)');
    console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

    const legacyResource =
      payload?.data?.attributes?.data ||
      payload?.data?.attributes ||
      payload?.data ||
      {};
    const checkoutSessionId = String(ctx.checkoutSessionId || legacyResource?.id || '').trim();
    const legacyAttrs = legacyResource?.attributes || legacyResource || {};
    const checkoutAttributes = { ...legacyAttrs, ...ctx.checkoutAttributes };
    let metadata = {
      ...(legacyAttrs?.metadata || {}),
      ...(checkoutAttributes?.metadata || {}),
      ...(ctx.metadata || {})
    };
    if (!metadata || Object.keys(metadata).length === 0) {
      console.warn('⚠️ [PAYMONGO WEBHOOK] metadata is empty — registrationId/plan may be missing. Inspect payload shape.', {
        hasAttributesData: !!payload?.data?.attributes?.data,
        innerDataKeys:
          payload?.data?.attributes?.data && typeof payload.data.attributes.data === 'object'
            ? Object.keys(payload.data.attributes.data)
            : []
      });
    } else {
      console.log('📋 [PAYMONGO WEBHOOK] Checkout metadata (keys):', Object.keys(metadata));
    }

    const referenceNumber = checkoutAttributes?.reference_number || '';
    const registrationId = String(metadata.registrationId || referenceNumber || '').trim();
    const planId = normalizePlanId(metadata.planId || metadata.plan || '');
    const payments = Array.isArray(checkoutAttributes?.payments) ? checkoutAttributes.payments : [];
    /** PayMongo payment resource id (for receipts / creditHistory.paymentId) */
    const paymongoPaymentId = String(
      payments?.[0]?.id || checkoutAttributes?.payment_intent_id || ''
    ).trim();
    /**
     * Single idempotency key per checkout: prefer checkout session id (stable across retries),
     * then payment id, then event id — prevents double-credit when webhook payload shape varies.
     */
    const idempotencyKey = String(
      checkoutSessionId || paymongoPaymentId || paymongoEventId || ''
    ).trim();
    console.log('🔎 [PAYMONGO WEBHOOK] Parsed identifiers', {
      eventId: paymongoEventId,
      checkoutSessionId,
      registrationId,
      paymongoPaymentId,
      idempotencyKey,
      planId,
      metadataKeys: Object.keys(metadata || {})
    });

    if (!idempotencyKey) {
      console.error('❌ [PAYMONGO WEBHOOK] Missing idempotency key (checkout session / payment / event id)');
      return sendAck({ processed: false, error: 'Missing idempotency key' });
    }

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
      return sendAck({ processed: false, error: 'Pending registration not found' });
    }

    if (pending.status === 'paid') {
      console.log('ℹ️ [PAYMONGO WEBHOOK] Already processed registration:', pending.registrationId);
      await markPaymongoWebhookEventProcessed(paymongoEventId, eventType);
      return sendAck({ processed: true, message: 'Already processed' });
    }

    const guardKeys = [idempotencyKey, paymongoPaymentId, checkoutSessionId];

    const existingUserByEmail = await Student.findOne({ email: pending.email }).lean();
    const existingUserByUsername = await Student.findOne({ username: pending.username }).lean();
    if (existingUserByEmail || existingUserByUsername) {
      // Existing user refill flow: student already registered before PayMongo (e.g. landing page flow).
      const existing = await Student.findOne({
        $or: [{ email: pending.email }, { username: pending.username }]
      });
      if (!existing) {
        console.error('❌ [PAYMONGO WEBHOOK] Inconsistency: email/username matched lean() but findOne returned null', {
          pendingEmail: pending.email,
          pendingUsername: pending.username
        });
        return sendAck({ processed: false, error: 'Student record not found for pending registration' });
      }

      console.log('👤 [PAYMONGO WEBHOOK] Branch: EXISTING STUDENT (refill / post-register payment)', {
        studentId: String(existing._id),
        email: existing.email,
        username: existing.username
      });

      if (paymongoKeysOverlap(existing.processedPaymentIds, guardKeys)) {
        console.log('ℹ️ [PAYMONGO WEBHOOK] Duplicate webhook ignored, payment already processed for student', existing._id);
        await markPaymongoWebhookEventProcessed(paymongoEventId, eventType);
        return sendAck({ processed: true, duplicate: true });
      }

      const normalizedPlanId = normalizePlanId(planId || pending.plan);
      const planCreditConfig = PLAN_CREDITS[normalizedPlanId] || { credits: 0, label: pending.plan || 'Plan' };
      const creditsToAdd = Number(planCreditConfig.credits || 0);
      const amountPaid = Number(pending.amount || 0);
      const creditTimestamp = new Date();
      const { startDate, endDate } = computeSubscriptionDates(normalizedPlanId || pending.plan);
      const balanceAfterPurchase = (existing.creditBalance || 0) + creditsToAdd;
      const historyPaymentId = paymongoPaymentId || idempotencyKey;

      const updateExisting = await Student.updateOne(
        { _id: existing._id, ...paymongoNotYetProcessedFilter(guardKeys) },
        {
          $set: {
            paymentStatus: 'paid',
            paymentMethod: 'paymongo',
            paymentReference: paymongoPaymentId || idempotencyKey,
            paymentPaidAt: creditTimestamp,
            subscriptionStatus: 'active',
            subscriptionPlan: normalizedPlanId || existing.subscriptionPlan || pending.plan,
            subscriptionStartDate: startDate,
            subscriptionEndDate: endDate,
            accountStatus: 'active_subscriber',
            isSubscribed: true,
          },
          $inc: {
            creditBalance: creditsToAdd,
            totalCreditsEarned: creditsToAdd,
            totalLessonsPurchased: creditsToAdd,
            'learningJourneyPurchasedByLevel.nursery': creditsToAdd,
            'learningJourneyPurchasedByLevel.kinder': creditsToAdd,
            'learningJourneyPurchasedByLevel.prep': creditsToAdd,
          },
          $push: {
            processedPaymentIds: idempotencyKey,
            creditHistory: {
              date: creditTimestamp,
              plan: planCreditConfig.label,
              credits: creditsToAdd,
              amountPaid,
              paymentId: historyPaymentId,
              entryType: 'purchase',
              balanceAfter: balanceAfterPurchase
            }
          }
        }
      );

      if (updateExisting.matchedCount === 0) {
        console.error('❌ [PAYMONGO WEBHOOK] Student.updateOne matched 0 documents (refill). Idempotency filter may exclude this payment.', {
          studentId: String(existing._id),
          idempotencyKey,
          paymongoPaymentId
        });
      } else {
        console.log('📊 [PAYMONGO WEBHOOK] Student.updateOne (refill)', {
          matchedCount: updateExisting.matchedCount,
          modifiedCount: updateExisting.modifiedCount
        });
      }

      pending.status = 'paid';
      pending.paymongoEventId = paymongoEventId;
      pending.processedAt = new Date();
      if (checkoutSessionId) pending.paymongoCheckoutId = checkoutSessionId;
      try {
        await pending.save();
      } catch (pendErr) {
        console.error('❌ [PAYMONGO WEBHOOK] pending.save failed after refill (payment already applied to student)', {
          message: pendErr.message,
          code: pendErr.code,
          registrationId: pending.registrationId
        });
        await markPaymongoWebhookEventProcessed(paymongoEventId, eventType);
        return sendAck({
          processed: true,
          refill: true,
          warning: 'Student updated but pending registration row not updated',
          error: pendErr.message
        });
      }
      console.log('✅ [PAYMONGO WEBHOOK] Existing student refill credited', {
        studentId: existing._id?.toString?.(),
        creditsToAdd,
        idempotencyKey,
        paymongoPaymentId,
        modifiedCount: updateExisting.modifiedCount
      });
      await markPaymongoWebhookEventProcessed(paymongoEventId, eventType);
      return sendAck({ processed: true, refill: true });
    }

    console.log('👤 [PAYMONGO WEBHOOK] Branch: NEW STUDENT — creating Student from PendingRegistration + metadata');
    console.log('📋 [PAYMONGO WEBHOOK] pending record:', {
      registrationId: pending.registrationId,
      username: pending.username,
      email: pending.email,
      plan: pending.plan,
      parentName: pending.parentName || '(empty)'
    });
    console.log('📋 [PAYMONGO WEBHOOK] webhook metadata (for audit):', {
      username: metadata.username,
      email: metadata.email,
      planId: metadata.planId,
      registrationId: metadata.registrationId
    });

    const normalizedPlanId = normalizePlanId(planId || pending.plan);
    const planCreditConfig = PLAN_CREDITS[normalizedPlanId] || { credits: 0, label: pending.plan || 'Plan' };
    const creditsToAdd = Number(planCreditConfig.credits || 0);
    const amountPaid = Number(pending.amount || 0);
    const { startDate, endDate } = computeSubscriptionDates(normalizedPlanId || pending.plan);
    const student = new Student({
      username: String(metadata.username || pending.username || '').trim() || pending.username,
      email: String(metadata.email || pending.email || '').trim() || pending.email,
      password: pending.passwordHash,
      parentName: pending.parentName || String(metadata.parentName || '').trim(),
      subscriptionPlan: normalizedPlanId || pending.plan,
      subscriptionStartDate: startDate,
      subscriptionEndDate: endDate,
      subscriptionStatus: 'active',
      paymentStatus: 'paid',
      paymentMethod: 'paymongo',
      paymentReference: paymongoPaymentId || idempotencyKey,
      paymentPaidAt: new Date(),
      accountStatus: 'active_subscriber',
      isSubscribed: true,
    });

    try {
      await student.save();
      console.log('✅ [PAYMONGO WEBHOOK] Student saved successfully', {
        studentId: student._id?.toString?.(),
        email: student.email,
        username: student.username,
        plan: student.subscriptionPlan
      });

      // Single creditHistory row + idempotency (no duplicate creditTransactions row for same payment).
      if (creditsToAdd > 0) {
        const creditTimestamp = new Date();
        const historyPaymentId = paymongoPaymentId || idempotencyKey;
        const creditUpdate = await Student.updateOne(
          {
            _id: student._id,
            ...paymongoNotYetProcessedFilter(guardKeys)
          },
          {
            $inc: {
              creditBalance: creditsToAdd,
              totalCreditsEarned: creditsToAdd,
              totalLessonsPurchased: creditsToAdd,
              'learningJourneyPurchasedByLevel.nursery': creditsToAdd,
              'learningJourneyPurchasedByLevel.kinder': creditsToAdd,
              'learningJourneyPurchasedByLevel.prep': creditsToAdd,
            },
            $push: {
              processedPaymentIds: idempotencyKey,
              creditHistory: {
                date: creditTimestamp,
                plan: planCreditConfig.label,
                credits: creditsToAdd,
                amountPaid,
                paymentId: historyPaymentId,
                entryType: 'purchase',
                balanceAfter: creditsToAdd
              }
            }
          }
        );
        console.log('✅ [PAYMONGO WEBHOOK] Credit allocation update result', {
          matchedCount: creditUpdate.matchedCount,
          modifiedCount: creditUpdate.modifiedCount,
          creditsToAdd,
          idempotencyKey,
          paymongoPaymentId
        });
      } else {
        await Student.updateOne(
          { _id: student._id, ...paymongoNotYetProcessedFilter(guardKeys) },
          { $push: { processedPaymentIds: idempotencyKey } }
        );
      }
    } catch (saveError) {
      const isDup = saveError.code === 11000;
      console.error('❌ [PAYMONGO WEBHOOK] Student.save() or credit update failed (non-fatal for PayMongo — returning 200)', {
        message: saveError.message,
        name: saveError.name,
        code: saveError.code,
        keyPattern: saveError.keyPattern || null,
        keyValue: saveError.keyValue || null,
        duplicateEmailOrUsername: isDup,
        hint: isDup
          ? 'Duplicate email/username: payment succeeded at PayMongo but Student was not created. Reconcile manually.'
          : undefined
      });
      return sendAck({
        processed: false,
        dbError: true,
        error: saveError.message,
        code: saveError.code,
        keyValue: saveError.keyValue || undefined
      });
    }

    pending.status = 'paid';
    pending.paymongoEventId = paymongoEventId;
    pending.processedAt = new Date();
    if (checkoutSessionId) pending.paymongoCheckoutId = checkoutSessionId;
    try {
      await pending.save();
      console.log('✅ [PAYMONGO WEBHOOK] Pending registration marked as paid', pending.registrationId);
    } catch (pendingSaveError) {
      console.error('❌ [PAYMONGO WEBHOOK] Failed to update pending registration status (Student may already exist)', {
        registrationId: pending.registrationId,
        message: pendingSaveError.message,
        code: pendingSaveError.code
      });
      await markPaymongoWebhookEventProcessed(paymongoEventId, eventType);
      return sendAck({
        processed: true,
        warning: 'Student saved but pending row not updated',
        error: pendingSaveError.message
      });
    }

    console.log('✅ [PAYMONGO WEBHOOK] checkout_session.payment.paid processed successfully');
    await markPaymongoWebhookEventProcessed(paymongoEventId, eventType);
    return sendAck({ processed: true });
  } catch (error) {
    console.error('❌ [PAYMONGO WEBHOOK] Unhandled error (top-level catch — still returning 200 to stop PayMongo retries)', {
      message: error.message,
      name: error.name,
      code: error.code,
      keyValue: error.keyValue,
      stack: error.stack
    });
    if (!res.headersSent) {
      return res.status(200).json({
        received: true,
        processed: false,
        error:
          process.env.NODE_ENV === 'production'
            ? 'Webhook processing failed'
            : String(error && error.message ? error.message : 'Webhook processing failed'),
      });
    }
  }
}

router.post('/paymongo', (req, res) => {
  handlePaymongoWebhook(req, res).catch((err) => {
    console.error('❌ [PAYMONGO WEBHOOK] Unhandled promise rejection (prevents Express 500):', {
      message: err.message,
      stack: err.stack
    });
    if (!res.headersSent) {
      res.status(200).json({
        received: true,
        processed: false,
        error: err.message || 'Webhook handler failed'
      });
    }
  });
});

module.exports = router;
