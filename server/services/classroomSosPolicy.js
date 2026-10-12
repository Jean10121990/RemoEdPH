/**
 * Tier rules for Classroom SOS.
 * Tier 1 is technical and must not observe or end the class until it is escalated.
 * Tier 3 is the only urgent safety tier. Escalation only moves upward.
 */
const CATEGORY_TIER = {
  technical_failure: 1,
  unaccompanied_child: 2,
  unauthorized_adult: 3,
  safety_distress: 3,
};

const CATEGORY_LABEL = {
  technical_failure: 'Technical failure (power or internet)',
  unaccompanied_child: 'Unaccompanied child under 6',
  unauthorized_adult: 'Unauthorized adult or behavioral issue',
  safety_distress: 'Safety, distress, or inappropriate content',
};

function tierForCategory(category) {
  return CATEGORY_TIER[category] || 0;
}

function actionAllowed(tier, action) {
  const t = Number(tier) || 0;
  if (action === 'observe' || action === 'pause' || action === 'terminate') {
    if (t < 2) {
      return {
        ok: false,
        code: 'TIER1_NO_INTERVENTION',
        message: 'Tier 1 is a technical issue. Do not observe or end the class unless you escalate it first.',
      };
    }
  }
  if (action === 'parent_contact' && t < 2) {
    return {
      ok: false,
      code: 'PARENT_CONTACT_TIER',
      message: 'Parent contact is for Tier 2 or Tier 3, not a routine technical issue.',
    };
  }
  return { ok: true };
}

function canEscalate(fromTier, toTier) {
  const from = Number(fromTier) || 0;
  const to = Number(toTier) || 0;
  if (to !== 2 && to !== 3) return false;
  return to > from;
}

module.exports = {
  CATEGORY_TIER,
  CATEGORY_LABEL,
  tierForCategory,
  actionAllowed,
  canEscalate,
};
