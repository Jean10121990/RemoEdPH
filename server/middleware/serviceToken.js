/**
 * Scoped machine-to-machine auth — NOT admin JWT.
 * Set INTEGRATION_SERVICE_TOKEN in .env; send header X-RemoEd-Service-Token: <token>.
 * Mount only on routes that should accept automation (never reuse for human admin UI).
 */
function verifyIntegrationServiceToken(req, res, next) {
  const expected = String(process.env.INTEGRATION_SERVICE_TOKEN || '').trim();
  if (!expected) {
    return res.status(503).json({
      error: 'Service integrations are disabled (INTEGRATION_SERVICE_TOKEN not set).',
    });
  }
  const got = String(
    req.headers['x-remoed-service-token'] ||
      req.headers['x-integration-token'] ||
      ''
  ).trim();
  if (!got || got.length < 16) {
    return res.status(401).json({ error: 'Missing or invalid service token.' });
  }
  const crypto = require('crypto');
  try {
    const a = Buffer.from(got, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return res.status(401).json({ error: 'Invalid service token.' });
    }
  } catch {
    return res.status(401).json({ error: 'Invalid service token.' });
  }
  req.serviceIntegration = true;
  next();
}

module.exports = { verifyIntegrationServiceToken };
