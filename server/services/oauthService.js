/**
 * Google / Facebook OAuth for students (assessment-first) and invite-bound teachers.
 */
const axios = require('axios');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcrypt');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const AssessmentTrial = require('../models/AssessmentTrial');
const InvitationToken = require('../models/InvitationToken');
const { getJwtSecret } = require('../config/jwtSecret');
const { JWT_EXPIRES_IN } = require('../config/authTokens');
const {
  googleConfigured,
  facebookConfigured,
  googleClientId,
  googleClientSecret,
  facebookAppId,
  facebookAppSecret,
} = require('../config/oauth');
const { resolveFrontendBaseUrl } = require('../utils/frontendBaseUrl');
const { findActivePassedInvitation } = require('../utils/teacherInvitation');
const { applyApplicantDocumentsToTeacher } = require('../utils/applicantDocuments');
const { PRIVACY_CONSENT_VERSION, consentRecord } = require('../config/privacyConsent');
const { signState, verifyState, signFinishTicket } = require('./oauthState');

class OAuthError extends Error {
  constructor(status, code, message, extra) {
    super(message);
    this.status = status;
    this.code = code;
    this.extra = extra || {};
  }
}

const INTENTS = new Set([
  'student_login',
  'student_register',
  'teacher_login',
  'teacher_signup',
  'link_student',
  'link_teacher',
]);

function publicBase(req) {
  // Prefer explicit public HTTPS base. Behind nginx, req.protocol is often "http"
  // and that causes Google redirect_uri_mismatch vs https://…/callback.
  const override = String(process.env.OAUTH_PUBLIC_BASE_URL || process.env.FRONTEND_URL || '')
    .trim()
    .replace(/\/$/, '');
  if (override) return override;
  const fromReq = resolveFrontendBaseUrl(req);
  if (/^https?:\/\//i.test(fromReq)) {
    try {
      const u = new URL(fromReq);
      // Force https for real domains (not localhost) when proxy did not set x-forwarded-proto.
      if (u.protocol === 'http:' && u.hostname !== 'localhost' && u.hostname !== '127.0.0.1') {
        u.protocol = 'https:';
        return u.origin;
      }
    } catch (_e) { /* fall through */ }
  }
  return fromReq;
}

function callbackUrl(req, provider) {
  return `${publicBase(req)}/api/auth/oauth/${provider}/callback`;
}

function finishPageUrl(req) {
  return `${publicBase(req)}/oauth-finish.html`;
}

function assessmentUrl(req) {
  return `${publicBase(req)}/student-assessment.html`;
}

function registerUrl(req, trialToken, email) {
  const u = new URL(`${publicBase(req)}/student-register.html`);
  if (trialToken) u.searchParams.set('trial', trialToken);
  if (email) u.searchParams.set('email', email);
  return u.toString();
}

function normalizeEmail(email) {
  return String(email || '').trim().toLowerCase();
}

function baseUsernameFromEmail(email, fallback) {
  let base = normalizeEmail(email)
    .split('@')[0]
    .replace(/[^a-z0-9._-]/g, '')
    .slice(0, 24);
  if (!base || base.length < 3) base = fallback || 'user';
  return base;
}

async function allocateUsername(Model, base, extraCheck) {
  let candidate = base;
  let n = 0;
  for (;;) {
    const taken = await Model.findOne({ username: candidate }).select('_id').lean();
    const extra = extraCheck ? await extraCheck(candidate) : false;
    if (!taken && !extra) return candidate;
    n += 1;
    candidate = `${base}${n}`.slice(0, 40);
    if (n > 9999) {
      throw new OAuthError(500, 'USERNAME_EXHAUSTED', 'Could not allocate a username.');
    }
  }
}

function providerLinked(user, provider, providerId) {
  const list = (user && user.authProviders) || [];
  return list.some(
    (p) =>
      String(p.provider) === provider && String(p.providerId) === String(providerId)
  );
}

function linkProvider(user, provider, providerId, email) {
  if (!user.authProviders) user.authProviders = [];
  if (providerLinked(user, provider, providerId)) return false;
  user.authProviders.push({
    provider,
    providerId: String(providerId),
    email: normalizeEmail(email),
    linkedAt: new Date(),
  });
  return true;
}

async function findByProvider(Model, provider, providerId) {
  return Model.findOne({
    authProviders: { $elemMatch: { provider, providerId: String(providerId) } },
  });
}

async function findByEmail(Model, email) {
  const emailNorm = normalizeEmail(email);
  if (!emailNorm) return null;
  const esc = emailNorm.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return Model.findOne({ email: new RegExp(`^${esc}$`, 'i') });
}

function signStudentToken(student, expiresIn) {
  return jwt.sign(
    {
      userRole: 'student',
      username: student.username,
      studentId: student._id,
      userType: 'student',
      role: 'student',
    },
    getJwtSecret(),
    { expiresIn: expiresIn || JWT_EXPIRES_IN }
  );
}

function signTeacherToken(teacher, expiresIn) {
  return jwt.sign(
    {
      userRole: 'teacher',
      username: teacher.username,
      teacherId: teacher.teacherId,
      teacherMongoId: String(teacher._id),
      userType: 'teacher',
      role: 'teacher',
    },
    getJwtSecret(),
    { expiresIn: expiresIn || JWT_EXPIRES_IN }
  );
}

function assertProviderConfigured(provider) {
  if (provider === 'google' && !googleConfigured()) {
    throw new OAuthError(503, 'OAUTH_NOT_CONFIGURED', 'Google sign-in is not configured.');
  }
  if (provider === 'facebook' && !facebookConfigured()) {
    throw new OAuthError(503, 'OAUTH_NOT_CONFIGURED', 'Facebook sign-in is not configured.');
  }
}

async function buildAuthUrl(req, provider, query) {
  assertProviderConfigured(provider);
  const intent = String(query.intent || 'student_login').trim();
  if (!INTENTS.has(intent)) {
    throw new OAuthError(400, 'INVALID_INTENT', 'Invalid OAuth intent.');
  }

  const statePayload = {
    intent,
    provider,
    trialToken: String(query.trialToken || query.trial || '').trim() || null,
    inviteToken: String(query.inviteToken || query.invitation || '').trim() || null,
    privacyConsentAccepted: query.privacyConsentAccepted === true || query.privacyConsentAccepted === 'true',
    marketingConsent: query.marketingConsent === true || query.marketingConsent === 'true',
    rememberMe: query.rememberMe === true || query.rememberMe === 'true',
    firstName: String(query.firstName || '').trim().slice(0, 80) || null,
    lastName: String(query.lastName || '').trim().slice(0, 80) || null,
    username: String(query.username || '').trim().slice(0, 40) || null,
    linkUserId: String(query.linkUserId || '').trim() || null,
    returnTo: String(query.returnTo || '').trim().slice(0, 200) || null,
  };

  if (intent === 'student_register') {
    if (!statePayload.trialToken) {
      throw new OAuthError(
        400,
        'ASSESSMENT_REQUIRED',
        'Finish the level assessment first, then register with the same email from your Claim Free Trial link.'
      );
    }
    if (!statePayload.privacyConsentAccepted) {
      throw new OAuthError(
        400,
        'CONSENT_REQUIRED',
        'A parent or guardian must accept the Student Privacy and Recording Policy before creating an account.'
      );
    }
  }

  if (intent === 'teacher_signup' && !statePayload.inviteToken) {
    throw new OAuthError(400, 'INVITE_REQUIRED', 'Teacher sign-up requires a valid invitation link.');
  }

  const state = signState(statePayload);
  const redirectUri = callbackUrl(req, provider);

  if (provider === 'google') {
    const params = new URLSearchParams({
      client_id: googleClientId(),
      redirect_uri: redirectUri,
      response_type: 'code',
      scope: 'openid email profile',
      state,
      access_type: 'online',
      prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
  }

  const params = new URLSearchParams({
    client_id: facebookAppId(),
    redirect_uri: redirectUri,
    state,
    scope: 'email,public_profile',
    response_type: 'code',
  });
  return `https://www.facebook.com/v19.0/dialog/oauth?${params.toString()}`;
}

async function exchangeGoogleCode(req, code) {
  const redirectUri = callbackUrl(req, 'google');
  const tokenRes = await axios.post(
    'https://oauth2.googleapis.com/token',
    new URLSearchParams({
      code: String(code),
      client_id: googleClientId(),
      client_secret: googleClientSecret(),
      redirect_uri: redirectUri,
      grant_type: 'authorization_code',
    }).toString(),
    { headers: { 'Content-Type': 'application/x-www-form-urlencoded' }, timeout: 15000 }
  );
  const accessToken = tokenRes.data && tokenRes.data.access_token;
  if (!accessToken) throw new OAuthError(502, 'TOKEN_EXCHANGE_FAILED', 'Google token exchange failed.');

  const profileRes = await axios.get('https://www.googleapis.com/oauth2/v3/userinfo', {
    headers: { Authorization: `Bearer ${accessToken}` },
    timeout: 15000,
  });
  const p = profileRes.data || {};
  const email = normalizeEmail(p.email);
  if (!email || p.email_verified === false) {
    throw new OAuthError(
      400,
      'EMAIL_UNVERIFIED',
      'Your Google account must have a verified email to continue.'
    );
  }
  return {
    provider: 'google',
    providerId: String(p.sub || ''),
    email,
    emailVerified: true,
    firstName: String(p.given_name || '').trim(),
    lastName: String(p.family_name || '').trim(),
    displayName: String(p.name || '').trim(),
  };
}

async function exchangeFacebookCode(req, code) {
  const redirectUri = callbackUrl(req, 'facebook');
  const tokenRes = await axios.get('https://graph.facebook.com/v19.0/oauth/access_token', {
    params: {
      client_id: facebookAppId(),
      client_secret: facebookAppSecret(),
      redirect_uri: redirectUri,
      code: String(code),
    },
    timeout: 15000,
  });
  const accessToken = tokenRes.data && tokenRes.data.access_token;
  if (!accessToken) throw new OAuthError(502, 'TOKEN_EXCHANGE_FAILED', 'Facebook token exchange failed.');

  const profileRes = await axios.get('https://graph.facebook.com/v19.0/me', {
    params: {
      fields: 'id,name,email,first_name,last_name',
      access_token: accessToken,
    },
    timeout: 15000,
  });
  const p = profileRes.data || {};
  const email = normalizeEmail(p.email);
  if (!email) {
    throw new OAuthError(
      400,
      'EMAIL_REQUIRED',
      'Facebook did not share an email. Use a Facebook account with an email, or register with password after your assessment.'
    );
  }
  return {
    provider: 'facebook',
    providerId: String(p.id || ''),
    email,
    emailVerified: true,
    firstName: String(p.first_name || '').trim(),
    lastName: String(p.last_name || '').trim(),
    displayName: String(p.name || '').trim(),
  };
}

async function resolveTrial(emailNorm, trialToken) {
  let trial = await AssessmentTrial.findOne({
    parentEmail: emailNorm,
    redeemedByStudentId: null,
  }).sort({ createdAt: -1 });

  if (!trial && trialToken) {
    const byToken = await AssessmentTrial.findOne({ token: String(trialToken).trim() });
    if (byToken) {
      const tokenEmail = normalizeEmail(byToken.parentEmail);
      if (byToken.redeemedByStudentId) {
        if (tokenEmail === emailNorm) {
          throw new OAuthError(409, 'EMAIL_REGISTERED', 'Email address already registered');
        }
      } else if (tokenEmail === emailNorm) {
        trial = byToken;
      } else {
        throw new OAuthError(
          400,
          'EMAIL_MISMATCH',
          'Use the same email address you used for the level assessment to claim your free trial class.'
        );
      }
    }
  }
  return trial;
}

async function createStudentFromOAuth(req, profile, state) {
  const emailNorm = normalizeEmail(profile.email);
  const trial = await resolveTrial(emailNorm, state.trialToken);
  if (!trial) {
    throw new OAuthError(
      400,
      'ASSESSMENT_REQUIRED',
      'Finish the level assessment first, then register with the same email from your Claim Free Trial link.'
    );
  }
  if (normalizeEmail(trial.parentEmail) !== emailNorm) {
    throw new OAuthError(
      400,
      'EMAIL_MISMATCH',
      'Use the same email address you used for the level assessment to claim your free trial class.'
    );
  }

  const existing = await findByEmail(Student, emailNorm);
  if (existing) {
    linkProvider(existing, profile.provider, profile.providerId, emailNorm);
    await existing.save();
    return existing;
  }

  const firstName =
    String(state.firstName || profile.firstName || '').trim() ||
    String((trial.childName || '').split(/\s+/)[0] || '').trim() ||
    'Student';
  const lastName =
    String(state.lastName || profile.lastName || '').trim() ||
    String((trial.childName || '').split(/\s+/).slice(1).join(' ') || '').trim() ||
    'Learner';

  const preferred = String(state.username || '').trim();
  const base = preferred
    ? preferred.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 40) || baseUsernameFromEmail(emailNorm, 'student')
    : baseUsernameFromEmail(emailNorm, 'student');
  const username = await allocateUsername(Student, base.toLowerCase());

  const student = new Student({
    username,
    email: emailNorm,
    password: null,
    firstName,
    lastName,
    parentEmail: emailNorm,
    contact: trial.contactNumber || '',
    authProviders: [
      {
        provider: profile.provider,
        providerId: String(profile.providerId),
        email: emailNorm,
        linkedAt: new Date(),
      },
    ],
  });
  await student.save();

  const now = new Date();
  const marketingOn = !!state.marketingConsent;
  const profileSet = {
    isSubscribed: false,
    hasFreeTrial: false,
    assessmentTrialCreditActive: false,
    freeLessonCompletedCount: 0,
    freeLessonPeriodKey: '',
    freeLessonActiveBookingId: null,
    firstName,
    lastName,
    privacyConsentVersion: PRIVACY_CONSENT_VERSION,
    privacyConsentAcceptedAt: now,
    marketingConsent: marketingOn,
    marketingConsentAt: marketingOn ? now : null,
  };

  const redeem = await AssessmentTrial.findOneAndUpdate(
    { _id: trial._id, redeemedByStudentId: null },
    { $set: { redeemedByStudentId: student._id, redeemedAt: now } },
    { new: true }
  );
  if (redeem) {
    if (redeem.cefrLevel) {
      profileSet.cefrLevel = redeem.cefrLevel;
      profileSet.leveling = redeem.cefrLevel;
    }
    if (redeem.score != null && redeem.score !== undefined) {
      profileSet.assessmentScore = Number(redeem.score) || 0;
    }
    profileSet.assessmentDate = new Date();
    if (redeem.contactNumber) profileSet.contact = redeem.contactNumber;
  }

  await Student.updateOne(
    { _id: student._id },
    { $set: profileSet, $push: { privacyConsents: consentRecord(req, 'register') } }
  );

  return Student.findById(student._id);
}

async function createTeacherFromOAuth(profile, state) {
  const found = await findActivePassedInvitation(state.inviteToken);
  if (found.reason === 'used') {
    throw new OAuthError(409, 'INVITE_USED', 'This invitation has already been used. Please log in.');
  }
  if (!found.ok) {
    throw new OAuthError(404, 'INVITE_INVALID', 'This invitation is invalid or expired.');
  }
  const { invitation, application } = found;
  const email = normalizeEmail(
    (application && application.email) || (invitation && invitation.email) || ''
  );
  if (!email) {
    throw new OAuthError(400, 'NO_EMAIL', 'This application has no email on file. Contact admin support.');
  }
  if (email !== normalizeEmail(profile.email)) {
    throw new OAuthError(
      400,
      'EMAIL_MISMATCH',
      'Sign in with the same email on your teacher invitation / application.'
    );
  }

  const existing = await findByEmail(Teacher, email);
  if (existing) {
    linkProvider(existing, profile.provider, profile.providerId, email);
    await existing.save();
    return existing;
  }

  const firstName =
    String(state.firstName || profile.firstName || (application && application.firstName) || '').trim() ||
    'Teacher';
  const lastName =
    String(state.lastName || profile.lastName || (application && application.lastName) || '').trim() ||
    'RemoEd';
  const middleName = String((application && application.middleName) || '').trim();

  const preferred = String(state.username || '').trim();
  const base = preferred
    ? preferred.replace(/[^a-zA-Z0-9._-]/g, '').slice(0, 40) || baseUsernameFromEmail(email, 'teacher')
    : baseUsernameFromEmail(email, 'teacher');
  const username = await allocateUsername(Teacher, base.toLowerCase(), async (candidate) => {
    const idTaken = await Teacher.findOne({ teacherId: candidate }).select('_id').lean();
    return !!idTaken;
  });

  const now = new Date();
  const claimed = await InvitationToken.findOneAndUpdate(
    { _id: invitation._id, isUsed: false, expiresAt: { $gt: now } },
    { $set: { isUsed: true, usedAt: now } },
    { new: true }
  );
  if (!claimed) {
    throw new OAuthError(409, 'INVITE_USED', 'This invitation has already been used.');
  }

  const teacher = new Teacher({
    username,
    password: null,
    teacherId: username,
    firstName,
    middleName,
    lastName,
    fullname: [firstName, middleName, lastName].filter(Boolean).join(' '),
    email,
    hireDate: now,
    authProviders: [
      {
        provider: profile.provider,
        providerId: String(profile.providerId),
        email,
        linkedAt: new Date(),
      },
    ],
  });
  applyApplicantDocumentsToTeacher(teacher, application);

  try {
    await teacher.save();
    application.teacherActivationStatus = 'Active Teacher';
    application.hiredAt = now;
    await application.save();
  } catch (saveErr) {
    await InvitationToken.updateOne(
      { _id: claimed._id },
      { $set: { isUsed: false, usedAt: null } }
    );
    throw saveErr;
  }
  return teacher;
}

function expiresForRemember(rememberMe) {
  return rememberMe ? '30d' : JWT_EXPIRES_IN || '2h';
}

function redirectWithTicket(req, payload) {
  const ticket = signFinishTicket(payload);
  const url = new URL(finishPageUrl(req));
  url.searchParams.set('ticket', ticket);
  return url.toString();
}

function redirectMessage(req, path, params) {
  const url = new URL(`${publicBase(req)}${path.startsWith('/') ? path : `/${path}`}`);
  Object.keys(params || {}).forEach((k) => {
    if (params[k] != null && params[k] !== '') url.searchParams.set(k, String(params[k]));
  });
  return url.toString();
}

async function handleLoginResolve(req, profile, state) {
  const emailNorm = normalizeEmail(profile.email);
  const byProviderStudent = await findByProvider(Student, profile.provider, profile.providerId);
  const byProviderTeacher = await findByProvider(Teacher, profile.provider, profile.providerId);
  let student = byProviderStudent || (await findByEmail(Student, emailNorm));
  let teacher = byProviderTeacher || (await findByEmail(Teacher, emailNorm));

  const intent = state.intent;
  const preferTeacher = intent === 'teacher_login' || intent === 'teacher_signup';
  const preferStudent = intent === 'student_login' || intent === 'student_register';

  if (student && teacher) {
    if (preferTeacher && !preferStudent) student = null;
    else if (preferStudent && !preferTeacher) teacher = null;
    else {
      throw new OAuthError(
        409,
        'AMBIGUOUS_ACCOUNT',
        'This email is linked to both a student and a teacher account. Sign in with your password and choose the correct portal, or contact support.'
      );
    }
  }

  if (teacher) {
    const st = String(teacher.status || '').toLowerCase();
    if (teacher.isApproved === false) {
      throw new OAuthError(403, 'PENDING_APPROVAL', 'Your teacher account is pending approval');
    }
    if (st === 'suspended') {
      throw new OAuthError(403, 'SUSPENDED', 'Your account has been suspended. Please contact the administrator.');
    }
    linkProvider(teacher, profile.provider, profile.providerId, emailNorm);
    await teacher.save();
    const token = signTeacherToken(teacher, expiresForRemember(state.rememberMe));
    return redirectWithTicket(req, {
      role: 'teacher',
      token,
      rememberMe: !!state.rememberMe,
      redirectTo: '/teacher-dashboard.html',
      teacherId: teacher.teacherId,
      teacherMongoId: String(teacher._id),
    });
  }

  if (student) {
    if (student.status === 'suspended') {
      throw new OAuthError(403, 'SUSPENDED', 'Your account has been suspended. Please contact the administrator.');
    }
    linkProvider(student, profile.provider, profile.providerId, emailNorm);
    await student.save();
    const token = signStudentToken(student, expiresForRemember(state.rememberMe));
    return redirectWithTicket(req, {
      role: 'student',
      token,
      rememberMe: !!state.rememberMe,
      redirectTo: '/student-dashboard.html',
      studentId: String(student._id),
    });
  }

  // No account yet
  if (intent === 'student_register') {
    const created = await createStudentFromOAuth(req, profile, state);
    const token = signStudentToken(created, expiresForRemember(state.rememberMe));
    return redirectWithTicket(req, {
      role: 'student',
      token,
      rememberMe: !!state.rememberMe,
      redirectTo: '/student-dashboard.html',
      studentId: String(created._id),
      created: true,
    });
  }

  if (intent === 'teacher_signup') {
    const created = await createTeacherFromOAuth(profile, state);
    const token = signTeacherToken(created, expiresForRemember(state.rememberMe));
    return redirectWithTicket(req, {
      role: 'teacher',
      token,
      rememberMe: !!state.rememberMe,
      redirectTo: '/teacher-dashboard.html',
      teacherId: created.teacherId,
      teacherMongoId: String(created._id),
      created: true,
    });
  }

  // Login intents: never create. Route toward assessment or register.
  const trial = await resolveTrial(emailNorm, state.trialToken).catch(() => null);
  if (trial && !trial.redeemedByStudentId) {
    return redirectMessage(req, '/student-register.html', {
      trial: trial.token,
      email: emailNorm,
      oauth: 'finish_register',
      msg: 'Finish registration from your assessment to create your student account.',
    });
  }

  if (intent === 'teacher_login') {
    return redirectMessage(req, '/login/', {
      oauth: 'teacher_invite',
      msg: 'Teachers join by invitation. Use the link from your RemoEd email, or sign in with your password.',
    });
  }

  return redirectMessage(req, '/student-assessment.html', {
    oauth: 'need_assessment',
    msg: 'Take the level assessment first. After you finish, use Claim Free Trial in your email to register.',
  });
}

async function handleLink(req, profile, state, role) {
  const Model = role === 'teacher' ? Teacher : Student;
  const userId = String(state.linkUserId || '').trim();
  if (!userId) {
    throw new OAuthError(400, 'LINK_USER_REQUIRED', 'Missing account to link.');
  }
  const user = await Model.findById(userId);
  if (!user) throw new OAuthError(404, 'USER_NOT_FOUND', 'Account not found.');

  const emailNorm = normalizeEmail(profile.email);
  const accountEmail = normalizeEmail(user.email);
  if (accountEmail && accountEmail !== emailNorm) {
    throw new OAuthError(
      400,
      'EMAIL_MISMATCH',
      'Use the same email as your RemoEd account to link this social login.'
    );
  }

  const other = await findByProvider(Model, profile.provider, profile.providerId);
  if (other && String(other._id) !== String(user._id)) {
    throw new OAuthError(409, 'PROVIDER_IN_USE', 'That social account is already linked to another user.');
  }

  linkProvider(user, profile.provider, profile.providerId, emailNorm);
  if (!user.email) user.email = emailNorm;
  await user.save();

  const token =
    role === 'teacher'
      ? signTeacherToken(user, expiresForRemember(state.rememberMe))
      : signStudentToken(user, expiresForRemember(state.rememberMe));

  return redirectWithTicket(req, {
    role,
    token,
    rememberMe: !!state.rememberMe,
    redirectTo: state.returnTo || (role === 'teacher' ? '/teacher-profile.html' : '/student-profile.html'),
    linked: true,
  });
}

async function handleCallback(req, provider, query) {
  assertProviderConfigured(provider);
  if (query.error) {
    throw new OAuthError(
      400,
      'PROVIDER_DENIED',
      String(query.error_description || query.error || 'Sign-in was cancelled.')
    );
  }
  const state = verifyState(query.state);
  if (!state || state.provider !== provider) {
    throw new OAuthError(400, 'INVALID_STATE', 'Sign-in session expired. Please try again.');
  }
  if (!query.code) {
    throw new OAuthError(400, 'MISSING_CODE', 'Missing authorization code.');
  }

  const profile =
    provider === 'google'
      ? await exchangeGoogleCode(req, query.code)
      : await exchangeFacebookCode(req, query.code);

  if (!profile.providerId) {
    throw new OAuthError(502, 'PROFILE_INCOMPLETE', 'Could not read your social profile id.');
  }

  if (state.intent === 'link_student') return handleLink(req, profile, state, 'student');
  if (state.intent === 'link_teacher') return handleLink(req, profile, state, 'teacher');
  return handleLoginResolve(req, profile, state);
}

async function listProvidersForUser(user) {
  return ((user && user.authProviders) || []).map((p) => ({
    provider: p.provider,
    email: p.email || '',
    linkedAt: p.linkedAt || null,
  }));
}

async function unlinkProvider(user, provider) {
  const list = user.authProviders || [];
  const next = list.filter((p) => String(p.provider) !== String(provider));
  if (next.length === list.length) {
    throw new OAuthError(404, 'NOT_LINKED', 'That provider is not linked.');
  }
  const hasPassword = !!(user.password && String(user.password).length > 20);
  if (!hasPassword && next.length === 0) {
    throw new OAuthError(
      400,
      'LAST_LOGIN_METHOD',
      'Set a password before unlinking your only social sign-in.'
    );
  }
  user.authProviders = next;
  await user.save();
  return listProvidersForUser(user);
}

async function setPasswordForOAuthUser(user, newPassword, role) {
  const hash = user.password;
  if (hash) {
    throw new OAuthError(
      400,
      'PASSWORD_EXISTS',
      'This account already has a password. Use Change Password instead.'
    );
  }
  if (!(user.authProviders && user.authProviders.length)) {
    throw new OAuthError(400, 'NOT_OAUTH', 'Only social accounts can set a first password this way.');
  }
  const RESET_PASSWORD_REGEX = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;
  if (!RESET_PASSWORD_REGEX.test(String(newPassword || ''))) {
    throw new OAuthError(
      400,
      'WEAK_PASSWORD',
      'Password must be at least 8 characters and include uppercase, lowercase, a number, and a symbol.'
    );
  }
  user.password = await bcrypt.hash(String(newPassword), role === 'admin' ? 12 : 10);
  user.hasGeneratedPassword = false;
  await user.save();
}

module.exports = {
  OAuthError,
  buildAuthUrl,
  handleCallback,
  listProvidersForUser,
  unlinkProvider,
  setPasswordForOAuthUser,
  signStudentToken,
  signTeacherToken,
  findByProvider,
  findByEmail,
  linkProvider,
  providerLinked,
  assessmentUrl,
  registerUrl,
  publicBase,
};
