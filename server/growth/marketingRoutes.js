'use strict';

const express = require('express');
const { verifyToken } = require('../authMiddleware');
const Lead = require('../models/Lead');
const Post = require('../models/Post');
const { accountFor } = require('./metaConnect');
const { publishFacebook } = require('./publishPost');
const { syncFacebookLeads } = require('./facebookPage');

const router = express.Router();

function requireGrowth(key) {
  return function (req, res, next) {
    const role = String((req.user && (req.user.role || req.user.userType)) || '').toLowerCase();
    if (role !== 'admin') return res.status(403).json({ success: false, error: 'Admin token required' });
    const perms = (req.user && req.user.permissions) || [];
    const slug = String((req.user && req.user.adminRole) || '').toLowerCase();
    if (slug === 'super_admin' || slug === 'admin_marketing' || perms.includes(key) || perms.includes('*')) return next();
    if (slug === 'admin_assistant' && (key === 'growth.leads' || key === 'growth.inbox')) return next();
    return res.status(403).json({ success: false, error: 'Missing ' + key });
  };
}

function graphError(res, err, fallback) {
  const status = err && err.code === 'NOT_CONNECTED' ? 409 : 502;
  return res.status(status).json({ success: false, error: (err && err.message) || fallback });
}

router.use(verifyToken);

router.get('/facebook-leads', requireGrowth('growth.leads'), async (_req, res) => {
  try {
    const result = await syncFacebookLeads();
    const leads = await Lead.find({ source: 'facebook' })
      .sort({ lastContactAt: -1, updatedAt: -1 })
      .limit(200)
      .select('name email phone formName formId facebookLeadId lastContactAt createdAt')
      .lean();
    res.json({ success: true, synced: result.synced, forms: result.forms, leads });
  } catch (err) {
    console.error('facebook leads:', err && err.message ? err.message : err);
    graphError(res, err, 'Could not sync Facebook leads.');
  }
});

router.post('/publish-fb', requireGrowth('growth.posts'), async (req, res) => {
  const text = String((req.body && req.body.text) || '').replace(/<[^>]*>/g, '').trim().slice(0, 5000);
  const imageUrl = String((req.body && (req.body.imageUrl || req.body.image)) || '').trim();
  if (!text && !imageUrl) {
    return res.status(400).json({ success: false, error: 'Write a post or add an image.' });
  }
  if (imageUrl && !/^https:\/\//i.test(imageUrl)) {
    return res.status(400).json({ success: false, error: 'The image must be a public https address.' });
  }
  const account = await accountFor('facebook');
  if (!account) {
    return res.status(409).json({ success: false, error: 'Connect the Facebook Page in Marketing Hub, then try again.' });
  }
  const post = await Post.create({
    body: text,
    platforms: ['facebook'],
    mediaPath: /^https:\/\//i.test(imageUrl) ? imageUrl.slice(0, 2000) : '',
    status: 'draft',
    language: 'en',
  });
  try {
    const result = await publishFacebook(post, account);
    post.results = [result];
    post.status = 'published';
    await post.save();
    res.json({ success: true, id: result.id || '', postId: String(post._id) });
  } catch (err) {
    post.results = [{ platform: 'facebook', status: 'failed', error: err.message || 'Publish failed' }];
    post.status = 'failed';
    await post.save().catch(() => {});
    console.error('publish facebook:', err && err.message ? err.message : err);
    res.status(502).json({ success: false, error: err.message || 'Facebook did not publish the post.' });
  }
});

module.exports = router;
