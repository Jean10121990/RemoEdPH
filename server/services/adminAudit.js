const AdminAuditLog = require('../models/AdminAuditLog');
const { getRequestIp } = require('../utils/clientIp');

/**
 * Best-effort audit write; never throws to callers (logging only).
 */
async function logAdminAction(req, payload) {
  try {
    const admin = req.admin || req.user || {};
    await AdminAuditLog.create({
      action: payload.action,
      actorUsername: String(admin.username || '').trim(),
      actorAdminId: admin.adminId != null ? String(admin.adminId) : '',
      ip: getRequestIp(req),
      userAgent: String(req.get('user-agent') || '').slice(0, 512),
      subjectType: payload.subjectType || 'student',
      subjectId: payload.subjectId,
      subjectEmail: String(payload.subjectEmail || '').slice(0, 320),
      details: payload.details && typeof payload.details === 'object' ? payload.details : {},
    });
  } catch (e) {
    console.error('[AdminAuditLog]', e.message);
  }
}

module.exports = { logAdminAction };
