/**
 * Phase 2 public copy. Text blocks are plain text. Legal blocks are sanitized HTML.
 * Unpublished or missing blocks are omitted so the HTML file stays on the page.
 * Culture block order is fixed in the page. This service does not reorder sections.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const createDOMPurify = require('isomorphic-dompurify');
const PageBlock = require('../models/PageBlock');
const FaqEntry = require('../models/FaqEntry');
const { getSetting } = require('./siteSettings');

const DOMPurify = createDOMPurify;
const TTL_MS = 5 * 60 * 1000;
const MARKETING_PAGES = new Set(['home', 'about', 'register']);
const HTML_PAGES = new Set(['privacy', 'terms', 'parent-terms', 'teacher-privacy', 'teacher-terms']);

const TEXT = [
  ['home', 'hero_title', 'Hero title', 'Help your 3–6 year old speak English with confidence, from home'],
  ['home', 'hero_lead', 'Hero lead', 'Take the free 2-minute assessment, get your child\'s English level, and try a free interactive lesson. No card needed.'],
  ['home', 'hero_trust', 'Hero trust line', 'Live classes are 25 minutes with a teacher. The free lesson is separate. No card needed.'],
  ['home', 'benefits_title', 'Why Learn at Home title', 'Why Learn at Home?'],
  ['home', 'b_safe_t', 'Safe title', 'Safe & Comfortable'],
  ['home', 'b_safe_p', 'Safe text', 'Learn in the safety and comfort of your own home. No commute needed or worry about safety!'],
  ['home', 'b_flex_t', 'Flexible title', 'Flexible Schedule'],
  ['home', 'b_flex_p', 'Flexible text', 'Choose class times that work for your family. Book sessions that fit your family\'s routine.'],
  ['home', 'b_fam_t', 'Family title', 'Family Involvement'],
  ['home', 'b_fam_p', 'Family text', 'Parents can watch and support their child\'s learning journey together!'],
  ['home', 'b_fun_t', 'Fun title', 'Fun & Interactive'],
  ['home', 'b_fun_p', 'Fun text', 'Play games, do activities, and learn through fun interactive lessons!'],
  ['home', 'b_teach_t', 'Teachers title', 'Expert Teachers'],
  ['home', 'b_teach_p', 'Teachers text', 'Learn from experienced, friendly teachers who love teaching kids!'],
  ['home', 'b_easy_t', 'Easy title', 'Easy to Use'],
  ['home', 'b_easy_p', 'Easy text', 'Simple platform designed for kids. Easy for parents to manage too!'],
  ['home', 'who_title', 'Who we are title', 'Who we are'],
  ['home', 'who_p1', 'Who we are paragraph', 'RemoEd is a Filipino ESL start-up empowering kids across Asia with an accessible, God-centered online education that fosters English proficiency, moral integrity, and environmental stewardship—investing our grace-given success back into local communities.'],
  ['home', 'who_p2', 'Who we are principles line', 'Our principles emphasize a Christian worldview, honoring each person, and uphold the biblical distinction of gender in all conduct.'],
  ['home', 'how_title', 'How it works title', 'How It Works'],
  ['home', 'how_1_t', 'Step 1 title', 'Take the 2-minute quiz'],
  ['home', 'how_1_p', 'Step 1 text', 'A few questions about your child. No card needed.'],
  ['home', 'how_2_t', 'Step 2 title', 'Get your child\'s English level'],
  ['home', 'how_2_p', 'Step 2 text', 'See the level that fits how they speak today.'],
  ['home', 'how_3_t', 'Step 3 title', 'Choose a plan and book live classes'],
  ['home', 'how_3_p', 'Step 3 text', 'Pick a time that fits your family and meet a real teacher.'],
  ['home', 'plan_spark_tag', 'RemoSpark headline', 'Spark their curiosity.'],
  ['home', 'plan_steady_tag', 'RemoSteady headline', 'Building a routine.'],
  ['home', 'plan_scholar_tag', 'RemoScholar headline', 'Mastering the basics.'],
  ['home', 'plan_summit_tag', 'RemoSummit headline', 'Reaching the peak.'],
  ['home', 'final_title', 'Final heading', 'Ready to see your child\'s level?'],
  ['home', 'final_note', 'Final note', 'The quiz is free. No card needed.'],
  ['about', 'about_who_title', 'Who we are title', 'Who we are?'],
  ['about', 'about_who_p', 'Who we are paragraph', 'RemoEd is a Filipino ESL start-up empowering kids across Asia with an accessible, God-centered online education that fosters English proficiency, moral integrity, and environmental stewardship—investing our grace-given success back into local communities.'],
  ['about', 'principles_title', 'Principles title', 'Foundational Principles of RemoEd Culture'],
  ['about', 'principles_lead', 'Principles lead', 'Our principles emphasize a Christian worldview, honoring each person, and uphold the biblical distinction of gender in all conduct.'],
  ['about', 'principle_1_t', 'Principle 1 title', 'Christian worldview'],
  ['about', 'principle_1_p', 'Principle 1 text', 'Faith shapes how we teach, serve, and grow together.'],
  ['about', 'principle_2_t', 'Principle 2 title', 'Honor each person'],
  ['about', 'principle_2_p', 'Principle 2 text', 'Every child, parent, and teacher is treated with dignity and care.'],
  ['about', 'principle_3_t', 'Principle 3 title', 'Biblical distinction'],
  ['about', 'principle_3_p', 'Principle 3 text', 'We uphold the biblical distinction of gender in all conduct.'],
  ['about', 'pillars_title', 'Pillars title', 'Core Cultural Pillars'],
  ['about', 'pillar_1_t', 'Pillar 1 title', 'Joyful Learning'],
  ['about', 'pillar_1_p', 'Pillar 1 text', 'Nurture safe, playful, inclusive learning environments.'],
  ['about', 'pillar_2_t', 'Pillar 2 title', 'Respect & Care'],
  ['about', 'pillar_2_p', 'Pillar 2 text', 'Show warmth and dignity to everyone involved.'],
  ['about', 'pillar_3_t', 'Pillar 3 title', 'Integrity & Accountability'],
  ['about', 'pillar_3_p', 'Pillar 3 text', 'Own your work and honor commitments transparently.'],
  ['about', 'heart_title', 'HEART title', 'H.E.A.R.T. Framework'],
  ['about', 'heart_h', 'HEART H', 'Hospitality'],
  ['about', 'heart_h_p', 'HEART H text', 'Creating a welcoming and warm environment'],
  ['about', 'heart_e', 'HEART E', 'Excellence'],
  ['about', 'heart_e_p', 'HEART E text', 'Pursuing high standards in teaching and learning'],
  ['about', 'heart_a', 'HEART A', 'Affection'],
  ['about', 'heart_a_p', 'HEART A text', 'Building trust through empathy and patience'],
  ['about', 'heart_r', 'HEART R', 'Respect'],
  ['about', 'heart_r_p', 'HEART R text', 'Fostering integrity and fairness in interactions'],
  ['about', 'heart_t', 'HEART T', 'Togetherness'],
  ['about', 'heart_t_p', 'HEART T text', 'Embracing diversity and cultural curiosity in learning'],
  ['about', 'vision_text', 'Vision', 'Together, we will embody excellence, showcase Filipino warmth, and uphold Christian values in every interaction.'],
  ['about', 'mission_text', 'Mission', 'To provide kids across Asia with an accessible, God-centered online education that fosters English proficiency, moral integrity, and environmental stewardship—investing our grace-given success back into local communities to build a sustainable and hopeful future for all.'],
  ['register', 'register_title', 'Register welcome title', 'Welcome to RemoEdPH'],
  ['register', 'register_lead', 'Register welcome text', 'Live classes, games, and progress tracking — for young English learners in the Philippines and around the world.'],
  ['login', 'login_lead', 'Login lead', 'Sign in to open live one-on-one English classes with real teachers, and your personalized dashboard.'],
  ['login', 'login_welcome', 'Login welcome heading', 'Welcome to RemoEdPH'],
  ['login', 'login_welcome_p', 'Login welcome text', 'Your gateway to live one-on-one English classes with real teachers. Sign in to open your personalized dashboard.'],
  ['login', 'login_f1', 'Login feature 1', 'Live one-on-one classes'],
  ['login', 'login_f2', 'Login feature 2', 'Real, friendly teachers'],
  ['login', 'login_f3', 'Login feature 3', 'Personalized dashboard'],
  ['brand', 'site_title', 'Site title', 'Online English Classes for Kids Ages 3–6 | RemoEdPH'],
  ['brand', 'meta_description', 'Meta description', 'Live online English classes for children ages 3–6 in the Philippines. Calm, engaging lessons at home. Take the free 2-minute assessment.'],
  ['brand', 'og_title', 'Share title', 'Online English Classes for Kids Ages 3–6 | RemoEdPH'],
];

const HTML_BLOCKS = [
  ['privacy', 'body', 'Public privacy policy'],
  ['terms', 'body', 'Public terms'],
  ['parent-terms', 'body', 'Short parent terms'],
  ['teacher-privacy', 'body', 'Teacher privacy policy'],
  ['teacher-terms', 'body', 'Teacher contractor agreement'],
];

const CATALOG = TEXT.map(([pageKey, blockKey, label, body]) => ({
  pageKey, blockKey, label, body, format: 'text',
})).concat(HTML_BLOCKS.map(([pageKey, blockKey, label]) => ({
  pageKey, blockKey, label, body: '', format: 'html',
})));

let snapshot = null;
let loadedAt = 0;

function sanitizeHtml(raw) {
  return DOMPurify.sanitize(String(raw || ''), {
    ALLOWED_TAGS: ['p', 'br', 'h1', 'h2', 'h3', 'h4', 'ul', 'ol', 'li', 'a', 'strong', 'em', 'blockquote'],
    ALLOWED_ATTR: ['href', 'target', 'rel'],
  });
}

function cleanText(raw) {
  return String(raw || '').replace(/<[^>]*>/g, '').trim().slice(0, 4000);
}

function isMarketingPage(pageKey) {
  return MARKETING_PAGES.has(pageKey);
}

function specFor(pageKey, blockKey) {
  return CATALOG.find((row) => row.pageKey === pageKey && row.blockKey === blockKey) || null;
}

async function loadSnapshot() {
  const [blocks, faqs] = await Promise.all([
    PageBlock.find({}).lean(),
    FaqEntry.find({}).sort({ sortOrder: 1, question: 1 }).lean(),
  ]);
  snapshot = { blocks, faqs };
  loadedAt = Date.now();
  return snapshot;
}

async function ensureFresh() {
  if (!snapshot || Date.now() - loadedAt > TTL_MS) await loadSnapshot();
  return snapshot;
}

function extractHtml(rel) {
  const file = path.join(__dirname, '../../public', rel);
  if (!fs.existsSync(file)) return '';
  const html = fs.readFileSync(file, 'utf8');
  const article = html.match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  if (article) return sanitizeHtml(article[1]);
  const card = html.match(/id="legal-printable"[^>]*>([\s\S]*?)<\/div>/i);
  return card ? sanitizeHtml(card[1]) : '';
}

const LEGAL_FILES = {
  privacy: 'site-privacy.html',
  terms: 'site-terms.html',
  'parent-terms': 'legal/terms.html',
  'teacher-privacy': 'privacy-policy.html',
  'teacher-terms': 'terms-of-service.html',
};

async function seedPageBlocks() {
  const existing = await PageBlock.find({}, { pageKey: 1, blockKey: 1, locale: 1 }).lean();
  const have = new Set(existing.map((row) => row.pageKey + '|' + row.blockKey + '|' + (row.locale || 'en')));
  const missing = [];
  CATALOG.forEach((row) => {
    const id = row.pageKey + '|' + row.blockKey + '|en';
    if (have.has(id)) return;
    let body = row.body;
    if (row.format === 'html') body = extractHtml(LEGAL_FILES[row.pageKey] || '') || '';
    missing.push({
      pageKey: row.pageKey,
      blockKey: row.blockKey,
      locale: 'en',
      format: row.format,
      label: row.label,
      body,
      published: row.format === 'text',
      updatedBy: '',
    });
  });
  if (missing.length) await PageBlock.insertMany(missing);
  return missing.length;
}

function readFaqFile() {
  const file = path.join(__dirname, '../../public/js/remoed-faq-data.js');
  const ctx = { window: {}, globalThis: {} };
  ctx.globalThis = ctx;
  vm.runInNewContext(fs.readFileSync(file, 'utf8'), ctx);
  return ctx.window.RemoedFaqData || null;
}

let faqFileCache = null;
function faqFileMeta() {
  if (faqFileCache) return faqFileCache;
  try {
    const data = readFaqFile() || {};
    faqFileCache = {
      title: data.title || 'Frequently Asked Questions',
      intro: data.intro || '',
      updatedLabel: data.updatedLabel || '',
    };
  } catch (_e) {
    faqFileCache = { title: 'Frequently Asked Questions', intro: '', updatedLabel: '' };
  }
  return faqFileCache;
}

async function seedFaq() {
  const count = await FaqEntry.countDocuments({ locale: 'en' });
  if (count) return 0;
  const data = readFaqFile();
  if (!data || !Array.isArray(data.sections)) return 0;
  const rows = [];
  let order = 0;
  data.sections.forEach((section) => {
    (section.items || []).forEach((item) => {
      order += 1;
      rows.push({
        sourceId: String(item.id || ''),
        sectionId: String(section.id || 'general'),
        sectionTitle: String(section.title || ''),
        locale: 'en',
        question: String(item.q || '').slice(0, 500),
        answer: String(item.a || '').slice(0, 8000),
        sortOrder: order,
        published: true,
        updatedBy: '',
      });
    });
  });
  if (rows.length) await FaqEntry.insertMany(rows);
  return rows.length;
}

async function seedSiteContent() {
  const blocks = await seedPageBlocks();
  const faqs = await seedFaq();
  await loadSnapshot();
  return { blocks, faqs };
}

function publicBlocks(rows) {
  const out = {};
  rows.forEach((row) => {
    if (!row.published) return;
    if (row.locale && row.locale !== 'en') return;
    const body = row.format === 'html' ? sanitizeHtml(row.body) : cleanText(row.body);
    if (!body) return;
    out[row.pageKey + '.' + row.blockKey] = body;
  });
  return out;
}

async function publicContent() {
  const snap = await ensureFresh();
  let supportEmail = 'support@remoedph.com';
  let facebookUrl = 'https://www.facebook.com/remoed';
  try {
    const email = await getSetting('supportEmail');
    const fb = await getSetting('facebookUrl');
    if (email) supportEmail = String(email);
    if (fb) facebookUrl = String(fb);
  } catch (_e) { /* file fallback stays in the page if this request fails */ }
  const blocks = publicBlocks(snap.blocks || []);
  return {
    contact: { supportEmail, facebookUrl },
    brand: {
      title: blocks['brand.site_title'] || '',
      description: blocks['brand.meta_description'] || '',
      ogTitle: blocks['brand.og_title'] || '',
    },
    blocks,
  };
}

async function publicFaq() {
  const snap = await ensureFresh();
  const rows = (snap.faqs || []).filter((row) => row.published && (!row.locale || row.locale === 'en'));
  if (!rows.length) return null;
  const sections = [];
  const byId = {};
  rows.forEach((row) => {
    const id = row.sectionId || 'general';
    if (!byId[id]) {
      byId[id] = { id, title: row.sectionTitle || 'FAQ', items: [] };
      sections.push(byId[id]);
    }
    byId[id].items.push({ id: row.sourceId || String(row._id), q: row.question, a: row.answer });
  });
  const meta = faqFileMeta();
  return { title: meta.title, updatedLabel: meta.updatedLabel, intro: meta.intro, sections };
}

async function listBlocks(pageKeys) {
  const snap = await ensureFresh();
  const allow = new Set(pageKeys);
  const saved = {};
  (snap.blocks || []).forEach((row) => {
    saved[row.pageKey + '|' + row.blockKey] = row;
  });
  return CATALOG.filter((row) => allow.has(row.pageKey)).map((row) => {
    const found = saved[row.pageKey + '|' + row.blockKey];
    return {
      pageKey: row.pageKey,
      blockKey: row.blockKey,
      label: row.label,
      format: row.format,
      body: found ? found.body : row.body,
      published: found ? !!found.published : row.format === 'text',
      updatedAt: found ? found.updatedAt : null,
    };
  });
}

async function saveBlock(input, username) {
  const pageKey = String(input.pageKey || '').trim();
  const blockKey = String(input.blockKey || '').trim();
  const spec = specFor(pageKey, blockKey);
  if (!spec) return { ok: false, status: 400, error: 'Unknown block.' };
  if (/price|peso|usdPer|php/i.test(blockKey)) return { ok: false, status: 400, error: 'Prices are not edited here.' };
  const body = spec.format === 'html' ? sanitizeHtml(input.body).slice(0, 100000) : cleanText(input.body);
  if (spec.format === 'text' && !body) return { ok: false, status: 400, error: 'Text is required.' };
  const published = input.published !== false;
  const row = await PageBlock.findOneAndUpdate(
    { pageKey, blockKey, locale: 'en' },
    { $set: { format: spec.format, label: spec.label, body, published, updatedBy: String(username || '').slice(0, 120) } },
    { upsert: true, new: true }
  ).lean();
  await loadSnapshot();
  return { ok: true, block: row };
}

async function listFaq() {
  const snap = await ensureFresh();
  return (snap.faqs || []).map((row) => ({
    id: String(row._id),
    sourceId: row.sourceId || '',
    sectionId: row.sectionId || '',
    sectionTitle: row.sectionTitle || '',
    question: row.question,
    answer: row.answer,
    sortOrder: row.sortOrder || 0,
    published: !!row.published,
  }));
}

async function saveFaq(input, username) {
  const question = cleanText(input.question).slice(0, 500);
  const answer = cleanText(input.answer).slice(0, 8000);
  if (!question || !answer) return { ok: false, status: 400, error: 'Question and answer are required.' };
  const patch = {
    question,
    answer,
    sectionTitle: cleanText(input.sectionTitle || 'FAQ').slice(0, 160),
    published: input.published !== false,
    updatedBy: String(username || '').slice(0, 120),
  };
  if (input.sectionId) patch.sectionId = cleanText(input.sectionId).slice(0, 80);
  if (input.sortOrder != null && input.sortOrder !== '' && Number.isFinite(Number(input.sortOrder))) {
    patch.sortOrder = Number(input.sortOrder);
  }
  let row;
  if (input.id && /^[a-f0-9]{24}$/i.test(String(input.id))) {
    row = await FaqEntry.findByIdAndUpdate(input.id, { $set: patch }, { new: true }).lean();
    if (!row) return { ok: false, status: 404, error: 'FAQ entry was not found.' };
  } else {
    row = await FaqEntry.create({
      ...patch,
      locale: 'en',
      sourceId: 'custom-' + Date.now(),
      sectionId: patch.sectionId || 'general',
      sortOrder: patch.sortOrder != null ? patch.sortOrder : Date.now(),
    });
    row = row.toObject();
  }
  await loadSnapshot();
  return { ok: true, entry: row };
}

module.exports = {
  MARKETING_PAGES,
  HTML_PAGES,
  isMarketingPage,
  seedSiteContent,
  publicContent,
  publicFaq,
  listBlocks,
  saveBlock,
  listFaq,
  saveFaq,
  loadSnapshot,
};
