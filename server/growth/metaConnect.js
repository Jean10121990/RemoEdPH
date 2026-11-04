'use strict';

const { facebookAppId, facebookAppSecret, facebookConfigured } = require('../config/oauth');
const { signState, verifyState } = require('../services/oauthState');
const SocialAccount = require('../models/SocialAccount');
const { encryptPiiString, decryptPiiString } = require('../utils/piiCrypto');

const GRAPH = 'https://graph.facebook.com/v21.0';
const PREFERRED = ['remoed', 'remoedph'];

function metaRedirectUri() {
  const fromEnv = String(process.env.META_OAUTH_REDIRECT_URI || '').trim();
  if (fromEnv) return fromEnv;
  const base = String(process.env.FRONTEND_URL || 'https://remoedph.com').trim().replace(/\/$/, '');
  return base + '/api/auth/oauth/facebook/callback';
}

function connectUrl(adminId) {
  const state = signState({ purpose: 'meta_pages', adminId: String(adminId || '') });
  const url = new URL('https://www.facebook.com/v21.0/dialog/oauth');
  url.searchParams.set('client_id', facebookAppId());
  url.searchParams.set('redirect_uri', metaRedirectUri());
  url.searchParams.set('state', state);
  url.searchParams.set('response_type', 'code');
  url.searchParams.set(
    'scope',
    [
      'pages_show_list',
      'pages_manage_posts',
      'pages_read_engagement',
      'pages_messaging',
      'instagram_basic',
      'instagram_content_publish',
      'business_management',
    ].join(',')
  );
  return url.toString();
}

async function graph(path, token, { method = 'GET', body = null } = {}) {
  const url = new URL(GRAPH + path);
  const opts = { method, headers: {} };
  if (method === 'GET') {
    url.searchParams.set('access_token', token);
  } else {
    const form = new URLSearchParams(body || {});
    form.set('access_token', token);
    opts.headers['Content-Type'] = 'application/x-www-form-urlencoded';
    opts.body = form.toString();
  }
  let res;
  try {
    res = await fetch(url, opts);
  } catch (_e) {
    throw new Error('Could not reach Facebook');
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || data.error) {
    const message = (data.error && data.error.message) || 'Facebook returned an error';
    const err = new Error(message);
    err.graph = true;
    throw err;
  }
  return data;
}

async function exchangeCode(code) {
  const url = new URL(GRAPH + '/oauth/access_token');
  url.searchParams.set('client_id', facebookAppId());
  url.searchParams.set('client_secret', facebookAppSecret());
  url.searchParams.set('redirect_uri', metaRedirectUri());
  url.searchParams.set('code', code);
  const res = await fetch(url);
  const data = await res.json().catch(() => ({}));
  if (!data.access_token) {
    throw new Error((data.error && data.error.message) || 'Facebook did not return a token');
  }
  const longUrl = new URL(GRAPH + '/oauth/access_token');
  longUrl.searchParams.set('grant_type', 'fb_exchange_token');
  longUrl.searchParams.set('client_id', facebookAppId());
  longUrl.searchParams.set('client_secret', facebookAppSecret());
  longUrl.searchParams.set('fb_exchange_token', data.access_token);
  const longRes = await fetch(longUrl);
  const longData = await longRes.json().catch(() => ({}));
  return longData.access_token || data.access_token;
}

function pageScore(page) {
  const blob = `${page.username || ''} ${page.name || ''} ${page.link || ''}`.toLowerCase();
  if (PREFERRED.some((name) => blob.includes(name))) return 2;
  if (blob.includes('remoed')) return 1;
  return 0;
}

async function choosePage(userToken) {
  const data = await graph(
    '/me/accounts?fields=id,name,access_token,instagram_business_account{id,username}',
    userToken
  );
  const pages = Array.isArray(data.data) ? data.data : [];
  if (!pages.length) {
    throw new Error('This Facebook login does not manage a Page. Use an admin of the RemoEd page.');
  }
  const ranked = [];
  for (const page of pages) {
    let username = '';
    let link = '';
    try {
      const info = await graph('/' + page.id + '?fields=username,link', page.access_token);
      username = info.username || '';
      link = info.link || '';
    } catch (_e) { /* name match still works */ }
    ranked.push({ ...page, username, link, score: pageScore({ ...page, username, link }) });
  }
  ranked.sort((a, b) => b.score - a.score);
  return ranked[0];
}

async function saveConnectedPage(page) {
  const pageToken = encryptPiiString(page.access_token);
  await SocialAccount.findOneAndUpdate(
    { platform: 'facebook' },
    {
      platform: 'facebook',
      accountName: page.name || page.username || 'Facebook Page',
      externalId: String(page.id),
      tokenEncrypted: pageToken,
      enabled: true,
    },
    { upsert: true, new: true }
  );
  const ig = page.instagram_business_account;
  if (ig && ig.id) {
    await SocialAccount.findOneAndUpdate(
      { platform: 'instagram' },
      {
        platform: 'instagram',
        accountName: ig.username ? '@' + ig.username : 'Instagram',
        externalId: String(ig.id),
        tokenEncrypted: pageToken,
        enabled: true,
      },
      { upsert: true, new: true }
    );
  } else {
    await SocialAccount.updateOne(
      { platform: 'instagram' },
      { $set: { enabled: false, tokenEncrypted: '', externalId: '', accountName: '' } }
    );
  }
  return {
    facebook: page.name || page.username || 'Facebook Page',
    instagram: ig && ig.username ? '@' + ig.username : '',
  };
}

function readState(state) {
  const body = verifyState(state);
  if (!body || body.purpose !== 'meta_pages' || !body.adminId) return null;
  return body;
}

async function facebookPageAuth() {
  const row = await SocialAccount.findOne({ platform: 'facebook', enabled: true }).lean();
  if (row && row.tokenEncrypted && row.externalId) {
    return { token: decryptPiiString(row.tokenEncrypted), pageId: row.externalId };
  }
  const env = String(process.env.META_PAGE_ACCESS_TOKEN || '').trim();
  if (env) return { token: env, pageId: '' };
  return null;
}

async function accountFor(platform) {
  const row = await SocialAccount.findOne({ platform, enabled: true }).lean();
  if (!row || !row.tokenEncrypted || !row.externalId) return null;
  return {
    token: decryptPiiString(row.tokenEncrypted),
    externalId: row.externalId,
    accountName: row.accountName || '',
  };
}

function publicAccounts(rows) {
  const byPlatform = {};
  (rows || []).forEach((row) => {
    byPlatform[row.platform] = {
      platform: row.platform,
      accountName: row.accountName || '',
      connected: !!(row.enabled && row.tokenEncrypted && row.externalId),
    };
  });
  return ['facebook', 'instagram', 'tiktok', 'x'].map((platform) => byPlatform[platform] || {
    platform,
    accountName: '',
    connected: false,
  });
}

function renderMetaPage(ok, message) {
  const safe = String(message || '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));
  const next = ok
    ? `<script>try{sessionStorage.setItem('remoed_meta_connect',${JSON.stringify(message || 'Connected')});}catch(e){}if(window.top){window.top.location='/admin/admin-marketing-hub.html#posts';}</script>`
    : '<p><a href="/admin/admin-marketing-hub.html#posts">Back to Marketing Hub</a></p>';
  return `<!DOCTYPE html><html><body style="font-family:Segoe UI,Arial,sans-serif;padding:24px;color:#1a365d;"><h1>${ok ? 'Connected' : 'Not connected'}</h1><p>${safe}</p>${next}</body></html>`;
}

/** Facebook returns to the already-whitelisted student login callback. State purpose selects this flow. */
async function completeMetaOAuth(query) {
  const state = readState(query && query.state);
  if (!state) return null;
  if (query.error) return renderMetaPage(false, 'Facebook did not grant access.');
  const Admin = require('../models/Admin');
  const admin = await Admin.findById(state.adminId).select('_id').lean();
  if (!admin) return renderMetaPage(false, 'That admin account was not found.');
  const code = String(query.code || '');
  if (!code) return renderMetaPage(false, 'Facebook did not return a code.');
  const userToken = await exchangeCode(code);
  const page = await choosePage(userToken);
  const saved = await saveConnectedPage(page);
  let inboxNote = '';
  try {
    await graph('/' + page.id + '/subscribed_apps', page.access_token, {
      method: 'POST',
      body: { subscribed_fields: 'messages' },
    });
  } catch (subErr) {
    inboxNote = ' Page messages were not subscribed: ' + (subErr.message || 'Facebook refused.');
  }
  const line = (saved.instagram
    ? `Connected ${saved.facebook} and Instagram ${saved.instagram}.`
    : `Connected ${saved.facebook}. Instagram is not linked to that Page yet.`) + inboxNote;
  return renderMetaPage(true, line);
}

module.exports = {
  facebookConfigured,
  metaRedirectUri,
  connectUrl,
  exchangeCode,
  choosePage,
  saveConnectedPage,
  readState,
  facebookPageAuth,
  accountFor,
  publicAccounts,
  graph,
  renderMetaPage,
  completeMetaOAuth,
};
