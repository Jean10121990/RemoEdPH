const nodemailer = require('nodemailer');

// Email service type: 'sendgrid', 'mailgun', or 'smtp' (optional - auto-detects if not set)
const EMAIL_SERVICE_TYPE = process.env.EMAIL_SERVICE_TYPE;

// Check which email service is configured
const isSendGridConfigured = !!process.env.SENDGRID_API_KEY;
const isMailgunConfigured = !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
const isSMTPConfigured = process.env.SMTP_USER && process.env.SMTP_PASS && 
                         process.env.SMTP_USER !== 'your-email@gmail.com' && 
                         process.env.SMTP_PASS !== 'your-app-password';

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

// SMTP configuration (for local development or fallback)
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT || '587', 10),
  secure: false, // true for 465, false for other ports
  requireTLS: true, // Require TLS for Gmail and most SMTP servers
  tls: {
    // Do not fail on invalid certificates (useful for some SMTP servers)
    rejectUnauthorized: false
  },
  connectionTimeout: 10000, // 10 seconds timeout
  greetingTimeout: 10000,
  auth: {
    user: process.env.SMTP_USER || 'your-email@gmail.com',
    pass: process.env.SMTP_PASS || 'your-app-password'
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
  })
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

// Send password reset email
async function sendPasswordResetEmail(email, username, newPassword, userType) {
  return await sendEmail(email, 'passwordReset', {
    username,
    newPassword,
    userType
  });
}

// Send assessment result email
async function sendAssessmentEmail(parentEmail, childName, cefrLevel, score) {
  try {
    if (!isEmailConfigured) {
      console.log('Email not configured - returning assessment data for testing');
      return {
        success: false,
        fallback: true,
        error: 'Email service not configured',
        assessment: { childName, cefrLevel, score }
      };
    }

    const levelLabels = {
      'A1': 'A1 - Beginner Level',
      'A2': 'A2 - Elementary Level',
      'A3': 'A3 - Upper Elementary Level',
      'B1': 'B1 - Intermediate Level',
      'B2': 'B2 - Upper Intermediate Level',
      'C1': 'C1 - Advanced Level',
      'C2': 'C2 - Proficient Level'
    };
    
    const levelLabel = levelLabels[cefrLevel] || cefrLevel;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Your Child's English Level Assessment Results</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1CA7E7, #5CB3FF); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .result-box { background: white; border: 3px solid #1CA7E7; border-radius: 12px; padding: 25px; margin: 20px 0; text-align: center; }
          .level { font-size: 2.5rem; font-weight: 800; color: #1CA7E7; margin: 15px 0; }
          .score { font-size: 1.5rem; color: #4CAF50; font-weight: 700; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .btn { display: inline-block; background: linear-gradient(135deg, #1CA7E7, #5CB3FF); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 700; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎯 Assessment Results! 🎉</h1>
            <p>Your Child's English Level Assessment</p>
          </div>
          
          <div class="content">
            <h2>Hello! 👋</h2>
            <p>Great news! <strong>${childName}</strong> has completed the English level assessment!</p>
            
            <div class="result-box">
              <h3 style="color: #1CA7E7; margin-bottom: 15px;">English Level</h3>
              <div class="level">${levelLabel}</div>
              <div class="score">Score: ${score}%</div>
            </div>
            
            <p style="margin-top: 25px;"><strong>What's Next?</strong></p>
            <p>Based on this assessment, we recommend classes at the <strong>${levelLabel}</strong> level. Our expert teachers will help ${childName} continue learning and improving!</p>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5000'}/student-login.html" class="btn">Start Learning Now! 🚀</a>
            </div>
            
            <p style="margin-top: 25px;"><strong>Questions?</strong></p>
            <p>If you have any questions about the assessment results or our learning programs, please don't hesitate to contact us!</p>
          </div>
          
          <div class="footer">
            <p>© 2024 RemoEdPH. All rights reserved.</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const text = `
RemoEdPH - Assessment Results

Hello!

Great news! ${childName} has completed the English level assessment!

English Level: ${levelLabel}
Score: ${score}%

What's Next?
Based on this assessment, we recommend classes at the ${levelLabel} level. Our expert teachers will help ${childName} continue learning and improving!

Start Learning Now!
Visit: ${process.env.FRONTEND_URL || 'http://localhost:5000'}/student-login.html

Questions?
If you have any questions about the assessment results or our learning programs, please don't hesitate to contact us!

© 2024 RemoEdPH. All rights reserved.
This is an automated message. Please do not reply to this email.
    `;
    
    const mailOptions = {
      from: `"RemoEdPH" <${emailConfig.auth.user}>`,
      to: parentEmail,
      subject: `🎯 ${childName}'s English Level Assessment Results - RemoEdPH`,
      html: html,
      text: text
    };
    
    const result = await transporter.sendMail(mailOptions);
    console.log('Assessment email sent successfully:', result.messageId);
    
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Error sending assessment email:', error);
    return {
      success: false,
      error: error.message,
      assessment: { childName, cefrLevel, score }
    };
  }
}

// Send subscription confirmation email
async function sendSubscriptionEmail(email, username, plan, planPrice) {
  try {
    if (!isEmailConfigured) {
      console.log('Email not configured - returning subscription data for testing');
      return {
        success: false,
        fallback: true,
        error: 'Email service not configured',
        subscription: { email, username, plan, planPrice }
      };
    }

    const planLabels = {
      '1month': '1 Month',
      '3months': '3 Months',
      '6months': '6 Months',
      '1year': '1 Year'
    };
    
    const planLabel = planLabels[plan] || plan;
    
    const html = `
      <!DOCTYPE html>
      <html>
      <head>
        <meta charset="utf-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Subscription Confirmation - RemoEdPH</title>
        <style>
          body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
          .container { max-width: 600px; margin: 0 auto; padding: 20px; }
          .header { background: linear-gradient(135deg, #1CA7E7, #5CB3FF); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
          .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 8px 8px; }
          .subscription-box { background: white; border: 3px solid #1CA7E7; border-radius: 12px; padding: 25px; margin: 20px 0; text-align: center; }
          .plan-name { font-size: 2rem; font-weight: 800; color: #1CA7E7; margin: 15px 0; }
          .price { font-size: 1.5rem; color: #4CAF50; font-weight: 700; }
          .footer { text-align: center; margin-top: 30px; color: #666; font-size: 14px; }
          .btn { display: inline-block; background: linear-gradient(135deg, #1CA7E7, #5CB3FF); color: white; padding: 15px 30px; text-decoration: none; border-radius: 8px; margin: 20px 0; font-weight: 700; }
        </style>
      </head>
      <body>
        <div class="container">
          <div class="header">
            <h1>🎉 Subscription Confirmed! 🎉</h1>
            <p>Welcome to RemoEdPH!</p>
          </div>
          
          <div class="content">
            <h2>Hello ${username}! 👋</h2>
            <p>Thank you for subscribing to RemoEdPH! Your subscription has been successfully activated.</p>
            
            <div class="subscription-box">
              <h3 style="color: #1CA7E7; margin-bottom: 15px;">Your Subscription Details</h3>
              <div class="plan-name">${planLabel}</div>
              <div class="price">$${planPrice === 0 ? '0 (Testing Mode - FREE!)' : planPrice}</div>
              <p style="margin-top: 15px; color: #666;">Your subscription is now active and you can start learning immediately!</p>
            </div>
            
            <p style="margin-top: 25px;"><strong>What's Next?</strong></p>
            <p>You can now log in to your account and start exploring all the amazing learning features:</p>
            <ul style="text-align: left; margin: 20px 0;">
              <li>📚 Book classes with expert teachers</li>
              <li>🎮 Play interactive learning games</li>
              <li>📊 Track your progress</li>
              <li>🎯 Take assessments to measure your level</li>
            </ul>
            
            <div style="text-align: center; margin: 30px 0;">
              <a href="${process.env.FRONTEND_URL || 'http://localhost:5000'}/student-login.html" class="btn">Start Learning Now! 🚀</a>
            </div>
            
            <p style="margin-top: 25px;"><strong>Questions?</strong></p>
            <p>If you have any questions about your subscription or our learning platform, please don't hesitate to contact us!</p>
          </div>
          
          <div class="footer">
            <p>© 2024 RemoEdPH. All rights reserved.</p>
            <p>This is an automated message. Please do not reply to this email.</p>
          </div>
        </div>
      </body>
      </html>
    `;
    
    const text = `
RemoEdPH - Subscription Confirmation

Hello ${username}!

Thank you for subscribing to RemoEdPH! Your subscription has been successfully activated.

Your Subscription Details:
Plan: ${planLabel}
Price: $${planPrice === 0 ? '0 (Testing Mode - FREE!)' : planPrice}

Your subscription is now active and you can start learning immediately!

What's Next?
You can now log in to your account and start exploring all the amazing learning features:
- Book classes with expert teachers
- Play interactive learning games
- Track your progress
- Take assessments to measure your level

Start Learning Now!
Visit: ${process.env.FRONTEND_URL || 'http://localhost:5000'}/student-login.html

Questions?
If you have any questions about your subscription or our learning platform, please don't hesitate to contact us!

© 2024 RemoEdPH. All rights reserved.
This is an automated message. Please do not reply to this email.
    `;
    
    const mailOptions = {
      from: `"RemoEdPH" <${emailConfig.auth.user}>`,
      to: email,
      subject: `🎉 Subscription Confirmed - Welcome to RemoEdPH!`,
      html: html,
      text: text
    };
    
    const result = await transporter.sendMail(mailOptions);
    console.log('Subscription confirmation email sent successfully:', result.messageId);
    
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Error sending subscription confirmation email:', error);
    return {
      success: false,
      error: error.message,
      subscription: { email, username, plan, planPrice }
    };
  }
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
      error: error.message,
      status: getEmailConfigStatus()
    };
  }
}

module.exports = {
  sendPasswordResetEmail,
  sendTeacherRegistrationEmail,
  sendEmail,
  sendAssessmentEmail,
  sendSubscriptionEmail,
  getEmailConfigStatus,
  testEmailSending
};
