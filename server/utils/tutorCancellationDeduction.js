'use strict';

/**
 * Tutor cancellation penalty vs 25-minute class rate (same as Total Hourly ÷ 2).
 * hoursBeforeClass = (classStart - cancellationTime) in hours; must be positive for a pre-class cancel.
 *
 * > 72h: 0%
 * 24h–72h (inclusive): 50%
 * 1h–24h (exclusive of 24h band above): 75%  → implemented as >= 1 and < 24
 * < 1h: 100%
 */
function tutorCancellationDeductionPeso(hoursBeforeClass, ratePer25Min) {
  const r = Number(ratePer25Min);
  const h = Number(hoursBeforeClass);
  if (!isFinite(h) || !isFinite(r) || r <= 0) return 0;
  if (h > 72) return 0;
  if (h >= 24) return r * 0.5;
  if (h >= 1) return r * 0.75;
  return r * 1;
}

module.exports = { tutorCancellationDeductionPeso };
