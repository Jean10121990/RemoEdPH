const rateLimit = require('express-rate-limit');

const std = {
  standardHeaders: true,
  legacyHeaders: false,
};

/** Teacher + student + register login bursts */
const authLoginLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_LOGIN_MAX_PER_15M || 40),
  ...std,
  message: { success: false, error: 'Too many login attempts. Try again later.' },
});

const adminLoginLimiterExtra = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(
    process.env.RATE_LIMIT_ADMIN_LOGIN_MAX_PER_15M ||
      process.env.ADMIN_LOGIN_RATE_LIMIT_MAX ||
      10
  ),
  ...std,
  message: { success: false, message: 'Too many login attempts. Please try again later.' },
});

/** Forgot / reset password (email + account enumeration mitigation) */
const passwordResetLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_PASSWORD_RESET_MAX_PER_HOUR || 12),
  ...std,
  message: { success: false, error: 'Too many password reset requests. Try again later.' },
});

/** Multipart / document uploads */
const fileUploadLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_UPLOAD_MAX_PER_15M || 120),
  ...std,
  message: { error: 'Too many uploads from this IP. Please try again later.' },
});

/** Teacher peer directory search (regex queries) */
const teacherPeerSearchLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: Number(process.env.RATE_LIMIT_TEACHER_SEARCH_PER_MIN || 40),
  ...std,
  message: { error: 'Too many search requests. Please slow down.' },
});

const authRegisterLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: Number(process.env.RATE_LIMIT_REGISTER_MAX_PER_HOUR || 25),
  ...std,
  message: { success: false, error: 'Too many registration attempts. Try again later.' },
});

module.exports = {
  authLoginLimiter,
  adminLoginLimiterExtra,
  passwordResetLimiter,
  fileUploadLimiter,
  teacherPeerSearchLimiter,
  authRegisterLimiter,
};
