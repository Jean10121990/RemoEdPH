const nodemailer = require('nodemailer');

/**
 * Gmail App Passwords are 16 characters; Google displays them as "xxxx xxxx xxxx xxxx".
 * SMTP AUTH fails with 535-5.7.8 if spaces are left in SMTP_PASS.
 */
function normalizeSmtpAuth(host, user, pass) {
  const hostNorm = String(host || 'smtp.gmail.com').trim();
  const hostLower = hostNorm.toLowerCase();
  const userNorm = String(user || '').trim();
  let passNorm = pass == null ? '' : String(pass).trim();
  if (hostLower.includes('gmail.com') || hostLower.includes('googlemail.com')) {
    passNorm = passNorm.replace(/\s+/g, '');
  }
  return { host: hostNorm, user: userNorm, pass: passNorm };
}

const smtpAuth = normalizeSmtpAuth(
  process.env.SMTP_HOST,
  process.env.SMTP_USER,
  process.env.SMTP_PASS
);

// Email service type: 'sendgrid', 'mailgun', or 'smtp' (optional - auto-detects if not set)
const EMAIL_SERVICE_TYPE = process.env.EMAIL_SERVICE_TYPE;

// Check which email service is configured
const isSendGridConfigured = !!process.env.SENDGRID_API_KEY;
const isMailgunConfigured = !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
const isSMTPConfigured = smtpAuth.user && smtpAuth.pass &&
                         smtpAuth.user !== 'your-email@gmail.com' &&
                         smtpAuth.pass !== 'your-app-password';

// Determine which service to use (priority: SendGrid > Mailgun > SMTP)
// IMPORTANT: If SendGrid is available, ALWAYS use it (best for Cloud Run)
let activeEmailService = 'none';

// Priority 1: Always prefer SendGrid if available (regardless of EMAIL_SERVICE_TYPE)
if (isSendGridConfigured) {
  activeEmailService = 'sendgrid';
  if (EMAIL_SERVICE_TYPE && EMAIL_SERVICE_TYPE !== 'sendgrid') {
    console.warn(`⚠️  EMAIL_SERVICE_TYPE is set to '${EMAIL_SERVICE_TYPE}' but SendGrid is available. Using SendGrid instead.`);
  }
} 
// Priority 2: Mailgun if SendGrid not available
else if (isMailgunConfigured) {
  if (EMAIL_SERVICE_TYPE === 'mailgun') {
    activeEmailService = 'mailgun';
  } else if (!EMAIL_SERVICE_TYPE || EMAIL_SERVICE_TYPE === 'mailgun') {
    activeEmailService = 'mailgun';
  } else {
    console.warn(`⚠️  EMAIL_SERVICE_TYPE is set to '${EMAIL_SERVICE_TYPE}' but Mailgun is configured. Using Mailgun.`);
    activeEmailService = 'mailgun';
  }
}
// Priority 3: SMTP only if neither SendGrid nor Mailgun available
else if (isSMTPConfigured) {
  if (EMAIL_SERVICE_TYPE === 'smtp' || !EMAIL_SERVICE_TYPE) {
    activeEmailService = 'smtp';
  } else {
    console.warn(`⚠️  EMAIL_SERVICE_TYPE is set to '${EMAIL_SERVICE_TYPE}' but only SMTP is configured. Using SMTP.`);
    activeEmailService = 'smtp';
  }
}

const isEmailConfigured = activeEmailService !== 'none';

// SonarQube Security Hotspot: allow insecure TLS only when explicitly opted-in
// or when using a known SMTP host that intermittently presents invalid/chain certificates (Hostinger).
// This is intentionally a fallback to avoid delivery failures; keep this scoped.
const allowInsecureSmtpTls =
  String(process.env.SMTP_ALLOW_INSECURE_TLS || '').toLowerCase() === 'true' ||
  /hostinger\.com$/i.test(String(smtpAuth.host || '').trim());

// SMTP configuration (for local development or fallback)
const emailConfig = {
  host: smtpAuth.host || 'smtp.hostinger.com',
  //port: parseInt(process.env.SMTP_PORT || '587', 10),
  port: 465,
  secure: true, // true for 465, false for other ports
  requireTLS: false, // Require TLS for Gmail and most SMTP servers
  tls: {
    // SonarQube Ignore: this is a scoped fallback for Hostinger / explicit opt-in.
    // IMPORTANT: Do not change SMTP behavior unless you fully control the SMTP cert chain.
    rejectUnauthorized: !allowInsecureSmtpTls
  },
  connectionTimeout: 10000, // 10 seconds timeout
  greetingTimeout: 10000,
  auth: {
    user: smtpAuth.user || 'your-email@gmail.com',
    pass: smtpAuth.pass || 'your-app-password'
  }
};

// Create transporter only if using SMTP
let transporter = null;
let transporterVerified = false;

// Log email service detection on startup
console.log('📧 Email Service Detection:');
console.log(`   EMAIL_SERVICE_TYPE: ${EMAIL_SERVICE_TYPE || '(not set, using auto-detect)'}`);
console.log(`   SENDGRID_API_KEY: ${isSendGridConfigured ? '✅ Set' : '❌ Not set'}`);
console.log(`   MAILGUN_API_KEY: ${isMailgunConfigured ? '✅ Set' : '❌ Not set'}`);
console.log(`   SMTP_USER: ${isSMTPConfigured ? '✅ Set' : '❌ Not set'}`);
console.log(`   Active Service: ${activeEmailService.toUpperCase()}`);

if (activeEmailService === 'smtp') {
  // Warn if SendGrid is available but SMTP is being used
  if (isSendGridConfigured) {
    console.warn('⚠️  WARNING: SendGrid API key is configured but SMTP is being used!');
    console.warn('⚠️  Set EMAIL_SERVICE_TYPE=sendgrid or remove SMTP credentials to use SendGrid.');
  }

  const gmailHost = emailConfig.host.toLowerCase().includes('gmail');
  if (gmailHost && smtpAuth.pass && smtpAuth.pass.length !== 16) {
    console.warn(
      '⚠️  Gmail App Passwords are exactly 16 characters (after removing spaces). ' +
        '535-5.7.8 usually means wrong password type: use an App Password from Google Account → Security → 2-Step Verification → App passwords, not your normal Gmail password.'
    );
  }

  transporter = nodemailer.createTransport(emailConfig);
  // Verify transporter connection on startup (non-blocking)
  transporter.verify((error, success) => {
    if (error) {
      const safeError = String(error).replace(/(password|pass|pwd)=[^\s&"']*/gi, '$1=***');
      console.error('❌ SMTP connection verification failed:', safeError);
      console.error('⚠️  Email sending may fail. Check SMTP credentials and network connectivity.');
      if (isSendGridConfigured) {
        console.error('💡 TIP: SendGrid API key is available. Consider using SendGrid instead of SMTP for Cloud Run.');
      }
      transporterVerified = false;
    } else {
      console.log('✅ SMTP connection verified successfully');
      console.log(`📧 Email configured: ${emailConfig.host}:${emailConfig.port}`);
      transporterVerified = true;
    }
  });
} else if (isEmailConfigured) {
  console.log(`✅ Email service configured: ${activeEmailService.toUpperCase()}`);
  if (activeEmailService === 'sendgrid') {
    console.log('📧 Using SendGrid API for email delivery');
    console.log(`   From email: ${process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_USER || 'not set'}`);
  } else if (activeEmailService === 'mailgun') {
    console.log(`📧 Using Mailgun API for email delivery (domain: ${process.env.MAILGUN_DOMAIN})`);
  }
} else {
  console.log('⚠️  Email not configured - No email service credentials found');
  console.log('💡 For Cloud Run, consider using SendGrid or Mailgun instead of SMTP');
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
      plan === '1month' ? 'RemoSpark (1 Month)' :
      plan === '3months' ? 'RemoSteady (3 Months)' :
      plan === '6months' ? 'RemoScholar (6 Months)' :
      plan === '1year' ? 'RemoSummit (12 Months)' :
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
  teacherPipelineWelcome: (fullName, signupLink) => ({
    subject: "Congratulations! You've passed the RemoEd Tutor Screening",
    html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>RemoEd Tutor Screening</title>
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
            <h1>You passed!</h1>
            <p>RemoEd Tutor Screening</p>
          </div>
          <div class="content">
            <p>Hello ${fullName || 'Applicant'},</p>
            <p>Congratulations, you have passed! Please sign up through this link to complete your onboarding:</p>
            <div class="box">
              <p><strong>Sign-up link:</strong></p>
              <p style="word-break: break-all;">${signupLink}</p>
            </div>
            <p style="text-align:center; margin-top: 20px;">
              <a class="btn" href="${signupLink}">Complete onboarding</a>
            </p>
            <p>This link is unique to your account and may expire. If you need help, contact support.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from RemoEdPH. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>
    `,
    text: `
Hello ${fullName || 'Applicant'},

Congratulations, you have passed! Please sign up through this link to complete your onboarding:
${signupLink}

This link is unique to your account and may expire.
    `.trim()
  }),
  teacherPipelineFail: (fullName, reapplyLine) => ({
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
            <p>Hello ${fullName || 'Applicant'},</p>
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
Hello ${fullName || 'Applicant'},

Thank you for your interest. At this time, we won't be moving forward with your application, but you can try to re-apply again after 3 months.
${reapplyLine ? `\n${reapplyLine}\n` : ''}
    `.trim()
  }),
  assessmentResult: (
    childName,
    cefrLevel,
    score,
    registerUrl,
    loginUrl,
    plansUrl
  ) => {
    const base = process.env.FRONTEND_URL || 'http://localhost:5000';
    const reg = registerUrl || `${base}/student-register.html`;
    const login = loginUrl || `${base}/student-login.html`;
    const plans = plansUrl || `${base}/index.html#plans`;
    return {
      subject: 'Your RemoEd Assessment Results are in! 📈',
      html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Assessment results</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1ca7e7, #14b8a6); color: white; padding: 22px; text-align: center; border-radius: 14px 14px 0 0; }
          .content { background: #f8fafc; padding: 28px; border-radius: 0 0 14px 14px; }
          .box { background: #fff; border: 2px solid #1ca7e7; border-radius: 12px; padding: 16px; margin: 16px 0; }
          .btn { display: inline-block; background: #1ca7e7; color: #fff; padding: 14px 24px; text-decoration: none; border-radius: 12px; font-weight: 700; }
          .btn-secondary { background: #6366f1; }
          .remind { background: #ecfdf5; border: 1px solid #34d399; border-radius: 12px; padding: 14px; margin: 18px 0; }
          .footer { text-align: center; margin-top: 22px; color: #666; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">Great work, ${childName}!</h1>
            <p style="margin:8px 0 0; opacity:0.95;">Your results are ready</p>
          </div>
          <div class="content">
            <p>You did a great job on your level assessment! To start learning with our expert tutors, please <strong>complete your registration</strong> and <strong>choose a plan</strong>.</p>
            <div class="box">
              <p><strong>Estimated CEFR level:</strong> ${cefrLevel}</p>
              <p><strong>Score:</strong> ${score}</p>
            </div>
            <p style="text-align:center; margin: 22px 0;">
              <a class="btn btn-secondary" href="${plans}">View subscription plans</a>
            </p>
            <div class="remind">
              <strong>Free trial class</strong><br>
              Create your account with the <strong>same email</strong> you used on the assessment to claim your complimentary trial lesson.
            </div>
            <p style="text-align:center; margin: 18px 0;">
              <a class="btn" href="${reg}">Register &amp; save my results</a>
            </p>
            <p style="text-align:center;">
              <a href="${login}" style="color:#1ca7e7;">Already registered? Student login</a>
            </p>
          </div>
          <div class="footer">
            <p>This is an automated message from RemoEdPH. Please do not reply.</p>
          </div>
        </div>
      </body>
      </html>`,
      text: `
Hi — results for ${childName}

You did a great job on your level assessment! To start learning with our expert tutors, please complete your registration and choose a plan here:
${plans}

CEFR level: ${cefrLevel}
Score: ${score}

Register (same email as assessment): ${reg}
Student login: ${login}
      `.trim(),
    };
  },
  trialConversionInvite: (greetName, plansUrl) => {
    const base = process.env.FRONTEND_URL || 'http://localhost:5000';
    const plans = plansUrl || `${base}/index.html#plans`;
    const name = greetName || 'there';
    return {
      subject: 'How was your RemoEd Trial Class? 🎓',
      html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Continue your RemoEd journey</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: #6366f1; color: white; padding: 20px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 28px; border-radius: 0 0 8px 8px; }
          .btn { display: inline-block; background: #6366f1; color: #fff; padding: 14px 26px; text-decoration: none; border-radius: 8px; font-weight: 700; }
          .hint { background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; padding: 12px 14px; margin: 18px 0; font-size: 14px; }
          .footer { text-align: center; margin-top: 22px; color: #666; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">Thanks for joining a trial class</h1>
          </div>
          <div class="content">
            <p>Hi ${name},</p>
            <p>We hope you enjoyed your free trial class! To continue your learning journey and unlock more sessions with our expert tutors, please subscribe to one of our learning plans.</p>
            <p style="text-align:center; margin: 26px 0;">
              <a class="btn" href="${plans}">View Subscription Plans</a>
            </p>
            <div class="hint">
              <strong>Limited-time offer:</strong> Subscribe within the next <strong>24 hours</strong> to get <strong>10% off your first month</strong> (apply at checkout or mention to support if paying manually).
            </div>
            <p>We’re glad you’re part of RemoEdPH.</p>
          </div>
          <div class="footer">
            <p>This is an automated message from RemoEdPH.</p>
          </div>
        </div>
      </body>
      </html>`,
      text: `
Hi ${name},

We hope you enjoyed your free trial class! To continue your learning journey and unlock more sessions with our expert tutors, please subscribe to one of our learning plans.

View Subscription Plans: ${plans}

Limited-time offer: Subscribe within the next 24 hours to get 10% off your first month (apply at checkout or mention to support if paying manually).

— RemoEdPH
      `.trim(),
    };
  },
  lesson2Invite: (greetName, plansUrl) => {
    const base = process.env.FRONTEND_URL || 'http://localhost:5000';
    const plans = plansUrl || `${base}/index.html#plans`;
    const name = greetName || 'there';
    return {
      subject: 'Ready for Lesson 2? 🎓',
      html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Continue with RemoEd</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #1e293b; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #0d9488, #1d9bf0); color: white; padding: 22px; text-align: center; border-radius: 16px 16px 0 0; }
          .content { background: #f8fafc; padding: 28px; border-radius: 0 0 16px 16px; }
          .btn { display: inline-block; background: linear-gradient(135deg, #1d9bf0, #14b8a6); color: #fff; padding: 14px 28px; text-decoration: none; border-radius: 999px; font-weight: 700; border: 2px solid rgba(250, 214, 72, 0.75); }
          .footer { text-align: center; margin-top: 22px; color: #64748b; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0;">Hi ${name}!</h1>
          </div>
          <div class="content">
            <p>We loved having you in your free trial class! Your journey doesn't have to stop here.</p>
            <p><strong>Enroll in a plan today</strong> to unlock Lesson 2 and keep learning with your favorite RemoEd tutor.</p>
            <p style="text-align:center; margin: 28px 0;">
              <a class="btn" href="${plans}">View learning plans</a>
            </p>
          </div>
          <div class="footer">
            <p>This is an automated message from RemoEdPH.</p>
          </div>
        </div>
      </body>
      </html>`,
      text: `
Hi ${name},

We loved having you in your free trial class! Your journey doesn't have to stop here. Enroll in a plan today to unlock Lesson 2 and keep learning with your favorite RemoEd tutor.

Plans: ${plans}

— RemoEdPH
      `.trim(),
    };
  },
  lesson1FeedbackReady: (greetName, dashboardUrl, plansUrl) => {
    const base = process.env.FRONTEND_URL || 'http://localhost:5000';
    const dash = dashboardUrl || `${base}/student-dashboard.html`;
    const plans = plansUrl || `${base}/index.html#plans`;
    const name = greetName || 'there';
    return {
      subject: 'Your RemoEd Lesson 1 Feedback is ready! 📚',
      html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your feedback is ready</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #292524; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #5c6d5c, #0d9488); color: #fafaf9; padding: 22px; text-align: center; border-radius: 16px 16px 0 0; }
          .content { background: #faf8f5; padding: 28px; border-radius: 0 0 16px 16px; border: 1px solid #e7e5e4; border-top: none; }
          .btn { display: inline-block; background: #115e59; color: #fff; padding: 12px 24px; text-decoration: none; border-radius: 999px; font-weight: 700; margin: 6px 4px; border: 2px solid rgba(250, 214, 72, 0.5); }
          .btn-secondary { background: #44403c; }
          .footer { text-align: center; margin-top: 22px; color: #78716c; font-size: 13px; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1 style="margin:0; font-size: 1.15rem;">Hi ${name}!</h1>
          </div>
          <div class="content">
            <p>Great job in your trial class! Check your feedback on your dashboard.</p>
            <p>To keep the momentum going and book Lesson 2, please choose your learning plan:</p>
            <p style="text-align:center; margin: 24px 0;">
              <a class="btn" href="${dash}">Open my dashboard</a><br>
              <a class="btn btn-secondary" href="${plans}">Choose my learning plan</a>
            </p>
          </div>
          <div class="footer">
            <p>This is an automated message from RemoEdPH.</p>
          </div>
        </div>
      </body>
      </html>`,
      text: `
Hi ${name},

Great job in your trial class! Check your feedback on your dashboard. To keep the momentum going and book Lesson 2, please choose your learning plan here: ${plans}

Dashboard: ${dash}

— RemoEdPH
      `.trim(),
    };
  },
  trialBookingReminder: (greetName, bookUrl) => {
    const base = process.env.FRONTEND_URL || 'http://localhost:5000';
    const book = bookUrl || `${base}/student-book.html`;
    const name = greetName || 'there';
    return {
      subject: 'Your free RemoEd trial class is waiting ✨',
      html: `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
      </head>
      <body style="font-family: Arial, sans-serif; line-height: 1.6; color: #44403c; max-width: 600px; margin: 0 auto; padding: 24px;">
        <p>Hi ${name},</p>
        <p>Don't let your free credit sit unused — book your trial class today and meet your tutor!</p>
        <p style="text-align:center; margin: 28px 0;">
          <a href="${book}" style="display:inline-block; background:#115e59; color:#fff; padding:14px 28px; border-radius:999px; text-decoration:none; font-weight:700;">Book my free class</a>
        </p>
        <p style="color:#78716c; font-size:13px;">— RemoEdPH</p>
      </body>
      </html>`,
      text: `
Hi ${name},

Don't let your free credit sit unused — book your trial class today!

${book}

— RemoEdPH
      `.trim(),
    };
  },
};

// Send email using SendGrid API (using official @sendgrid/mail library)
async function sendEmailViaSendGrid(to, subject, html, text) {
  const sgMail = require('@sendgrid/mail');
  
  // Set SendGrid API key
  sgMail.setApiKey(process.env.SENDGRID_API_KEY);
  
  const emailFrom = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_USER || 'noreply@remoedph.com';
  const emailFromName = process.env.SENDGRID_FROM_NAME || 'RemoEdPH';
  
  const msg = {
    to: to,
    from: {
      email: emailFrom,
      name: emailFromName
    },
    subject: subject,
    text: text,
    html: html
  };
  
  try {
    const response = await sgMail.send(msg);
    // SendGrid returns an array with response object
    const messageId = response[0]?.headers?.['x-message-id'] || 'sent';
    return { success: true, messageId: messageId };
  } catch (error) {
    // Enhanced error logging for SendGrid
    let errorMessage = 'SendGrid API error';
    
    if (error.response) {
      const errorData = error.response.body;
      if (errorData?.errors && Array.isArray(errorData.errors)) {
        errorMessage = errorData.errors.map(e => e.message || e.field || JSON.stringify(e)).join('; ');
      } else if (errorData?.message) {
        errorMessage = errorData.message;
      }
      
      const statusCode = error.response.code || error.response.statusCode;
      console.error(`❌ SendGrid API Error (${statusCode}):`, errorMessage);
      
      if (statusCode === 401) {
        errorMessage = 'Invalid SendGrid API key. Please check your SENDGRID_API_KEY.';
      } else if (statusCode === 403) {
        errorMessage = 'SendGrid API key does not have permission to send emails.';
      } else if (statusCode === 400) {
        errorMessage = `SendGrid validation error: ${errorMessage}`;
      }
    } else if (error.message) {
      errorMessage = error.message;
    }
    
    throw new Error(errorMessage);
  }
}

// Send email using Mailgun API
async function sendEmailViaMailgun(to, subject, html, text) {
  const axios = require('axios');
  const FormData = require('form-data');
  
  const mailgunDomain = process.env.MAILGUN_DOMAIN;
  const mailgunUrl = `https://api.mailgun.net/v3/${mailgunDomain}/messages`;
  const emailFrom = process.env.MAILGUN_FROM_EMAIL || `noreply@${mailgunDomain}`;
  
  const form = new FormData();
  form.append('from', `RemoEdPH <${emailFrom}>`);
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
    
    // Use appropriate email service
    if (activeEmailService === 'sendgrid') {
      result = await sendEmailViaSendGrid(to, emailContent.subject, emailContent.html, emailContent.text);
    } else if (activeEmailService === 'mailgun') {
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
        from: `"RemoEdPH" <${emailConfig.auth.user}>`,
        to: to,
        subject: emailContent.subject,
        html: emailContent.html,
        text: emailContent.text
      };
      
      const info = await transporter.sendMail(mailOptions);
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
    
    // Use appropriate email service
    if (activeEmailService === 'sendgrid') {
      result = await sendEmailViaSendGrid(email, template.subject, template.html, template.text);
    } else if (activeEmailService === 'mailgun') {
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
        from: `"RemoEdPH" <${emailConfig.auth.user}>`,
        to: email,
        subject: template.subject,
        html: template.html,
        text: template.text
      };
      
      result = await transporter.sendMail(mailOptions);
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
    if (activeEmailService === 'sendgrid') {
      result = await sendEmailViaSendGrid(email, template.subject, template.html, template.text);
    } else if (activeEmailService === 'mailgun') {
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

      const info = await transporter.sendMail({
        from: `"RemoEdPH" <${emailConfig.auth.user}>`,
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

/** From-address for security alerts (must be deliverable by your provider). */
const REMOED_SECURITY_ALERT_FROM_EMAIL =
  process.env.REMOED_SECURITY_ALERT_FROM_EMAIL || 'support@remoedph.com';

/**
 * Send transactional mail with an explicit From (SendGrid / Mailgun / SMTP).
 */
async function deliverTransactionalEmailFrom(
  to,
  fromEmail,
  fromName,
  subject,
  html,
  text,
  contextLabel = 'email'
) {
  if (!isEmailConfigured) {
    return { success: false, error: 'Email service not configured', fallback: true };
  }
  const fromAddr = String(fromEmail || REMOED_SECURITY_ALERT_FROM_EMAIL).trim();
  const fromDisp = String(fromName || 'RemoEdPH').trim();
  try {
    if (activeEmailService === 'sendgrid') {
      const sgMail = require('@sendgrid/mail');
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
      const response = await sgMail.send({
        to,
        from: { email: fromAddr, name: fromDisp },
        subject,
        text,
        html,
      });
      const messageId = response[0]?.headers?.['x-message-id'] || 'sent';
      return { success: true, messageId };
    }
    if (activeEmailService === 'mailgun') {
      const axios = require('axios');
      const FormData = require('form-data');
      const mailgunDomain = process.env.MAILGUN_DOMAIN;
      const mailgunUrl = `https://api.mailgun.net/v3/${mailgunDomain}/messages`;
      const form = new FormData();
      form.append('from', `${fromDisp} <${fromAddr}>`);
      form.append('to', to);
      form.append('subject', subject);
      form.append('text', text);
      form.append('html', html);
      const response = await axios.post(mailgunUrl, form, {
        headers: {
          ...form.getHeaders(),
          Authorization: `Basic ${Buffer.from(`api:${process.env.MAILGUN_API_KEY}`).toString('base64')}`,
        },
      });
      return { success: true, messageId: response.data.id || 'sent' };
    }
    if (activeEmailService === 'smtp') {
      if (!transporterVerified) {
        try {
          await transporter.verify();
          transporterVerified = true;
        } catch (verifyError) {
          const safeErr = String(verifyError).replace(/(password|pass|pwd)=[^\s&"']*/gi, '$1=***');
          console.error(`❌ SMTP verification failed (${contextLabel}):`, safeErr);
          return {
            success: false,
            error: `SMTP connection failed: ${verifyError.message || 'Connection verification failed'}`,
          };
        }
      }
      const info = await transporter.sendMail({
        from: `"${fromDisp}" <${fromAddr}>`,
        to,
        subject,
        html,
        text,
      });
      return { success: true, messageId: info.messageId };
    }
    return { success: false, error: 'No email service configured' };
  } catch (error) {
    const msg = error.message || String(error);
    return { success: false, error: msg };
  }
}

async function sendAdminNewLoginSecurityEmail(to, { deviceName, ip, occurredAt }) {
  const toAddr = String(to || '').trim();
  if (!toAddr) {
    return { success: false, error: 'No recipient email' };
  }
  const esc = (s) =>
    String(s == null ? '' : s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  const timeStr = occurredAt.toLocaleString('en-PH', {
    timeZone: process.env.REMOED_TZ || 'Asia/Manila',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
  const subject = '⚠️ Security Alert: New Login for RemoEdPH';
  const html = `
<!DOCTYPE html>
<html><head><meta charset="utf-8"></head>
<body style="font-family:Segoe UI,Roboto,sans-serif;background:#f4f4f5;padding:24px;">
  <div style="max-width:560px;margin:0 auto;background:#fff;border-radius:12px;padding:24px;border:1px solid #e4e4e7;">
    <h1 style="font-size:1.125rem;color:#b45309;margin:0 0 12px;">Security alert</h1>
    <p style="color:#3f3f46;line-height:1.5;margin:0 0 16px;">
      A <strong>new sign-in</strong> was detected on your RemoEdPH admin account from a device or browser we have not recorded before.
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:0.9rem;color:#18181b;">
      <tr><td style="padding:8px 0;color:#71717a;">Device</td><td style="padding:8px 0;font-weight:600;">${esc(
        deviceName || 'Unknown'
      )}</td></tr>
      <tr><td style="padding:8px 0;color:#71717a;">IP address</td><td style="padding:8px 0;font-weight:600;">${esc(
        ip || '(unknown)'
      )}</td></tr>
      <tr><td style="padding:8px 0;color:#71717a;">Time</td><td style="padding:8px 0;font-weight:600;">${esc(timeStr)}</td></tr>
    </table>
    <p style="color:#71717a;font-size:0.8125rem;margin-top:20px;">
      If this was you, you can ignore this message. If not, change your password and contact support immediately.
    </p>
  </div>
</body></html>`.trim();
  const text = [
    'Security Alert: New Login for RemoEdPH',
    '',
    `Device: ${deviceName || 'Unknown'}`,
    `IP: ${ip || '(unknown)'}`,
    `Time: ${timeStr}`,
    '',
    'If this was not you, change your password and contact support.',
  ].join('\n');
  return deliverTransactionalEmailFrom(
    toAddr,
    REMOED_SECURITY_ALERT_FROM_EMAIL,
    'RemoEdPH',
    subject,
    html,
    text,
    'admin new login security'
  );
}

async function deliverTransactionalEmail(to, subject, html, text, contextLabel = 'email') {
  if (!isEmailConfigured) {
    return { success: false, error: 'Email service not configured', fallback: true };
  }
  try {
    if (activeEmailService === 'sendgrid') {
      return await sendEmailViaSendGrid(to, subject, html, text);
    }
    if (activeEmailService === 'mailgun') {
      return await sendEmailViaMailgun(to, subject, html, text);
    }
    if (activeEmailService === 'smtp') {
      if (!transporterVerified) {
        try {
          await transporter.verify();
          transporterVerified = true;
        } catch (verifyError) {
          const safeError = String(verifyError).replace(/(password|pass|pwd)=[^\s&"']*/gi, '$1=***');
          console.error(`❌ SMTP verification failed (${contextLabel}):`, safeError);
          return {
            success: false,
            error: `SMTP connection failed: ${verifyError.message || 'Connection verification failed'}`
          };
        }
      }
      const info = await transporter.sendMail({
        from: `"RemoEdPH" <${emailConfig.auth.user}>`,
        to,
        subject,
        html,
        text
      });
      return { success: true, messageId: info.messageId };
    }
    return { success: false, error: 'No email service configured' };
  } catch (error) {
    const msg = error.message || String(error);
    if (/535|5\.7\.8|Invalid login/i.test(msg)) {
      console.error(
        '❌ Gmail SMTP auth rejected. Use SMTP_USER = full Gmail address and SMTP_PASS = 16-character App Password (no spaces).'
      );
    }
    return { success: false, error: msg };
  }
}

async function sendTeacherPipelineWelcomeEmail(email, fullName, signupLink) {
  const template = emailTemplates.teacherPipelineWelcome(fullName, signupLink);
  return deliverTransactionalEmail(
    email,
    template.subject,
    template.html,
    template.text,
    'teacher pipeline pass'
  );
}

async function sendTeacherPipelineFailEmail(email, fullName, reapplyEligibleAt) {
  const reapplyLine = reapplyEligibleAt
    ? `You may submit a new application on or after ${reapplyEligibleAt.toLocaleDateString('en-US', {
        year: 'numeric',
        month: 'long',
        day: 'numeric'
      })}.`
    : '';
  const template = emailTemplates.teacherPipelineFail(fullName, reapplyLine);
  return deliverTransactionalEmail(
    email,
    template.subject,
    template.html,
    template.text,
    'teacher pipeline fail'
  );
}

async function sendAssessmentEmail(to, childName, cefrLevel, score, registerUrl) {
  const base = (process.env.FRONTEND_URL || 'http://localhost:5000').replace(/\/$/, '');
  const reg = registerUrl || `${base}/student-register.html`;
  const loginUrl = `${base}/student-login.html`;
  const plansUrl = `${base}/index.html#plans`;
  const template = emailTemplates.assessmentResult(
    childName,
    cefrLevel,
    score,
    reg,
    loginUrl,
    plansUrl
  );
  return deliverTransactionalEmail(
    to,
    template.subject,
    template.html,
    template.text,
    'assessment result'
  );
}

async function sendTrialConversionEmail(studentEmail, greetName) {
  const to = String(studentEmail || '').trim();
  if (!to) {
    return { success: false, error: 'No student email' };
  }
  const base = (process.env.FRONTEND_URL || 'http://localhost:5000').replace(/\/$/, '');
  const plansUrl = `${base}/index.html#plans`;
  const template = emailTemplates.trialConversionInvite(greetName, plansUrl);
  return deliverTransactionalEmail(
    to,
    template.subject,
    template.html,
    template.text,
    'trial conversion'
  );
}

async function sendLesson2InvitationEmail(studentEmail, greetName) {
  const to = String(studentEmail || '').trim();
  if (!to) {
    return { success: false, error: 'No student email' };
  }
  const base = (process.env.FRONTEND_URL || 'http://localhost:5000').replace(/\/$/, '');
  const plansUrl = `${base}/index.html#plans`;
  const template = emailTemplates.lesson2Invite(greetName, plansUrl);
  return deliverTransactionalEmail(
    to,
    template.subject,
    template.html,
    template.text,
    'lesson 2 invitation'
  );
}

async function sendLesson1FeedbackReadyEmail(
  studentEmail,
  greetName,
  dashboardUrl,
  plansUrl
) {
  const to = String(studentEmail || '').trim();
  if (!to) {
    return { success: false, error: 'No student email' };
  }
  const template = emailTemplates.lesson1FeedbackReady(greetName, dashboardUrl, plansUrl);
  return deliverTransactionalEmail(
    to,
    template.subject,
    template.html,
    template.text,
    'lesson 1 feedback ready'
  );
}

async function sendTrialBookingReminderEmail(studentEmail, greetName) {
  const to = String(studentEmail || '').trim();
  if (!to) {
    return { success: false, error: 'No student email' };
  }
  const base = (process.env.FRONTEND_URL || 'http://localhost:5000').replace(/\/$/, '');
  const bookUrl = `${base}/student-book.html`;
  const template = emailTemplates.trialBookingReminder(greetName, bookUrl);
  return deliverTransactionalEmail(
    to,
    template.subject,
    template.html,
    template.text,
    'trial booking reminder'
  );
}

// Diagnostic function to check email configuration (without exposing credentials)
function getEmailConfigStatus() {
  const status = {
    configured: isEmailConfigured,
    service: activeEmailService,
    verified: transporterVerified,
    emailServiceType: EMAIL_SERVICE_TYPE || '(not set, using auto-detect)',
    hasSendGridKey: isSendGridConfigured,
    hasMailgunConfig: isMailgunConfigured,
    hasSMTPConfig: isSMTPConfigured
  };
  
  if (activeEmailService === 'sendgrid') {
    status.sendgridConfigured = isSendGridConfigured;
    status.fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_USER || 'not set';
    status.fromName = process.env.SENDGRID_FROM_NAME || 'RemoEdPH';
    status.apiKeyLength = process.env.SENDGRID_API_KEY ? process.env.SENDGRID_API_KEY.length : 0;
  } else if (activeEmailService === 'mailgun') {
    status.mailgunConfigured = isMailgunConfigured;
    status.domain = process.env.MAILGUN_DOMAIN || 'not set';
    status.fromEmail = process.env.MAILGUN_FROM_EMAIL || 'not set';
  } else if (activeEmailService === 'smtp') {
    status.host = emailConfig.host;
    status.port = emailConfig.port;
    status.user = emailConfig.auth.user;
    status.hasPassword = !!emailConfig.auth.pass && emailConfig.auth.pass !== 'your-app-password';
    status.requireTLS = emailConfig.requireTLS;
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
      error:
        process.env.NODE_ENV === 'production'
          ? 'Email test failed'
          : String(error && error.message ? error.message : 'Email test failed'),
      status: getEmailConfigStatus()
    };
  }
}

module.exports = {
  sendAdminNewLoginSecurityEmail,
  sendPasswordResetEmail,
  sendTeacherRegistrationEmail,
  sendSubscriptionEmail,
  sendTeacherPipelineWelcomeEmail,
  sendTeacherPipelineFailEmail,
  sendAssessmentEmail,
  sendTrialConversionEmail,
  sendLesson2InvitationEmail,
  sendLesson1FeedbackReadyEmail,
  sendTrialBookingReminderEmail,
  sendEmail,
  getEmailConfigStatus,
  testEmailSending
};
