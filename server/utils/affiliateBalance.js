'use strict';

const Referral = require('../models/Referral');
const AffiliateRecurringLedger = require('../models/AffiliateRecurringLedger');

function nextAffiliatePayoutDate(now = new Date()) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Manila',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
  }).formatToParts(now);
  const y = Number(parts.find((p) => p.type === 'year').value);
  const m = Number(parts.find((p) => p.type === 'month').value);
  const d = Number(parts.find((p) => p.type === 'day').value);
  const last = new Date(Date.UTC(y, m, 0)).getUTCDate();
  const target = d <= 15 ? 15 : last;
  return `${y}-${String(m).padStart(2, '0')}-${String(target).padStart(2, '0')}`;
}

async function affiliateBalancePhp(affiliate) {
  const affiliateId = String(affiliate._id || affiliate.id || '');
  const [refs, ledger] = await Promise.all([
    Referral.find({ ownerType: 'affiliate', ownerId: affiliateId, status: 'successful' })
      .select('commissionAmount')
      .lean(),
    AffiliateRecurringLedger.find({ affiliateId }).select('amountPhp').lean(),
  ]);
  const upfront = refs.reduce((s, r) => s + (Number(r.commissionAmount) || 0), 0);
  const recurring = ledger.reduce((s, r) => s + (Number(r.amountPhp) || 0), 0);
  const paid = (affiliate.withdrawals || [])
    .filter((w) => w.status === 'paid' || w.status === 'requested')
    .reduce((s, w) => s + (Number(w.amountPhp) || 0), 0);
  return {
    earnedPhp: Math.round((upfront + recurring) * 100) / 100,
    reservedPhp: Math.round(paid * 100) / 100,
    availablePhp: Math.round((upfront + recurring - paid) * 100) / 100,
    nextPayoutDate: nextAffiliatePayoutDate(),
  };
}

function publicAffiliateName(name) {
  const parts = String(name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Affiliate';
  if (parts.length === 1) return parts[0];
  return `${parts[0]} ${parts[parts.length - 1][0].toUpperCase()}.`;
}

module.exports = {
  nextAffiliatePayoutDate,
  affiliateBalancePhp,
  publicAffiliateName,
};
