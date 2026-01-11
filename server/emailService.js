const nodemailer = require('nodemailer');

// Email configuration
const emailConfig = {
  host: process.env.SMTP_HOST || 'smtp.gmail.com',
  port: parseInt(process.env.SMTP_PORT) || 587,
  secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
  auth: {
    user: process.env.SMTP_USER || 'your-email@gmail.com',
    pass: process.env.SMTP_PASS || 'your-app-password'
  }
};

// Check if email credentials are properly configured
const isEmailConfigured = process.env.SMTP_USER && process.env.SMTP_PASS && 
                         process.env.SMTP_USER !== 'your-email@gmail.com' && 
                         process.env.SMTP_PASS !== 'your-app-password';

// Create transporter
const transporter = nodemailer.createTransport(emailConfig);

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

// Send email function
async function sendEmail(to, template, data) {
  try {
    // Check if email is properly configured
    if (!isEmailConfigured) {
      console.log('Email not configured - using fallback mode');
      return { 
        success: false, 
        error: 'Email service not configured. Please set up SMTP credentials in .env file.',
        fallback: true
      };
    }

    const emailContent = emailTemplates[template](data.username, data.newPassword, data.userType);
    
    const mailOptions = {
      from: `"RemoEdPH" <${emailConfig.auth.user}>`,
      to: to,
      subject: emailContent.subject,
      html: emailContent.html,
      text: emailContent.text
    };
    
    const info = await transporter.sendMail(mailOptions);
    console.log('Email sent successfully:', info.messageId);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('Error sending email:', error);
    return { success: false, error: error.message };
  }
}

// Send teacher registration email
async function sendTeacherRegistrationEmail(email, username, password, firstName, lastName) {
  try {
    if (!isEmailConfigured) {
      console.log('Email not configured - returning credentials for testing');
      return {
        success: false,
        fallback: true,
        error: 'Email service not configured',
        credentials: { username, password }
      };
    }

    const template = emailTemplates.teacherRegistration(email, username, password, firstName, lastName);
    
    const mailOptions = {
      from: `"RemoEdPH" <${emailConfig.auth.user}>`,
      to: email,
      subject: template.subject,
      html: template.html,
      text: template.text
    };

    const result = await transporter.sendMail(mailOptions);
    console.log('Teacher registration email sent successfully:', result.messageId);
    
    return { success: true, messageId: result.messageId };
  } catch (error) {
    console.error('Error sending teacher registration email:', error);
    return {
      success: false,
      error: error.message,
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

module.exports = {
  sendPasswordResetEmail,
  sendTeacherRegistrationEmail,
  sendEmail,
  sendAssessmentEmail,
  sendSubscriptionEmail
};
