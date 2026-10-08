'use strict';

/** Reasons that waive a teacher absence or cancellation penalty when proof is on file. */
const EMERGENCY_REASONS = [
  { id: 'natural-disaster', label: 'Natural disaster' },
  { id: 'calamity', label: 'Calamity' },
  { id: 'electricity-maintenance', label: 'Electricity maintenance' },
  { id: 'scheduled-outage', label: 'Scheduled electricity outage' },
  { id: 'accident', label: 'Accident' },
  { id: 'death', label: 'Death' },
  { id: 'emergency', label: 'Emergency' },
];

const EMERGENCY_REASON_IDS = new Set(EMERGENCY_REASONS.map((r) => r.id));

const EMERGENCY_ISSUE_TYPE =
  'Emergency (disaster, calamity, power outage, accident, death)';

function isEmergencyReason(id) {
  return EMERGENCY_REASON_IDS.has(String(id || '').trim());
}

function emergencyReasonLabel(id) {
  const row = EMERGENCY_REASONS.find((r) => r.id === String(id || '').trim());
  return row ? row.label : '';
}

function rescheduleDeadlineOneMonth(from) {
  const d = new Date(from || Date.now());
  d.setMonth(d.getMonth() + 1);
  return d;
}

module.exports = {
  EMERGENCY_REASONS,
  EMERGENCY_ISSUE_TYPE,
  isEmergencyReason,
  emergencyReasonLabel,
  rescheduleDeadlineOneMonth,
};
