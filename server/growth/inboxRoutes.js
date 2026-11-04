'use strict';

const express = require('express');
const crypto = require('crypto');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { upsertLead } = require('./leadService');
const { answerParent } = require('./aiAgent');

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

metaRouter.get('/meta', (req, res) => {
  const mode = req.query['hub.mode'];
  const token = req.query['hub.verify_token'];
  const challenge = req.query['hub.challenge'];
  if (mode === 'subscribe' && token && token === process.env.META_VERIFY_TOKEN) {
    return res.status(200).send(challenge);
  }
  return res.sendStatus(403);
});

metaRouter.post('/meta', async (req, res) => {
  if (!metaSignatureOk(req)) return res.sendStatus(403);
  const body = req.body || {};
  const text = (((body.entry || [])[0] || {}).messaging || [])[0];
  const msg = text && text.message && text.message.text;
  const from = text && text.sender && text.sender.id;
  if (msg && from) {
    const lead = await upsertLead({ name: 'Messenger ' + from, source: 'messenger', stage: 'Inquiry', phone: from });
    const convo = await Conversation.create({
      channel: 'messenger',
      externalThreadId: from,
      leadId: lead && lead._id,
      status: 'ai',
    });
    await Message.create({ conversationId: convo._id, direction: 'in', text: msg, sender: 'contact' });
    const answer = await answerParent(msg);
    if (answer.handoff) convo.status = 'needs_human';
    convo.lastMessageAt = new Date();
    await convo.save();
    await Message.create({ conversationId: convo._id, direction: 'out', text: answer.reply, sender: 'ai' });
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
