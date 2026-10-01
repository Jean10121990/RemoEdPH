# Environment Variables Quick Reference

## 🔴 REQUIRED Variables/Secrets

```bash
# MongoDB Connection (REQUIRED - Store as SECRET)
MONGODB_URI=mongodb+srv://username:password@cluster.mongodb.net/online-distance-learning?retryWrites=true&w=majority

# JWT Secret (REQUIRED - Store as SECRET, minimum 32 characters)
JWT_SECRET=a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6

# Frontend URL (REQUIRED - Regular Variable)
# Production must be the public https site: Microsoft PowerPoint fetches lesson decks from it.
FRONTEND_URL=https://remoedph.com
```

## 🟡 OPTIONAL Variables/Secrets

```bash
# Lessons open in Microsoft PowerPoint; FRONTEND_URL must be the public https site
# so Microsoft can fetch the signed lesson file link.

# Email Configuration (OPTIONAL - for password reset emails)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password-here  # Store as SECRET
```

## 📋 Summary Table

| Variable Name | Type | Required | Example |
|--------------|------|----------|---------|
| `MONGODB_URI` | **Secret** | ✅ Yes | `mongodb+srv://user:pass@cluster.mongodb.net/db` |
| `JWT_SECRET` | **Secret** | ✅ Yes | `abc123...xyz789` (32+ chars) |
| `FRONTEND_URL` | Variable | ✅ Yes | `https://remoedph.com` |
| `SMTP_HOST` | Variable | ❌ No | `smtp.gmail.com` |
| `SMTP_PORT` | Variable | ❌ No | `587` |
| `SMTP_USER` | Variable | ❌ No | `email@gmail.com` |
| `SMTP_PASS` | **Secret** | ❌ No | `app-password` |
| `PORT` | Auto-set | ✅ Auto | `8080` (Cloud Run sets this) |

## 🔐 Secrets to Create in Secret Manager

1. **jwt-secret** → Maps to `JWT_SECRET`
2. **mongodb-uri** → Maps to `MONGODB_URI`
3. **smtp-password** → Maps to `SMTP_PASS` (optional)

## 📝 Quick Setup Commands

### Create Secrets (using gcloud CLI)
```bash
# JWT Secret
echo -n "your-jwt-secret-here" | gcloud secrets create jwt-secret --data-file=-

# MongoDB URI
echo -n "mongodb+srv://..." | gcloud secrets create mongodb-uri --data-file=-

# SMTP Password (if using email)
echo -n "your-smtp-password" | gcloud secrets create smtp-password --data-file=-
```

### Grant Permissions
```bash
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding jwt-secret \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding mongodb-uri \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"
```

## 🎯 Minimum Required Configuration

For basic functionality, you **MUST** configure these 3:

1. ✅ `MONGODB_URI` (Secret)
2. ✅ `JWT_SECRET` (Secret)
3. ✅ `FRONTEND_URL` (Variable)

All others are optional but enable additional features.
