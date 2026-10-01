/** Current parent privacy and recording policy. A new string forces the checkbox again. */
const PRIVACY_CONSENT_VERSION = '2026-10-01';
const CONSENT_SOURCES = ['register', 'booking', 'checkout'];

function clientIp(req) {
  const forwarded = req && req.headers && req.headers['x-forwarded-for'];
  if (forwarded) {
    const first = String(forwarded).split(',')[0].trim();
    if (first) return first.slice(0, 64);
  }
  const ip = req && (req.ip || (req.socket && req.socket.remoteAddress));
  return String(ip || '').slice(0, 64);
}

function hasCurrentConsent(student) {
  return !!(student && String(student.privacyConsentVersion || '') === PRIVACY_CONSENT_VERSION);
}

function consentRecord(req, source) {
  const src = CONSENT_SOURCES.indexOf(source) !== -1 ? source : 'booking';
  return {
    version: PRIVACY_CONSENT_VERSION,
    acceptedAt: new Date(),
    ip: clientIp(req),
    userAgent: String((req && req.headers && req.headers['user-agent']) || '').slice(0, 300),
    source: src,
  };
}

function privacyConsentPayload(student) {
  return {
    required: true,
    accepted: hasCurrentConsent(student),
    version: PRIVACY_CONSENT_VERSION,
    marketingConsent: !!(student && student.marketingConsent),
  };
}

function consentRequiredBody() {
  return {
    success: false,
    error: 'A parent or guardian must accept the Student Privacy and Recording Policy before continuing.',
    message: 'A parent or guardian must accept the Student Privacy and Recording Policy before continuing.',
    code: 'CONSENT_REQUIRED',
    version: PRIVACY_CONSENT_VERSION,
  };
}

module.exports = {
  PRIVACY_CONSENT_VERSION,
  clientIp,
  hasCurrentConsent,
  consentRecord,
  privacyConsentPayload,
  consentRequiredBody,
};
