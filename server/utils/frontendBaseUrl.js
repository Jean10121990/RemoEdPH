/**
 * Resolve the public app origin for invitation / email links.
 * Prefers the incoming request (Dev Tunnels, reverse proxy), then FRONTEND_URL, then localhost:PORT.
 */
function resolveFrontendBaseUrl(req) {
  if (req) {
    const forwardedHost = req.headers['x-forwarded-host'];
    if (forwardedHost) {
      const proto = String(req.headers['x-forwarded-proto'] || 'https')
        .split(',')[0]
        .trim();
      const host = String(forwardedHost).split(',')[0].trim();
      if (host) {
        return `${proto}://${host}`.replace(/\/$/, '');
      }
    }
    const host = req.get && req.get('host');
    if (host) {
      const proto = req.protocol || 'http';
      return `${proto}://${host}`.replace(/\/$/, '');
    }
  }

  const envUrl = String(process.env.FRONTEND_URL || '').trim();
  if (envUrl) {
    return envUrl.replace(/\/$/, '');
  }

  const port = process.env.PORT || 8080;
  return `http://localhost:${port}`;
}

module.exports = {
  resolveFrontendBaseUrl,
};
