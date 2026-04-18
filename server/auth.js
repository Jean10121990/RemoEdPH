const express = require('express');
const bcrypt = require('bcrypt');
const {
  authLoginLimiter,
  adminLoginLimiterExtra,
  passwordResetLimiter,
  authRegisterLimiter,
  teacherInviteByApplicationLimiter,
} = require('./middleware/apiRateLimits');
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');
const Admin = require('./models/Admin');
const Application = require('./models/Application');
const InvitationToken = require('./models/InvitationToken');
const AssessmentTrial = require('./models/AssessmentTrial');
const router = express.Router();
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret'; // Use a strong secret in production
const { JWT_EXPIRES_IN } = require('./config/authTokens');
const { blacklistToken, isTokenBlacklisted } = require('./services/jwtBlacklist');
const {
  isAccountLocked,
  lockoutMessage,
  applyFailedLogin,
  resetLoginAttempts,
} = require('./utils/accountLockout');
const crypto = require('crypto');
const mongoose = require('mongoose');
const { sendPasswordResetEmail } = require('./emailService');
const { recordAdminLoginActivity, getAdminSessionVersion } = require('./services/adminLoginActivity');
const {
  ADMIN_2FA_ENROLLMENT_PURPOSE,
  requiresForced2faEnrollment,
} = require('./utils/adminForce2fa');
const { decryptTotpSecret, encryptTotpSecret } = require('./utils/twoFactorSecretCrypto');
const { authenticator } = require('otplib');
const QRCode = require('qrcode');

authenticator.options = { window: 1 };

/**
 * Ensure encrypted TOTP secret exists and return a data-URL QR for the admin login / setup UI.
 */
async function prepareAdminTotpEnrollmentMaterials(admin) {
  let secretPlain = admin.twoFactorSecret ? decryptTotpSecret(admin.twoFactorSecret) : null;
  if (!secretPlain) {
    secretPlain = authenticator.generateSecret();
    admin.twoFactorSecret = encryptTotpSecret(secretPlain);
    admin.isTwoFactorEnabled = false;
    admin.twoFactorEnabledAt = null;
    await admin.save();
  }
  const otpauth = authenticator.keyuri(admin.username, 'RemoEdPH Admin', secretPlain);
  const qrCodeData = await QRCode.toDataURL(otpauth);
  return { qrCodeData };
}

const ADMIN_2FA_PENDING_PURPOSE = 'admin_2fa_pending';

function getAdminPasswordHashField(adminDoc) {
  return adminDoc.passwordHash || adminDoc.password || '';
}

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  if (isTokenBlacklisted(token)) {
    return res.status(403).json({ success: false, message: 'Token has been revoked' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

function isProbableMongoObjectIdString(s) {
  return typeof s === 'string' && /^[a-f0-9]{24}$/i.test(String(s).trim());
}

/**
 * Stateless helper for public register.html when only appId is present.
 * Returns an active invitation token only if the application is in `passed` stage.
 */
router.get(
  '/teacher-signup/invitation-by-application',
  teacherInviteByApplicationLimiter,
  async (req, res) => {
    try {
      const appId = String(req.query.appId || '').trim();
      if (!isProbableMongoObjectIdString(appId)) {
        return res.status(400).json({ success: false, message: 'Invalid application id' });
      }
      const application = await Application.findById(appId).lean();
      if (!application || application.currentStage !== 'passed') {
        return res.status(404).json({ success: false, message: 'Application not found or not approved' });
      }
      const now = new Date();
      const inv = await InvitationToken.findOne({
        applicationId: application._id,
        isUsed: false,
        expiresAt: { $gt: now },
      })
        .sort({ createdAt: -1 })
        .lean();
      if (!inv || !inv.token) {
        return res.status(404).json({ success: false, message: 'No active invitation for this application' });
      }
      return res.json({
        success: true,
        invitation: inv.token,
        applicant: { email: application.email || '', fullName: application.fullName || '' },
      });
    } catch (e) {
      console.error('GET /api/auth/teacher-signup/invitation-by-application:', e);
      return res.status(500).json({ success: false, message: 'Server error' });
    }
  }
);

// Function to generate strong password (10 characters) - NO SPECIAL CHARACTERS
function generateStrongPassword() {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  
  let password = '';
  
  // Ensure at least one character from each category
  password += uppercase[crypto.randomInt(0, uppercase.length)];
  password += lowercase[crypto.randomInt(0, lowercase.length)];
  password += numbers[crypto.randomInt(0, numbers.length)];
  
  // Fill the remaining 7 characters with random characters from all categories
  const allChars = uppercase + lowercase + numbers;
  for (let i = 0; i < 7; i++) {
    password += allChars[crypto.randomInt(0, allChars.length)];
  }
  
  // Shuffle using Fisher–Yates with crypto RNG
  const a = password.split('');
  for (let i = a.length - 1; i > 0; i--) {
    const j = crypto.randomInt(0, i + 1);
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a.join('');
}

// Bootstrap admin from .env (plaintext password only in env; stored as bcrypt in MongoDB)
const seedAdminFromEnv = async () => {
  const username = String(process.env.ADMIN_SEED_USERNAME || '').trim();
  const plain = process.env.ADMIN_SEED_PASSWORD;
  if (!username || !plain) {
    const count = await Admin.countDocuments().catch(() => 0);
    if (!count) {
      console.warn(
        '⚠️ No admins in database. Set ADMIN_SEED_USERNAME and ADMIN_SEED_PASSWORD in .env to create the first admin, or create one via MongoDB.'
      );
    }
    return;
  }
  try {
    const existing = await Admin.findOne({ username });
    if (existing) return;
    const passwordHash = await bcrypt.hash(plain, 12);
    await Admin.create({ username, passwordHash });
    console.log('✅ Admin user created from ADMIN_SEED_USERNAME (password stored as bcrypt hash only).');
  } catch (error) {
    console.warn('Could not seed admin from env:', error.message);
  }
};

setTimeout(seedAdminFromEnv, 2000);

// Admin login endpoint (rate-limited; sets httpOnly session cookie + optional legacy JWT)
router.post('/admin-login', adminLoginLimiterExtra, async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    const uid = String(username).trim();
    const uidEsc = uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const admin = await Admin.findOne({
      $or: [{ username: uid }, { email: new RegExp(`^${uidEsc}$`, 'i') }],
    });
    if (!admin) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (admin.status === 'suspended') {
      console.log('Admin is suspended:', admin.username);
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact the system administrator.',
      });
    }

    const hash = getAdminPasswordHashField(admin);
    if (!hash) {
      return res.status(401).json({
        success: false,
        code: 'ADMIN_PASSWORD_NOT_SET',
        message:
          'No password on this account yet. Use the first-time setup link and token from your Super-Admin, then sign in.',
      });
    }

    const match = await bcrypt.compare(password, hash);
    if (!match) {
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (admin.password && !admin.passwordHash) {
      admin.passwordHash = admin.password;
      admin.password = undefined;
      await admin.save().catch(() => {});
    }

    const adminRole = admin.adminRole || 'super_admin';

    if (requiresForced2faEnrollment(admin)) {
      let qrCodeData = null;
      try {
        const out = await prepareAdminTotpEnrollmentMaterials(admin);
        qrCodeData = out.qrCodeData;
      } catch (prepErr) {
        console.error('prepareAdminTotpEnrollmentMaterials:', prepErr);
        return res.status(500).json({
          success: false,
          message: 'Could not prepare two-factor authentication. Please try again.',
        });
      }
      const enrollmentToken = jwt.sign(
        {
          purpose: ADMIN_2FA_ENROLLMENT_PURPOSE,
          adminId: String(admin._id),
        },
        JWT_SECRET,
        { expiresIn: '30m' }
      );
      // Create a short-lived enrollment session so the setup page (or login modal) can POST verify with { code }.
      return req.session.regenerate((regenErr) => {
        if (regenErr) {
          console.error('Session regenerate error (2fa enrollment):', regenErr);
          return res.status(500).json({ success: false, message: 'Could not create enrollment session' });
        }
        req.session.admin2faEnroll = true;
        req.session.admin2faEnrollAdminId = String(admin._id);
        req.session.admin2faEnrollToken = enrollmentToken;
        req.session.save((saveErr) => {
          if (saveErr) {
            console.error('Session save error (2fa enrollment):', saveErr);
            return res.status(500).json({ success: false, message: 'Could not save enrollment session' });
          }
          return res.json({
            success: true,
            require2FASetup: true,
            enrollmentToken,
            qrCodeData,
            setupPath: '/admin/2fa-setup',
            username: admin.username,
            adminRole,
            message: 'Complete two-factor setup before accessing the admin portal.',
          });
        });
      });
    }

    if (admin.isTwoFactorEnabled === true) {
      const tempToken = jwt.sign(
        {
          purpose: ADMIN_2FA_PENDING_PURPOSE,
          adminId: String(admin._id),
        },
        JWT_SECRET,
        { expiresIn: '10m' }
      );
      return res.json({
        success: true,
        require2FA: true,
        tempToken,
        username: admin.username,
      });
    }

    const sessionVersion = await getAdminSessionVersion(admin._id);
    const token = jwt.sign(
      {
        username: admin.username,
        isAdmin: true,
        role: 'admin',
        adminRole,
        adminId: String(admin._id),
        twoFactorVerified: true,
        sessionVersion,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    req.session.regenerate((regenErr) => {
    if (regenErr) {
      console.error('Session regenerate error:', regenErr);
      return res.status(500).json({ success: false, message: 'Could not create session' });
    }
    req.session.adminAuth = true;
    req.session.adminUsername = admin.username;
    req.session.adminId = String(admin._id);
    req.session.adminRole = adminRole;
    req.session.admin2faVerified = true;
    req.session.adminSessionVersion = sessionVersion;

    req.session.save(async (saveErr) => {
      if (saveErr) {
        console.error('Session save error:', saveErr);
        return res.status(500).json({ success: false, message: 'Could not save session' });
      }
      try {
        await recordAdminLoginActivity(req, admin);
      } catch (logErr) {
        console.error('Admin login activity:', logErr);
      }
      console.log('Admin login successful (session + token):', { username: admin.username, adminRole });
      res.json({ success: true, token, username: admin.username, adminRole });
    });
    });
  } catch (err) {
    console.error('admin-login error:', err);
    return res.status(500).json({ success: false, message: 'Login failed' });
  }
});

/** Complete admin sign-in when TOTP is enabled (after password step). Issues session + JWT with twoFactorVerified. */
router.post('/verify-2fa', adminLoginLimiterExtra, async (req, res) => {
  try {
    const { tempToken, code } = req.body || {};
    const digits = code != null ? String(code).replace(/\s/g, '') : '';
    if (!tempToken || !/^\d{6}$/.test(digits)) {
      return res.status(400).json({
        success: false,
        message: 'tempToken and a valid 6-digit code are required.',
      });
    }

    let decoded;
    try {
      decoded = jwt.verify(String(tempToken), JWT_SECRET);
    } catch (_e) {
      return res.status(401).json({
        success: false,
        message: 'Invalid or expired verification token. Sign in again.',
      });
    }
    if (decoded.purpose !== ADMIN_2FA_PENDING_PURPOSE || !decoded.adminId) {
      return res.status(401).json({ success: false, message: 'Invalid verification token.' });
    }

    const admin = await Admin.findById(String(decoded.adminId));
    if (!admin || admin.status === 'suspended' || !admin.isTwoFactorEnabled) {
      return res.status(401).json({ success: false, message: 'Invalid verification request.' });
    }

    const plainSecret = decryptTotpSecret(admin.twoFactorSecret);
    if (!plainSecret) {
      return res.status(500).json({ success: false, message: 'Two-factor is misconfigured. Contact support.' });
    }
    const ok = authenticator.verify({ token: digits, secret: plainSecret });
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid authentication code.' });
    }

    const adminRole = admin.adminRole || 'super_admin';
    const sessionVersion = await getAdminSessionVersion(admin._id);
    const token = jwt.sign(
      {
        username: admin.username,
        isAdmin: true,
        role: 'admin',
        adminRole,
        adminId: String(admin._id),
        twoFactorVerified: true,
        sessionVersion,
      },
      JWT_SECRET,
      { expiresIn: JWT_EXPIRES_IN }
    );

    req.session.regenerate((regenErr) => {
      if (regenErr) {
        console.error('Session regenerate error (verify-2fa):', regenErr);
        return res.status(500).json({ success: false, message: 'Could not create session' });
      }
      req.session.adminAuth = true;
      req.session.adminUsername = admin.username;
      req.session.adminId = String(admin._id);
      req.session.adminRole = adminRole;
      req.session.admin2faVerified = true;
      req.session.adminSessionVersion = sessionVersion;

      req.session.save(async (saveErr) => {
        if (saveErr) {
          console.error('Session save error (verify-2fa):', saveErr);
          return res.status(500).json({ success: false, message: 'Could not save session' });
        }
        try {
          await recordAdminLoginActivity(req, admin);
        } catch (logErr) {
          console.error('Admin verify-2fa login activity:', logErr);
        }
        res.json({ success: true, token, username: admin.username, adminRole });
      });
    });
  } catch (err) {
    console.error('verify-2fa:', err);
    res.status(500).json({ success: false, message: 'Verification failed' });
  }
});

/** First-time password for admins created without a password (Super-Admin receives one-time token). */
router.post('/admin-first-setup', authRegisterLimiter, async (req, res) => {
  try {
    const { username, setupToken, password } = req.body || {};
    if (!username || !setupToken || !password) {
      return res.status(400).json({
        success: false,
        message: 'Username, setup token, and new password are required.',
      });
    }
    const pwdRe = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/;
    if (!pwdRe.test(String(password))) {
      return res.status(400).json({
        success: false,
        message: 'Password must be at least 8 characters with uppercase, lowercase, and a number.',
      });
    }
    const admin = await Admin.findOne({ username: String(username).trim() });
    if (!admin || !admin.mustSetPassword || !admin.passwordSetupTokenHash) {
      return res.status(400).json({
        success: false,
        message: 'Invalid setup request or account already has a password.',
      });
    }
    if (admin.passwordSetupExpires && admin.passwordSetupExpires < new Date()) {
      return res.status(400).json({ success: false, message: 'Setup token has expired. Ask a Super-Admin to re-invite you.' });
    }
    const ok = await bcrypt.compare(String(setupToken), admin.passwordSetupTokenHash);
    if (!ok) {
      return res.status(401).json({ success: false, message: 'Invalid setup token.' });
    }
    admin.passwordHash = await bcrypt.hash(String(password), 12);
    admin.password = undefined;
    admin.mustSetPassword = false;
    admin.passwordSetupTokenHash = null;
    admin.passwordSetupExpires = null;
    await admin.save();
    res.json({
      success: true,
      message: 'Password saved. You can sign in from the admin login page.',
    });
  } catch (err) {
    console.error('admin-first-setup:', err);
    res.status(500).json({ success: false, message: 'Setup failed' });
  }
});

router.post('/admin-logout', (req, res) => {
  const authHeader = req.headers.authorization;
  const bearer = authHeader && authHeader.split(' ')[1];
  if (bearer) blacklistToken(bearer);

  const { sessionCookieBase } = require('./config/authTokens');
  const cookieOpts = { path: '/', ...sessionCookieBase() };

  req.session.destroy((err) => {
    if (err) {
      return res.status(500).json({ success: false, message: 'Logout failed' });
    }
    res.clearCookie('remoed.admin.sid', cookieOpts);
    res.set(
      'Cache-Control',
      'no-store, no-cache, must-revalidate, proxy-revalidate'
    );
    res.set('Pragma', 'no-cache');
    res.set('Expires', '0');
    res.status(200).json({ success: true });
  });
});

router.post('/login', authLoginLimiter, async (req, res) => {
  console.log('=== TEACHER LOGIN ATTEMPT ===');
  console.log('Request headers:', req.headers);
  console.log('Request body:', req.body);
  
  const { username, password } = req.body;
  
  if (!username || !password) {
    console.log('Missing username or password');
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }
  
  try {
    const uid = String(username).trim();
    const uidEsc = uid.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const identRe = new RegExp(`^${uidEsc}$`, 'i');
    const teacher = await Teacher.findOne({
      $or: [{ username: uid }, { username: identRe }, { email: identRe }],
    });
    console.log('Login attempt for username:', username);
    console.log('Teacher found:', !!teacher);
    
    if (!teacher) {
      console.log('User not found');
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    if (isAccountLocked(teacher)) {
      return res.status(423).json({ success: false, message: lockoutMessage() });
    }

    // Check if user is suspended
    if (teacher.status === 'suspended') {
      console.log('User is suspended:', teacher.username);
      return res.status(403).json({ success: false, message: 'Your account has been suspended. Please contact the administrator.' });
    }
    
    const passwordMatch = await bcrypt.compare(password, teacher.password);
    // Do not log password checks (avoid leaking auth signals)
    
    if (passwordMatch) {
      await resetLoginAttempts(teacher);
      const token = jwt.sign(
        {
          username: teacher.username,
          teacherId: teacher.teacherId,
          teacherMongoId: String(teacher._id),
          userType: 'teacher',
          role: 'teacher',
        },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      console.log('Token generated successfully');
      console.log('Sending response:', { success: true, token: token.substring(0, 20) + '...', teacherId: teacher.teacherId });

      // CORS is handled globally by server/index.js (credentials + allowed origins). Do not set
      // Access-Control-Allow-Origin: * here — browsers reject * with credentials:true.

      // Check if user has a generated password and needs to change it
      const needsPasswordChange = teacher.hasGeneratedPassword;
      console.log('Teacher hasGeneratedPassword:', teacher.hasGeneratedPassword);
      console.log('needsPasswordChange:', needsPasswordChange);
      
      res.json({ 
        success: true, 
        token, 
        teacherId: teacher.teacherId,
        teacherMongoId: String(teacher._id),
        needsPasswordChange: needsPasswordChange
      });
    } else {
      console.log('Password incorrect');
      await applyFailedLogin(teacher);
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/register', authRegisterLimiter, async (req, res) => {
  const { username, password, firstName = '', middleName = '', lastName = '', email = '' } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }
  try {
    // Check if username already exists
    const existingUsername = await Teacher.findOne({ username });
    if (existingUsername) {
      return res.status(409).json({ success: false, message: 'Username already exists.' });
    }
    
    // Check if email already exists (if provided)
    if (email) {
      const existingEmail = await Teacher.findOne({ email });
      if (existingEmail) {
        return res.status(409).json({ success: false, message: 'Email already exists.' });
      }
    }
    
    // teacherId is the same stable string as login username (unique on Teacher).
    const teacherId = String(username).trim();
    const teacherIdTaken = await Teacher.findOne({ teacherId });
    if (teacherIdTaken) {
      return res.status(409).json({
        success: false,
        message: 'That teacher id is already in use. Choose a different username.',
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const teacher = new Teacher({ 
      username,
      password: hashedPassword,
      teacherId: teacherId,
      firstName,
      middleName,
      lastName,
      email: email || undefined
    });
    await teacher.save();
    res.json({ success: true, teacherId: teacherId, message: 'Account created successfully!' });
  } catch (err) {
    console.error('Registration error:', err);
    if (err.code === 11000) {
      // Duplicate key error
      const field = Object.keys(err.keyPattern)[0];
      return res.status(409).json({ success: false, message: `${field} already exists.` });
    }
    res.status(500).json({ success: false, message: 'Server error: ' + (err.message || 'Failed to create account') });
  }
});

// Student login endpoint
router.post('/student-login', authLoginLimiter, async (req, res) => {
  const { email, username, password } = req.body;
  console.log('=== STUDENT LOGIN ATTEMPT ===');
  console.log('Request body:', { email, username, password: '***' });
  try {
    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ Database not connected. Connection state:', mongoose.connection.readyState);
      return res.status(503).json({ 
        success: false, 
        message: 'Database connection unavailable. Please try again in a moment.' 
      });
    }
    
    // Support both email and username for backward compatibility
    const loginIdentifier = email || username;
    if (!loginIdentifier) {
      return res.status(400).json({ success: false, message: 'Email is required' });
    }
    
    // Search by email first, then fall back to username for backward compatibility
    const student = await Student.findOne({ 
      $or: [
        { email: loginIdentifier },
        { username: loginIdentifier }
      ]
    });
    console.log('Student found:', !!student);
    console.log('Searching for:', loginIdentifier);
    if (!student) {
      console.log('Student not found');
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (isAccountLocked(student)) {
      return res.status(423).json({ success: false, message: lockoutMessage() });
    }

    // Check if user is suspended
    if (student.status === 'suspended') {
      console.log('Student is suspended:', student.username);
      return res.status(403).json({ success: false, message: 'Your account has been suspended. Please contact the administrator.' });
    }
    
    const passwordMatch = await bcrypt.compare(password, student.password);
    // Do not log password checks (avoid leaking auth signals)
    if (passwordMatch) {
      await resetLoginAttempts(student);
      const token = jwt.sign(
        { username: student.username, studentId: student._id },
        JWT_SECRET,
        { expiresIn: JWT_EXPIRES_IN }
      );
      // Check if user has a generated password and needs to change it
      const needsPasswordChange = student.hasGeneratedPassword;
      console.log('Student hasGeneratedPassword:', student.hasGeneratedPassword);
      console.log('needsPasswordChange:', needsPasswordChange);
      
      let accountStatus = student.accountStatus || 'standard';
      if (student.paymentStatus === 'paid' && student.subscriptionStatus === 'active') {
        const subPatch = {};
        if (accountStatus !== 'active_subscriber') {
          subPatch.accountStatus = 'active_subscriber';
          accountStatus = 'active_subscriber';
        }
        if (student.isSubscribed !== true) {
          subPatch.isSubscribed = true;
        }
        if (Object.keys(subPatch).length) {
          await Student.updateOne({ _id: student._id }, { $set: subPatch });
        }
      }

      const fresh = await Student.findById(student._id).lean();
      const effectiveSubscribed = fresh
        ? fresh.isSubscribed === true ||
          (fresh.paymentStatus === 'paid' && fresh.subscriptionStatus === 'active')
        : student.isSubscribed === true ||
          (student.paymentStatus === 'paid' && student.subscriptionStatus === 'active');

      const showWelcomeTour = fresh
        ? fresh.hasSeenWelcomeTour !== true
        : student.hasSeenWelcomeTour !== true;

      const response = { 
        success: true, 
        token, 
        studentId: student._id,
        username: student.username,
        needsPasswordChange: needsPasswordChange,
        accountStatus: (fresh && fresh.accountStatus) || accountStatus,
        hasFreeTrial: fresh ? !!fresh.hasFreeTrial : !!student.hasFreeTrial,
        isSubscribed: !!effectiveSubscribed,
        showWelcomeTour: !!showWelcomeTour,
        isFirstLogin: !!showWelcomeTour,
      };
      console.log('Sending response:', { ...response, token: '***' });
      try {
        const { withRedis } = require('./utils/redisClient');
        const sid = String(student._id || '').trim();
        if (sid) {
          await withRedis((r) => r.set(`login:touch:${sid}`, '1', { EX: 600 }));
        }
      } catch (loginRedisErr) {
        console.error(
          '[student-login] Redis optional step failed (login continues):',
          loginRedisErr && loginRedisErr.message ? loginRedisErr.message : loginRedisErr
        );
      }
      res.json(response);
    } else {
      console.log('Password incorrect');
      await applyFailedLogin(student);
      res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
  } catch (err) {
    console.error('❌ Student login error:', err);
    console.error('Error details:', {
      message: err.message,
      name: err.name,
      code: err.code
    });
    
    // Check if it's a database connection error
    if (err.name === 'MongoServerError' || err.message.includes('Mongo') || err.message.includes('connection')) {
      return res.status(503).json({ 
        success: false, 
        message: 'Database connection error. Please try again in a moment.' 
      });
    }
    
    // Provide more specific error messages
    const errorMessage = err.message || 'Server error';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
});

/**
 * Unified login for Student + Teacher.
 * Strict isolation: does NOT search Admin collection.
 *
 * Request: { email, password }
 * Response (success): { success:true, token, userRole, redirectTo }
 */
router.post('/unified-login', authLoginLimiter, async (req, res) => {
  const { email, password, rememberMe } = req.body || {};
  const identifierRaw = String(email || '').trim();
  const identifierLower = identifierRaw.toLowerCase();

  if (!identifierRaw || !password) {
    return res.status(400).json({ success: false, message: 'Email/username and password are required' });
  }

  // If an admin email is submitted here, do not reveal anything (admins use separate route).
  const forcedAdminIdentifier = String(process.env.FORCE_2FA_ADMIN_IDENTIFIER || 'admin@remoedph.com')
    .trim()
    .toLowerCase();
  if (identifierLower === forcedAdminIdentifier) {
    return res.status(401).json({ success: false, message: 'Invalid email or password' });
  }

  const esc = identifierRaw.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const identRe = new RegExp(`^${esc}$`, 'i');

  try {
    const expiresIn = rememberMe ? '30d' : '2h';

    // Fast dual-search across separate collections (do not query Admin).
    const [student, teacher] = await Promise.all([
      Student.findOne({ $or: [{ email: identRe }, { username: identRe }] }),
      Teacher.findOne({ $or: [{ email: identRe }, { username: identRe }] }),
    ]);

    let useTeacher = !!teacher;
    let useStudent = !!student;
    // Same identifier on both collections: only one password should match in normal setups.
    if (student && teacher) {
      const teacherOk = await bcrypt.compare(String(password), teacher.password).catch(() => false);
      const studentOk = await bcrypt.compare(String(password), student.password).catch(() => false);
      if (teacherOk && !studentOk) {
        useStudent = false;
      } else if (studentOk && !teacherOk) {
        useTeacher = false;
      } else {
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }
    }

    if (!useTeacher && !useStudent) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    if (useTeacher) {
      // Pending / under review teachers: allow flexible status values seen in legacy docs.
      const st = String(teacher.status || '').toLowerCase();
      if (teacher.isApproved === false) {
        return res
          .status(403)
          .json({ success: false, message: 'Your teacher account is pending approval' });
      }
      if (st && st !== 'active' && st !== 'suspended') {
        return res
          .status(403)
          .json({ success: false, message: 'Your teacher account is currently under review.' });
      }
      if (st === 'suspended') {
        return res.status(403).json({
          success: false,
          message: 'Your account has been suspended. Please contact the administrator.',
        });
      }

      if (isAccountLocked(teacher)) {
        return res.status(423).json({ success: false, message: lockoutMessage() });
      }

      const ok = await bcrypt.compare(String(password), teacher.password);
      if (!ok) {
        await applyFailedLogin(teacher);
        return res.status(401).json({ success: false, message: 'Invalid email or password' });
      }

      await resetLoginAttempts(teacher);
      const token = jwt.sign(
        {
          userRole: 'teacher',
          username: teacher.username,
          teacherId: teacher.teacherId,
          teacherMongoId: String(teacher._id),
          userType: 'teacher',
          role: 'teacher',
        },
        JWT_SECRET,
        { expiresIn }
      );
      return res.json({
        success: true,
        token,
        userRole: 'teacher',
        teacherId: teacher.teacherId,
        teacherMongoId: String(teacher._id),
        redirectTo: '/teacher/dashboard',
      });
    }

    // Student
    if (!useStudent) {
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }
    if (student.status === 'suspended') {
      return res.status(403).json({
        success: false,
        message: 'Your account has been suspended. Please contact the administrator.',
      });
    }
    if (isAccountLocked(student)) {
      return res.status(423).json({ success: false, message: lockoutMessage() });
    }

    const ok = await bcrypt.compare(String(password), student.password);
    if (!ok) {
      await applyFailedLogin(student);
      return res.status(401).json({ success: false, message: 'Invalid email or password' });
    }

    await resetLoginAttempts(student);
    const token = jwt.sign(
      { userRole: 'student', username: student.username, studentId: student._id },
      JWT_SECRET,
      { expiresIn }
    );
    try {
      const { withRedis } = require('./utils/redisClient');
      const sid = String(student._id || '').trim();
      if (sid) {
        await withRedis((r) => r.set(`login:touch:${sid}`, '1', { EX: 600 }));
      }
    } catch (loginRedisErr) {
      console.error(
        '[unified-login] Redis optional step failed (login continues):',
        loginRedisErr && loginRedisErr.message ? loginRedisErr.message : loginRedisErr
      );
    }
    return res.json({
      success: true,
      token,
      userRole: 'student',
      redirectTo: '/student/dashboard',
    });
  } catch (err) {
    console.error('Unified login error:', err);
    return res.status(500).json({ success: false, message: 'Login failed. Please try again.' });
  }
});

// Student registration endpoint
router.post('/student-register', authRegisterLimiter, async (req, res) => {
  const { username, email, password, referralCode, assessmentTrialToken } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email address is required' });
  }

  // Check if database is connected
  if (mongoose.connection.readyState !== 1) {
    console.error('❌ Database not connected. Connection state:', mongoose.connection.readyState);
    return res.status(503).json({ 
      success: false, 
      message: 'Database connection unavailable. Please try again in a moment.' 
    });
  }

  let trial = null;
  if (assessmentTrialToken && String(assessmentTrialToken).trim()) {
    trial = await AssessmentTrial.findOne({
      token: String(assessmentTrialToken).trim(),
      redeemedByStudentId: null,
    });
    if (!trial) {
      return res.status(400).json({
        success: false,
        message: 'Invalid or already used assessment trial link. Request a new results email from the assessment page.',
      });
    }
    const em = String(email).trim().toLowerCase();
    if (em !== trial.parentEmail) {
      return res.status(400).json({
        success: false,
        message:
          'Use the same email address you used for the level assessment to claim your free trial class.',
      });
    }
  }
  
  try {
    // Check if username already exists
    const existingUsername = await Student.findOne({ username });
    if (existingUsername) {
      return res.status(409).json({ success: false, message: 'Username already exists' });
    }
    
    // Check if email already exists
    const existingEmail = await Student.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({ success: false, message: 'Email address already registered' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const student = new Student({ 
      username, 
      email: email,
      password: hashedPassword,
      parentName: req.body.parentName || '',
      contact: req.body.contact || ''
      // firstName and lastName will be set when they update their profile
    });

    // Attach referral if provided (teacher referral link)
    if (referralCode && String(referralCode).trim()) {
      const code = String(referralCode).trim();
      try {
        const teacher = await Teacher.findOne({ referralCode: code }).lean();
        if (teacher) {
          student.referralCode = code;
          student.referredByTeacherId = teacher.teacherId; // legacy
          student.referredByOwnerType = 'teacher';
          student.referredByOwnerId = teacher.teacherId;
        } else {
          const admin = await Admin.findOne({ referralCode: code }).lean();
          if (admin) {
            student.referralCode = code;
            student.referredByOwnerType = 'admin';
            student.referredByOwnerId = admin.username;
          }
        }
      } catch (e) {
        // Don't fail registration if referral lookup fails
        console.warn('Referral lookup failed during student registration:', e.message);
      }
    }

    await student.save();

    if (trial) {
      const now = new Date();
      const redeem = await AssessmentTrial.findOneAndUpdate(
        { _id: trial._id, redeemedByStudentId: null },
        { $set: { redeemedByStudentId: student._id, redeemedAt: now } },
        { new: true }
      );
      if (!redeem) {
        return res.status(409).json({
          success: false,
          message: 'This assessment trial link was just used. Please refresh and try again.',
        });
      }
      const prevBal = Math.max(0, Number(student.creditBalance) || 0);
      const reserved = Math.max(0, Number(student.reservedCredits) || 0);
      const balanceAfterPool = prevBal + 1;
      const trialProfileSet = {
        assessmentTrialCreditActive: true,
        accountStatus: 'trial_active',
        hasFreeTrial: true,
        isSubscribed: false,
        assessmentTrialGrantedAt: now,
      };
      if (redeem.cefrLevel) {
        trialProfileSet.cefrLevel = redeem.cefrLevel;
        trialProfileSet.leveling = redeem.cefrLevel;
      }
      if (redeem.score != null && redeem.score !== undefined) {
        trialProfileSet.assessmentScore = Number(redeem.score) || 0;
      }
      trialProfileSet.assessmentDate = new Date();

      await Student.updateOne(
        { _id: student._id },
        {
          $inc: {
            creditBalance: 1,
            totalCreditsEarned: 1,
            totalLessonsPurchased: 1,
            'learningJourneyPurchasedByLevel.nursery': 1,
            'learningJourneyPurchasedByLevel.kinder': 1,
            'learningJourneyPurchasedByLevel.prep': 1,
          },
          $set: trialProfileSet,
          $push: {
            creditTransactions: {
              date: now,
              type: 'adjustment',
              plan: 'assessment-trial',
              description: 'Free trial class from level assessment',
              credits: 1,
              balanceAfter: Math.max(balanceAfterPool - reserved, 0),
              amountPaid: 0,
            },
          },
        }
      );
      return res.json({
        success: true,
        message: 'Student registered successfully. Log in to book your free trial class.',
        studentId: student._id,
        assessmentTrialActivated: true,
      });
    }

    res.json({ success: true, message: 'Student registered successfully', studentId: student._id });
  } catch (err) {
    console.error('❌ Student registration error:', err);
    console.error('Error details:', {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack
    });
    
    // Provide more specific error messages
    let errorMessage = 'Server error';
    if (err.name === 'ValidationError') {
      errorMessage = `Validation error: ${err.message}`;
    } else if (err.name === 'MongoServerError' && err.code === 11000) {
      // Duplicate key error
      const field = Object.keys(err.keyPattern)[0];
      errorMessage = `${field} already exists`;
    } else if (err.message) {
      errorMessage = err.message;
    }
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// After PayMongo checkout: finish profile with password check (no JWT yet)
router.post('/complete-checkout-profile', authRegisterLimiter, async (req, res) => {
  try {
    const email = String(req.body.email || '').trim().toLowerCase();
    const username = String(req.body.username || '').trim();
    const password = req.body.password;
    const firstName = String(req.body.firstName || '').trim();
    const lastName = String(req.body.lastName || '').trim();
    const contact = req.body.contact != null ? String(req.body.contact).trim() : '';

    if (!email || !username || !password || !firstName || !lastName) {
      return res.status(400).json({
        success: false,
        message: 'Email, username, password, first name, and last name are required.',
      });
    }

    if (mongoose.connection.readyState !== 1) {
      return res.status(503).json({
        success: false,
        message: 'Database unavailable. Try again shortly.',
      });
    }

    const student = await Student.findOne({ username });
    const studentEmail = (student && student.email) ? String(student.email).toLowerCase() : '';
    if (!student || studentEmail !== email) {
      return res.status(404).json({
        success: false,
        message: 'No matching account. Check your username and email, or contact support.',
      });
    }

    if (student.paymentStatus !== 'paid') {
      return res.status(403).json({
        success: false,
        message: 'Payment not confirmed yet. If you just paid, wait a moment and try again.',
      });
    }

    const passwordMatch = await bcrypt.compare(password, student.password);
    if (!passwordMatch) {
      return res.status(401).json({
        success: false,
        message: 'Password does not match the one you used at checkout.',
      });
    }

    student.firstName = firstName;
    student.lastName = lastName;
    if (contact) student.contact = contact;
    await student.save();

    return res.json({
      success: true,
      message: 'Profile saved. You can log in with your username and password.',
    });
  } catch (err) {
    console.error('complete-checkout-profile error:', err);
    return res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Add forgot password endpoint for teachers - generates new password
router.post('/forgot-password', passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if email is provided
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }
    
    // Look for user by username or email field
    const user = await Teacher.findOne({ 
      $or: [
        { username: email },
        { email: email }
      ]
    });
    
    if (!user) {
      // Email doesn't exist in database
      return res.status(404).json({ success: false, message: 'Email address not found. Please check your email or contact support.' });
    }
    
    // Verify that the entered email matches the user's registered email
    const userEmail = user.email || user.username;
    if (userEmail !== email) {
      // Email doesn't match the user's registered email
      return res.status(404).json({ success: false, message: 'Email address not found. Please check your email or contact support.' });
    }
    
    // Generate a strong password (10 characters)
    const newPassword = generateStrongPassword();
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update user's password
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    
    // Send email with new password to the entered email address
    const emailResult = await sendPasswordResetEmail(
      email, // Use the email address that was entered
      user.username, 
      newPassword, 
      'Teacher'
    );
    
    if (emailResult.success) {
      res.json({ 
        success: true, 
        message: 'A new password has been generated and sent to your email address.'
      });
    } else if (emailResult.fallback) {
      // Email not configured - return password for testing
      console.log('Email not configured - returning password for testing');
      res.json({ 
        success: true, 
        message: 'A new password has been generated. Please check your email or contact support if you don\'t receive it.',
        newPassword: newPassword // Only for testing when email not configured
      });
    } else {
      // If email fails, still update password but notify user
      console.error('Email sending failed:', emailResult.error);
      res.json({ 
        success: true, 
        message: 'A new password has been generated. Please check your email or contact support if you don\'t receive it.'
      });
    }
  } catch (error) {
    console.error('Error in forgot password:', error);
    res.status(500).json({ success: false, message: 'An error occurred while processing your request.' });
  }
});

// Add reset password endpoint
router.post('/reset-password', passwordResetLimiter, async (req, res) => {
  const { token, password } = req.body;
  console.log('Token received:', token);
  const user = await Teacher.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() }
  });
  console.log('User found for token:', user);
  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
  }
  user.password = await bcrypt.hash(password, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  res.json({ success: true });
});



// Student schema (already imported from models/Student.js)

// Student login endpoint (duplicate removed - using the one above)

// Student forgot password endpoint - generates new password
router.post('/student-forgot-password', passwordResetLimiter, async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if email is provided
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }
    
    // Look for user by username or email field
    const user = await Student.findOne({ 
      $or: [
        { username: email },
        { email: email }
      ]
    });
    
    if (!user) {
      // Email doesn't exist in database
      return res.status(404).json({ success: false, message: 'Email address not found. Please check your email or contact support.' });
    }
    
    // Verify that the entered email matches the user's registered email
    const userEmail = user.email || user.username;
    if (userEmail !== email) {
      // Email doesn't match the user's registered email
      return res.status(404).json({ success: false, message: 'Email address not found. Please check your email or contact support.' });
    }
    
    // Generate a strong password (10 characters)
    const newPassword = generateStrongPassword();
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update user's password and set hasGeneratedPassword flag
    user.password = hashedPassword;
    user.hasGeneratedPassword = true; // Set flag to force password change
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    
    // Send email with new password to the entered email address
    const emailResult = await sendPasswordResetEmail(
      email, // Use the email address that was entered
      user.username, 
      newPassword, 
      'Student'
    );
    
    if (emailResult.success) {
      res.json({ 
        success: true, 
        message: 'A new password has been generated and sent to your email address.'
      });
    } else if (emailResult.fallback) {
      // Email not configured - return password for testing
      console.log('Email not configured - returning password for testing');
      res.json({ 
        success: true, 
        message: 'A new password has been generated. Please check your email or contact support if you don\'t receive it.',
        newPassword: newPassword // Only for testing when email not configured
      });
    } else {
      // If email fails, still update password but notify user
      console.error('Email sending failed:', emailResult.error);
      res.json({ 
        success: true, 
        message: 'A new password has been generated. Please check your email or contact support if you don\'t receive it.'
      });
    }
  } catch (error) {
    console.error('Error in student forgot password:', error);
    res.status(500).json({ success: false, message: 'An error occurred while processing your request.' });
  }
});

// Add reset password endpoint (duplicate removed - using the one above)

// Student reset password endpoint
router.post('/student-reset-password', passwordResetLimiter, async (req, res) => {
  const { token, password } = req.body;
  const user = await Student.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() }
  });
  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
  }
  user.password = await bcrypt.hash(password, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  res.json({ success: true });
});

// Get users by role
router.get('/users', async (req, res) => {
  const role = req.query.role;
  if (role === 'teacher') {
    const teachers = await Teacher.find({}, 'username');
    return res.json(teachers.map(t => ({ username: t.username, role: 'teacher' })));
  } else if (role === 'student') {
    const students = await Student.find({}, 'username');
    return res.json(students.map(s => ({ username: s.username, role: 'student' })));
  } else if (role === 'admin') {
    const admins = await Admin.find({}, 'username');
    return res.json(admins.map(a => ({ username: a.username, role: 'admin' })));
  } else {
    return res.status(400).json({ success: false, message: 'Invalid role' });
  }
});

// Change user role (move between collections)
router.post('/user-role', async (req, res) => {
  const { username, fromRole, toRole } = req.body;
  if (!username || !fromRole || !toRole || fromRole === toRole) {
    return res.status(400).json({ success: false, message: 'Invalid request' });
  }
  let userDoc = null;
  if (fromRole === 'teacher') {
    userDoc = await Teacher.findOneAndDelete({ username });
  } else if (fromRole === 'student') {
    userDoc = await Student.findOneAndDelete({ username });
  } else if (fromRole === 'admin') {
    userDoc = await Admin.findOneAndDelete({ username });
  }
  if (!userDoc) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  // Move to new collection
  if (toRole === 'teacher') {
    await Teacher.create({ username, password: userDoc.password });
  } else if (toRole === 'student') {
    await Student.create({ username, password: userDoc.password });
  } else if (toRole === 'admin') {
    await Admin.create({ username, password: userDoc.password });
  }
  res.json({ success: true });
});

// Migration endpoint to add hasGeneratedPassword field to all users
router.post('/migrate-generated-password-field', async (req, res) => {
  try {
    // Update all teachers
    const teacherResult = await Teacher.updateMany(
      { hasGeneratedPassword: { $exists: false } },
      { $set: { hasGeneratedPassword: false } }
    );
    
    // Update all students
    const studentResult = await Student.updateMany(
      { hasGeneratedPassword: { $exists: false } },
      { $set: { hasGeneratedPassword: false } }
    );
    
    // Update all admins
    const adminResult = await Admin.updateMany(
      { hasGeneratedPassword: { $exists: false } },
      { $set: { hasGeneratedPassword: false } }
    );
    
    res.json({ 
      success: true, 
      message: 'Migration completed',
      teachersUpdated: teacherResult.modifiedCount,
      studentsUpdated: studentResult.modifiedCount,
      adminsUpdated: adminResult.modifiedCount
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ success: false, message: 'Migration failed' });
  }
});

// Test endpoint to set hasGeneratedPassword flag for testing
router.post('/test-set-generated-password', async (req, res) => {
  try {
    const { username, userType } = req.body;
    
    let user;
    if (userType === 'teacher') {
      user = await Teacher.findOne({ username });
    } else if (userType === 'student') {
      user = await Student.findOne({ username });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid user type' });
    }
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    user.hasGeneratedPassword = true;
    await user.save();
    
    res.json({ 
      success: true, 
      message: `hasGeneratedPassword flag set to true for ${username}` 
    });
  } catch (error) {
    console.error('Error setting generated password flag:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Change password endpoint
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, userType } = req.body;
    const userId = req.user.teacherId || req.user.studentId; // Get the appropriate ID from token

    console.log('=== CHANGE PASSWORD ATTEMPT ===');
    console.log('User ID from token:', userId);
    console.log('User type:', userType);
    console.log('Request body:', { currentPassword: '***', newPassword: '***', userType });

    if (!currentPassword || !newPassword || !userType) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Validate new password strength (no special characters required)
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ 
        success: false, 
        message: 'New password must be at least 8 characters long and contain uppercase, lowercase, and number' 
      });
    }

    let user;
    let UserModel;

    // Determine which model to use based on userType
    if (userType === 'teacher') {
      UserModel = Teacher;
    } else if (userType === 'student') {
      UserModel = Student;
    } else if (userType === 'admin') {
      UserModel = Admin;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid user type' });
    }

    // Find user by the appropriate ID based on user type
    if (userType === 'teacher') {
      console.log('Looking for teacher with teacherId:', userId);
      user = await UserModel.findOne({ teacherId: userId });
    } else if (userType === 'student') {
      console.log('Looking for student with studentId:', userId);
      user = await UserModel.findOne({ _id: userId });
    } else if (userType === 'admin') {
      console.log('Looking for admin with adminId:', userId);
      user = await UserModel.findOne({ _id: userId });
    }
    console.log('User found:', !!user);
    if (!user) {
      console.log('User not found in database');
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    console.log('User found successfully:', user.username);

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    // Check if new password is same as current
    const isNewPasswordSame = await bcrypt.compare(newPassword, user.password);
    if (isNewPasswordSame) {
      return res.status(400).json({ success: false, message: 'New password must be different from current password' });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear the generated password flag
    user.password = hashedNewPassword;
    user.hasGeneratedPassword = false; // Clear the flag since user now has a personal password
    await user.save();

    res.json({ success: true, message: 'Password updated successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router; 