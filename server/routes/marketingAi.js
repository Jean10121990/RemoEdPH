const express = require('express');
const mongoose = require('mongoose');
const {
  verifyAdminApiAuth,
  requireAdmin,
  requireAdminTwoFactorSatisfied,
  requireAdminSessionValid,
  requirePermission,
} = require('../authMiddleware');
const MarketingCalendarEntry = require('../models/MarketingCalendarEntry');
const AssessmentTrial = require('../models/AssessmentTrial');
const Lead = require('../models/Lead');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Admin = require('../models/Admin');
const Affiliate = require('../models/Affiliate');
const { sendMarketingTestEmail, sendMarketingAudienceEmail } = require('../emailService');
const {
  buildMarketingCalendar,
  calendarWriteError,
  STATUSES,
  CONTENT_TYPES,
} = require('../services/marketingCalendarSeed');
const { warmParentLetter, letterNeedsHistory, shortParentPost } = require('../services/marketingEmailVoice');

const router = express.Router();

const SYSTEM_INSTRUCTION = `You write marketing copy for RemoEdPH for parents of children ages 3 to 6 in Taiwan, Japan, South Korea, Southeast Asia, and the Philippines.
The free offer is an interactive trial and an optional level assessment on the RemoEd App. No credit card. The free trial is not a live class.
Live 25-minute one-on-one lessons with a real teacher are paid plans only: RemoSpark 22 classes at ₱350 (₱7,700), RemoSteady 66 at ₱340 (₱22,440), RemoScholar 132 at ₱330 (₱43,560), RemoSummit 264 at ₱320 (₱84,480). Do not invent another discount.
Sound warm, friendly, professional, and wholesome. Christian values mean kindness, patience, and character. Do not preach. Do not pressure. Do not call RemoEd AI-powered.
Lesson characters are Remo, Ed, Sofie, and Teacher Grace. Remo is the cute green robot.`;

const adminChain = [
  verifyAdminApiAuth,
  requireAdmin,
  requireAdminTwoFactorSatisfied,
  requireAdminSessionValid,
  requirePermission('growth.ai_settings'),
];

function getModels() {
  const models = [
    process.env.GEMINI_MODEL || 'gemini-3.8-flash',
    'gemini-3.8-flash',
    'gemini-3.6-flash',
  ];
  return [...new Set(models.filter(Boolean))];
}

function clamp(value, max) {
  return String(value == null ? '' : value).slice(0, max);
}

function editorName(user) {
  return clamp((user && (user.username || user.email)) || 'admin', 120);
}

function posterConfig(raw, fallbackHeadline) {
  const src = raw && typeof raw === 'object' ? raw : {};
  const format = src.format === 'portrait' ? 'portrait' : 'square';
  const mascot = ['remo', 'ed', 'sofie'].indexOf(src.mascot) !== -1 ? src.mascot : 'remo';
  return {
    format,
    theme: clamp(src.theme || 'custom', 40),
    headline: clamp(src.headline || fallbackHeadline || '', 120),
    subheadline: clamp(src.subheadline || '', 240),
    cta: clamp(src.cta || 'remoedph.com • Free Trial on RemoEd App', 120),
    mascot,
  };
}

function publicEntry(doc) {
  return {
    id: String(doc._id),
    dateKey: doc.dateKey,
    slot: doc.slot,
    title: doc.title || '',
    keyTopic: doc.keyTopic || '',
    contentType: doc.contentType || 'facebook',
    targetMarket: doc.targetMarket || 'General International (Asia)',
    generatedCopy: doc.generatedCopy || '',
    emailSubject: doc.emailSubject || '',
    emailBody: doc.emailBody || '',
    posterConfig: doc.posterConfig || null,
    status: doc.status || 'planned',
    dryRun: doc.dryRun === true,
  };
}

async function ensureYear(year) {
  if (mongoose.connection.name !== 'test') {
    throw new Error('Refusing calendar seed outside the test database.');
  }
  const wanted = buildMarketingCalendar().filter((row) => row.dateKey.slice(0, 4) === String(year));
  for (const row of wanted) {
    await MarketingCalendarEntry.updateOne(
      { dateKey: row.dateKey, slot: row.slot },
      { $setOnInsert: row },
      { upsert: true }
    );
  }
  const csrDates = wanted.filter((row) => row.slot === 'csr').map((row) => row.dateKey);
  await MarketingCalendarEntry.deleteMany({
    $and: [
      { dateKey: { $regex: '^' + String(year) + '-' } },
      { dateKey: { $nin: csrDates } },
      { slot: 'csr' },
      { status: 'planned' },
      { generatedCopy: '' },
      { emailBody: '' },
    ],
  });
}

function addEmail(set, value) {
  const email = String(value || '').trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return;
  set.add(email);
}

function facebookFallback(topic) {
  return shortParentPost(topic);
}

function facebookResult(pack) {
  const post = clamp(pack.post, 5000);
  const adHeadline = clamp(pack.adHeadline, 120);
  const adText = clamp(pack.adText, 2000);
  return {
    success: true,
    content: 'Page post\n\n' + post + '\n\nShort ad\n' + adHeadline + '\n\n' + adText,
    facebook: { post, ad: { headline: adHeadline, text: adText } },
  };
}

function emailResult(email) {
  const subject = clamp(email.subject, 200);
  const body = clamp(email.body, 20000);
  const variation = clamp(email.variation || '', 20000);
  return {
    success: true,
    content: subject + '\n\n' + body + (variation ? '\n\n---\n' + variation : ''),
    email: { subject, body, variation },
  };
}

function parseModelJson(text) {
  const raw = String(text || '').trim();
  const start = raw.indexOf('{');
  const end = raw.lastIndexOf('}');
  if (start === -1 || end <= start) return null;
  try {
    return JSON.parse(raw.slice(start, end + 1));
  } catch (_err) {
    return null;
  }
}

router.get('/calendar/audience', adminChain, async (req, res) => {
  try {
    const assessments = new Set();
    const leads = new Set();
    const students = new Set();
    const teachers = new Set();
    const admins = new Set();
    const affiliates = new Set();

    const [trialRows, leadRows, studentRows, teacherRows, adminRows, affiliateRows] = await Promise.all([
      AssessmentTrial.find({}).select('parentEmail').lean(),
      Lead.find({}).select('email').lean(),
      Student.find({}).select('email parentEmail authProviders.email').lean(),
      Teacher.find({}).select('email').lean(),
      Admin.find({}).select('email').lean(),
      Affiliate.find({ status: { $in: ['active', 'pending'] } }).select('email').lean(),
    ]);

    trialRows.forEach((row) => addEmail(assessments, row.parentEmail));
    leadRows.forEach((row) => addEmail(leads, row.email));
    studentRows.forEach((row) => {
      addEmail(students, row.email);
      addEmail(students, row.parentEmail);
      (row.authProviders || []).forEach((provider) => addEmail(students, provider && provider.email));
    });
    teacherRows.forEach((row) => addEmail(teachers, row.email));
    adminRows.forEach((row) => addEmail(admins, row.email));
    affiliateRows.forEach((row) => addEmail(affiliates, row.email));

    const everyone = new Set([...assessments, ...leads, ...students, ...teachers, ...admins, ...affiliates]);
    return res.json({
      success: true,
      groups: {
        assessments: assessments.size,
        leads: leads.size,
        students: students.size,
        teachers: teachers.size,
        admins: admins.size,
        affiliates: affiliates.size,
      },
      unique: everyone.size,
    });
  } catch (error) {
    console.error('Marketing audience counts failed:', error.message || error);
    return res.status(500).json({ success: false, message: 'Could not count the audience.' });
  }
});

router.post('/calendar/test-email', adminChain, async (req, res) => {
  try {
    const body = req.body || {};
    if (body.to && String(body.to).trim().toLowerCase() !== 'jean10121990@gmail.com') {
      return res.status(400).json({ success: false, message: 'This test can only be sent to the approved address.' });
    }
    const subject = clamp(body.subject, 200).trim();
    const text = clamp(body.text || body.emailBody || '', 20000).trim();
    const html = clamp(body.html || '', 20000).trim();
    if (!subject || (!text && !html)) {
      return res.status(400).json({ success: false, message: 'Add an email subject and body first.' });
    }
    const result = await sendMarketingTestEmail({
      subject,
      text,
      html: html || text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>'),
    });
    if (!result.success) {
      return res.status(502).json({ success: false, message: result.error || 'Could not send the test email.' });
    }
    return res.json({ success: true, from: result.from, provider: result.provider });
  } catch (error) {
    console.error('Marketing test email failed:', error.message || error);
    return res.status(500).json({ success: false, message: 'Could not send the test email.' });
  }
});

router.post('/calendar/send-affiliates', adminChain, async (req, res) => {
  try {
    const body = req.body || {};
    const subject = clamp(body.subject, 200).trim();
    const text = clamp(body.text || body.emailBody || '', 20000).trim();
    const html = clamp(body.html || '', 20000).trim();
    if (!subject || (!text && !html)) {
      return res.status(400).json({ success: false, message: 'Add an email subject and body first.' });
    }
    const rows = await Affiliate.find({ status: { $in: ['active', 'pending'] } }).select('email').lean();
    const recipients = new Set();
    rows.forEach((row) => addEmail(recipients, row.email));
    if (!recipients.size) {
      return res.status(400).json({ success: false, message: 'No affiliate email addresses are ready.' });
    }
    const safeHtml = html || text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/\n/g, '<br>');
    const result = await sendMarketingAudienceEmail({
      recipients: Array.from(recipients),
      subject,
      text,
      html: safeHtml,
    });
    if (!result.success) {
      return res.status(502).json({ success: false, message: result.error || 'Could not send to affiliates.' });
    }
    return res.json({
      success: true,
      from: result.from,
      provider: result.provider,
      sent: result.sent,
      failed: result.failed,
    });
  } catch (error) {
    console.error('Marketing affiliate email failed:', error.message || error);
    return res.status(500).json({ success: false, message: 'Could not send to affiliates.' });
  }
});

router.get('/calendar', adminChain, async (req, res) => {
  try {
    const year = String(req.query.year || '');
    if (year !== '2026' && year !== '2027') {
      return res.status(400).json({ success: false, message: 'Choose 2026 or 2027.' });
    }
    await ensureYear(year);
    const rows = await MarketingCalendarEntry.find({ dateKey: new RegExp('^' + year + '-') })
      .sort({ dateKey: 1, slot: 1 })
      .lean();
    return res.json({ success: true, year, entries: rows.map(publicEntry) });
  } catch (error) {
    console.error('Marketing calendar load failed:', error.message || error);
    return res.status(500).json({ success: false, message: 'Could not load the calendar.' });
  }
});

router.put('/calendar/:dateKey', adminChain, async (req, res) => {
  try {
    if (mongoose.connection.name !== 'test') {
      return res.status(500).json({ success: false, message: 'Calendar saves stay on the test database.' });
    }
    const dateKey = String(req.params.dateKey || '');
    const writeError = calendarWriteError(dateKey, req.body && req.body.status);
    if (writeError) {
      return res.status(400).json({ success: false, message: writeError });
    }
    const body = req.body || {};
    let slot = clamp(body.slot, 40);
    const customTitle = clamp(body.customTitle, 120).trim();
    if (!slot && customTitle) {
      slot = 'custom:' + new mongoose.Types.ObjectId().toString();
    }
    if (!/^(regular|csr|observance|custom:[a-f0-9]{24})$/.test(slot)) {
      return res.status(400).json({ success: false, message: 'Choose a post on this date, or add a custom occasion.' });
    }
    if (body.contentType && CONTENT_TYPES.indexOf(body.contentType) === -1) {
      return res.status(400).json({ success: false, message: 'Choose a Facebook post, a parent email, or an ad.' });
    }
    if (body.status && STATUSES.indexOf(body.status) === -1) {
      return res.status(400).json({ success: false, message: 'That status is not available.' });
    }
    const existing = await MarketingCalendarEntry.findOne({ dateKey, slot });
    const title = clamp(body.title || customTitle || (existing && existing.title) || 'Custom occasion', 120);
    const next = {
      title,
      keyTopic: body.keyTopic != null ? clamp(body.keyTopic, 2000) : (existing && existing.keyTopic) || title,
      contentType: body.contentType || (existing && existing.contentType) || 'facebook',
      targetMarket: clamp(body.targetMarket || (existing && existing.targetMarket) || 'General International (Asia)', 80),
      generatedCopy: body.generatedCopy != null ? clamp(body.generatedCopy, 20000) : (existing && existing.generatedCopy) || '',
      emailSubject: body.emailSubject != null ? clamp(body.emailSubject, 200) : (existing && existing.emailSubject) || '',
      emailBody: body.emailBody != null ? clamp(body.emailBody, 20000) : (existing && existing.emailBody) || '',
      posterConfig: posterConfig(body.posterConfig || (existing && existing.posterConfig), title),
      status: body.status || (existing && existing.status) || (slot.indexOf('custom:') === 0 ? 'edited' : 'planned'),
      dryRun: dateKey.slice(0, 4) === '2026',
      updatedBy: editorName(req.user),
    };
    const saved = await MarketingCalendarEntry.findOneAndUpdate(
      { dateKey, slot },
      { $set: next, $setOnInsert: { dateKey, slot } },
      { upsert: true, new: true }
    );
    return res.json({ success: true, entry: publicEntry(saved) });
  } catch (error) {
    console.error('Marketing calendar save failed:', error.message || error);
    return res.status(500).json({ success: false, message: 'Could not save this date.' });
  }
});

router.post('/ai-generate', adminChain, async (req, res) => {
  try {
    const body = req.body || {};
    const contentType = clamp(body.contentType || 'Facebook Group Post', 80);
    const targetMarket = clamp(body.targetMarket || 'General International (Asia)', 80);
    const topicDetails = clamp(body.topicDetails || '', 2000).trim();
    const format = body.format === 'email' || /email/i.test(contentType) ? 'email' : (body.format === 'ad' ? 'ad' : 'facebook');

    if (!topicDetails) {
      return res.status(400).json({ success: false, message: 'Topic details are required.' });
    }

    if (format !== 'email') {
      return res.json(facebookResult(facebookFallback(topicDetails)));
    }

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'Gemini API key is missing in server environment.' });
    }

    const prompt = [
      'Task: a parent email that feels like a personal note, not a brochure.',
      'Target market: ' + targetMarket,
      'Key topic: ' + topicDetails,
      'Return JSON only: {"subject":"...","body":"...","variation":"..."}',
      'Voice: friendly, lively, caring, and professional. Build trust. Sound glad to help.',
      'Open with a human hello. Picture one small true-to-life moment a child aged 3 to 6 might have.',
      'Weave the topic in with warmth. Do not paste the topic as its own sentence. Do not lecture.',
      'If the topic is a Philippine hero, holiday, or historical event, add two or three true sentences of background so a parent outside the Philippines knows who the person was, when it happened, and why the day is kept. Do not assume the reader grew up in the Philippines. Do not invent dates.',
      'The free next step is the interactive trial on the RemoEd App, not a live class. A live 25-minute lesson with a real teacher is a paid plan. Close with a kind next step and no pressure.',
      'variation is a shorter second note with the same care.',
    ].join('\n');

    const generationConfig = { temperature: 0.4, maxOutputTokens: 700 };

    let response;
    let data;
    let lastError = '';
    for (const model of getModels()) {
      const controller = new AbortController();
      const timer = setTimeout(function () { controller.abort(); }, 18000);
      try {
        response = await fetch(
          'https://generativelanguage.googleapis.com/v1beta/models/' + model + ':generateContent',
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
            body: JSON.stringify({
              systemInstruction: { parts: [{ text: SYSTEM_INSTRUCTION }] },
              contents: [{ role: 'user', parts: [{ text: prompt }] }],
              generationConfig,
            }),
            signal: controller.signal,
          }
        );
        data = await response.json();
        if (response.ok) break;
        if (response.status === 404 || response.status === 429 || response.status === 503) {
          console.error('Gemini model skipped: ' + model + ' ' + response.status);
          response = null;
          continue;
        }
        break;
      } catch (error) {
        lastError = error && error.name === 'AbortError' ? 'timed out' : (error && error.message) || 'failed';
        console.error('Gemini model ' + model + ' ' + lastError);
        response = null;
      } finally {
        clearTimeout(timer);
      }
    }

    if (!response || !response.ok) {
      console.error('Gemini API Error:', JSON.stringify(data || { message: lastError }));
      return res.json(emailResult(warmParentLetter(topicDetails)));
    }

    const generatedText = ((data.candidates && data.candidates[0] && data.candidates[0].content && data.candidates[0].content.parts) || [])
      .map((part) => part.text || '')
      .join('')
      .trim();

    if (!generatedText) {
      const reason = (data.promptFeedback && data.promptFeedback.blockReason)
        || (data.candidates && data.candidates[0] && data.candidates[0].finishReason);
      console.error('Gemini returned no text. Reason:', reason);
      return res.json(emailResult(warmParentLetter(topicDetails)));
    }

    const parsed = parseModelJson(generatedText) || {};
    const fallback = warmParentLetter(topicDetails);
    const subject = clamp(parsed.subject || fallback.subject, 200);
    let emailBody = clamp(parsed.body || '', 20000);
    if (emailBody.length < 280 || emailBody.indexOf(topicDetails) === 0 || letterNeedsHistory(topicDetails, emailBody)) {
      return res.json(emailResult(fallback));
    }
    const variation = clamp(parsed.variation || '', 20000);
    return res.json(emailResult({ subject, body: emailBody, variation }));
  } catch (error) {
    console.error('Error generating marketing copy:', error.message || error);
    return res.status(500).json({ success: false, message: 'Failed to generate content.' });
  }
});

module.exports = router;
