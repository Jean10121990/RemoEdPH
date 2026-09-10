/**
 * Sentry must load before other app modules so auto-instrumentation works.
 * Require this file first from server/index.js (or via `node --require ./server/instrument.js`).
 * No-op when SENTRY_DSN is unset (local/CI without a project).
 */
require('dotenv').config();

const Sentry = require('@sentry/node');

const dsn = String(process.env.SENTRY_DSN || '').trim();
const explicitlyDisabled =
  process.env.SENTRY_ENABLED === '0' ||
  String(process.env.SENTRY_ENABLED || '').toLowerCase() === 'false';

let sentryEnabled = false;

if (dsn && !explicitlyDisabled) {
  const envName =
    process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development';
  const defaultSample = envName === 'production' ? 0.1 : 1.0;
  const tracesSampleRate = Number(
    process.env.SENTRY_TRACES_SAMPLE_RATE != null &&
      String(process.env.SENTRY_TRACES_SAMPLE_RATE).trim() !== ''
      ? process.env.SENTRY_TRACES_SAMPLE_RATE
      : defaultSample
  );

  Sentry.init({
    dsn,
    environment: envName,
    release: process.env.SENTRY_RELEASE || process.env.K_REVISION || undefined,
    tracesSampleRate: Number.isFinite(tracesSampleRate) ? tracesSampleRate : defaultSample,
    // Avoid sending noisy localhost noise when DSN is accidentally set in .env
    enabled: true,
  });
  sentryEnabled = true;
  console.log(`📡 Sentry enabled (environment=${envName})`);
} else if (!dsn) {
  console.log('📡 Sentry skipped (SENTRY_DSN not set)');
}

function isSentryEnabled() {
  return sentryEnabled;
}

module.exports = { Sentry, isSentryEnabled };
