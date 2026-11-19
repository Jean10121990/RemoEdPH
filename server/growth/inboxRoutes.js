'use strict';

const express = require('express');
const crypto = require('crypto');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const Lead = require('../models/Lead');
const { upsertLead } = require('./leadService');
const { answerParent } = require('./aiAgent');
const { ingestLeadgen } = require('./facebookPage');
const { sendMessengerWelcome, messengerFirstName } = require('../services/messengerService');

const metaRouter = express.Router();
const chatRouter = express.Router();

function metaSignatureOk(req) {
  const secret = process.env.META_APP_SECRET || '';
  const header = String(req.get('x-hub-signature-256') || '');
  if (!secret || !header.startsWith('sha256=')) return false;
  const raw = req.rawBody || Buffer.from('');
  const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(raw).digest('hex');
  const a = Buffer.from(header);
  const b = Buffer.from(expected);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

function verifyMeta(req, res) {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
}

async function welcomeMessengerLead(psid) {
  const id = String(psid || '').trim().slice(0, 80);
  if (!id) return;
  let lead = await Lead.findOne({ messengerPsid: id });
  if (!lead) {
    const first = await messengerFirstName(id);
    try {
      lead = await Lead.create({
        messengerPsid: id,
        source: 'messenger',
        stage: 'Inquiry',
        name: first,
      });
    } catch (err) {
      if (!err || err.code !== 11000) throw err;
      lead = await Lead.findOne({ messengerPsid: id });
    }
  }
  if (!lead) return;
  const claimed = await Lead.findOneAndUpdate(
    { _id: lead._id, welcomeMessengerSent: { $ne: true } },
    { $set: { welcomeMessengerSent: true, welcomeMessengerSentAt: new Date() } }
  );
  if (!claimed) return;
  const firstName = String(lead.name || '').trim().split(/\s+/)[0];
  try {
    await sendMessengerWelcome({ psid: id, firstName });
  } catch (err) {
    await Lead.updateOne(
      { _id: lead._id },
      { $set: { welcomeMessengerSent: false, welcomeMessengerSentAt: null } }
    ).catch(function () {});
    console.error('messenger welcome:', err && err.message ? err.message : err);
  }
}

async function handleMetaBody(body) {
  const entries = Array.isArray(body && body.entry) ? body.entry : [];
  for (const entry of entries) {
    const messaging = Array.isArray(entry && entry.messaging) ? entry.messaging : [];
    for (const event of messaging) {
      if (!event || (event.message && event.message.is_echo)) continue;
      if (!event.message && !event.postback) continue;
      const psid = event.sender && event.sender.id;
      if (!psid) continue;
      try {
        await welcomeMessengerLead(psid);
      } catch (err) {
        console.error('messenger webhook:', err && err.message ? err.message : err);
      }
    }
    const changes = Array.isArray(entry && entry.changes) ? entry.changes : [];
    for (const change of changes) {
      if (!change || change.field !== 'leadgen') continue;
      try {
        await ingestLeadgen(change.value || {});
      } catch (err) {
        console.error('leadgen webhook:', err && err.message ? err.message : err);
      }
    }
  }
}

metaRouter.get(['/meta', '/facebook'], verifyMeta);

metaRouter.post(['/meta', '/facebook'], async (req, res) => {
  if (!metaSignatureOk(req)) return res.sendStatus(403);
  try {
    await handleMetaBody(req.body || {});
  } catch (err) {
    console.error('facebook webhook:', err && err.message ? err.message : err);
  }
  res.sendStatus(200);
});

const chatHits = new Map();
chatRouter.post('/chat', async (req, res) => {
  const ip = req.ip || 'local';
  const now = Date.now();
  const prev = chatHits.get(ip) || [];
  const recent = prev.filter((t) => now - t < 60000);
  if (recent.length >= 20) return res.status(429).json({ success: false, error: 'Too many messages' });
  recent.push(now);
  chatHits.set(ip, recent);
  const text = String((req.body && req.body.text) || '').trim().slice(0, 2000);
  if (!text) return res.status(400).json({ success: false, error: 'Message required' });
  if (process.env.AI_WEBCHAT_ENABLED === '0') {
    const rules = require('./aiAgent').ruleReply(text);
    return res.json({ success: true, reply: rules.reply, handoff: !!rules.handoff, source: 'rules' });
  }
  const lead = await upsertLead({
    name: String((req.body && req.body.name) || ''),
    email: String((req.body && req.body.email) || ''),
    source: 'webchat',
    stage: 'Inquiry',
  });
  const convo = await Conversation.create({ channel: 'webchat', leadId: lead && lead._id, status: 'ai' });
  await Message.create({ conversationId: convo._id, direction: 'in', text, sender: 'contact' });
  const answer = await answerParent(text);
  if (answer.handoff) {
    convo.status = 'needs_human';
    await convo.save();
  }
  await Message.create({ conversationId: convo._id, direction: 'out', text: answer.reply, sender: 'ai' });
  res.json({ success: true, reply: answer.reply, handoff: !!answer.handoff, source: answer.source });
});

module.exports = { metaRouter, chatRouter };
