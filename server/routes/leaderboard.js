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

const ADMIN_ROLE_CLAIMS = new Set([
  'admin',
  'super_admin',
  'admin_hr',
  'admin_accounting',
  'admin_qa',
]);

function attachAdminFromSession(req) {
  if (req.session && req.session.adminAuth === true && req.session.adminUsername) {
    req.user = {
      username: req.session.adminUsername,
      isAdmin: true,
      role: 'admin',
      adminId: req.session.adminId || null,
      adminRole: req.session.adminRole || 'super_admin',
      sessionVersion: req.session.adminSessionVersion,
    };
    return true;
  }
  return false;
}

/**
 * Admin portal uses an httpOnly session cookie; teacher/student use Bearer JWTs.
 * Prefer a valid admin session so an expired admin JWT does not 401 the leaderboard.
 */
function verifyLeaderboardAuth(req, res, next) {
  if (attachAdminFromSession(req)) return next();
  return verifyToken(req, res, next);
}

function requireAuthenticatedUser(req, res, next) {
  if (!req.user) {
    return res.status(401).json({ success: false, error: 'Authentication required' });
  }
  const role = String(req.user.role || req.user.userRole || req.user.userType || '').toLowerCase();
  const adminRole = String(req.user.adminRole || '').toLowerCase();
  const ok =
    role === 'teacher' ||
    role === 'student' ||
    ADMIN_ROLE_CLAIMS.has(role) ||
    ADMIN_ROLE_CLAIMS.has(adminRole) ||
    req.user.isAdmin === true ||
    !!req.user.teacherId ||
    !!req.user.studentId ||
    !!req.user.adminId;
  if (!ok) {
    return res.status(403).json({ success: false, error: 'Access denied' });
  }
  return next();
}

router.get('/students', verifyLeaderboardAuth, requireAuthenticatedUser, async (req, res) => {
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

router.get('/teachers', verifyLeaderboardAuth, requireAuthenticatedUser, async (req, res) => {
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

router.get('/meta', verifyLeaderboardAuth, requireAuthenticatedUser, async (req, res) => {
  res.json({
    success: true,
    currentMonth: currentMonthKey(),
    ageGroups: AGE_GROUPS,
  });
});

/** Optional rebuild (authenticated) — refreshes monthly snapshots. */
router.post('/rebuild', verifyLeaderboardAuth, requireAuthenticatedUser, async (req, res) => {
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
