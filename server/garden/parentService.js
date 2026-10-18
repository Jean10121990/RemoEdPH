const { GardenError } = require('./errors');
const domain = require('./domain');
const config = require('./garden.config');
const math = require('./rewardMath');
const { MIN_SHARE_AGE, ANONYMOUS_NAME } = require('./share.config');

function escapeHtml(value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function firstNameOf(student) {
  const first = String((student && student.firstName) || '').trim().split(/\s+/)[0];
  return first || 'Your child';
}

function sharingOn(student) {
  if (!student) return false;
  if (student.sharingEnabled === true) return true;
  if (student.sharingEnabled === false) return false;
  const age = Number(student.age);
  return Number.isFinite(age) && age >= MIN_SHARE_AGE;
}

function displayNameOf(student) {
  const mode = student && student.shareDisplay ? student.shareDisplay : 'first';
  if (mode === 'anonymous') return ANONYMOUS_NAME;
  if (mode === 'nickname') {
    const nick = String((student && student.nickname) || '').trim();
    if (nick) return nick.split(/\s+/)[0];
  }
  const first = String((student && student.firstName) || '').trim().split(/\s+/)[0];
  return first || ANONYMOUS_NAME;
}

function createParentService({ repo, garden }) {
  async function childrenOf(viewerId) {
    if (!repo.listLinkedChildren) return [];
    return repo.listLinkedChildren(viewerId);
  }

  function linked(children, childId) {
    return children.some((child) => child.username === childId);
  }

  async function cardFor(child, now) {
    const monthKey = domain.monthKeyOf(now, config.GARDEN_TIMEZONE);
    const trees = repo.listAllTrees ? await repo.listAllTrees(child.username) : [];
    const monthTrees = trees.filter((tree) => tree.monthKey === monthKey);
    const active = monthTrees.find((tree) => !tree.completedAt) || monthTrees[0] || null;
    const claims = repo.listClaims ? (await repo.listClaims(child.username)) : [];
    const grants = repo.listCreditGrants ? await repo.listCreditGrants(monthKey) : [];
    const mine = grants.filter((row) => row.studentId === child.username);
    const breakdown = [];
    const addLine = (source, label) => {
      const credits = mine.filter((row) => row.source === source).reduce((n, row) => n + (Number(row.credits) || 0), 0);
      if (credits > 0) breakdown.push({ label, credits });
    };
    addLine('tier1', 'Tree reward');
    addLine('tier2', 'Perfect month');
    addLine('streak', 'Streak bonus');
    addLine('evergreen', 'Evergreen bonus');
    const freeLessonsThisMonth = breakdown.reduce((n, row) => n + row.credits, 0);
    const lessonsDone = repo.countLedger ? await repo.countLedger(child.username, monthKey, 'lesson') : 0;
    let treeLine = null;
    let eligibilityTip = '';
    if (active) {
      const points = await repo.sumGrowthPoints(child.username, active.monthKey, active.sequence || 1);
      const stageIndex = domain.stageIndexFor(points, active.monthlyTarget);
      const stage = config.STAGES[stageIndex];
      treeLine = {
        species: active.species,
        stage: stage.name,
        lessonsDone,
        lessonsTarget: active.monthlyTarget,
        text: active.species + ' tree: ' + stage.name + ', ' + lessonsDone + ' of ' + active.monthlyTarget + ' lessons',
      };
      const required = math.lessonsRequired(active.monthlyTarget);
      if (lessonsDone < required) {
        eligibilityTip = 'needs ' + (required - lessonsDone) + ' more lessons to be eligible';
      }
    }
    const lots = Array.isArray(child.creditLots) ? child.creditLots : [];
    const activeLots = lots.filter((lot) => (Number(lot.creditsRemaining) || 0) > 0 && (!lot.expiresAt || new Date(lot.expiresAt) > now));
    const unusedCredits = activeLots.reduce((n, lot) => n + (Number(lot.creditsRemaining) || 0), 0);
    const expiries = activeLots.map((lot) => new Date(lot.expiresAt)).filter((d) => !Number.isNaN(d.getTime()));
    const nearestExpiry = expiries.length ? new Date(Math.min(...expiries.map((d) => d.getTime()))).toISOString() : null;
    const allGrants = repo.listCreditGrants ? await repo.listCreditGrants() : [];
    const badges = repo.listBadges ? await repo.listBadges(child.username) : [];
    return {
      childUsername: child.username,
      childName: firstNameOf(child),
      monthKey,
      freeLessonsThisMonth,
      breakdown,
      tree: treeLine,
      eligibilityTip,
      unusedCredits,
      nearestExpiry,
      bookUrl: 'student-book.html',
      lifetime: {
        freeLessons: allGrants.filter((row) => row.studentId === child.username).reduce((n, row) => n + (Number(row.credits) || 0), 0),
        trees: trees.filter((tree) => tree.completedAt).length,
        badges: badges.length,
      },
      sharingEnabled: sharingOn(child),
      shareDisplay: child.shareDisplay || 'first',
      zero: freeLessonsThisMonth === 0,
      zeroMessage: freeLessonsThisMonth === 0 ? 'No free lessons yet this month.' : '',
      claimCount: claims.length,
    };
  }

  async function cards(viewerId, now = new Date()) {
    const children = await childrenOf(viewerId);
    const cardsOut = [];
    for (const child of children) cardsOut.push(await cardFor(child, now));
    return { cards: cardsOut };
  }

  async function setSharing(viewerId, childUsername, patch, now = new Date()) {
    const children = await childrenOf(viewerId);
    if (!linked(children, childUsername)) {
      throw new GardenError(403, 'NOT_YOUR_CHILD', 'That student is not linked to this parent.');
    }
    const next = {};
    if (patch.sharingEnabled != null) next.sharingEnabled = !!patch.sharingEnabled;
    if (patch.shareDisplay != null) {
      const mode = String(patch.shareDisplay);
      if (!['first', 'nickname', 'anonymous'].includes(mode)) {
        throw new GardenError(400, 'BAD_DISPLAY_NAME', 'Choose a first name, a nickname, or A RemoEd student.');
      }
      next.shareDisplay = mode;
    }
    if (repo.setSharing) await repo.setSharing(childUsername, next);
    if (repo.shareAudit) {
      await repo.shareAudit({ studentId: childUsername, shareId: '', action: 'sharing-settings', at: now, by: viewerId });
    }
    return { ok: true, sharingEnabled: sharingOn({ ...(children.find((c) => c.username === childUsername) || {}), ...next }) };
  }

  async function certificate(viewerId, treeId) {
    const children = await childrenOf(viewerId);
    const tree = repo.findTreeById ? await repo.findTreeById(treeId) : null;
    if (!tree || !tree.completedAt || !linked(children, tree.studentId)) {
      throw new GardenError(404, 'TREE_NOT_FOUND', 'That certificate is not available.');
    }
    const child = children.find((row) => row.username === tree.studentId) || {};
    const name = [child.firstName, child.lastName].filter(Boolean).join(' ') || firstNameOf(child);
    const when = tree.completedAt ? new Date(tree.completedAt) : new Date();
    const fields = {
      studentName: name,
      species: tree.species,
      month: domain.monthLabel(tree.monthKey),
      date: when.toLocaleDateString('en-PH', { timeZone: config.GARDEN_TIMEZONE }),
      level: child.level || '',
    };
    const html = '<!DOCTYPE html><html><head><meta charset="utf-8"><title>Garden certificate</title>'
      + '<style>body{font-family:Georgia,serif;text-align:center;padding:48px;color:#14532d}'
      + 'h1{font-size:42px} .rule{height:4px;background:#22c55e;margin:16px auto;width:240px}'
      + '@media print{button{display:none}}</style></head><body>'
      + '<p>RemoEd</p><h1>Garden certificate</h1><div class="rule"></div>'
      + '<p>' + escapeHtml(fields.studentName) + '</p>'
      + '<p>grew a ' + escapeHtml(fields.species) + ' tree</p>'
      + '<p>' + escapeHtml(fields.month) + '</p>'
      + '<p>' + escapeHtml(fields.date) + '</p>'
      + '<p>' + escapeHtml(fields.level) + '</p>'
      + '<button onclick="print()">Print</button></body></html>';
    return { ...fields, html };
  }

  async function creditReport(monthKey) {
    if (!domain.isValidMonthKey(monthKey)) {
      throw new GardenError(400, 'INVALID_MONTH', 'Month must look like 2026-10.');
    }
    const rows = repo.listCreditGrants ? await repo.listCreditGrants(monthKey) : [];
    const bySource = { tier1: 0, tier2: 0, streak: 0, evergreen: 0 };
    const students = new Set();
    rows.forEach((row) => {
      if (!bySource.hasOwnProperty(row.source)) return;
      const n = Number(row.credits) || 0;
      bySource[row.source] += n;
      if (n > 0) students.add(row.studentId);
    });
    const totalCredits = Object.values(bySource).reduce((n, v) => n + v, 0);
    return { monthKey, students: students.size, totalCredits, bySource };
  }

  return { cards, setSharing, certificate, creditReport, sharingOn, displayNameOf, firstNameOf };
}

module.exports = { createParentService, escapeHtml };
