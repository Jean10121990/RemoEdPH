# Email Setup Guide for RemoEdPH

## Production Email Configuration

To enable email functionality for password resets, you need to configure the following environment variables:

### 1. Create a .env file in the root directory:

```env
# Email Configuration
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password

# Frontend URL
FRONTEND_URL=https://your-domain.com

# JWT Secret
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production

# MongoDB Connection
MONGODB_URI=mongodb://localhost:27017/online-distance-learning
```

### 2. Gmail Setup (Recommended for testing):

1. **Enable 2-Factor Authentication** on your Gmail account
2. **Generate an App Password**:
   - Go to Google Account settings
   - Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
   - Use this password as `SMTP_PASS`

### 3. Alternative Email Providers:

#### Outlook/Hotmail:
```env
SMTP_HOST=smtp-mail.outlook.com
SMTP_PORT=587
```

#### Yahoo:
```env
SMTP_HOST=smtp.mail.yahoo.com
SMTP_PORT=587
```

#### Custom SMTP Server:
```env
SMTP_HOST=your-smtp-server.com
SMTP_PORT=587
SMTP_USER=your-username
SMTP_PASS=your-password
```

### 4. Security Considerations:

- ✅ Use environment variables (never hardcode credentials)
- ✅ Use app passwords instead of regular passwords
- ✅ Enable SSL/TLS encryption
- ✅ Regularly rotate email credentials
- ✅ Monitor email sending logs

### 5. Testing Email Configuration:

1. Set up your .env file with valid credentials
2. Restart the server
3. Test the forgot password functionality
4. Check server logs for email sending status

### 6. Production Deployment:

- Use a dedicated email service (SendGrid, Mailgun, etc.)
- Set up proper DNS records (SPF, DKIM, DMARC)
- Monitor email deliverability
- Implement rate limiting for password reset requests

## Email Templates

The system includes professional HTML email templates with:
- RemoEdPH branding
- Clear password display
- Security warnings
- Step-by-step instructions
- Mobile-responsive design

## Troubleshooting

### Common Issues:

1. **Authentication Failed**: Check SMTP credentials
2. **Connection Timeout**: Verify SMTP host and port
3. **Email Not Received**: Check spam folder
4. **SSL/TLS Errors**: Ensure proper encryption settings

### Debug Mode:

Enable debug logging by adding to your .env:
```env
DEBUG_EMAIL=true
```

This will log detailed email sending information to help troubleshoot issues.
