/**
 * Garden + Play & Learn completion routes.
 * Auth: every route is student Bearer (verifyToken + requireStudent). The student is
 * always req.student.username from the JWT; no route accepts a student id from the client.
 */
const express = require('express');
const { GardenError } = require('./errors');

function studentKey(req) {
  return req.student && req.student.username ? String(req.student.username) : '';
}

function sendError(res, err, fallback) {
  if (err instanceof GardenError) {
    return res.status(err.status).json({ success: false, error: err.message, code: err.code });
  }
  console.error(fallback + ':', err && err.message);
  return res.status(500).json({ success: false, error: fallback, code: 'SERVER_ERROR' });
}

function withStudent(handler, fallback) {
  return async (req, res) => {
    const studentId = studentKey(req);
    if (!studentId) {
      return res.status(401).json({ success: false, error: 'Student session required.', code: 'NO_STUDENT' });
    }
    try {
      await handler(req, res, studentId);
    } catch (err) {
      sendError(res, err, fallback);
    }
  };
}

/** Only app upload/image paths or https images; anything else falls back to Remo. */
function safeAvatar(value) {
  const v = String(value || '').trim();
  if (/^\/(uploads|images)\/[\w./-]+$/.test(v) || /^https:\/\/[^\s"'<>]+$/.test(v)) return v;
  return '';
}

/**
 * @param {{ garden, care, play, auth: Function[], isLocked?: (req) => boolean, clock?: () => Date }} deps
 */
function viewOf(req) {
  return String(req.get('x-remoed-view') || '');
}

function createGardenRouter({ garden, care, rewards, parent, shares, auth, isLocked = () => false, clock = () => new Date() }) {
  const router = express.Router();
  router.use(...auth);

  router.get(
    '/current',
    withStudent(async (req, res, studentId) => {
      const now = clock();
      const data = await garden.getCurrent(studentId, now);
      if (rewards && rewards.remindExpiring) await rewards.remindExpiring(studentId, now);
      const rewardPreview = rewards && rewards.previewForTree ? await rewards.previewForTree(studentId, data.tree) : null;
      res.json({
        success: true,
        locked: !!isLocked(req),
        avatarUrl: safeAvatar(req.student && req.student.profilePicture),
        ...data,
        rewardPreview,
      });
    }, 'Could not load the garden')
  );

  router.get(
    '/history',
    withStudent(async (req, res, studentId) => {
      res.json({ success: true, trees: await garden.getHistory(studentId, clock()) });
    }, 'Could not load past trees')
  );

  router.post(
    '/care',
    withStudent(async (req, res, studentId) => {
      if (!care || typeof care.applyCare !== 'function') {
        return res.status(500).json({ success: false, error: 'Care is not available.', code: 'SERVER_ERROR' });
      }
      const body = req.body || {};
      const result = await care.applyCare(
        studentId,
        {
          action: typeof body.action === 'string' ? body.action : '',
          requestId: typeof body.requestId === 'string' ? body.requestId : '',
          monthKey: typeof body.monthKey === 'string' ? body.monthKey : '',
          view: viewOf(req),
        },
        clock()
      );
      res.json({ success: true, ...result });
    }, 'Could not tend the tree')
  );

  router.get(
    '/forest',
    withStudent(async (req, res, studentId) => {
      res.json({ success: true, ...(await rewards.forest(studentId)) });
    }, 'Could not load your forest')
  );

  router.post(
    '/plant',
    withStudent(async (req, res, studentId) => {
      res.json({ success: true, ...(await rewards.plantBonus(studentId, clock(), viewOf(req))) });
    }, 'Could not plant a new tree')
  );

  router.post(
    '/decorate',
    withStudent(async (req, res, studentId) => {
      const body = req.body || {};
      const result = await rewards.buyDecoration(
        studentId,
        typeof body.itemKey === 'string' ? body.itemKey : '',
        typeof body.requestId === 'string' ? body.requestId : '',
        clock(),
        viewOf(req)
      );
      res.json({ success: true, ...result });
    }, 'Could not add that decoration')
  );

  router.post(
    '/trees/:treeId/claim',
    withStudent(async (req, res, studentId) => {
      res.json({ success: true, ...(await rewards.claim(studentId, String(req.params.treeId), clock(), null, viewOf(req))) });
    }, 'Could not claim that tree')
  );

  router.get(
    '/trees/:treeId',
    withStudent(async (req, res, studentId) => {
      const tree = await rewards.forest(studentId);
      const row = (tree.trees || []).find((item) => item.id === String(req.params.treeId));
      if (!row) return res.status(404).json({ success: false, error: 'That tree is not yours.', code: 'TREE_NOT_FOUND' });
      res.json({ success: true, tree: row });
    }, 'Could not load that tree')
  );

  router.get(
    '/parent',
    withStudent(async (req, res, studentId) => {
      res.json({ success: true, ...(await parent.cards(studentId, clock())) });
    }, 'Could not load the parent garden')
  );

  router.post(
    '/parent/sharing',
    withStudent(async (req, res, studentId) => {
      const body = req.body || {};
      const result = await parent.setSharing(studentId, String(body.childUsername || studentId), {
        sharingEnabled: body.sharingEnabled,
        shareDisplay: body.shareDisplay,
      }, clock());
      res.json({ success: true, ...result });
    }, 'Could not update sharing')
  );

  router.get(
    '/trees/:treeId/certificate',
    withStudent(async (req, res, studentId) => {
      res.json({ success: true, ...(await parent.certificate(studentId, String(req.params.treeId))) });
    }, 'Could not load that certificate')
  );

  router.post(
    '/shares',
    withStudent(async (req, res, studentId) => {
      const body = req.body || {};
      const result = await shares.createShare(studentId, {
        type: typeof body.type === 'string' ? body.type : '',
        targetId: typeof body.targetId === 'string' ? body.targetId : '',
        childUsername: typeof body.childUsername === 'string' ? body.childUsername : '',
        view: viewOf(req),
      }, clock());
      res.json({ success: true, ...result });
    }, 'Could not create a share link')
  );

  router.post(
    '/shares/:shareId/revoke',
    withStudent(async (req, res, studentId) => {
      res.json({ success: true, ...(await shares.revoke(studentId, String(req.params.shareId), clock())) });
    }, 'Could not stop sharing')
  );

  router.get(
    '/:monthKey',
    withStudent(async (req, res, studentId) => {
      res.json({ success: true, tree: await garden.getTree(studentId, String(req.params.monthKey), clock()) });
    }, 'Could not load that tree')
  );

  return router;
}

function createPlayRouter({ play, auth, clock = () => new Date() }) {
  const router = express.Router();
  router.use(...auth);

  router.post(
    '/games/:gameId/start',
    withStudent(async (req, res, studentId) => {
      res.json({ success: true, ...play.startGame(studentId, String(req.params.gameId), clock()) });
    }, 'Could not start the game')
  );

  router.post(
    '/games/:gameId/finish',
    withStudent(async (req, res, studentId) => {
      const body = req.body || {};
      const ecoDrop = await play.finishGame(
        studentId,
        String(req.params.gameId),
        { ticket: typeof body.ticket === 'string' ? body.ticket : '', roundsCompleted: body.roundsCompleted },
        clock()
      );
      res.json({ success: true, ecoDrop });
    }, 'Could not finish the game')
  );

  return router;
}

function createSharePageRouter({ shares }) {
  const router = express.Router();
  router.get('/:shareId/card.png', async (req, res) => {
    try {
      const png = await shares.cardPng(String(req.params.shareId), String(req.query.variant || 'og'));
      res.set('Cache-Control', 'public, max-age=86400');
      res.type('png').send(png);
    } catch (err) {
      sendError(res, err, 'Could not draw that card');
    }
  });
  router.get('/:shareId', async (req, res) => {
    try {
      const ip = req.ip || '';
      const pub = await shares.publicShare(String(req.params.shareId), ip);
      res.set('X-Robots-Tag', 'noindex');
      res.type('html').send(shares.pageHtml(pub.copy, pub.row.shareId));
    } catch (err) {
      if (err instanceof GardenError && err.status === 429) {
        return res.status(429).type('html').send('<!DOCTYPE html><title>Slow down</title><p>Too many views. Try again in a minute.</p>');
      }
      return res.status(404).type('html').send('<!DOCTYPE html><meta name="robots" content="noindex"><title>Not found</title><p>That link is not available.</p>');
    }
  });
  return router;
}

function createGardenAdminRouter({ parent, auth }) {
  const router = express.Router();
  router.use(...auth);
  router.get('/credits', async (req, res) => {
    try {
      const monthKey = String(req.query.monthKey || '');
      res.json({ success: true, ...(await parent.creditReport(monthKey)) });
    } catch (err) {
      sendError(res, err, 'Could not load the garden credit report');
    }
  });
  return router;
}

module.exports = {
  createGardenRouter,
  createPlayRouter,
  createSharePageRouter,
  createGardenAdminRouter,
  safeAvatar,
};
