const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');
const Admin = require('./models/Admin');
const { isTokenBlacklisted } = require('./services/jwtBlacklist');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

const ADMIN_2FA_SETUP_PATHS = new Set(['/2fa-setup', '/2fa-verify']);

/**
 * Invalidate other sessions via Admin.sessionVersion (Bearer + cookie must match DB).
 */
const requireAdminSessionValid = async (req, res, next) => {
  try {
    if (!req.user || req.user.isAdmin !== true) {
      return next();
    }
    const adminId = req.user.adminId;
    if (!adminId || !mongoose.isValidObjectId(String(adminId))) {
      return next();
    }
    const admin = await Admin.findById(String(adminId)).select('sessionVersion').lean();
    if (!admin) {
      return res.status(401).json({ error: 'Invalid session.', code: 'ADMIN_SESSION_REVOKED' });
    }
    const dbSv = Number(admin.sessionVersion) || 0;
    const fromSession = !!(req.session && req.session.adminAuth === true);
    const tokenSv = fromSession ? req.session.adminSessionVersion : req.user.sessionVersion;
    if ((tokenSv === undefined || tokenSv === null) && dbSv > 0) {
      return res.status(401).json({
        error: 'Session expired. Please sign in again.',
        code: 'ADMIN_SESSION_REVOKED',
      });
    }
    if (Number(tokenSv || 0) !== dbSv) {
      return res.status(401).json({
        error: 'Session expired. Please sign in again.',
        code: 'ADMIN_SESSION_REVOKED',
      });
    }
    return next();
  } catch (e) {
    return res.status(500).json({ error: 'Session check failed.' });
  }
};

/**
 * When an admin has TOTP enabled, require a post-2FA session flag or a JWT with twoFactorVerified.
 * Exempts POST /2fa-setup and POST /2fa-verify (enrollment) from this check.
 */
const requireAdminTwoFactorSatisfied = async (req, res, next) => {
  try {
    const p = req.path || '';
    const method = req.method || '';
    if (method === 'POST' && ADMIN_2FA_SETUP_PATHS.has(p)) {
      return next();
    }
    if (!req.user || (req.user.isAdmin !== true && req.user.role !== 'admin')) {
      return next();
    }
    const adminId = req.user.adminId;
    if (!adminId || !mongoose.isValidObjectId(String(adminId))) {
      return res.status(403).json({
        error: 'Two-factor authentication required.',
        code: 'ADMIN_2FA_REQUIRED',
      });
    }
    const admin = await Admin.findById(String(adminId)).select('isTwoFactorEnabled twoFactorEnabledAt').lean();
    if (!admin) {
      return res.status(401).json({ error: 'Invalid admin session.', code: 'ADMIN_2FA_REQUIRED' });
    }
    if (!admin.isTwoFactorEnabled) {
      return next();
    }

    const fromSession = !!(req.session && req.session.adminAuth === true);
    if (fromSession) {
      if (req.session.admin2faVerified === true) {
        return next();
      }
      return res.status(403).json({
        error: 'Two-factor authentication required.',
        code: 'ADMIN_2FA_REQUIRED',
      });
    }

    if (req.user.twoFactorVerified !== true) {
      return res.status(403).json({
        error: 'Two-factor authentication required.',
        code: 'ADMIN_2FA_REQUIRED',
      });
    }
    if (admin.twoFactorEnabledAt) {
      const enabledSec = Math.floor(new Date(admin.twoFactorEnabledAt).getTime() / 1000);
      const iat = Number(req.user.iat);
      if (Number.isFinite(iat) && Number.isFinite(enabledSec) && iat < enabledSec - 1) {
        return res.status(403).json({
          error: 'Sign in again after enabling two-factor authentication.',
          code: 'ADMIN_2FA_REQUIRED',
        });
      }
    }
    return next();
  } catch (e) {
    return res.status(500).json({ error: 'Authorization check failed.' });
  }
};

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  console.log('Verifying token...');
  console.log('Authorization header:', req.headers.authorization);
  
  const token =
    req.headers.authorization?.split(' ')[1] ||
    req.body?.token ||
    req.query?.token;
  console.log('Extracted token:', token ? 'Token found' : 'No token');
  
  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    if (isTokenBlacklisted(token)) {
      return res.status(401).json({ error: 'Token has been revoked.' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Token decoded successfully:', decoded);
    req.user = decoded;
    next();
  } catch (error) {
    console.log('Token verification failed:', error.message);
    console.log('JWT_SECRET used:', JWT_SECRET ? 'Secret exists' : 'No secret');
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

/**
 * Admin API: accept httpOnly session cookie (set on POST /api/auth/admin-login)
 * or legacy Bearer JWT with isAdmin / role admin.
 */
const verifyAdminApiAuth = (req, res, next) => {
  if (req.session && req.session.adminAuth === true && req.session.adminUsername) {
    req.user = {
      username: req.session.adminUsername,
      isAdmin: true,
      role: 'admin',
      adminId: req.session.adminId || null,
      adminRole: req.session.adminRole || 'super_admin',
      sessionVersion: req.session.adminSessionVersion,
    };
    return next();
  }

  const token =
    req.headers.authorization?.split(' ')[1] ||
    req.body?.token ||
    req.query?.token;

  if (!token) {
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    if (isTokenBlacklisted(token)) {
      return res.status(401).json({ error: 'Token has been revoked.' });
    }
    const decoded = jwt.verify(token, JWT_SECRET);
    if (decoded.isAdmin !== true && decoded.role !== 'admin') {
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
    req.user = {
      ...decoded,
      adminRole: decoded.adminRole || 'super_admin',
    };
    next();
  } catch (error) {
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

/**
 * Scope non–super-admin roles from sensitive admin API areas.
 * super_admin bypasses all checks.
 */
const adminRoleGate = (req, res, next) => {
  if (!req.user || req.user.isAdmin !== true) return next();
  const role = req.user.adminRole || 'super_admin';
  if (role === 'super_admin') return next();
  const p = req.path || '';

  if (
    p.includes('/settings/') ||
    p.includes('/maintenance') ||
    p.includes('/cleanup/')
  ) {
    return res.status(403).json({ error: 'Only Super-Admin can access system settings and maintenance.' });
  }

  // Match /user CRUD only — NOT paths like /messages/users (substring "/user" inside "/users").
  const userMgmtRe = /^\/user(\/|$|\?)/;

  if (role === 'admin_qa') {
    if (
      /\/payment|\/dispense|\/teachers-weekly-salaries|teacher-pipeline|teachers-list|teachers-filter-list|students-list|admins-list|\/referral-link|unique-link|global-rate|save-global-rate|update-global-rate/.test(
        p
      ) ||
      userMgmtRe.test(p)
    ) {
      return res.status(403).json({ error: 'Your admin role (QA) cannot access this resource.' });
    }
  }
  if (role === 'admin_accounting') {
    if (
      /\/issues|issue-reports|teacher-pipeline|teachers-list|students-list|admins-list|^\/admins$/.test(p) ||
      userMgmtRe.test(p)
    ) {
      return res.status(403).json({ error: 'Your admin role (Accounting) cannot access this resource.' });
    }
  }
  if (role === 'admin_hr') {
    if (
      /\/issues|issue-reports|payment|dispense|teachers-weekly-salaries|classroom-recordings|referral-link|unique-link|global-rate|save-global-rate|update-global-rate/.test(
        p
      )
    ) {
      return res.status(403).json({ error: 'Your admin role (HR) cannot access this resource.' });
    }
  }
  return next();
};

/** Classroom recording admin routes (mounted separately) — QA + Super-Admin only. */
const requireAdminQaOrSuper = (req, res, next) => {
  const role = req.user && (req.user.adminRole || 'super_admin');
  if (role === 'super_admin' || role === 'admin_qa') return next();
  return res.status(403).json({ error: 'Your admin role cannot access lesson recordings.' });
};

const requireSuperAdminDb = async (req, res, next) => {
  try {
    if (!req.user || !req.user.username) {
      return res.status(401).json({ error: 'Authentication required.' });
    }
    const admin = await Admin.findOne({ username: String(req.user.username).trim() }).lean();
    const role = admin && admin.adminRole ? admin.adminRole : 'super_admin';
    if (role !== 'super_admin') {
      return res.status(403).json({ error: 'Only Super-Admin can perform this action.' });
    }
    next();
  } catch (e) {
    return res.status(500).json({ error: 'Authorization check failed.' });
  }
};

// Middleware to ensure user is a teacher
const requireTeacher = async (req, res, next) => {
  try {
    console.log('requireTeacher middleware - req.user:', req.user);
    if (!req.user) {
      console.log('No req.user found in requireTeacher middleware');
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Try to resolve the teacher by multiple identifiers for robustness
    const orConditions = [];
    if (req.user.teacherId) {
      orConditions.push({ teacherId: req.user.teacherId });
      if (mongoose.isValidObjectId(req.user.teacherId)) {
        orConditions.push({ _id: req.user.teacherId });
      }
    }
    if (req.user.username) {
      orConditions.push({ username: req.user.username });
      orConditions.push({ email: req.user.username });
    }

    const teacher = await Teacher.findOne({ $or: orConditions });
    
    if (!teacher) {
      console.log('Teacher not found for identifiers:', {
        teacherId: req.user.teacherId,
        username: req.user.username
      });
      return res.status(403).json({ error: 'Access denied. Teacher privileges required.' });
    }

    req.teacher = teacher;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Server error during authentication.' });
  }
};

// Middleware to ensure user is a student
const requireStudent = async (req, res, next) => {
  try {
    console.log('requireStudent middleware - req.user:', req.user);
    if (!req.user) {
      console.log('No req.user found in requireStudent middleware');
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Try to resolve the student by multiple identifiers for robustness
    const orConditions = [];
    if (req.user.studentId) {
      orConditions.push({ _id: req.user.studentId });
    }
    if (req.user.username) {
      orConditions.push({ username: req.user.username });
      orConditions.push({ email: req.user.username });
    }

    const student = await Student.findOne({ $or: orConditions });
    
    if (!student) {
      console.log('Student not found for identifiers:', {
        studentId: req.user.studentId,
        username: req.user.username
      });
      return res.status(403).json({ error: 'Access denied. Student privileges required.' });
    }

    req.student = student;
    next();
  } catch (error) {
    console.log('Error in requireStudent middleware:', error);
    console.log('Decoded user:', req.user);
    return res.status(500).json({ error: 'Server error during authentication.' });
  }
};

// Middleware to ensure teacher can only access their own data
const requireOwnTeacherData = async (req, res, next) => {
  try {
    const requestedTeacherId = req.params.teacherId || req.body.teacherId || req.query.teacherId;
    
    if (requestedTeacherId && requestedTeacherId !== req.user.teacherId) {
      return res.status(403).json({ error: 'Access denied. You can only access your own data.' });
    }
    
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Server error during authorization.' });
  }
};

// Middleware to ensure student can only access their own data
const requireOwnStudentData = async (req, res, next) => {
  try {
    const requestedStudentId = req.params.studentId || req.body.studentId || req.query.studentId;
    
    if (requestedStudentId && requestedStudentId !== req.user.studentId) {
      return res.status(403).json({ error: 'Access denied. You can only access your own data.' });
    }
    
    next();
  } catch (error) {
    console.log('Decoded user:', req.user);
    return res.status(500).json({ error: 'Server error during authorization.' });
  }
};

// Middleware to ensure user is an admin
const requireAdmin = async (req, res, next) => {
  try {
    console.log('requireAdmin middleware - req.user:', JSON.stringify(req.user, null, 2));
    if (!req.user) {
      console.log('No req.user found in requireAdmin middleware');
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Check admin only from verified claims (JWT or session) — do not infer from username
    const isAdmin = req.user.isAdmin === true || req.user.role === 'admin';
    
    console.log('Admin check result:', {
      isAdmin: req.user.isAdmin,
      role: req.user.role,
      username: req.user.username,
      finalResult: isAdmin
    });

    if (isAdmin) {
      req.admin = req.user;
      next();
    } else {
      console.log('User is not admin. User details:', {
        username: req.user.username,
        isAdmin: req.user.isAdmin,
        role: req.user.role
      });
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
  } catch (error) {
    console.error('Error in requireAdmin middleware:', error);
    return res.status(500).json({ error: 'Server error during authentication.' });
  }
};

// Middleware to log access attempts for security monitoring
const logAccess = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const userType = req.user?.teacherId
    ? 'teacher'
    : req.user?.studentId
      ? 'student'
      : req.user?.isAdmin || req.user?.role === 'admin'
        ? 'admin'
        : 'unknown';
  const userId = req.user?.teacherId || req.user?.studentId || req.user?.username || 'unknown';
  const endpoint = req.originalUrl;
  const method = req.method;
  
  console.log(`[${timestamp}] ${method} ${endpoint} - User: ${userType}:${userId} - IP: ${req.ip}`);
  next();
};

module.exports = {
  verifyToken,
  verifyAdminApiAuth,
  requireAdminTwoFactorSatisfied,
  requireAdminSessionValid,
  adminRoleGate,
  requireAdminQaOrSuper,
  requireSuperAdminDb,
  requireTeacher,
  requireStudent,
  requireAdmin,
  requireOwnTeacherData,
  requireOwnStudentData,
  logAccess
}; 