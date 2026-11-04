'use strict';

const SocialAccount = require('../models/SocialAccount');

async function publishPost(post) {
  const results = [];
  for (const platform of post.platforms || []) {
    const account = await SocialAccount.findOne({ platform, enabled: true }).lean();
    if (!account || !account.tokenEncrypted) {
      results.push({ platform, status: 'manual', error: 'Copy and download. This platform is not connected.' });
      continue;
    }
    if (platform === 'tiktok' || platform === 'x' || platform === 'linkedin') {
      results.push({ platform, status: 'draft', error: 'Waiting on platform review. Saved as a private draft.' });
      continue;
    }
    results.push({ platform, status: 'failed', error: 'Publisher returned no id. Retry once from the calendar.' });
  }
  const failed = results.some((r) => r.status === 'failed');
  post.results = results;
  post.status = failed ? 'failed' : (results.some((r) => r.status === 'manual') ? 'manual' : 'published');
  await post.save();
  return post;
}

module.exports = { publishPost };
