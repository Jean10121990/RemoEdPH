const Application = require('../models/Application');
const InvitationToken = require('../models/InvitationToken');

function applicantPayload(application, invitation) {
  const email = String(
    (application && application.email) || (invitation && invitation.email) || ''
  )
    .trim()
    .toLowerCase();
  return {
    email,
    fullName: String((application && application.fullName) || '').trim(),
    contactNo: String((application && application.contactNo) || '').trim(),
  };
}

/**
 * Lookup an invitation token. `ok: true` only for unused, unexpired, passed applications.
 * Used-but-passed invites return `{ ok: false, reason: 'used', invitation, application }`.
 */
async function lookupTeacherInvitation(token) {
  const t = String(token || '').trim();
  if (!t) {
    return { ok: false, reason: 'missing' };
  }

  const invitation = await InvitationToken.findOne({ token: t });
  if (!invitation) {
    return { ok: false, reason: 'invalid' };
  }

  const application = await Application.findById(invitation.applicationId);
  if (!application || String(application.currentStage || '').toLowerCase() !== 'passed') {
    return { ok: false, reason: 'not_passed' };
  }

  if (invitation.isUsed) {
    return { ok: false, reason: 'used', invitation, application };
  }

  if (!invitation.expiresAt || new Date(invitation.expiresAt) <= new Date()) {
    return { ok: false, reason: 'expired', invitation, application };
  }

  return { ok: true, invitation, application };
}

async function findActivePassedInvitation(token) {
  const found = await lookupTeacherInvitation(token);
  if (found.ok) return found;
  return {
    ok: false,
    reason: found.reason,
    invitation: found.invitation,
    application: found.application,
  };
}

const INVITE_ERROR_MESSAGES = {
  missing: 'This sign-up link is missing an invitation. Please use the link from your email.',
  invalid: 'This invitation is invalid or has already been used.',
  used: 'This invitation was already used. Please log in with your teacher account.',
  expired: 'This invitation has expired. Ask admin to resend your sign-up email.',
  not_passed: 'This invitation is not valid for teacher sign-up.',
};

function inviteErrorMessage(reason) {
  return INVITE_ERROR_MESSAGES[reason] || INVITE_ERROR_MESSAGES.invalid;
}

function canShowSignupPage(found) {
  return !!(found && (found.ok || found.reason === 'used' || found.reason === 'expired'));
}

module.exports = {
  lookupTeacherInvitation,
  findActivePassedInvitation,
  applicantPayload,
  inviteErrorMessage,
  canShowSignupPage,
};
