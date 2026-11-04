'use strict';

const { accountFor, graph } = require('./metaConnect');

function publicImage(post) {
  const raw = String((post && post.mediaPath) || '').trim();
  if (/^https:\/\//i.test(raw)) return raw;
  return '';
}

async function publishFacebook(post, account) {
  const image = publicImage(post);
  const text = String(post.body || '').slice(0, 5000);
  if (image) {
    const data = await graph('/' + account.externalId + '/photos', account.token, {
      method: 'POST',
      body: { url: image, caption: text },
    });
    return { platform: 'facebook', status: 'published', id: data.post_id || data.id || '' };
  }
  const data = await graph('/' + account.externalId + '/feed', account.token, {
    method: 'POST',
    body: { message: text },
  });
  return { platform: 'facebook', status: 'published', id: data.id || '' };
}

async function publishInstagram(post, account) {
  const image = publicImage(post);
  if (!image) {
    return {
      platform: 'instagram',
      status: 'manual',
      error: 'Instagram needs a public https image. Facebook can post the text on its own.',
    };
  }
  const created = await graph('/' + account.externalId + '/media', account.token, {
    method: 'POST',
    body: { image_url: image, caption: String(post.body || '').slice(0, 2200) },
  });
  const published = await graph('/' + account.externalId + '/media_publish', account.token, {
    method: 'POST',
    body: { creation_id: created.id },
  });
  return { platform: 'instagram', status: 'published', id: published.id || '' };
}

async function publishPost(post) {
  const wanted = Array.isArray(post.platforms) && post.platforms.length
    ? post.platforms
    : ['facebook', 'instagram'];
  const results = [];
  for (const platform of wanted) {
    if (platform === 'tiktok' || platform === 'x' || platform === 'linkedin') {
      results.push({
        platform,
        status: 'manual',
        error: 'Copy this post and publish it on the account. TikTok and X are not approved for automatic posting yet.',
      });
      continue;
    }
    if (platform !== 'facebook' && platform !== 'instagram') continue;
    const account = await accountFor(platform);
    if (!account) {
      results.push({ platform, status: 'manual', error: 'Not connected. Use Connect Facebook & Instagram.' });
      continue;
    }
    try {
      results.push(await (platform === 'facebook' ? publishFacebook(post, account) : publishInstagram(post, account)));
    } catch (err) {
      results.push({ platform, status: 'failed', error: err.message || 'Publish failed' });
    }
  }
  const failed = results.some((r) => r.status === 'failed');
  const published = results.some((r) => r.status === 'published');
  post.results = results;
  post.status = failed ? 'failed' : (published ? 'published' : 'manual');
  await post.save();
  return post;
}

module.exports = { publishPost };
