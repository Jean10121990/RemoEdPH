/**
 * Shared PayMongo purchase credit application (webhook + client confirm).
 * Stacks via $inc on creditBalance; idempotent via processedPaymentIds.
 */
const Student = require('../models/Student');
const {
  PLAN_CREDITS,
  normalizePlanId,
  getPlanDurationMonths,
} = require('../config/planCredits');

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
        0,
      ],
    },
  };
}

function computeSubscriptionDates(plan) {
  const startDate = new Date();
  const endDate = new Date(startDate);
  const months = getPlanDurationMonths(plan);
  endDate.setMonth(endDate.getMonth() + months);
  return { startDate, endDate };
}

function buildGuardKeys({ idempotencyKey, paymongoPaymentId, checkoutSessionId }) {
  return [...new Set([idempotencyKey, paymongoPaymentId, checkoutSessionId].filter(Boolean))];
}

/**
 * Apply plan credits to an existing student after a paid PayMongo checkout.
 * @returns {Promise<{
 *   ok: boolean,
 *   duplicate?: boolean,
 *   creditsAdded?: number,
 *   availableBalance?: number,
 *   matchedCount?: number,
 *   modifiedCount?: number,
 *   error?: string
 * }>}
 */
async function applyExistingStudentPurchase({
  student,
  pending,
  planId,
  idempotencyKey,
  paymongoPaymentId,
  checkoutSessionId,
  paymongoEventId,
}) {
  if (!student || !pending) {
    return { ok: false, error: 'Missing student or pending registration' };
  }
  if (!idempotencyKey) {
    return { ok: false, error: 'Missing idempotency key' };
  }

  const guardKeys = buildGuardKeys({ idempotencyKey, paymongoPaymentId, checkoutSessionId });

  if (paymongoKeysOverlap(student.processedPaymentIds, guardKeys)) {
    const bal = Math.max(0, Number(student.creditBalance) || 0);
    return {
      ok: true,
      duplicate: true,
      creditsAdded: 0,
      availableBalance: bal,
    };
  }

  const normalizedPlanId = normalizePlanId(planId || pending.plan);
  const planCreditConfig = PLAN_CREDITS[normalizedPlanId] || { credits: 0, label: pending.plan || 'Plan' };
  const creditsToAdd = Number(planCreditConfig.credits || 0);
  const amountPaid = Number(pending.amount || 0);
  const creditTimestamp = new Date();
  const { startDate, endDate } = computeSubscriptionDates(normalizedPlanId || pending.plan);
  const balanceAfterPurchase = (Number(student.creditBalance) || 0) + creditsToAdd;
  const historyPaymentId = paymongoPaymentId || idempotencyKey;

  const updateExisting = await Student.updateOne(
    { _id: student._id, ...paymongoNotYetProcessedFilter(guardKeys) },
    {
      $set: {
        paymentStatus: 'paid',
        paymentMethod: 'paymongo',
        paymentReference: paymongoPaymentId || idempotencyKey,
        paymentPaidAt: creditTimestamp,
        subscriptionStatus: 'active',
        subscriptionPlan: normalizedPlanId || student.subscriptionPlan || pending.plan,
        subscriptionStartDate: startDate,
        subscriptionEndDate: endDate,
        accountStatus: 'active_subscriber',
        isSubscribed: true,
      },
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
        processedPaymentIds: idempotencyKey,
        creditHistory: {
          date: creditTimestamp,
          plan: planCreditConfig.label,
          credits: creditsToAdd,
          amountPaid,
          paymentId: historyPaymentId,
          entryType: 'purchase',
          balanceAfter: balanceAfterPurchase,
        },
      },
    }
  );

  if (updateExisting.matchedCount === 0) {
    const refreshed = await Student.findById(student._id).select('creditBalance processedPaymentIds').lean();
    if (refreshed && paymongoKeysOverlap(refreshed.processedPaymentIds, guardKeys)) {
      return {
        ok: true,
        duplicate: true,
        creditsAdded: 0,
        availableBalance: Math.max(0, Number(refreshed.creditBalance) || 0),
      };
    }
    return {
      ok: false,
      error: 'Could not credit student (idempotency filter matched 0)',
      matchedCount: 0,
    };
  }

  pending.status = 'paid';
  if (paymongoEventId) pending.paymongoEventId = paymongoEventId;
  pending.processedAt = new Date();
  if (checkoutSessionId) pending.paymongoCheckoutId = checkoutSessionId;
  try {
    await pending.save();
  } catch (pendErr) {
    console.error('[paymongoCreditApply] pending.save failed after credit apply', {
      message: pendErr.message,
      registrationId: pending.registrationId,
    });
  }

  const availableBalance = balanceAfterPurchase;
  return {
    ok: true,
    duplicate: false,
    credited: true,
    creditsAdded: creditsToAdd,
    availableBalance,
    matchedCount: updateExisting.matchedCount,
    modifiedCount: updateExisting.modifiedCount,
  };
}

/**
 * Whether a retrieved PayMongo checkout session resource looks paid.
 * Note: checkout session status "active" means still open — NOT paid.
 * @param {object} sessionData - PayMongo data object (type checkout_session)
 */
function isPaymongoCheckoutPaid(sessionData) {
  if (!sessionData || typeof sessionData !== 'object') return false;
  const attrs = sessionData.attributes || sessionData;

  const payments = Array.isArray(attrs.payments) ? attrs.payments : [];
  if (
    payments.some((p) => {
      const st = String(p?.attributes?.status || p?.status || '').toLowerCase();
      return st === 'paid' || st === 'succeeded';
    })
  ) {
    return true;
  }

  const paymentStatus = String(attrs.payment_status || '').toLowerCase();
  if (paymentStatus === 'paid') return true;

  // Bare checkout attributes.status === 'active' is NOT paid (session still open).
  const status = String(attrs.status || '').toLowerCase();
  if (status === 'paid') return true;

  const pi = attrs.payment_intent;
  if (pi && typeof pi === 'object') {
    const piSt = String(pi.attributes?.status || pi.status || '').toLowerCase();
    if (piSt === 'succeeded' || piSt === 'paid') return true;
  }

  return false;
}

/** Compact debug snapshot for unpaid / confirm logs (no full PII dump). */
function summarizeCheckoutPaymentsForLog(sessionData) {
  const attrs = sessionData?.attributes || sessionData || {};
  const payments = Array.isArray(attrs.payments) ? attrs.payments : [];
  return {
    checkoutId: sessionData?.id || '',
    status: attrs.status || '',
    payment_status: attrs.payment_status || '',
    attrKeys: Object.keys(attrs).slice(0, 40),
    paymentsCount: payments.length,
    paymentStatuses: payments.map((p) => ({
      id: p?.id || '',
      status: p?.attributes?.status || p?.status || '',
    })),
    paymentIntentStatus:
      attrs.payment_intent?.attributes?.status ||
      attrs.payment_intent?.status ||
      (typeof attrs.payment_intent === 'string' ? 'id-only' : ''),
  };
}

function extractPaymentIdFromCheckout(sessionData) {
  const attrs = sessionData?.attributes || sessionData || {};
  const payments = Array.isArray(attrs.payments) ? attrs.payments : [];
  // Prefer a paid payment if multiple attempts exist
  const paid = payments.find((p) => {
    const st = String(p?.attributes?.status || p?.status || '').toLowerCase();
    return st === 'paid' || st === 'succeeded';
  });
  const first = paid || payments[0];
  if (!first) return '';
  return String(first.id || first?.attributes?.id || '').trim();
}

module.exports = {
  paymongoKeysOverlap,
  paymongoNotYetProcessedFilter,
  computeSubscriptionDates,
  buildGuardKeys,
  applyExistingStudentPurchase,
  isPaymongoCheckoutPaid,
  summarizeCheckoutPaymentsForLog,
  extractPaymentIdFromCheckout,
  PLAN_CREDITS,
  normalizePlanId,
};
