/**
 * Super-Admin site settings. Auth: admin JWT, authenticator session, nav:settings.
 * Marketing cannot call these routes. Checkout does not read the saved values yet.
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
      live: false,
      note: 'Saved here only. Checkout, booking, and class length still use the code until a later step. There is no daily class cap.',
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

module.exports = router;
