/**
 * Super-Admin site settings and the six account letters.
 * Auth: admin JWT, authenticator session, nav:settings.
 * Marketing cannot call these routes. Checkout, booking, payouts, and garden read the saved values.
 * SMTP passwords are not accepted here.
 */
const express = require('express');
const {
  verifyAdminApiAuth,
  requireAdmin,
  requireAdminTwoFactorSatisfied,
  requireAdminSessionValid,
  requirePermission,
} = require('./authMiddleware');
const { logAdminAction } = require('./services/adminAudit');
const settings = require('./services/siteSettings');

const router = express.Router();

router.use(
  verifyAdminApiAuth,
  requireAdmin,
  requireAdminTwoFactorSatisfied,
  requireAdminSessionValid,
  requirePermission('nav:settings')
);

router.get('/site-settings', async (_req, res) => {
  try {
    const rows = await settings.listSettings();
    res.json({
      success: true,
      live: true,
      note: 'Checkout, booking windows, class length, payouts, commissions, and garden use these values. A missing row keeps today’s code constant. There is no daily class cap. The peso exchange rate is not here. globalRate is the fallback when a teacher has no payout tier.',
      settings: rows,
    });
  } catch (err) {
    console.error('GET /site-settings', err && err.message);
    res.status(500).json({ success: false, error: 'Could not load settings.' });
  }
});

router.post('/site-settings/refresh', async (req, res) => {
  try {
    await settings.loadSnapshot();
    await logAdminAction(req, {
      action: 'setting.refresh',
      subjectType: 'setting',
      details: { key: '*' },
    });
    const rows = await settings.listSettings();
    res.json({ success: true, settings: rows });
  } catch (err) {
    console.error('POST /site-settings/refresh', err && err.message);
    res.status(500).json({ success: false, error: 'Could not refresh settings.' });
  }
});

function confirmOk(key, body) {
  if (!settings.needsConfirm(key)) return true;
  return String((body && body.confirmKey) || '').trim() === key;
}

router.put('/site-settings/:key', async (req, res) => {
  const key = String(req.params.key || '');
  if (!confirmOk(key, req.body)) {
    return res.status(400).json({ success: false, error: 'Type the setting key to confirm this change.' });
  }
  try {
    const result = await settings.writeValue(key, req.body && req.body.value, req.admin && req.admin.username, 'setting.update');
    if (!result.ok) return res.status(result.status || 400).json({ success: false, error: result.error });
    if (!result.unchanged) {
      await logAdminAction(req, {
        action: 'setting.update',
        subjectType: 'setting',
        details: { key, from: result.from, to: result.to },
      });
    }
    res.json({ success: true, setting: result.row, unchanged: !!result.unchanged });
  } catch (err) {
    console.error('PUT /site-settings', err && err.message);
    res.status(500).json({ success: false, error: 'Could not save the setting.' });
  }
});

router.post('/site-settings/:key/restore', async (req, res) => {
  const key = String(req.params.key || '');
  if (!confirmOk(key, req.body)) {
    return res.status(400).json({ success: false, error: 'Type the setting key to confirm this restore.' });
  }
  try {
    const result = await settings.restoreDefault(key, req.admin && req.admin.username);
    if (!result.ok) return res.status(result.status || 400).json({ success: false, error: result.error });
    if (!result.unchanged) {
      await logAdminAction(req, {
        action: 'setting.restore',
        subjectType: 'setting',
        details: { key, from: result.from, to: result.to },
      });
    }
    res.json({ success: true, setting: result.row, unchanged: !!result.unchanged });
  } catch (err) {
    console.error('POST /site-settings restore', err && err.message);
    res.status(500).json({ success: false, error: 'Could not restore the setting.' });
  }
});

const emailTemplates = require('./services/emailTemplateStore');

router.get('/email-templates', async (_req, res) => {
  try {
    const seeds = require('./emailService').buildSeedBodies();
    res.json({ success: true, templates: emailTemplates.listForAdmin(seeds) });
  } catch (err) {
    console.error('GET /email-templates', err && err.message);
    res.status(500).json({ success: false, error: 'Could not load letters.' });
  }
});

router.post('/email-templates/preview', (req, res) => {
  const body = req.body || {};
  const key = String(body.key || '');
  const subject = String(body.subject || '');
  const html = String(body.html || '');
  const text = String(body.text || '');
  if (!emailTemplates.KEYS.some((row) => row.key === key)) {
    return res.status(404).json({ success: false, error: 'Unknown letter.' });
  }
  if (!html.trim()) {
    const file = require('./emailService').sampleFileLetter(key);
    return res.json({
      success: true,
      usingFile: true,
      preview: file,
      previewToken: emailTemplates.issuePreview(key, subject, html, text),
    });
  }
  const preview = emailTemplates.renderPreview(key, subject, html, text);
  if (!emailTemplates.visibleText(preview.html)) {
    return res.status(400).json({
      success: false,
      error: 'This letter is blank. Clear the box to keep the built-in letter.',
    });
  }
  return res.json({
    success: true,
    usingFile: false,
    preview,
    previewToken: emailTemplates.issuePreview(key, subject, html, text),
  });
});

router.put('/email-templates/:key', async (req, res) => {
  const key = String(req.params.key || '');
  const body = req.body || {};
  const subject = String(body.subject || '');
  const html = String(body.html || '');
  const text = String(body.text || '');
  if (!emailTemplates.previewMatches(body.previewToken, key, subject, html, text)) {
    return res.status(400).json({ success: false, error: 'Preview this letter before saving it.' });
  }
  try {
    const result = await emailTemplates.saveTemplate(key, subject, html, text, req.admin && req.admin.username);
    if (!result.ok) return res.status(result.status || 400).json({ success: false, error: result.error });
    await logAdminAction(req, {
      action: 'email.template',
      subjectType: 'email',
      details: { key, usingFile: result.usingFile },
    });
    const seeds = require('./emailService').buildSeedBodies();
    const row = emailTemplates.listForAdmin(seeds).find((item) => item.key === key);
    res.json({ success: true, template: row });
  } catch (err) {
    console.error('PUT /email-templates', err && err.message);
    res.status(500).json({ success: false, error: 'Could not save the letter.' });
  }
});

router.post('/email-templates/:key/restore', async (req, res) => {
  const key = String(req.params.key || '');
  if (!emailTemplates.KEYS.some((row) => row.key === key)) {
    return res.status(404).json({ success: false, error: 'Unknown letter.' });
  }
  try {
    const result = await emailTemplates.saveTemplate(key, '', '', '', req.admin && req.admin.username);
    if (!result.ok) return res.status(result.status || 400).json({ success: false, error: result.error });
    await logAdminAction(req, {
      action: 'email.template.restore',
      subjectType: 'email',
      details: { key },
    });
    const seeds = require('./emailService').buildSeedBodies();
    const row = emailTemplates.listForAdmin(seeds).find((item) => item.key === key);
    res.json({ success: true, template: row });
  } catch (err) {
    console.error('POST /email-templates restore', err && err.message);
    res.status(500).json({ success: false, error: 'Could not restore the letter.' });
  }
});

module.exports = router;
