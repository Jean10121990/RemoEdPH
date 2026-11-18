'use strict';

const Lead = require('../models/Lead');
const Conversation = require('../models/Conversation');
const Message = require('../models/Message');
const { accountFor, graph } = require('./metaConnect');
const { upsertLead } = require('./leadService');

function clip(value, max) {
  return String(value == null ? '' : value).replace(/<[^>]*>/g, '').trim().slice(0, max);
}

function answersFromFieldData(fieldData) {
  const out = {};
  const rows = Array.isArray(fieldData) ? fieldData : [];
  rows.slice(0, 30).forEach((row) => {
    const key = clip(row && row.name, 80).replace(/\./g, '_');
    if (!key || Object.prototype.hasOwnProperty.call(out, key)) return;
    const values = Array.isArray(row && row.values) ? row.values : [];
    out[key] = clip(values.map((item) => String(item || '')).join(', '), 500);
  });
  return out;
}

function pickAnswer(answers, names) {
  const keys = Object.keys(answers || {});
  for (let i = 0; i < names.length; i += 1) {
    const want = names[i];
    const hit = keys.find((key) => {
      const norm = key.toLowerCase().replace(/\s+/g, '_');
      return norm === want || norm.includes(want);
    });
    if (hit && answers[hit]) return answers[hit];
  }
  return '';
}

function leadFieldsFromGraph(row, form) {
  const answers = answersFromFieldData(row && row.field_data);
  const email = pickAnswer(answers, ['email']).toLowerCase();
  const phone = pickAnswer(answers, ['phone', 'mobile']);
  const full = pickAnswer(answers, ['full_name']);
  const joined = [pickAnswer(answers, ['first_name']), pickAnswer(answers, ['last_name'])].filter(Boolean).join(' ');
  return {
    facebookLeadId: clip(row && row.id, 80),
    formId: clip((form && form.id) || (row && row.form_id), 80),
    formName: clip(form && form.name, 200),
    fieldAnswers: answers,
    name: clip(full || joined, 200),
    email: clip(email, 200).toLowerCase(),
    phone: clip(phone, 40),
    createdTime: row && row.created_time ? new Date(row.created_time) : new Date(),
  };
}

async function saveFacebookLead(fields) {
  const facebookLeadId = clip(fields && fields.facebookLeadId, 80);
  if (!facebookLeadId) return null;
  const when = fields.createdTime instanceof Date && !Number.isNaN(fields.createdTime.getTime())
    ? fields.createdTime
    : new Date();
  return Lead.findOneAndUpdate(
    { facebookLeadId },
    {
      $set: {
        facebookLeadId,
        formId: clip(fields.formId, 80),
        formName: clip(fields.formName, 200),
        fieldAnswers: fields.fieldAnswers || {},
        source: 'facebook',
        name: clip(fields.name, 200),
        email: clip(fields.email, 200).toLowerCase(),
        phone: clip(fields.phone, 40),
        lastContactAt: when,
      },
      $setOnInsert: { stage: 'Inquiry' },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

async function listAll(path, token) {
  const rows = [];
  let after = '';
  for (let page = 0; page < 8; page += 1) {
    const extra = (path.includes('?') ? '&' : '?') + 'limit=25' + (after ? '&after=' + encodeURIComponent(after) : '');
    const data = await graph(path + extra, token);
    const batch = Array.isArray(data.data) ? data.data : [];
    rows.push(...batch);
    const nextAfter = data.paging && data.paging.cursors && data.paging.cursors.after;
    if (!nextAfter || nextAfter === after || !batch.length) break;
    after = nextAfter;
  }
  return rows;
}

async function pageAccount() {
  const account = await accountFor('facebook');
  if (!account) {
    const err = new Error('Connect the Facebook Page in Marketing Hub, then try again.');
    err.code = 'NOT_CONNECTED';
    throw err;
  }
  return account;
}

function readableFacebookError(err) {
  const message = err && err.message ? String(err.message) : '';
  if (/pages_manage_ads/i.test(message)) {
    const next = new Error('Facebook needs permission to read lead forms. Open Posts, click Connect Facebook, allow the ads permission, then sync again.');
    next.code = 'NOT_CONNECTED';
    return next;
  }
  if (/pages_messaging|pages_read_engagement|conversation/i.test(message)) {
    const next = new Error('Facebook needs permission to read Page messages. Open Posts, click Reconnect, allow messaging, then open Messages again.');
    next.code = 'NOT_CONNECTED';
    return next;
  }
  return err;
}

async function ensureMessengerThread(psid, name, when) {
  const id = clip(psid, 80);
  if (!id) return null;
  let convo = await Conversation.findOne({ channel: 'messenger', externalThreadId: id });
  const label = clip(name, 200);
  if (!convo) {
    const lead = await upsertLead({
      name: label || ('Messenger ' + id.slice(-6)),
      source: 'messenger',
      stage: 'Inquiry',
      phone: id,
    });
    convo = await Conversation.create({
      channel: 'messenger',
      externalThreadId: id,
      leadId: lead && lead._id,
      status: 'open',
      lastMessageAt: when || new Date(),
    });
    return convo;
  }
  if (label && convo.leadId) {
    await Lead.updateOne(
      { _id: convo.leadId, name: { $regex: /^Messenger / } },
      { $set: { name: label } }
    );
  }
  return convo;
}

async function saveThreadMessage(convo, row, pageId) {
  const externalId = clip(row && row.id, 200);
  const text = clip((row && (row.message || row.snippet)) || '', 2000);
  if (!text) return;
  if (externalId) {
    const dup = await Message.findOne({ conversationId: convo._id, externalId }).select('_id').lean();
    if (dup) return;
  }
  const fromId = row && row.from && row.from.id ? String(row.from.id) : '';
  const outbound = !!(fromId && pageId && fromId === String(pageId));
  const created = row && row.created_time ? new Date(row.created_time) : new Date();
  await Message.create({
    conversationId: convo._id,
    direction: outbound ? 'out' : 'in',
    text,
    sender: outbound ? 'human' : 'contact',
    externalId,
    createdAt: Number.isNaN(created.getTime()) ? new Date() : created,
  });
}

async function syncMessengerThreads() {
  const account = await pageAccount();
  let threads;
  try {
    threads = await listAll(
      '/' + account.externalId + '/conversations?platform=MESSENGER&fields=id,updated_time,snippet,participants',
      account.token
    );
  } catch (err) {
    throw readableFacebookError(err);
  }
  let synced = 0;
  for (const thread of threads) {
    if (!thread || !thread.id || synced >= 40) break;
    const people = (thread.participants && thread.participants.data) || [];
    const person = people.find((row) => row && String(row.id) !== String(account.externalId));
    if (!person || !person.id) continue;
    const when = thread.updated_time ? new Date(thread.updated_time) : new Date();
    const convo = await ensureMessengerThread(person.id, person.name, when);
    if (!convo) continue;
    let messages = [];
    try {
      const detail = await graph(
        '/' + thread.id + '?fields=messages.limit(25){id,message,from,created_time}',
        account.token
      );
      messages = (detail.messages && detail.messages.data) || [];
    } catch (_err) {
      messages = [];
    }
    for (const row of messages) {
      await saveThreadMessage(convo, row, account.externalId);
    }
    if (!messages.length && thread.snippet) {
      const existing = await Message.findOne({ conversationId: convo._id }).select('_id').lean();
      if (!existing) {
        await saveThreadMessage(convo, {
          message: thread.snippet,
          from: { id: person.id },
          created_time: thread.updated_time,
        }, account.externalId);
      }
    }
    if (when && !Number.isNaN(when.getTime()) && (!convo.lastMessageAt || when > convo.lastMessageAt)) {
      convo.lastMessageAt = when;
      await convo.save();
    }
    synced += 1;
  }
  return { synced };
}

async function listMessengerThreads() {
  const rows = await Conversation.find({ channel: 'messenger' })
    .sort({ lastMessageAt: -1 })
    .limit(100)
    .select('channel status lastMessageAt leadId externalThreadId')
    .lean();
  const leadIds = rows.map((row) => row.leadId).filter(Boolean);
  const leads = leadIds.length
    ? await Lead.find({ _id: { $in: leadIds } }).select('name').lean()
    : [];
  const names = {};
  leads.forEach((lead) => { names[String(lead._id)] = lead.name || ''; });
  return rows.map((row) => ({
    _id: row._id,
    channel: row.channel,
    status: row.status,
    lastMessageAt: row.lastMessageAt,
    name: names[String(row.leadId)] || 'Facebook',
  }));
}

async function syncFacebookLeads() {
  const account = await pageAccount();
  let forms;
  try {
    forms = await listAll('/' + account.externalId + '/leadgen_forms?fields=id,name', account.token);
  } catch (err) {
    throw readableFacebookError(err);
  }
  let synced = 0;
  for (const form of forms) {
    if (!form || !form.id || synced >= 200) break;
    const leads = await listAll('/' + form.id + '/leads?fields=id,created_time,field_data', account.token);
    for (const row of leads) {
      if (synced >= 200) break;
      const saved = await saveFacebookLead(leadFieldsFromGraph(row, form));
      if (saved) synced += 1;
    }
  }
  return { synced, forms: forms.length };
}

async function ingestLeadgen(value) {
  const leadgenId = clip(value && value.leadgen_id, 80);
  if (!leadgenId) return null;
  const account = await pageAccount();
  const row = await graph('/' + leadgenId + '?fields=id,created_time,field_data,form_id', account.token);
  let formName = '';
  const formId = clip((value && value.form_id) || row.form_id, 80);
  if (formId) {
    try {
      const form = await graph('/' + formId + '?fields=name', account.token);
      formName = form.name || '';
    } catch (_err) { /* the lead still saves with the form id */ }
  }
  return saveFacebookLead(leadFieldsFromGraph(row, { id: formId, name: formName }));
}

async function sendPageMessage(psid, text) {
  const account = await pageAccount();
  const url = new URL('https://graph.facebook.com/v21.0/me/messages');
  url.searchParams.set('access_token', account.token);
  let res;
  try {
    res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        recipient: { id: String(psid) },
        message: { text: String(text || '').slice(0, 2000) },
      }),
    });
  } catch (_err) {
    throw new Error('Could not reach Facebook');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    throw new Error((data.error && data.error.message) || 'Facebook did not send the reply.');
  }
  return data;
}

module.exports = {
  clip,
  answersFromFieldData,
  leadFieldsFromGraph,
  saveFacebookLead,
  syncFacebookLeads,
  ingestLeadgen,
  sendPageMessage,
  syncMessengerThreads,
  listMessengerThreads,
};
