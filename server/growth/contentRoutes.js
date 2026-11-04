'use strict';

const express = require('express');
const Post = require('../models/Post');
const SocialAccount = require('../models/SocialAccount');
const { publishPost } = require('./publishPost');
const { facebookConfigured, connectUrl, publicAccounts } = require('./metaConnect');
const { queueCampaign } = require('./brevo');

const router = express.Router();

function requireGrowth(key) {
  return function (req, res, next) {
    const role = String((req.user && (req.user.role || req.user.userType)) || '').toLowerCase();
    if (role !== 'admin') return res.status(403).json({ success: false, error: 'Admin token required' });
    const perms = (req.user && req.user.permissions) || [];
    const slug = String((req.user && req.user.adminRole) || '').toLowerCase();
    if (slug === 'super_admin' || slug === 'admin_marketing' || perms.includes(key) || perms.includes('*')) return next();
    return res.status(403).json({ success: false, error: 'Missing ' + key });
  };
}

router.get('/posts', requireGrowth('growth.posts'), async (_req, res) => {
  const posts = await Post.find({}).sort({ scheduledAt: -1, createdAt: -1 }).limit(200).lean();
  res.json({ success: true, posts });
});

router.post('/posts', requireGrowth('growth.posts'), async (req, res) => {
  const allowed = ['facebook', 'instagram', 'tiktok', 'x'];
  const platforms = (Array.isArray(req.body && req.body.platforms) ? req.body.platforms : [])
    .map((p) => String(p || '').toLowerCase())
    .filter((p) => allowed.includes(p));
  const image = String((req.body && req.body.mediaPath) || '').trim();
  const post = await Post.create({
    body: String((req.body && req.body.body) || '').slice(0, 5000),
    platforms,
    language: String((req.body && req.body.language) || 'en'),
    scheduledAt: req.body && req.body.scheduledAt ? new Date(req.body.scheduledAt) : null,
    status: req.body && req.body.scheduledAt ? 'scheduled' : 'draft',
    affiliateKit: !!(req.body && req.body.affiliateKit),
    mediaPath: /^https:\/\//i.test(image) ? image.slice(0, 2000) : '',
  });
  res.json({ success: true, post });
});

router.post('/posts/:id/adapt', requireGrowth('growth.posts'), async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ success: false });
  const lang = String((req.body && req.body.language) || post.language || 'en');
  post.body = `[${lang}] ${post.body}`;
  post.language = lang;
  await post.save();
  res.json({ success: true, post });
});

router.post('/posts/:id/publish', requireGrowth('growth.posts'), async (req, res) => {
  const post = await Post.findById(req.params.id);
  if (!post) return res.status(404).json({ success: false });
  await publishPost(post);
  res.json({ success: true, post });
});

router.get('/social-accounts', requireGrowth('growth.posts'), async (_req, res) => {
  const rows = await SocialAccount.find({}).select('platform accountName externalId tokenEncrypted enabled').lean();
  res.json({
    success: true,
    facebookAppReady: facebookConfigured(),
    accounts: publicAccounts(rows),
  });
});

router.get('/social/meta/start', requireGrowth('growth.posts'), (req, res) => {
  if (!facebookConfigured()) {
    return res.status(503).json({
      success: false,
      error: 'Set FACEBOOK_APP_ID and FACEBOOK_APP_SECRET, and add the Marketing Hub redirect in the Meta app.',
    });
  }
  const adminId = req.user && (req.user.adminId || req.user.id);
  if (!adminId) return res.status(403).json({ success: false, error: 'Admin token required' });
  res.json({ success: true, url: connectUrl(adminId) });
});

router.post('/social-accounts/disconnect', requireGrowth('growth.posts'), async (req, res) => {
  const platform = String((req.body && req.body.platform) || '');
  const platforms = platform === 'meta' ? ['facebook', 'instagram'] : [platform];
  if (!platforms.every((p) => ['facebook', 'instagram', 'tiktok', 'x'].includes(p))) {
    return res.status(400).json({ success: false, error: 'Unknown account' });
  }
  await SocialAccount.updateMany(
    { platform: { $in: platforms } },
    { $set: { enabled: false, tokenEncrypted: '', externalId: '', accountName: '' } }
  );
  res.json({ success: true });
});

router.post('/campaigns/send', requireGrowth('growth.campaigns'), async (req, res) => {
  const result = await queueCampaign({
    campaignId: String((req.body && req.body.campaignId) || 'manual'),
    subject: String((req.body && req.body.subject) || 'RemoEd'),
    html: String((req.body && req.body.html) || ''),
    emails: (req.body && req.body.emails) || [],
  });
  res.json({ success: true, ...result });
});

module.exports = router;
