/**
 * Tracks wall-clock duration of /api/* responses (finish event) for ops dashboards.
 * Ring buffer of the last N samples; average excludes nothing.
 */
const MAX_SAMPLES = 100;
const samples = [];

function recordSample(ms) {
  const n = Number(ms);
  if (!Number.isFinite(n) || n < 0) return;
  samples.push(n);
  while (samples.length > MAX_SAMPLES) samples.shift();
}

function getAverageApiLatencyMs() {
  if (!samples.length) return null;
  const sum = samples.reduce((a, b) => a + b, 0);
  return Math.round((sum / samples.length) * 100) / 100;
}

function getSampleCount() {
  return samples.length;
}

/** Express middleware — mount early so "finish" spans full handler + JSON send. */
function apiLatencyMiddleware(req, res, next) {
  const url = req.originalUrl || req.url || '';
  if (!url.startsWith('/api')) return next();
  const start = process.hrtime.bigint();
  res.on('finish', () => {
    try {
      const ms = Number(process.hrtime.bigint() - start) / 1e6;
      recordSample(ms);
    } catch (_e) {
      /* ignore */
    }
  });
  next();
}

module.exports = {
  apiLatencyMiddleware,
  getAverageApiLatencyMs,
  getSampleCount,
  MAX_SAMPLES,
};
