require('dotenv').config();
const crypto = require('crypto');

async function main() {
  const { connectDB } = require('../db');
  const ok = await connectDB();
  if (!ok) {
    console.error('DB connect failed');
    process.exit(1);
  }

  const Application = require('../models/Application');
  const InvitationToken = require('../models/InvitationToken');
  const { sendTeacherPipelineWelcomeEmail } = require('../emailService');
  const { buildTeacherInvitationSignupUrl } = require('../utils/frontendBaseUrl');

  const emailFilter = process.argv[2] ? String(process.argv[2]).trim().toLowerCase() : '';
  const query = { currentStage: 'passed' };
  if (emailFilter) {
    query.email = new RegExp(emailFilter.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'i');
  }

  const applicants = await Application.find(query).sort({ passedAt: -1 }).lean();
  console.log(`Passed applicants matching filter: ${applicants.length}`);
  for (const a of applicants) {
    console.log('-', a._id.toString(), a.fullName || '(no name)', a.email, a.passedAt);
  }
  if (!applicants.length) {
    process.exit(1);
  }

  const applicant = applicants[0];
  let recipientEmail = String(applicant.email || '').trim().toLowerCase();
  if (!recipientEmail && applicant.applicantEmail) {
    recipientEmail = String(applicant.applicantEmail).trim().toLowerCase();
  }
  if (!recipientEmail) {
    console.error('No recipient email on application');
    process.exit(1);
  }

  const now = new Date();
  let invitation = await InvitationToken.findOne({
    applicationId: applicant._id,
    isUsed: false,
    expiresAt: { $gt: now },
  }).sort({ createdAt: -1 });

  if (!invitation) {
    invitation = await InvitationToken.create({
      applicationId: applicant._id,
      email: recipientEmail,
      token: crypto.randomBytes(24).toString('hex'),
      isUsed: false,
      expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7),
    });
    console.log('Created new invitation token');
  } else {
    console.log('Reusing existing invitation token');
  }

  const signupLink = buildTeacherInvitationSignupUrl(invitation.token, null);

  console.log('Sending to:', recipientEmail);
  console.log('Signup link:', signupLink);

  const emailResult = await sendTeacherPipelineWelcomeEmail(
    recipientEmail,
    applicant.fullName,
    signupLink,
    applicant.firstName
  );
  console.log('Email result:', JSON.stringify(emailResult, null, 2));
  process.exit(emailResult.success ? 0 : 1);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
