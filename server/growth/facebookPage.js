'use strict';

const Lead = require('../models/Lead');
const { accountFor, graph } = require('./metaConnect');

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
  return err;
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

module.exports = {
  clip,
  answersFromFieldData,
  leadFieldsFromGraph,
  saveFacebookLead,
  syncFacebookLeads,
  ingestLeadgen,
};
