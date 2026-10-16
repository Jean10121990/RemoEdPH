/**
 * Social OAuth routes: /api/auth/oauth/*
 * Auth: public start/callback/providers/exchange; link/unlink/set-password need portal JWT.
 */
const express = require('express');
const { authLoginLimiter, authRegisterLimiter } = require('../middleware/apiRateLimits');
const { providerPublicStatus } = require('../config/oauth');
const {
  OAuthError,
  buildAuthUrl,
  handleCallback,
  listProvidersForUser,
  unlinkProvider,
  setPasswordForOAuthUser,
} = require('../services/oauthService');
const { verifyFinishTicket, verifyState } = require('../services/oauthState');
const { verifyToken } = require('../authMiddleware');
const { getAdminLoginPathSegment } = require('../utils/adminRouteConfig');
const { sendAdminAuthChallenge } = require('../services/adminAuthChallenge');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const Admin = require('../models/Admin');

const router = express.Router();

function portalRole(req) {
  const u = req.user || {};
  return String(u.userRole || u.userType || u.role || '')
    .trim()
    .toLowerCase();
}

async function loadPortalUser(req) {
  const role = portalRole(req);
  if (role === 'student') {
    return { role, user: await Student.findOne({ username: req.user.username }) };
  }
  if (role === 'teacher') {
    return { role, user: await Teacher.findOne({ username: req.user.username }) };
  }
  return { role: '', user: null };
}

function sendOAuthError(res, err) {
  if (err instanceof OAuthError) {
    return res.status(err.status || 400).json({
      success: false,
      code: err.code,
      message: err.message,
      ...err.extra,
    });
  }
  console.error('[oauth]', err && err.message ? err.message : err);
  return res.status(500).json({ success: false, message: 'Social sign-in failed. Please try again.' });
}

function redirectError(res, req, err, query) {
  const base = String(process.env.OAUTH_PUBLIC_BASE_URL || process.env.FRONTEND_URL || '')
    .trim()
    .replace(/\/$/, '');
  const host = base || `${req.protocol}://${req.get('host') || 'localhost'}`.replace(/\/$/, '');
  let path = '/oauth-finish.html';
  try {
    const state = query && query.state ? verifyState(query.state) : null;
    if (state && state.intent === 'admin_login') {
      path = `/${getAdminLoginPathSegment()}`;
    }
  } catch (_e) {
    path = '/oauth-finish.html';
  }
  const url = new URL(`${host}${path}`);
  url.searchParams.set('error', (err && err.message) || 'Social sign-in failed. Please try again.');
  if (err && err.code) url.searchParams.set('code', err.code);
  return res.redirect(302, url.toString());
}

router.get('/providers', (req, res) => {
  res.json({ success: true, providers: providerPublicStatus() });
});

router.post('/exchange', authLoginLimiter, (req, res) => {
  try {
    const ticket = String((req.body && req.body.ticket) || '').trim();
    const body = verifyFinishTicket(ticket);
    if (!body || !body.token || !body.role || body.role === 'admin_gate') {
      return res.status(400).json({ success: false, message: 'Sign-in session expired. Please try again.' });
    }
    return res.json({
      success: true,
      token: body.token,
      userRole: body.role,
      rememberMe: !!body.rememberMe,
      redirectTo:
        body.redirectTo ||
        (body.role === 'teacher' ? '/teacher-dashboard.html' : '/student-dashboard.html'),
      teacherId: body.teacherId || undefined,
      teacherMongoId: body.teacherMongoId || undefined,
      studentId: body.studentId || undefined,
      created: !!body.created,
      linked: !!body.linked,
    });
  } catch (err) {
    return sendOAuthError(res, err);
  }
});

router.get('/me/providers', verifyToken, async (req, res) => {
  try {
    const { role, user } = await loadPortalUser(req);
    if (!role) return res.status(403).json({ success: false, message: 'Students and teachers only.' });
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    const providers = await listProvidersForUser(user);
    return res.json({
      success: true,
      providers,
      hasPassword: !!(user.password && String(user.password).length > 20),
      available: providerPublicStatus(),
    });
  } catch (err) {
    return sendOAuthError(res, err);
  }
});

router.post('/me/unlink', verifyToken, async (req, res) => {
  try {
    const provider = String((req.body && req.body.provider) || '').toLowerCase();
    if (provider !== 'google' && provider !== 'facebook') {
      return res.status(400).json({ success: false, message: 'Unknown provider' });
    }
    const { role, user } = await loadPortalUser(req);
    if (!role) return res.status(403).json({ success: false, message: 'Students and teachers only.' });
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    const providers = await unlinkProvider(user, provider);
    return res.json({
      success: true,
      providers,
      hasPassword: !!(user.password && String(user.password).length > 20),
    });
  } catch (err) {
    return sendOAuthError(res, err);
  }
});

router.post('/me/set-password', verifyToken, async (req, res) => {
  try {
    const { role, user } = await loadPortalUser(req);
    if (!role) return res.status(403).json({ success: false, message: 'Students and teachers only.' });
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });
    await setPasswordForOAuthUser(user, req.body && req.body.newPassword, role);
    return res.json({
      success: true,
      message: 'Password saved. You can sign in with email and password.',
    });
  } catch (err) {
    return sendOAuthError(res, err);
  }
});

/** Google identified an existing admin. Still requires authenticator before a portal session. */
router.post('/admin-gate', authLoginLimiter, async (req, res) => {
  try {
    const ticket = String((req.body && req.body.ticket) || '').trim();
    const body = verifyFinishTicket(ticket);
    if (!body || body.role !== 'admin_gate' || !body.adminId) {
      return res.status(400).json({ success: false, message: 'Sign-in session expired. Please try again.' });
    }
    const admin = await Admin.findById(String(body.adminId));
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Staff account not found.' });
    }
    if (admin.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact the system administrator.',
      });
    }
    return sendAdminAuthChallenge(req, res, admin);
  } catch (err) {
    return sendOAuthError(res, err);
  }
});

router.get('/:provider/start', authLoginLimiter, async (req, res) => {
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    if (provider !== 'google' && provider !== 'facebook') {
      return res.status(404).json({ success: false, message: 'Unknown provider' });
    }
    const url = await buildAuthUrl(req, provider, req.query || {});
    return res.redirect(302, url);
  } catch (err) {
    return sendOAuthError(res, err);
  }
});

router.get('/:provider/callback', authRegisterLimiter, async (req, res) => {
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    if (provider !== 'google' && provider !== 'facebook') {
      return res.status(404).json({ success: false, message: 'Unknown provider' });
    }
    const redirectTo = await handleCallback(req, provider, req.query || {});
    return res.redirect(302, redirectTo);
  } catch (err) {
    return redirectError(
      res,
      req,
      err instanceof OAuthError
        ? err
        : new OAuthError(500, 'OAUTH_FAILED', 'Social sign-in failed. Please try again.'),
      req.query || {}
    );
  }
});

router.get('/:provider/link', verifyToken, authLoginLimiter, async (req, res) => {
  try {
    const provider = String(req.params.provider || '').toLowerCase();
    if (provider !== 'google' && provider !== 'facebook') {
      return res.status(404).json({ success: false, message: 'Unknown provider' });
    }
    const { role, user } = await loadPortalUser(req);
    if (role !== 'student' && role !== 'teacher') {
      return res.status(403).json({ success: false, message: 'Students and teachers only.' });
    }
    if (!user) return res.status(404).json({ success: false, message: 'Account not found.' });

    const url = await buildAuthUrl(req, provider, {
      intent: role === 'teacher' ? 'link_teacher' : 'link_student',
      linkUserId: String(user._id),
      returnTo: role === 'teacher' ? '/teacher-profile.html' : '/student-profile.html',
      rememberMe: 'true',
    });
    // Profile pages store JWT in localStorage, so they request JSON and navigate client-side.
    const wantsJson =
      String(req.query.format || '').toLowerCase() === 'json' ||
      String(req.headers.accept || '').indexOf('application/json') !== -1;
    if (wantsJson) {
      return res.json({ success: true, url });
    }
    return res.redirect(302, url);
  } catch (err) {
    return sendOAuthError(res, err);
  }
});

module.exports = router;
