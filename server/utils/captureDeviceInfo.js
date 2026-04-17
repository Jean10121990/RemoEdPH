const { useragent } = require('express-useragent');

/**
 * Best-effort client IP (honors X-Forwarded-For when proxy sets it).
 */
function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) {
    return String(xf.split(',')[0])
      .replace(/^::ffff:/i, '')
      .trim();
  }
  if (Array.isArray(xf) && xf[0]) {
    return String(xf[0])
      .split(',')[0]
      .replace(/^::ffff:/i, '')
      .trim();
  }
  const raw = req.ip || req.socket?.remoteAddress || req.connection?.remoteAddress || '';
  return String(raw).replace(/^::ffff:/i, '').trim();
}

/**
 * Parse User-Agent into a small plain object for LoginLog / emails.
 * @param {import('express').Request} req
 */
function captureDeviceInfo(req) {
  const raw = (req.headers && req.headers['user-agent']) || '';
  const ua = useragent.parse(raw);
  const browser = [ua.browser, ua.version].filter(Boolean).join(' ').trim() || 'Unknown';
  const os = (ua.os && String(ua.os).trim()) || 'Unknown';
  const platform = (ua.platform && String(ua.platform).trim()) || '';
  const isMobile = !!(ua.isMobile || ua.isTablet);
  return {
    browser,
    os,
    platform,
    isMobile,
    /** Human-readable one-liner for emails */
    deviceName: [browser, os, platform].filter(Boolean).join(' · ') || 'Unknown device',
  };
}

module.exports = { captureDeviceInfo, getClientIp };
