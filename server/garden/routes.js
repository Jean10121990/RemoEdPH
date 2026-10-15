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
 * @param {{ garden, play, auth: Function[], isLocked?: (req) => boolean, clock?: () => Date }} deps
 */
function createGardenRouter({ garden, auth, isLocked = () => false, clock = () => new Date() }) {
  const router = express.Router();
  router.use(...auth);

  router.get(
    '/current',
    withStudent(async (req, res, studentId) => {
      const data = await garden.getCurrent(studentId, clock());
      res.json({
        success: true,
        locked: !!isLocked(req),
        avatarUrl: safeAvatar(req.student && req.student.profilePicture),
        ...data,
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
    '/seen-stage',
    withStudent(async (req, res, studentId) => {
      const body = req.body || {};
      const result = await garden.markSeenStage(
        studentId,
        { monthKey: typeof body.monthKey === 'string' ? body.monthKey : '', stage: body.stage },
        clock()
      );
      res.json({ success: true, ...result });
    }, 'Could not save the garden')
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

module.exports = { createGardenRouter, createPlayRouter, safeAvatar };
