# Email Setup Guide for RemoEdPH

## Email Configuration (local and production)

RemoEdPH defaults to **Gmail SMTP** everywhere. With `SMTP_CONNECTION_MODE=auto` (the default), it tries Gmail first and falls back to **Hostinger** on auth failure if both are configured.

### 1. Create a .env file in the root directory:

**Gmail (default — local and online):**

```env
EMAIL_SERVICE_TYPE=smtp
SMTP_GMAIL_USER=your-workspace-or-gmail@gmail.com
SMTP_GMAIL_PASS=your-16-char-app-password
FRONTEND_URL=https://your-domain.com
```

Or use `EMAIL_USER` / `EMAIL_PASS` when `EMAIL_USER` is a `@gmail.com` address:

```env
EMAIL_USER=your@gmail.com
EMAIL_PASS=your-16-char-app-password
```

**Auto mode (default):** Gmail first; on `535` / `EAUTH`, retries Hostinger if `EMAIL_USER`/`EMAIL_PASS` point at the Hostinger mailbox.

```env
SMTP_CONNECTION_MODE=auto
SMTP_GMAIL_USER=your-gmail@gmail.com
SMTP_GMAIL_PASS=your-16-char-app-password
EMAIL_USER=support@remoedph.com
EMAIL_PASS=your-hostinger-mailbox-password
```

**Hostinger only** (force production mailbox, no Gmail):

```env
SMTP_CONNECTION_MODE=hostinger
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
EMAIL_USER=support@remoedph.com
EMAIL_PASS=your-hostinger-mailbox-password
FRONTEND_URL=https://your-domain.com
```

> **Important:** Never pair a Gmail user/password with `smtp.hostinger.com` (or Hostinger password with `smtp.gmail.com`). Mismatched host + credentials cause `535 5.7.8 authentication failed`.

Applicant invitation links use the **incoming request origin** (Dev Tunnels / reverse proxy) when available, then `FRONTEND_URL`, then `http://localhost:8080`.

### 2. Gmail App Password setup:

1. **Enable 2-Factor Authentication** on your Google account
2. **Generate an App Password**:
   - Google Account → Security → 2-Step Verification → App passwords
   - Generate a new app password for "Mail"
   - Use the 16-character password as `SMTP_GMAIL_PASS` (not `EMAIL_PASS`)

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

- Default mail is **Gmail SMTP** (`SMTP_GMAIL_*` or `EMAIL_USER`/`EMAIL_PASS` with a Gmail address); optional **Hostinger** fallback or `SMTP_CONNECTION_MODE=hostinger`; optional **Mailgun** if `EMAIL_SERVICE_TYPE=mailgun`.
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
