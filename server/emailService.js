const nodemailer = require('nodemailer');

/** Hostinger: envelope From must match the SMTP login mailbox (support@remoedph.com). */
const SMTP_FROM_LITERAL = 'RemoEd Support <support@remoedph.com>';
const HOSTINGER_MAILBOX = 'support@remoedph.com';

const EMAIL_SERVICE_TYPE = process.env.EMAIL_SERVICE_TYPE;

function trimEnv(value) {
  return String(value == null ? '' : value).trim();
}

function isPlaceholderSecret(value) {
  const v = trimEnv(value).toLowerCase();
  return (
    !v ||
    v === 'your-app-password' ||
    v === 'your-email@gmail.com' ||
    v === 'replace-with-hostinger-mailbox-password'
  );
}

function isGmailLikeAddress(email) {
  const e = trimEnv(email).toLowerCase();
  return /@(gmail|googlemail)\.com$/i.test(e);
}

function resolveSmtpConnectionMode() {
  const raw = trimEnv(process.env.SMTP_CONNECTION_MODE).toLowerCase();
  if (raw === 'auto' || raw === 'hostinger' || raw === 'gmail') return raw;
  return 'auto';
}

function normalizeSmtpPassword(value) {
  return trimEnv(value).replace(/\s+/g, '');
}

function resolveGmailUser() {
  if (trimEnv(process.env.SMTP_GMAIL_USER)) return trimEnv(process.env.SMTP_GMAIL_USER);
  const smtpUser = trimEnv(process.env.SMTP_USER);
  const smtpHost = trimEnv(process.env.SMTP_HOST).toLowerCase();
  if (smtpHost === 'smtp.gmail.com' && isGmailLikeAddress(smtpUser)) return smtpUser;
  if (isGmailLikeAddress(hostingerUser)) return hostingerUser;
  return '';
}

function resolveGmailPass(gmailUserResolved) {
  if (trimEnv(process.env.SMTP_GMAIL_PASS)) {
    return normalizeSmtpPassword(process.env.SMTP_GMAIL_PASS);
  }
  const smtpHost = trimEnv(process.env.SMTP_HOST).toLowerCase();
  const smtpUser = trimEnv(process.env.SMTP_USER);
  if (smtpHost === 'smtp.gmail.com' && gmailUserResolved && smtpUser === gmailUserResolved) {
    return normalizeSmtpPassword(process.env.SMTP_PASS);
  }
  if (gmailUserResolved && gmailUserResolved === hostingerUser) {
    return normalizeSmtpPassword(hostingerPass);
  }
  return '';
}

const hostingerUser = trimEnv(process.env.EMAIL_USER || process.env.SMTP_USER || HOSTINGER_MAILBOX);
const hostingerPass = normalizeSmtpPassword(process.env.EMAIL_PASS || process.env.SMTP_PASS);
const smtpConnectionMode = resolveSmtpConnectionMode();

const gmailUser = resolveGmailUser();
const gmailPass = resolveGmailPass(gmailUser);

function buildHostingerProfile() {
  const smtpHost = trimEnv(process.env.SMTP_HOST).toLowerCase();
  if (smtpHost === 'smtp.gmail.com') return null;
  if (isGmailLikeAddress(hostingerUser) && smtpConnectionMode !== 'hostinger') return null;
  if (!hostingerUser || isPlaceholderSecret(hostingerPass)) return null;
  const port = parseInt(process.env.SMTP_PORT || '465', 10);
  const secure =
    process.env.SMTP_SECURE === 'false' || process.env.SMTP_SECURE === '0' ? false : port === 465;
  return {
    id: 'hostinger',
    host: trimEnv(process.env.SMTP_HOST) || 'smtp.hostinger.com',
    port,
    secure,
    requireTLS: !secure,
    auth: { user: hostingerUser, pass: hostingerPass },
    from: SMTP_FROM_LITERAL,
  };
}

function buildGmailProfile() {
  if (!gmailUser || isPlaceholderSecret(gmailPass)) return null;
  return {
    id: 'gmail',
    host: 'smtp.gmail.com',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: gmailUser, pass: gmailPass },
    from: `RemoEd Support <${gmailUser}>`,
  };
}

const hostingerProfile = buildHostingerProfile();
const gmailProfile = buildGmailProfile();

function selectInitialSmtpProfile() {
  if (smtpConnectionMode === 'hostinger') return hostingerProfile;
  if (smtpConnectionMode === 'gmail') return gmailProfile;
  return gmailProfile || hostingerProfile;
}

function getAlternateSmtpProfile(currentId) {
  if (smtpConnectionMode !== 'auto') return null;
  if (currentId === 'hostinger' && gmailProfile) return gmailProfile;
  if (currentId === 'gmail' && hostingerProfile) return hostingerProfile;
  return null;
}

const isMailgunConfigured = !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);

let isSMTPConfigured = false;
if (smtpConnectionMode === 'hostinger') {
  isSMTPConfigured = !!hostingerProfile;
} else if (smtpConnectionMode === 'gmail') {
  isSMTPConfigured = !!gmailProfile;
} else {
  isSMTPConfigured = !!(hostingerProfile || gmailProfile);
}

let activeEmailService = 'none';
if (isMailgunConfigured && EMAIL_SERVICE_TYPE === 'mailgun') {
  activeEmailService = 'mailgun';
} else if (isSMTPConfigured) {
  activeEmailService = 'smtp';
} else if (isMailgunConfigured) {
  activeEmailService = 'mailgun';
}

const isEmailConfigured = activeEmailService !== 'none';

let activeSmtpProfile = selectInitialSmtpProfile();
let activeSmtpProfileId = activeSmtpProfile ? activeSmtpProfile.id : null;
let transporter = null;
let transporterVerified = false;

function createTransporterForProfile(profile) {
  if (profile.id === 'gmail') {
    return nodemailer.createTransport({
      service: 'gmail',
      auth: profile.auth,
      connectionTimeout: 10000,
      greetingTimeout: 10000,
    });
  }
  return nodemailer.createTransport({
    host: profile.host,
    port: profile.port,
    secure: profile.secure,
    requireTLS: profile.requireTLS,
    tls: {
      rejectUnauthorized: false,
    },
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    auth: profile.auth,
  });
}

function isSmtpAuthError(error) {
  const code = error && error.code;
  const msg = String((error && error.message) || error || '');
  return code === 'EAUTH' || /535|authentication failed/i.test(msg);
}

async function sendViaSmtp(mailOptions) {
  if (!activeSmtpProfile || !transporter) {
    throw new Error('SMTP not configured');
  }

  async function attemptSend() {
    const from = activeSmtpProfile.from;
    console.log('Attempting to send as:', from);
    const info = await transporter.sendMail({
      ...mailOptions,
      from,
    });
    return { success: true, messageId: info.messageId, provider: activeSmtpProfileId };
  }

  try {
    if (!transporterVerified) {
      await transporter.verify();
      transporterVerified = true;
    }
    return await attemptSend();
  } catch (error) {
    const alternate = getAlternateSmtpProfile(activeSmtpProfileId);
    if (!isSmtpAuthError(error) || !alternate) {
      throw error;
    }
    console.warn(
      `⚠️ SMTP auth failed on ${activeSmtpProfileId}; retrying with ${alternate.id}...`
    );
    activeSmtpProfile = alternate;
    activeSmtpProfileId = alternate.id;
    transporter = createTransporterForProfile(alternate);
    transporterVerified = false;
    await transporter.verify();
    transporterVerified = true;
    const result = await attemptSend();
    console.log(`✅ Email sent via fallback SMTP provider: ${alternate.id}`);
    return result;
  }
}

async function smtpSendMail(mailOptions) {
  const result = await sendViaSmtp(mailOptions);
  return { messageId: result.messageId, provider: result.provider };
}

console.log('📧 Email (Gmail SMTP default; optional Hostinger fallback + Mailgun):');
console.log(`   Active: ${activeEmailService.toUpperCase()}`);
console.log(`   SMTP mode: ${smtpConnectionMode}`);
if (activeSmtpProfile) {
  console.log(
    `   SMTP ${activeSmtpProfile.host}:${activeSmtpProfile.port} secure=${activeSmtpProfile.secure} provider=${activeSmtpProfileId}`
  );
  console.log(`   Auth user: ${activeSmtpProfile.auth.user || '(none)'}`);
  console.log(`   Has password: ${!!activeSmtpProfile.auth.pass}`);
  console.log(`   From: ${activeSmtpProfile.from}`);
} else if (activeEmailService === 'smtp') {
  console.log('   SMTP profile missing — check EMAIL_USER/EMAIL_PASS or SMTP_GMAIL_*');
}
if (hostingerProfile && gmailProfile && smtpConnectionMode === 'auto') {
  console.log('   Hostinger fallback available if Gmail auth fails');
}
if (isMailgunConfigured) {
  console.log(`   Mailgun available (${process.env.MAILGUN_DOMAIN}); set EMAIL_SERVICE_TYPE=mailgun to use it`);
}

if (activeEmailService === 'smtp' && activeSmtpProfile) {
  transporter = createTransporterForProfile(activeSmtpProfile);
  transporter.verify((error, _success) => {
    if (error) {
      const safeError = String(error).replace(/(password|pass|pwd)=[^\s&"']*/gi, '$1=***');
      console.error(`❌ SMTP connection verification failed (${activeSmtpProfileId}):`, safeError);
      transporterVerified = false;
      const alternate = getAlternateSmtpProfile(activeSmtpProfileId);
      if (alternate) {
        console.warn(`   Will retry sends via ${alternate.id} if auth fails`);
      }
    } else {
      console.log(`✅ SMTP connection verified successfully (${activeSmtpProfileId})`);
      transporterVerified = true;
    }
  });
} else if (activeEmailService === 'mailgun') {
  console.log(`✅ Mailgun configured (domain: ${process.env.MAILGUN_DOMAIN})`);
} else {
  console.log(
    '⚠️  Email not configured — set SMTP_GMAIL_* or EMAIL_USER/EMAIL_PASS (Gmail), or Hostinger EMAIL_* / Mailgun env vars'
  );
}

// Email templates
const emailTemplates = {
  teacherRegistration: (email, username, password, firstName, lastName) => ({
    subject: `Welcome to RemoEdPH - Your Teacher Account`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to RemoEdPH - Teacher Account</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1ca7e7; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .credentials-box { background: #fff; border: 2px solid #1ca7e7; border-radius: 6px; padding: 15px; margin: 20px 0; }
          .credential { font-family: 'Courier New', monospace; font-size: 16px; font-weight: bold; color: #1ca7e7; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .btn { display: inline-block; background: #1ca7e7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎓 Welcome to RemoEdPH!</h1>
            <p>Your Teacher Account Has Been Created</p>
          </div>
          
          <div class="content">
            <h2>Hello ${firstName} ${lastName}!</h2>
            
            <p>Welcome to RemoEdPH! Your teacher account has been successfully created by the administrator.</p>
            
            <div class="credentials-box">
              <h3>🔑 Your Login Credentials:</h3>
              <p><strong>Username:</strong> <span class="credential">${username}</span></p>
              <p><strong>Password:</strong> <span class="credential">${password}</span></p>
            </div>
            
            <div class="warning">
              <strong>⚠️ Important Security Notice:</strong><br>
              • Please save these credentials immediately<br>
              • Change your password after your first login<br>
              • Do not share these credentials with anyone<br>
              • This is a temporary password for initial access
            </div>
            
            <p><strong>Next Steps:</strong></p>
            <ol>
              <li>Copy your username and password above</li>
              <li>Go to the RemoEdPH teacher login page</li>
              <li>Log in with your credentials</li>
              <li>You will be prompted to change your password</li>
              <li>Complete your profile setup</li>
            </ol>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5000'}/teacher-login.html" class="btn">Go to Teacher Login</a>
            </div>
            
            <p><strong>About RemoEdPH:</strong><br>
            RemoEdPH is an online distance learning platform that connects teachers and students for quality education. As a teacher, you can create your profile, set your availability, and start teaching students.</p>
            
            <p><strong>Need Help?</strong><br>
            If you have any questions or need assistance, please contact our support team.</p>
          </div>
          
          <div class="footer">
            <p>This is an automated message from RemoEdPH.<br>
            Please do not reply to this email.</p>
            <p>&copy; 2025 RemoEdPH. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Welcome to RemoEdPH - Your Teacher Account

Hello ${firstName} ${lastName}!

Welcome to RemoEdPH! Your teacher account has been successfully created by the administrator.

Your Login Credentials:
Username: ${username}
Password: ${password}

Important Security Notice:
- Please save these credentials immediately
- Change your password after your first login
- Do not share these credentials with anyone
- This is a temporary password for initial access

Next Steps:
1. Copy your username and password above
2. Go to the RemoEdPH teacher login page
3. Log in with your credentials
4. You will be prompted to change your password
5. Complete your profile setup

About RemoEdPH:
RemoEdPH is an online distance learning platform that connects teachers and students for quality education. As a teacher, you can create your profile, set your availability, and start teaching students.

Need Help?
If you have any questions or need assistance, please contact our support team.

This is an automated message from RemoEdPH.
Please do not reply to this email.

© 2025 RemoEdPH. All rights reserved.
    `
  }),
  subscriptionConfirmation: (email, username, plan, planPrice) => {
    const planLabel =
      plan === '1month' ? 'RemoSpark — Starter Bundle (3 Months)' :
      plan === '3months' ? 'RemoSteady — Progress Bundle (6 Months)' :
      plan === '6months' ? 'RemoScholar — Mastery Bundle (12 Months)' :
      plan === '1year' ? 'RemoSummit — Ultimate Bundle (24 Months)' :
      String(plan || 'Subscription');

    const amount = Number(planPrice || 0) || 0;
    const amountText = amount ? `₱${amount.toLocaleString()}` : '₱0';
    const loginUrl = `${process.env.FRONTEND_URL || 'http://localhost:5000'}/student-login.html`;

    return {
      subject: `RemoEdPH - Subscription Activated`,
      html: `
        <!DOCTYPE html>
        <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
          <title>Subscription Activated - RemoEdPH</title>
          <style>
            body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
            .container { max-width: 600px; margin: 0 auto; padding: 20px; }
            .header { background: #1ca7e7; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
            .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
            .box { background: #fff; border: 2px solid #1ca7e7; border-radius: 8px; padding: 16px; margin: 18px 0; }
            .label { color: #64748b; font-size: 12px; font-weight: 700; text-transform: uppercase; letter-spacing: .6px; }
            .value { font-weight: 800; font-size: 16px; color: #0f172a; margin-top: 4px; }
            .btn { display: inline-block; background: #1ca7e7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 8px; font-weight: 800; }
            .footer { text-align: center; margin-top: 26px; color: #666; font-size: 14px; }
          </style>
        </head>
        <body>
          <div class="container">
            <div class="header">
              <h1>✅ Subscription Activated</h1>
              <p>Welcome to RemoEdPH</p>
            </div>
            <div class="content">
              <p>Hello ${username || (email ? email.split('@')[0] : 'Student')}!</p>
              <p>Your payment has been confirmed and your subscription is now active.</p>

              <div class="box">
                <div class="label">Plan</div>
                <div class="value">${planLabel}</div>
              </div>
              <div class="box">
                <div class="label">Amount Paid</div>
                <div class="value">${amountText}</div>
              </div>

              <p style="margin-top: 18px;">You can now log in and click <strong>Start Learning</strong>.</p>
              <div style="text-align:center; margin: 22px 0;">
                <a class="btn" href="${loginUrl}">Go to Student Login</a>
              </div>

              <p>If you have questions, please contact support.</p>
            </div>
            <div class="footer">
              <p>This is an automated message from RemoEdPH. Please do not reply.</p>
            </div>
          </div>
        </body>
        </html>
      `,
      text: `
RemoEdPH - Subscription Activated

Hello ${username || (email ? email.split('@')[0] : 'Student')}!

Your payment has been confirmed and your subscription is now active.

Plan: ${planLabel}
Amount Paid: ${amountText}

Login to start learning: ${loginUrl}

This is an automated message from RemoEdPH. Please do not reply.
      `.trim()
    };
  },
  passwordReset: (username, newPassword, userType) => ({
    subject: `RemoEdPH - New Password Generated`,
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>New Password - RemoEdPH</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1ca7e7; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .password-box { background: #fff; border: 2px solid #1ca7e7; border-radius: 6px; padding: 15px; margin: 20px 0; text-align: center; }
          .password { font-family: 'Courier New', monospace; font-size: 18px; font-weight: bold; color: #1ca7e7; }
          .warning { background: #fff3cd; border: 1px solid #ffeaa7; border-radius: 6px; padding: 15px; margin: 20px 0; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .btn { display: inline-block; background: #1ca7e7; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; margin: 10px 0; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🔐 Password Reset</h1>
            <p>RemoEdPH - Online Distance Learning Platform</p>
          </div>
          
          <div class="content">
            <h2>Hello ${username}!</h2>
            
            <p>A new password has been generated for your ${userType} account as requested.</p>
            
            <div class="password-box">
              <strong>Your New Password:</strong><br>
              <span class="password">${newPassword}</span>
            </div>
            
            <div class="warning">
              <strong>⚠️ Important Security Notice:</strong><br>
              • Please save this password immediately<br>
              • Change your password after logging in<br>
              • Do not share this password with anyone<br>
              • This password is valid for immediate use
            </div>
            
            <p><strong>Next Steps:</strong></p>
            <ol>
              <li>Copy the password above</li>
              <li>Go to the RemoEdPH login page</li>
              <li>Log in with your username and the new password</li>
              <li>Change your password in your account settings</li>
            </ol>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5000'}" class="btn">Go to Login Page</a>
            </div>
            
            <p><strong>Need Help?</strong><br>
            If you didn't request this password reset, please contact our support team immediately.</p>
          </div>
          
          <div class="footer">
            <p>This is an automated message from RemoEdPH.<br>
            Please do not reply to this email.</p>
            <p>&copy; 2025 RemoEdPH. All rights reserved.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
RemoEdPH - New Password Generated

Hello ${username}!

A new password has been generated for your ${userType} account as requested.

Your New Password: ${newPassword}

IMPORTANT SECURITY NOTICE:
- Please save this password immediately
- Change your password after logging in
- Do not share this password with anyone
- This password is valid for immediate use

Next Steps:
1. Copy the password above
2. Go to the RemoEdPH login page
3. Log in with your username and the new password
4. Change your password in your account settings

Need Help?
If you didn't request this password reset, please contact our support team immediately.

This is an automated message from RemoEdPH.
Please do not reply to this email.

© 2025 RemoEdPH. All rights reserved.
    `
  }),
  teacherPipelineWelcome: (firstName, fullName, signupLink) => ({
    subject: 'Welcome to the Team - RemoEdPH',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Welcome to the Team - RemoEdPH</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #1ca7e7; color: #fff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px; }
          .box { background: #fff; border: 2px solid #1ca7e7; border-radius: 8px; padding: 16px; margin: 16px 0; }
          .btn { display: inline-block; background: #1ca7e7; color: #fff; padding: 12px 20px; text-decoration: none; border-radius: 8px; font-weight: 700; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Welcome to the Team</h1>
            <p>RemoEdPH Teacher Pipeline</p>
          </div>
          <div class="content">
            <p>Dear ${firstName && String(firstName).trim() ? String(firstName).trim() : 'Teacher'},</p>
            <p>Congratulations! You passed our teacher pipeline${fullName && String(fullName).trim() ? `, <strong>${String(fullName).trim()}</strong>` : ''}. Please complete your official teacher portal sign-up using the secure link below.</p>
            <div class="box">
              <p><strong>Secure sign-up link:</strong></p>
              <p style="word-break: break-all;">${signupLink}</p>
            </div>
            <p style="text-align:center; margin-top: 20px;">
              <a class="btn" href="${signupLink}">Complete Teacher Sign-up</a>
            </p>
            <p>This link is unique to your account and may expire. If you have trouble accessing it, please contact admin support.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from RemoEdPH. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Welcome to the Team - RemoEdPH

Dear ${firstName && String(firstName).trim() ? String(firstName).trim() : 'Teacher'},

Congratulations! You passed our teacher pipeline${fullName && String(fullName).trim() ? `, ${String(fullName).trim()}` : ''}.
Complete your official teacher portal sign-up using this secure link:
${signupLink}

This link is unique to your account and may expire.
If you need help, contact admin support.
    `.trim()
  }),
  teacherPipelineFail: (firstName, reapplyLine) => ({
    subject: 'Update on your RemoEd Tutor Application',
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>RemoEd Tutor Application</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #334155; color: #fff; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 24px; border-radius: 0 0 8px 8px; }
          .footer { text-align: center; margin-top: 20px; color: #666; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>Application update</h1>
            <p>RemoEd Tutor Application</p>
          </div>
          <div class="content">
            <p>Dear ${firstName && String(firstName).trim() ? String(firstName).trim() : 'Teacher'},</p>
            <p>Thank you for your interest. At this time, we won't be moving forward with your application, but you can try to re-apply again after 3 months.</p>
            ${reapplyLine ? `<p><strong>${reapplyLine}</strong></p>` : ''}
          </div>
          <div class="footer">
            <p>This is an automated message from RemoEdPH. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Dear ${firstName && String(firstName).trim() ? String(firstName).trim() : 'Teacher'},

Thank you for your interest. At this time, we won't be moving forward with your application, but you can try to re-apply again after 3 months.
${reapplyLine ? `\n${reapplyLine}\n` : ''}
    `.trim()
  })
};

/** Deep log for Mailgun / SMTP failures — responseCode 550 often means recipient rejected. */
function logOutboundMailError(contextLabel, error) {
  const msg = error && (error.message || String(error));
  console.error(`❌ Email send failed (${contextLabel}):`, msg);
  if (error && error.code) {
    console.error(`   error.code:`, error.code);
  }
  if (error && error.responseCode != null) {
    console.error(`   SMTP responseCode (e.g. 550 = mailbox unavailable / recipient rejected):`, error.responseCode);
  }
  if (error && error.command) {
    console.error(`   SMTP command:`, error.command);
  }
  if (error && error.response) {
    console.error(`   SMTP server response:`, String(error.response).slice(0, 800));
  }
  if (error && error.errno != null) {
    console.error(`   errno:`, error.errno);
  }
  if (error && error.response && typeof error.response === 'object' && !error.responseCode) {
    const sc = error.response.status || error.response.statusCode;
    if (sc) console.error(`   HTTP status (API provider):`, sc);
    const body = error.response.data || error.response.body;
    if (body) {
      try {
        console.error(`   Provider body:`, typeof body === 'string' ? body.slice(0, 600) : JSON.stringify(body).slice(0, 600));
      } catch (_e) {
        console.error(`   Provider body: (unserializable)`);
      }
    }
  }
}

// Send email using Mailgun API
async function sendEmailViaMailgun(to, subject, html, text) {
  const axios = require('axios');
  const FormData = require('form-data');
  
  const mailgunDomain = process.env.MAILGUN_DOMAIN;
  const mailgunUrl = `https://api.mailgun.net/v3/${mailgunDomain}/messages`;
  const form = new FormData();
  form.append('from', SMTP_FROM_LITERAL);
  form.append('to', to);
  form.append('subject', subject);
  form.append('text', text);
  form.append('html', html);
  
  try {
    const response = await axios.post(mailgunUrl, form, {
      headers: {
        ...form.getHeaders(),
        'Authorization': `Basic ${Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64')}`
      }
    });
    return { success: true, messageId: response.data.id || 'sent' };
  } catch (error) {
    const errorMessage = error.response?.data?.message || error.message || 'Mailgun API error';
    throw new Error(errorMessage);
  }
}

// Send email function
async function sendEmail(to, template, data) {
  try {
    // Check if email is properly configured
    if (!isEmailConfigured) {
      console.log('⚠️  Email not configured - using fallback mode');
      return { 
        success: false, 
        error: 'Email service not configured. Please set up email credentials in environment variables.',
        fallback: true
      };
    }

    const emailContent = emailTemplates[template](data.username, data.newPassword, data.userType);
    
    console.log(`📧 Attempting to send email to: ${to} via ${activeEmailService.toUpperCase()}`);
    
    let result;
    
    if (activeEmailService === 'mailgun') {
      result = await sendEmailViaMailgun(to, emailContent.subject, emailContent.html, emailContent.text);
    } else if (activeEmailService === 'smtp') {
      // Verify connection before sending (if not already verified)
      if (!transporterVerified) {
        console.log('🔍 Verifying SMTP connection before sending email...');
        try {
          await transporter.verify();
          transporterVerified = true;
          console.log('✅ SMTP connection verified');
        } catch (verifyError) {
          const safeError = String(verifyError).replace(/(password|pass|pwd)=[^\s&"']*/gi, '$1=***');
          console.error('❌ SMTP verification failed:', safeError);
          return { 
            success: false, 
            error: `SMTP connection failed: ${verifyError.message || 'Connection verification failed'}` 
          };
        }
      }
      
      const mailOptions = {
        to: to,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      };
      
      const info = await smtpSendMail(mailOptions);
      result = { success: true, messageId: info.messageId };
    } else {
      return { 
        success: false, 
        error: 'No email service configured' 
      };
    }
    
    console.log('✅ Email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    // Safely log error without exposing credentials
    const errorMessage = error.message || String(error);
    const safeErrorMessage = errorMessage
      .replace(/(password|pass|pwd|api[_-]?key)=[^\s&"']*/gi, '$1=***')
      .replace(/auth[^}]*pass[^}]*}/gi, 'auth:{...}');
    
    // Enhanced error logging for debugging
    console.error(`❌ Error sending email via ${activeEmailService}:`, safeErrorMessage);
    if (error.response?.status) {
      console.error(`   HTTP status: ${error.response.status}`);
    }
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    
    return { success: false, error: errorMessage };
  }
}

// Send teacher registration email
async function sendTeacherRegistrationEmail(email, username, password, firstName, lastName) {
  try {
    if (!isEmailConfigured) {
      console.log('⚠️  Email not configured - returning credentials for testing');
      return {
        success: false,
        fallback: true,
        error: 'Email service not configured',
        credentials: { username, password }
      };
    }

    const template = emailTemplates.teacherRegistration(email, username, password, firstName, lastName);
    
    console.log(`📧 Attempting to send teacher registration email to: ${email} via ${activeEmailService.toUpperCase()}`);
    
    let result;
    
    if (activeEmailService === 'mailgun') {
      result = await sendEmailViaMailgun(email, template.subject, template.html, template.text);
    } else if (activeEmailService === 'smtp') {
      // Verify connection before sending (if not already verified)
      if (!transporterVerified) {
        console.log('🔍 Verifying SMTP connection before sending teacher registration email...');
        try {
          await transporter.verify();
          transporterVerified = true;
          console.log('✅ SMTP connection verified');
        } catch (verifyError) {
          const safeError = String(verifyError).replace(/(password|pass|pwd)=[^\s&"']*/gi, '$1=***');
          console.error('❌ SMTP verification failed:', safeError);
          return {
            success: false,
            error: `SMTP connection failed: ${verifyError.message || 'Connection verification failed'}`,
            credentials: { username, password }
          };
        }
      }
      
      const mailOptions = {
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text
      };
      
      result = await smtpSendMail(mailOptions);
      result = { success: true, messageId: result.messageId };
    } else {
      return {
        success: false,
        error: 'No email service configured',
        credentials: { username, password }
      };
    }
    
    console.log('✅ Teacher registration email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    // Safely log error without exposing credentials
    const errorMessage = error.message || String(error);
    const safeErrorMessage = errorMessage
      .replace(/(password|pass|pwd|api[_-]?key)=[^\s&"']*/gi, '$1=***')
      .replace(/auth[^}]*pass[^}]*}/gi, 'auth:{...}');
    
    // Enhanced error logging for debugging
    console.error(`❌ Error sending teacher registration email via ${activeEmailService}:`, safeErrorMessage);
    if (error.response?.status) {
      console.error(`   HTTP status: ${error.response.status}`);
    }
    if (error.code) {
      console.error(`   Error code: ${error.code}`);
    }
    
    return {
      success: false,
      error: errorMessage,
      credentials: { username, password }
    };
  }
}

// Send subscription confirmation email
async function sendSubscriptionEmail(email, username, plan, planPrice) {
  try {
    if (!isEmailConfigured) {
      console.log('⚠️  Email not configured - subscription email not sent');
      return {
        success: false,
        fallback: true,
        error: 'Email service not configured'
      };
    }

    const template = emailTemplates.subscriptionConfirmation(email, username, plan, planPrice);
    console.log(`📧 Attempting to send subscription confirmation email to: ${email} via ${activeEmailService.toUpperCase()}`);

    let result;
    if (activeEmailService === 'mailgun') {
      result = await sendEmailViaMailgun(email, template.subject, template.html, template.text);
    } else if (activeEmailService === 'smtp') {
      if (!transporterVerified) {
        console.log('🔍 Verifying SMTP connection before sending subscription email...');
        try {
          await transporter.verify();
          transporterVerified = true;
          console.log('✅ SMTP connection verified');
        } catch (verifyError) {
          const safeError = String(verifyError).replace(/(password|pass|pwd)=[^\s&"']*/gi, '$1=***');
          console.error('❌ SMTP verification failed:', safeError);
          return { success: false, error: `SMTP connection failed: ${verifyError.message || 'Connection verification failed'}` };
        }
      }

      const info = await smtpSendMail({
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text
      });
      result = { success: true, messageId: info.messageId };
    } else {
      return { success: false, error: 'No email service configured' };
    }

    console.log('✅ Subscription email sent successfully:', result.messageId);
    return result;
  } catch (error) {
    const errorMessage = error.message || String(error);
    const safeErrorMessage = errorMessage
      .replace(/(password|pass|pwd|api[_-]?key)=[^\s&"']*/gi, '$1=***')
      .replace(/auth[^}]*pass[^}]*}/gi, 'auth:{...}');
    console.error(`❌ Error sending subscription email via ${activeEmailService}:`, safeErrorMessage);
    return { success: false, error: errorMessage };
  }
}

// Send password reset email
async function sendPasswordResetEmail(email, username, newPassword, userType) {
  return await sendEmail(email, 'passwordReset', {
    username,
    newPassword,
    userType
  });
}

/** Pipeline welcome: stateless send — `email` must be the Application record address, not admin session. */
async function sendTeacherPipelineWelcomeEmail(email, fullName, signupLink, firstName) {
  const targetEmail = String(email || '').trim().toLowerCase();
  if (!targetEmail) {
    console.error('❌ sendTeacherPipelineWelcomeEmail: missing recipient after trim/lowercase');
    return { success: false, error: 'Missing recipient email' };
  }
  try {
    if (!isEmailConfigured) {
      return { success: false, error: 'Email service not configured', fallback: true };
    }

    const template = emailTemplates.teacherPipelineWelcome(firstName, fullName, signupLink);
    let result;

    if (activeEmailService === 'mailgun') {
      result = await sendEmailViaMailgun(targetEmail, template.subject, template.html, template.text);
    } else if (activeEmailService === 'smtp') {
      const info = await smtpSendMail({
        to: targetEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      });
      result = { success: true, messageId: info.messageId, provider: info.provider };
    } else {
      result = { success: false, error: 'No email service configured' };
    }

    return result;
  } catch (error) {
    logOutboundMailError('teacher pipeline pass (welcome)', error);
    return { success: false, error: error.message || 'Failed to send teacher pipeline email' };
  }
}

async function sendTeacherPipelineFailEmail(email, fullName, reapplyEligibleAt, firstName) {
  const targetEmail = String(email || '').trim().toLowerCase();
  if (!targetEmail) {
    console.error('❌ sendTeacherPipelineFailEmail: missing recipient after trim/lowercase');
    return { success: false, error: 'Missing recipient email' };
  }
  const reapplyLine = reapplyEligibleAt
    ? `You may submit a new application on or after ${reapplyEligibleAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}.`
    : '';
  try {
    if (!isEmailConfigured) {
      return { success: false, error: 'Email service not configured', fallback: true };
    }

    const template = emailTemplates.teacherPipelineFail(firstName, reapplyLine);
    let result;

    if (activeEmailService === 'mailgun') {
      result = await sendEmailViaMailgun(targetEmail, template.subject, template.html, template.text);
    } else if (activeEmailService === 'smtp') {
      const info = await smtpSendMail({
        to: targetEmail,
        subject: template.subject,
        html: template.html,
        text: template.text
      });
      result = { success: true, messageId: info.messageId, provider: info.provider };
    } else {
      result = { success: false, error: 'No email service configured' };
    }

    return result;
  } catch (error) {
    logOutboundMailError('teacher pipeline fail', error);
    return { success: false, error: error.message || 'Failed to send teacher pipeline fail email' };
  }
}

// Diagnostic function to check email configuration (without exposing credentials)
function getEmailConfigStatus() {
  const status = {
    configured: isEmailConfigured,
    service: activeEmailService,
    verified: transporterVerified,
    emailServiceType: EMAIL_SERVICE_TYPE || '(not set)',
    hasMailgunConfig: isMailgunConfigured,
    hasSMTPConfig: isSMTPConfigured,
    fromHeader: SMTP_FROM_LITERAL,
  };

  if (activeEmailService === 'mailgun') {
    status.mailgunConfigured = isMailgunConfigured;
    status.domain = process.env.MAILGUN_DOMAIN || 'not set';
  } else if (activeEmailService === 'smtp') {
    status.smtpMode = smtpConnectionMode;
    status.provider = activeSmtpProfileId;
    status.hasHostingerProfile = !!hostingerProfile;
    status.hasGmailProfile = !!gmailProfile;
    if (activeSmtpProfile) {
      status.host = activeSmtpProfile.host;
      status.port = activeSmtpProfile.port;
      status.secure = activeSmtpProfile.secure;
      status.user = activeSmtpProfile.auth.user;
      status.hasPassword = !!activeSmtpProfile.auth.pass;
      status.requireTLS = activeSmtpProfile.requireTLS;
      status.fromHeader = activeSmtpProfile.from;
    }
  }

  return status;
}

// Test email sending function (for diagnostics)
async function testEmailSending(testEmail) {
  if (!isEmailConfigured) {
    return {
      success: false,
      error: 'No email service configured',
      status: getEmailConfigStatus()
    };
  }
  
  try {
    const testResult = await sendEmail(testEmail, 'passwordReset', {
      username: 'test-user',
      newPassword: 'test-password-123',
      userType: 'Test'
    });
    
    return {
      success: testResult.success,
      messageId: testResult.messageId,
      error: testResult.error,
      status: getEmailConfigStatus()
    };
  } catch (error) {
    return {
      success: false,
      error: error.message,
      status: getEmailConfigStatus()
    };
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendTeacherRegistrationEmail,
  sendSubscriptionEmail,
  sendTeacherPipelineWelcomeEmail,
  sendTeacherPipelineFailEmail,
  sendEmail,
  getEmailConfigStatus,
  testEmailSending
};
