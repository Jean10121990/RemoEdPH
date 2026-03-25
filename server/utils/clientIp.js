/**
 * Client IP for audit logs. Requires trust proxy when behind a reverse proxy (see TRUST_PROXY).
 */
function getRequestIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) {
    return xf.split(',')[0].trim();
  }
  if (Array.isArray(xf) && xf[0]) {
    return String(xf[0]).trim();
  }
  return req.ip || req.socket?.remoteAddress || '';
}

module.exports = { getRequestIp };
