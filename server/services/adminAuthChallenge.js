/**
 * After an admin identity is proven (password or Google), require authenticator
 * setup or a 6-digit code before any portal session or JWT is issued.
 */
const jwt = require('jsonwebtoken');
const QRCode = require('qrcode');
const { authenticator } = require('otplib');
const { getJwtSecret } = require('../config/jwtSecret');
const { ADMIN_JWT_EXPIRES_IN } = require('../config/authTokens');
const { recordAdminLoginActivity, getAdminSessionVersion } = require('./adminLoginActivity');
const { ADMIN_2FA_ENROLLMENT_PURPOSE, requiresForced2faEnrollment } = require('../utils/adminForce2fa');
const { decryptTotpSecret, encryptTotpSecret } = require('../utils/twoFactorSecretCrypto');

const ADMIN_2FA_PENDING_PURPOSE = 'admin_2fa_pending';
const ADMIN_2FA_PENDING_MS = 10 * 60 * 1000;

function rememberAdmin2faPending(req, adminId) {
  return new Promise(function (resolve, reject) {
    if (!req.session || typeof req.session.save !== 'function') {
      reject(new Error('No session'));
      return;
    }
    const write = function () {
      req.session.admin2faPending = true;
      req.session.admin2faPendingAdminId = String(adminId);
      req.session.admin2faPendingExp = Date.now() + ADMIN_2FA_PENDING_MS;
      req.session.save(function (err) {
        if (err) reject(err);
        else resolve();
      });
    };
    if (typeof req.session.regenerate === 'function') {
      req.session.regenerate(function (err) {
        if (err) reject(err);
        else write();
      });
    } else {
      write();
    }
  });
}

function readAdmin2faPending(req) {
  const s = req && req.session;
  if (!s || s.admin2faPending !== true || !s.admin2faPendingAdminId) return '';
  const exp = Number(s.admin2faPendingExp) || 0;
  if (exp <= Date.now()) return '';
  return String(s.admin2faPendingAdminId);
}

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

function sendAdminAuthChallenge(req, res, admin) {
  const adminRole = admin.adminRole || 'super_admin';
  const JWT_SECRET = getJwtSecret();

  if (requiresForced2faEnrollment(admin)) {
    return prepareAdminTotpEnrollmentMaterials(admin)
      .then(function (out) {
        const enrollmentToken = jwt.sign(
          { purpose: ADMIN_2FA_ENROLLMENT_PURPOSE, adminId: String(admin._id) },
          JWT_SECRET,
          { expiresIn: '30m' }
        );
        return new Promise(function (resolve) {
          req.session.regenerate(function (regenErr) {
            if (regenErr) {
              res.status(500).json({ success: false, message: 'Could not create enrollment session' });
              return resolve();
            }
            req.session.admin2faEnroll = true;
            req.session.admin2faEnrollAdminId = String(admin._id);
            req.session.admin2faEnrollToken = enrollmentToken;
            req.session.save(function (saveErr) {
              if (saveErr) {
                res.status(500).json({ success: false, message: 'Could not save enrollment session' });
                return resolve();
              }
              res.json({
                success: true,
                require2FASetup: true,
                enrollmentToken,
                qrCodeData: out.qrCodeData,
                setupPath: '/admin/2fa-setup',
                username: admin.username,
                adminRole,
                message: 'Complete two-factor setup before accessing the admin portal.',
              });
              resolve();
            });
          });
        });
      })
      .catch(function (prepErr) {
        console.error('prepareAdminTotpEnrollmentMaterials:', prepErr);
        res.status(500).json({
          success: false,
          message: 'Could not prepare two-factor authentication. Please try again.',
        });
      });
  }

  if (admin.isTwoFactorEnabled === true) {
    const tempToken = jwt.sign(
      { purpose: ADMIN_2FA_PENDING_PURPOSE, adminId: String(admin._id) },
      JWT_SECRET,
      { expiresIn: '10m' }
    );
    return rememberAdmin2faPending(req, admin._id)
      .catch(function (err) {
        console.error('rememberAdmin2faPending:', err && err.message ? err.message : err);
      })
      .then(function () {
        if (res.headersSent) return;
        res.json({
          success: true,
          require2FA: true,
          tempToken,
          username: admin.username,
        });
      });
  }

  return getAdminSessionVersion(admin._id).then(function (sessionVersion) {
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
      { expiresIn: ADMIN_JWT_EXPIRES_IN }
    );
    return new Promise(function (resolve) {
      req.session.regenerate(function (regenErr) {
        if (regenErr) {
          res.status(500).json({ success: false, message: 'Could not create session' });
          return resolve();
        }
        req.session.adminAuth = true;
        req.session.adminUsername = admin.username;
        req.session.adminId = String(admin._id);
        req.session.adminRole = adminRole;
        req.session.admin2faVerified = true;
        req.session.adminSessionVersion = sessionVersion;
        req.session.save(async function (saveErr) {
          if (saveErr) {
            res.status(500).json({ success: false, message: 'Could not save session' });
            return resolve();
          }
          try {
            await recordAdminLoginActivity(req, admin);
          } catch (logErr) {
            console.error('Admin login activity:', logErr);
          }
          res.json({ success: true, token, username: admin.username, adminRole });
          resolve();
        });
      });
    });
  });
}

module.exports = {
  sendAdminAuthChallenge,
  readAdmin2faPending,
  ADMIN_2FA_PENDING_PURPOSE,
};
