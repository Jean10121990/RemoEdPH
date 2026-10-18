const crypto = require('crypto');
const { GardenError } = require('./errors');
const domain = require('./domain');
const { GARDEN_BADGES } = require('./badges.config');
const { CARD_SIZES, SHARE_VIEW_LIMIT, SHARE_VIEW_WINDOW_MS } = require('./share.config');
const { renderCard } = require('./pngCard');
const { escapeHtml } = require('./parentService');

function createViewLimiter({ max = SHARE_VIEW_LIMIT, windowMs = SHARE_VIEW_WINDOW_MS } = {}) {
  const hits = new Map();
  return function allow(ip, now = new Date()) {
    const t = now.getTime();
    const fresh = (hits.get(ip) || []).filter((ts) => t - ts < windowMs);
    if (fresh.length >= max) {
      hits.set(ip, fresh);
      return false;
    }
    fresh.push(t);
    hits.set(ip, fresh);
    return true;
  };
}

function captionFor(share, profile, parent) {
  const name = parent.displayNameOf(profile);
  if (share.type === 'badge') {
    const badge = GARDEN_BADGES.find((row) => row.key === share.targetId);
    const label = badge ? badge.name : 'badge';
    return {
      name,
      title: label,
      subtitle: name,
      text: 'I just earned the ' + label + ' badge on RemoEd! 🌳',
      message: name + ' earned the ' + label + ' badge.',
    };
  }
  if (share.type === 'tree') {
    const species = share.species || 'tree';
    const golden = share.perfectMonth ? 'Golden ' : '';
    return {
      name,
      title: golden + species,
      subtitle: (share.monthLabel || '') + ' ' + name,
      text: 'I grew a ' + species + ' tree on RemoEd by finishing my lessons! 🌳',
      message: name + ' grew a ' + golden + species + ' tree.',
    };
  }
  return {
    name,
    title: 'My Forest',
    subtitle: name,
    text: 'I grew my forest on RemoEd! 🌳',
    message: name + ' is growing a forest on RemoEd.',
  };
}

function createShareService({ repo, parent, origin = 'https://remoedph.com', allowView = createViewLimiter() }) {
  const cache = new Map();

  async function loadOwned(studentId, type, targetId) {
    if (type === 'forest') {
      const trees = repo.listAllTrees ? await repo.listAllTrees(studentId) : [];
      const completed = trees.filter((tree) => tree.completedAt);
      if (!completed.length) throw new GardenError(403, 'NOT_SHAREABLE', 'Finish a tree before sharing the forest.');
      return { species: '', monthLabel: '', perfectMonth: completed.some((tree) => tree.perfectMonth) };
    }
    if (type === 'badge') {
      const owned = repo.listBadges ? await repo.listBadges(studentId) : [];
      if (!owned.some((row) => row.badgeKey === targetId)) {
        throw new GardenError(403, 'NOT_SHAREABLE', 'That badge is not earned yet.');
      }
      return {};
    }
    if (type === 'tree') {
      const tree = repo.findTreeById ? await repo.findTreeById(targetId) : null;
      if (!tree || tree.studentId !== studentId || !tree.completedAt) {
        throw new GardenError(403, 'NOT_SHAREABLE', 'Only a finished tree can be shared.');
      }
      return {
        species: tree.species,
        monthLabel: domain.monthLabel(tree.monthKey),
        perfectMonth: !!tree.perfectMonth,
      };
    }
    throw new GardenError(400, 'BAD_SHARE', 'Choose a badge, a tree, or the forest.');
  }

  async function createShare(viewerId, { type, targetId, childUsername, view } = {}, now = new Date()) {
    const children = repo.listLinkedChildren ? await repo.listLinkedChildren(viewerId) : [];
    const studentId = childUsername || viewerId;
    if (!children.some((child) => child.username === studentId)) {
      throw new GardenError(403, 'NOT_YOUR_CHILD', 'That student is not linked to this parent.');
    }
    const asParent = view === 'parent' || (!!childUsername && childUsername !== viewerId);
    const profile = children.find((child) => child.username === studentId);
    if (!asParent && !parent.sharingOn(profile)) {
      throw new GardenError(403, 'SHARING_DISABLED', 'Ask your parent to turn on sharing.');
    }
    const extra = await loadOwned(studentId, type, String(targetId || ''));
    const keyTarget = type === 'forest' ? 'summary' : String(targetId || '');
    let row = repo.findShareByTarget ? await repo.findShareByTarget(studentId, type, keyTarget) : null;
    if (row && row.revokedAt && repo.clearRevoke) {
      await repo.clearRevoke(row.shareId);
      row = { ...row, revokedAt: null };
    }
    if (!row) {
      const shareId = crypto.randomBytes(16).toString('base64url');
      const doc = {
        shareId,
        studentId,
        type,
        targetId: keyTarget,
        createdAt: now,
        revokedAt: null,
        viewCount: 0,
        audit: [{ action: 'create', at: now, by: viewerId }],
        ...extra,
      };
      const inserted = repo.insertShare ? await repo.insertShare(doc) : doc;
      row = inserted || (await repo.findShareByTarget(studentId, type, keyTarget));
    }
    if (repo.shareAudit) await repo.shareAudit({ studentId, shareId: row.shareId, action: 'create', at: now, by: viewerId });
    return { shareId: row.shareId, url: origin + '/share/' + row.shareId, replayed: false };
  }

  async function revoke(viewerId, shareId, now = new Date()) {
    const row = repo.findShareById ? await repo.findShareById(shareId) : null;
    if (!row) throw new GardenError(404, 'SHARE_NOT_FOUND', 'That link is not available.');
    const children = repo.listLinkedChildren ? await repo.listLinkedChildren(viewerId) : [];
    if (!children.some((child) => child.username === row.studentId)) {
      throw new GardenError(403, 'NOT_YOUR_CHILD', 'That student is not linked to this parent.');
    }
    if (repo.revokeShare) await repo.revokeShare(shareId, now, viewerId);
    cache.delete(shareId + ':og');
    cache.delete(shareId + ':square');
    return { ok: true };
  }

  async function publicShare(shareId, ip, now = new Date()) {
    if (!allowView(ip || 'unknown', now)) {
      throw new GardenError(429, 'RATE_LIMIT', 'Too many views. Try again in a minute.');
    }
    const row = repo.findShareById ? await repo.findShareById(shareId) : null;
    if (!row || row.revokedAt) throw new GardenError(404, 'SHARE_NOT_FOUND', 'That link is not available.');
    if (repo.bumpView) await repo.bumpView(shareId);
    const profile = repo.profile ? await repo.profile(row.studentId) : null;
    const copy = captionFor(row, profile, parent);
    return { row, copy };
  }

  function pageHtml(copy, shareId) {
    const url = origin + '/share/' + shareId;
    const image = url + '/card.png?variant=og';
    return '<!DOCTYPE html><html><head><meta charset="utf-8">'
      + '<meta name="robots" content="noindex">'
      + '<meta property="og:title" content="' + escapeHtml(copy.title) + '">'
      + '<meta property="og:description" content="' + escapeHtml(copy.message) + '">'
      + '<meta property="og:image" content="' + escapeHtml(image) + '">'
      + '<meta property="og:url" content="' + escapeHtml(url) + '">'
      + '<meta name="twitter:card" content="summary_large_image">'
      + '<title>' + escapeHtml(copy.title) + '</title></head><body>'
      + '<p>' + escapeHtml(copy.message) + '</p>'
      + '<img alt="" src="' + escapeHtml(image) + '">'
      + '<p><a href="' + escapeHtml(origin) + '/">Start learning with RemoEd</a></p>'
      + '</body></html>';
  }

  async function cardPng(shareId, variant) {
    const key = shareId + ':' + (variant === 'square' ? 'square' : 'og');
    if (cache.has(key)) return cache.get(key);
    const row = repo.findShareById ? await repo.findShareById(shareId) : null;
    if (!row || row.revokedAt) throw new GardenError(404, 'SHARE_NOT_FOUND', 'That link is not available.');
    const profile = repo.profile ? await repo.profile(row.studentId) : null;
    const copy = captionFor(row, profile, parent);
    const size = variant === 'square' ? CARD_SIZES.square : CARD_SIZES.og;
    const png = renderCard({ width: size.width, height: size.height, title: copy.title, subtitle: copy.name });
    cache.set(key, png);
    return png;
  }

  return { createShare, revoke, publicShare, pageHtml, cardPng, captionFor };
}

module.exports = { createShareService, createViewLimiter, captionFor };
