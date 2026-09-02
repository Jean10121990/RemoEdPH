const Application = require('../models/Application');
const InvitationToken = require('../models/InvitationToken');

/**
 * Unused, unexpired invitation whose application is in `passed` stage.
 * @param {string} token
 * @returns {Promise<{ ok: true, invitation: object, application: object } | { ok: false, reason: string }>}
 */
async function findActivePassedInvitation(token) {
  const t = String(token || '').trim();
  if (!t) {
    return { ok: false, reason: 'missing' };
  }

  const invitation = await InvitationToken.findOne({ token: t, isUsed: false });
  if (!invitation) {
    return { ok: false, reason: 'invalid' };
  }

  if (!invitation.expiresAt || new Date(invitation.expiresAt) <= new Date()) {
    return { ok: false, reason: 'expired' };
  }

  const application = await Application.findById(invitation.applicationId);
  if (!application || String(application.currentStage || '').toLowerCase() !== 'passed') {
    return { ok: false, reason: 'not_passed' };
  }

  return { ok: true, invitation, application };
}

const INVITE_ERROR_MESSAGES = {
  missing: 'This sign-up link is missing an invitation. Please use the link from your email.',
  invalid: 'This invitation is invalid or has already been used.',
  expired: 'This invitation has expired. Ask admin to resend your sign-up email.',
  not_passed: 'This invitation is not valid for teacher sign-up.',
};

function inviteErrorMessage(reason) {
  return INVITE_ERROR_MESSAGES[reason] || INVITE_ERROR_MESSAGES.invalid;
}

module.exports = {
  findActivePassedInvitation,
  inviteErrorMessage,
};
