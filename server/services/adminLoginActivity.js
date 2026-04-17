const LoginLog = require('../models/LoginLog');
const Admin = require('../models/Admin');
const { captureDeviceInfo, getClientIp } = require('../utils/captureDeviceInfo');
const { sendAdminNewLoginSecurityEmail } = require('../emailService');

/**
 * After successful admin authentication: upsert LoginLog by adminId+browser+os;
 * on new fingerprint send security email to admin's email.
 * @param {import('express').Request} req
 * @param {import('mongoose').Document | { _id: import('mongoose').Types.ObjectId; email?: string }} admin
 */
async function recordAdminLoginActivity(req, admin) {
  const adminId = admin._id;
  const device = captureDeviceInfo(req);
  const ip = getClientIp(req);
  const now = new Date();

  const existing = await LoginLog.findOne({
    adminId,
    browser: device.browser,
    os: device.os,
  }).sort({ timestamp: -1 });

  if (existing) {
    await LoginLog.updateOne(
      { _id: existing._id },
      { $set: { timestamp: now, ip, platform: device.platform, isMobile: device.isMobile } }
    );
    return { isNewDevice: false };
  }

  await LoginLog.create({
    adminId,
    ip,
    browser: device.browser,
    os: device.os,
    platform: device.platform,
    isMobile: device.isMobile,
    timestamp: now,
  });

  const to = admin.email && String(admin.email).trim();
  if (to) {
    try {
      await sendAdminNewLoginSecurityEmail(to, {
        deviceName: device.deviceName,
        ip: ip || '(unknown)',
        occurredAt: now,
      });
    } catch (e) {
      console.warn('adminLoginActivity: security email failed:', e.message || e);
    }
  }

  return { isNewDevice: true };
}

/**
 * Load current sessionVersion for JWT/session stamping.
 */
async function getAdminSessionVersion(adminId) {
  if (!adminId) return 0;
  const a = await Admin.findById(String(adminId)).select('sessionVersion').lean();
  return Number(a && a.sessionVersion) || 0;
}

module.exports = { recordAdminLoginActivity, getAdminSessionVersion };
