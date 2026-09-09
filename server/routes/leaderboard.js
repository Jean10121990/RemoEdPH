/**
 * Platform leaderboard API — accessible by any authenticated portal user.
 */
const express = require('express');
const { verifyToken } = require('../authMiddleware');
const {
  getStudentLeaderboard,
  getTeacherLeaderboard,
  rebuildMonth,
  normalizeMonth,
  currentMonthKey,
  AGE_GROUPS,
} = require('../services/leaderboardService');

const router = express.Router();

function requireAuthenticatedUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  const role = String(req.user.role || req.user.userRole || req.user.userType || '').toLowerCase();
  const ok =
    role === 'teacher' ||
    role === 'student' ||
    role === 'admin' ||
    req.user.isAdmin === true ||
    !!req.user.teacherId ||
    !!req.user.studentId;
  if (!ok) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  return next();
}

router.get('/students', verifyToken, requireAuthenticatedUser, async (req, res) => {
  try {
    const month = normalizeMonth(req.query.month);
    const ageGroup = String(req.query.ageGroup || 'ALL').trim() || 'ALL';
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const data = await getStudentLeaderboard({ month, ageGroup, page, pageSize });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('GET /api/leaderboard/students:', err);
    res.status(500).json({ success: false, error: 'Failed to load student leaderboard' });
  }
});

router.get('/teachers', verifyToken, requireAuthenticatedUser, async (req, res) => {
  try {
    const month = normalizeMonth(req.query.month);
    const page = parseInt(req.query.page, 10) || 1;
    const pageSize = parseInt(req.query.pageSize, 10) || 20;
    const data = await getTeacherLeaderboard({ month, page, pageSize });
    res.json({ success: true, ...data });
  } catch (err) {
    console.error('GET /api/leaderboard/teachers:', err);
    res.status(500).json({ success: false, error: 'Failed to load teacher leaderboard' });
  }
});

router.get('/meta', verifyToken, requireAuthenticatedUser, async (req, res) => {
  res.json({
    success: true,
    currentMonth: currentMonthKey(),
    ageGroups: AGE_GROUPS,
  });
});

/** Optional rebuild (authenticated) — refreshes monthly snapshots. */
router.post('/rebuild', verifyToken, requireAuthenticatedUser, async (req, res) => {
  try {
    const month = normalizeMonth(req.body && req.body.month);
    const result = await rebuildMonth(month);
    res.json({ success: true, ...result });
  } catch (err) {
    console.error('POST /api/leaderboard/rebuild:', err);
    res.status(500).json({ success: false, error: 'Failed to rebuild leaderboard' });
  }
});

module.exports = router;
