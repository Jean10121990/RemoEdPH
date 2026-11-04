'use strict';

const CampaignEvent = require('../models/CampaignEvent');

const DAILY_CAP = 300;

async function sentToday() {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return CampaignEvent.countDocuments({ type: 'queued', createdAt: { $gte: start } });
}

async function queueCampaign({ campaignId, subject, html, emails }) {
  const key = process.env.BREVO_API_KEY || '';
  const list = (emails || []).map((e) => String(e || '').trim()).filter(Boolean);
  const used = await sentToday();
  const room = Math.max(0, DAILY_CAP - used);
  const batch = list.slice(0, room);
  if (!key) {
    return { queued: 0, skipped: list.length, reason: 'BREVO_API_KEY unset' };
  }
  for (const email of batch) {
    const unsub = `https://remoedph.com/unsubscribe?email=${encodeURIComponent(email)}`;
    const body = `${html}<p><a href="${unsub}">Unsubscribe</a></p>`;
    const res = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: { 'api-key': key, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sender: { email: 'support@remoedph.com', name: 'RemoEd' },
        to: [{ email }],
        subject,
        htmlContent: body,
      }),
    });
    if (res.ok) {
      await CampaignEvent.create({ campaignId, email, type: 'queued' });
    }
  }
  return { queued: batch.length, skipped: list.length - batch.length };
}

async function recordBrevoEvent(body) {
  const event = String((body && body.event) || '');
  const email = String((body && body.email) || '');
  const campaignId = String((body && (body.campaign_id || body['campaign-id'])) || '');
  const type = event === 'opened' || event === 'open' ? 'open'
    : event === 'click' ? 'click'
    : event === 'unsubscribed' ? 'unsubscribed'
    : '';
  if (!type || !email) return null;
  return CampaignEvent.create({ campaignId, email, type });
}

async function markCampaignPaid(email) {
  const since = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000);
  const queued = await CampaignEvent.findOne({
    email: String(email || '').trim(),
    type: 'queued',
    createdAt: { $gte: since },
  }).lean();
  if (!queued) return false;
  const already = await CampaignEvent.findOne({ email: queued.email, campaignId: queued.campaignId, type: 'paid' }).lean();
  if (already) return false;
  await CampaignEvent.create({ campaignId: queued.campaignId, email: queued.email, type: 'paid' });
  return true;
}

module.exports = { queueCampaign, recordBrevoEvent, markCampaignPaid, DAILY_CAP };
