/**
 * Stored letters for the six account emails. A missing row or an empty html
 * field keeps the letter in emailService.js, so a blank save cannot send a blank receipt.
 * SMTP passwords are not stored here.
 */
const crypto = require('crypto');
const EmailTemplate = require('../models/EmailTemplate');

const KEYS = [
  { key: 'teacherRegistration', label: 'Teacher account' },
  { key: 'subscriptionConfirmation', label: 'Subscription receipt' },
  { key: 'assessmentResults', label: 'Assessment results' },
  { key: 'passwordReset', label: 'Password reset' },
  { key: 'teacherPipelineWelcome', label: 'Teacher pipeline welcome' },
  { key: 'teacherPipelineFail', label: 'Teacher pipeline update' },
];

const KEY_SET = new Set(KEYS.map((row) => row.key));
const RAW_HTML = new Set(['fullNameClause', 'reapplyBlock']);
const PREVIEW_MS = 15 * 60 * 1000;
const hmacKey = crypto.randomBytes(32);

let cache = Object.create(null);

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function fill(template, vars, html) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_]+)\s*\}\}/g, (_, key) => {
    if (!vars || !Object.prototype.hasOwnProperty.call(vars, key)) return '';
    const raw = vars[key] == null ? '' : String(vars[key]);
    if (!html || RAW_HTML.has(key)) return raw;
    return escapeHtml(raw);
  });
}

function visibleText(html) {
  return String(html || '')
    .replace(/<style[\s\S]*?<\/style>/gi, '')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/gi, ' ')
    .trim();
}

function resolve(key, fileResult, vars) {
  const row = cache[key];
  const stored = row && String(row.html || '').trim();
  if (!stored || !fileResult) return fileResult;
  const html = fill(row.html, vars, true);
  if (!visibleText(html)) return fileResult;
  const subject = fill(row.subject || '', vars, false).trim() || fileResult.subject;
  const text = fill(row.text || '', vars, false);
  return { subject, html, text: String(text || '').trim() ? text : fileResult.text };
}

function cleanHtml(html) {
  return String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
    .replace(/javascript\s*:/gi, '');
}

function replaceCache(rows) {
  const next = Object.create(null);
  (rows || []).forEach((row) => {
    if (row && row.key) next[row.key] = row;
  });
  cache = next;
}

async function loadSnapshot() {
  const rows = await EmailTemplate.find({}).lean();
  replaceCache(rows);
}

async function seedMissing(bodies) {
  const existing = await EmailTemplate.find({}, { key: 1 }).lean();
  const have = new Set(existing.map((row) => row.key));
  const missing = KEYS.filter((row) => !have.has(row.key) && bodies && bodies[row.key]);
  if (missing.length) {
    await EmailTemplate.insertMany(missing.map((row) => ({
      key: row.key,
      label: row.label,
      subject: String(bodies[row.key].subject || ''),
      html: String(bodies[row.key].html || ''),
      text: String(bodies[row.key].text || ''),
      updatedBy: '',
    })));
  }
  await loadSnapshot();
  return missing.length;
}

function listForAdmin(seeds) {
  return KEYS.map((spec) => {
    const row = cache[spec.key];
    const storedHtml = row && String(row.html || '').trim();
    const seed = (seeds && seeds[spec.key]) || {};
    return {
      key: spec.key,
      label: spec.label,
      subject: (row && String(row.subject || '').trim()) || seed.subject || '',
      html: storedHtml ? row.html : (seed.html || ''),
      text: (row && String(row.text || '').trim()) ? row.text : (seed.text || ''),
      usingFile: !storedHtml,
    };
  });
}

function sampleVars(key) {
  const samples = {
    teacherRegistration: {
      firstName: 'Ana',
      lastName: 'Reyes',
      username: 'ana.reyes',
      password: 'TempPass1',
      email: 'ana@example.com',
      loginUrl: 'https://remoedph.com/login/',
    },
    subscriptionConfirmation: {
      greetingName: 'Ana',
      planLabel: 'RemoSpark — Starter Bundle (3 Months)',
      amountText: '₱9,244.62',
      loginUrl: 'https://remoedph.com/login/',
    },
    assessmentResults: {
      childName: 'Sofie',
      cefrLevel: 'A1',
      score: '4',
      registerUrl: 'https://remoedph.com/trial.html',
    },
    passwordReset: {
      username: 'ana.reyes',
      userType: 'student',
      resetLink: 'https://remoedph.com/reset-password.html?token=sample',
    },
    teacherPipelineWelcome: {
      firstName: 'Ana',
      fullNameClause: ', <strong>Ana Reyes</strong>',
      fullNameClauseText: ', Ana Reyes',
      signupLink: 'https://remoedph.com/teacher-signup?invite=sample',
    },
    teacherPipelineFail: {
      firstName: 'Ana',
      reapplyBlock: '<p><strong>You may submit a new application on or after January 1, 2027.</strong></p>',
      reapplyText: '\nYou may submit a new application on or after January 1, 2027.',
    },
  };
  return samples[key] || {};
}

function renderPreview(key, subject, html, text) {
  const vars = sampleVars(key);
  return {
    subject: fill(subject, vars, false),
    html: fill(html, vars, true),
    text: fill(text, vars, false),
  };
}

function issuePreview(key, subject, html, text) {
  const payload = JSON.stringify({
    key,
    subject,
    html,
    text,
    exp: Date.now() + PREVIEW_MS,
  });
  const sig = crypto.createHmac('sha256', hmacKey).update(payload).digest('base64url');
  return Buffer.from(JSON.stringify({ payload, sig }), 'utf8').toString('base64url');
}

function previewMatches(token, key, subject, html, text) {
  try {
    const parsed = JSON.parse(Buffer.from(String(token || ''), 'base64url').toString('utf8'));
    const expected = crypto.createHmac('sha256', hmacKey).update(String(parsed.payload || '')).digest('base64url');
    const a = Buffer.from(expected);
    const b = Buffer.from(String(parsed.sig || ''));
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return false;
    const body = JSON.parse(parsed.payload);
    if (!body || body.exp < Date.now()) return false;
    return body.key === key && body.subject === subject && body.html === html && body.text === text;
  } catch (_err) {
    return false;
  }
}

async function saveTemplate(key, subject, html, text, updatedBy) {
  if (!KEY_SET.has(key)) return { ok: false, status: 404, error: 'Unknown letter.' };
  const cleanSubject = String(subject || '').trim().slice(0, 200);
  const clean = cleanHtml(html).slice(0, 100000);
  const cleanText = String(text || '').slice(0, 40000);
  if (clean.trim() && !cleanSubject) {
    return { ok: false, status: 400, error: 'Add a subject before saving this letter.' };
  }
  if (clean.trim() && !visibleText(renderPreview(key, cleanSubject, clean, cleanText).html)) {
    return { ok: false, status: 400, error: 'This letter is blank. Preview the built-in letter, or clear the box to keep it.' };
  }
  const spec = KEYS.find((row) => row.key === key);
  await EmailTemplate.findOneAndUpdate(
    { key },
    {
      $set: {
        label: spec.label,
        subject: cleanSubject,
        html: clean.trim() ? clean : '',
        text: cleanText,
        updatedBy: String(updatedBy || '').slice(0, 80),
      },
      $setOnInsert: { key },
    },
    { upsert: true, new: true }
  );
  await loadSnapshot();
  return { ok: true, usingFile: !clean.trim() };
}

module.exports = {
  KEYS,
  fill,
  resolve,
  seedMissing,
  loadSnapshot,
  listForAdmin,
  sampleVars,
  renderPreview,
  issuePreview,
  previewMatches,
  saveTemplate,
  visibleText,
  cleanHtml,
};
