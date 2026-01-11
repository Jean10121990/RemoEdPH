const nodemailer = require('nodemailer');

// Email service type: 'sendgrid', 'mailgun', or 'smtp'
const EMAIL_SERVICE_TYPE = process.env.EMAIL_SERVICE_TYPE || 'smtp';

// Check which email service is configured
const isSendGridConfigured = !!process.env.SENDGRID_API_KEY;
const isMailgunConfigured = !!(process.env.MAILGUN_API_KEY && process.env.MAILGUN_DOMAIN);
const isSMTPConfigured = process.env.SMTP_USER && process.env.SMTP_PASS && 
                         process.env.SMTP_USER !== 'your-email@gmail.com' && 
                         process.env.SMTP_PASS !== 'your-app-password';

// Determine which service to use (priority: SendGrid > Mailgun > SMTP)
let activeEmailService = 'none';
if (isSendGridConfigured && (EMAIL_SERVICE_TYPE === 'sendgrid' || EMAIL_SERVICE_TYPE === 'smtp')) {
  activeEmailService = 'sendgrid';
} else if (isMailgunConfigured && EMAIL_SERVICE_TYPE === 'mailgun') {
  activeEmailService = 'mailgun';
} else if (isSMTPConfigured) {
  activeEmailService = 'smtp';
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

if (activeEmailService === 'smtp') {
  transporter = nodemailer.createTransport(emailConfig);
  // Verify transporter connection on startup (non-blocking)
  transporter.verify((error, success) => {
    if (error) {
      const safeError = String(error).replace(/(password|pass|pwd)=[^\s&"']*/gi, '$1=***');
      console.error('❌ SMTP connection verification failed:', safeError);
      console.error('⚠️  Email sending may fail. Check SMTP credentials and network connectivity.');
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

// Send email using SendGrid API
async function sendEmailViaSendGrid(to, subject, html, text) {
  const axios = require('axios');
  const sendGridUrl = 'https://api.sendgrid.com/v3/mail/send';
  
  const emailFrom = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_USER || 'noreply@remoedph.com';
  const emailFromName = process.env.SENDGRID_FROM_NAME || 'RemoEdPH';
  
  const payload = {
    personalizations: [{
      to: [{ email: to }],
      subject: subject
    }],
    from: {
      email: emailFrom,
      name: emailFromName
    },
    content: [
      {
        type: 'text/plain',
        value: text
      },
      {
        type: 'text/html',
        value: html
      }
    ]
  };
  
  try {
    const response = await axios.post(sendGridUrl, payload, {
      headers: {
        'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
        'Content-Type': 'application/json'
      }
    });
    return { success: true, messageId: response.headers['x-msg-id'] || 'sent' };
  } catch (error) {
    const errorMessage = error.response?.data?.errors?.[0]?.message || error.message || 'SendGrid API error';
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

// Diagnostic function to check email configuration (without exposing credentials)
function getEmailConfigStatus() {
  const status = {
    configured: isEmailConfigured,
    service: activeEmailService,
    verified: transporterVerified
  };
  
  if (activeEmailService === 'sendgrid') {
    status.sendgridConfigured = isSendGridConfigured;
    status.fromEmail = process.env.SENDGRID_FROM_EMAIL || process.env.SMTP_USER || 'not set';
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

module.exports = {
  sendPasswordResetEmail,
  sendTeacherRegistrationEmail,
  sendEmail,
  getEmailConfigStatus
};
