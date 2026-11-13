/**
 * Public copy reads are open and rate-limited.
 * Homepage and About writes: admin JWT + authenticator + content:homepage.
 * FAQ writes: content:faq.
 * Login, brand, and legal writes: nav:settings (Super-Admin).
 * Marketing cannot save prices, consent version, or teacher legal HTML.
 */
const express = require('express');
const rateLimit = require('express-rate-limit');
const {
  verifyAdminApiAuth,
  requireAdmin,
  requireAdminTwoFactorSatisfied,
  requireAdminSessionValid,
  requirePermission,
} = require('./authMiddleware');
const { logAdminAction } = require('./services/adminAudit');
const content = require('./services/siteContent');
const { roleHas } = require('./services/adminRbac');

const publicRouter = express.Router();
const adminRouter = express.Router();

const publicLimit = rateLimit({
  windowMs: 60 * 1000,
  max: 60,
  standardHeaders: true,
  legacyHeaders: false,
});

publicRouter.get('/site-content', publicLimit, async (_req, res) => {
  try {
    const payload = await content.publicContent();
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, ...payload });
  } catch (err) {
    console.error('GET /api/public/site-content', err && err.message);
    res.status(500).json({ success: false });
  }
});

publicRouter.get('/login-options', publicLimit, (_req, res) => {
  res.set('Cache-Control', 'no-store');
  try {
    const facebook = require('./services/siteSettings').readSetting('loginFacebookEnabled') === true;
    res.json({ success: true, facebook });
  } catch (err) {
    console.error('GET /api/public/login-options', err && err.message);
    res.json({ success: true, facebook: false });
  }
});

publicRouter.get('/faq', publicLimit, async (_req, res) => {
  try {
    const faq = await content.publicFaq();
    res.set('Cache-Control', 'no-store');
    res.json({ success: true, faq });
  } catch (err) {
    console.error('GET /api/public/faq', err && err.message);
    res.status(500).json({ success: false, faq: null });
  }
});

function adminStack(permissionKey) {
  return [
    verifyAdminApiAuth,
    requireAdmin,
    requireAdminTwoFactorSatisfied,
    requireAdminSessionValid,
    requirePermission(permissionKey),
  ];
}

async function canMarketing(req) {
  const role = String((req.user && req.user.adminRole) || '').toLowerCase();
  if (role === 'super_admin') return true;
  return roleHas(role, 'content:homepage');
}

adminRouter.get('/content/blocks', ...adminStack('content:homepage'), async (req, res) => {
  try {
    const pages = ['home', 'about', 'register'];
    if (String((req.user && req.user.adminRole) || '').toLowerCase() === 'super_admin') {
      pages.push('login', 'brand', 'privacy', 'terms', 'parent-terms', 'teacher-privacy', 'teacher-terms');
    }
    const blocks = await content.listBlocks(pages);
    res.json({ success: true, blocks });
  } catch (err) {
    console.error('GET /content/blocks', err && err.message);
    res.status(500).json({ success: false, error: 'Could not load copy.' });
  }
});

adminRouter.get('/content/legal', ...adminStack('nav:settings'), async (_req, res) => {
  try {
    const blocks = await content.listBlocks(['login', 'brand', 'privacy', 'terms', 'parent-terms', 'teacher-privacy', 'teacher-terms']);
    res.json({ success: true, blocks });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not load legal copy.' });
  }
});

adminRouter.put('/content/blocks', ...adminStack('content:homepage'), async (req, res) => {
  const pageKey = String((req.body && req.body.pageKey) || '');
  if (!content.isMarketingPage(pageKey)) {
    return res.status(403).json({ success: false, error: 'That page is Super-Admin only.' });
  }
  if (!(await canMarketing(req))) {
    return res.status(403).json({ success: false, error: 'Missing permission.' });
  }
  try {
    const result = await content.saveBlock(req.body || {}, req.admin && req.admin.username);
    if (!result.ok) return res.status(result.status || 400).json({ success: false, error: result.error });
    await logAdminAction(req, {
      action: 'content.update',
      subjectType: 'page',
      details: { pageKey, blockKey: req.body.blockKey, published: result.block.published },
    });
    res.json({ success: true, block: { pageKey, blockKey: req.body.blockKey, published: result.block.published } });
  } catch (err) {
    console.error('PUT /content/blocks', err && err.message);
    res.status(500).json({ success: false, error: 'Could not save.' });
  }
});

adminRouter.put('/content/legal', ...adminStack('nav:settings'), async (req, res) => {
  const pageKey = String((req.body && req.body.pageKey) || '');
  if (content.isMarketingPage(pageKey)) {
    return res.status(400).json({ success: false, error: 'Use the homepage editor for that page.' });
  }
  try {
    const result = await content.saveBlock(req.body || {}, req.admin && req.admin.username);
    if (!result.ok) return res.status(result.status || 400).json({ success: false, error: result.error });
    await logAdminAction(req, {
      action: 'content.update',
      subjectType: 'page',
      details: { pageKey, blockKey: req.body.blockKey, published: result.block.published },
    });
    res.json({ success: true });
  } catch (err) {
    console.error('PUT /content/legal', err && err.message);
    res.status(500).json({ success: false, error: 'Could not save.' });
  }
});

adminRouter.get('/content/faq', ...adminStack('content:faq'), async (_req, res) => {
  try {
    res.json({ success: true, entries: await content.listFaq() });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Could not load FAQ.' });
  }
});

adminRouter.put('/content/faq', ...adminStack('content:faq'), async (req, res) => {
  try {
    const result = await content.saveFaq(req.body || {}, req.admin && req.admin.username);
    if (!result.ok) return res.status(result.status || 400).json({ success: false, error: result.error });
    await logAdminAction(req, {
      action: 'content.faq',
      subjectType: 'faq',
      details: { id: String(result.entry._id || ''), question: result.entry.question },
    });
    res.json({ success: true, id: String(result.entry._id) });
  } catch (err) {
    console.error('PUT /content/faq', err && err.message);
    res.status(500).json({ success: false, error: 'Could not save the FAQ.' });
  }
});

module.exports = { publicRouter, adminRouter };
