# Google Cloud Run Environment Variables Setup Guide

This guide provides step-by-step instructions for configuring environment variables and secrets in Google Cloud Run for the RemoEdPH application.

## 📋 Prerequisites

- Google Cloud account with Cloud Run API enabled
- Your Cloud Run service already created (or create it after setting these variables)
- MongoDB Atlas account (or your MongoDB connection string)
- Cloudmersive API account (optional, for PPTX conversion)

---

## 🔧 Step-by-Step: Setting Environment Variables in Google Cloud Run

### Method 1: Using Google Cloud Console (Web UI)

#### Step 1: Navigate to Cloud Run
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Select your project (e.g., "RemoEdPH")
3. Navigate to **Cloud Run** from the left sidebar menu
4. Click on your service name (e.g., "remoedph")

#### Step 2: Edit the Service
1. Click the **"EDIT & DEPLOY NEW REVISION"** button at the top
2. Scroll down to the **"Variables & Secrets"** section
3. Expand **"Variables & Secrets"** or **"Environment Variables"**

#### Step 3: Add Regular Environment Variables
Click **"ADD VARIABLE"** for each of the following:

**Required Variables:**

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `MONGODB_URI` | `mongodb+srv://username:password@cluster.mongodb.net/online-distance-learning?retryWrites=true&w=majority` | Your MongoDB Atlas connection string (see below for format) |
| `JWT_SECRET` | `your-super-secret-jwt-key-minimum-32-characters-long` | Strong secret key for JWT token signing (use a secure random string) |
| `FRONTEND_URL` | `https://remoedph-925242915072.europe-west1.run.app` | Your Cloud Run service URL (without trailing slash) |

**Optional Variables:**

| Variable Name | Value | Description |
|--------------|-------|-------------|
| `CLOUDMERSIVE_API_KEY` | `your-cloudmersive-api-key` | API key for PPTX to PNG conversion (get from [Cloudmersive](https://www.cloudmersive.com/)) |
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server hostname for email sending |
| `SMTP_PORT` | `587` | SMTP server port (usually 587 for TLS) |

**Note:** `PORT` is automatically set by Cloud Run - **DO NOT** set it manually.

#### Step 4: Add Secrets (For Sensitive Data)

For sensitive data like passwords and API keys, use **Secrets** instead of regular variables:

1. Click **"ADD SECRET"** or use the **"Secrets"** tab
2. You'll need to create secrets in **Secret Manager** first, then reference them

##### Creating Secrets in Secret Manager:

**For JWT_SECRET:**
1. Go to **Secret Manager** from the left sidebar
2. Click **"CREATE SECRET"**
3. **Secret name:** `jwt-secret`
4. **Secret value:** Your JWT secret (e.g., a long random string)
5. Click **"CREATE SECRET"**

**For SMTP_PASS (Email Password):**
1. Go to **Secret Manager**
2. Click **"CREATE SECRET"**
3. **Secret name:** `smtp-password`
4. **Secret value:** Your email app password or SMTP password
5. Click **"CREATE SECRET"**

**For MONGODB_URI (if contains password):**
1. Go to **Secret Manager**
2. Click **"CREATE SECRET"**
3. **Secret name:** `mongodb-uri`
4. **Secret value:** Your complete MongoDB connection string
5. Click **"CREATE SECRET"**

**For CLOUDMERSIVE_API_KEY:**
1. Go to **Secret Manager**
2. Click **"CREATE SECRET"**
3. **Secret name:** `cloudmersive-api-key`
4. **Secret value:** Your Cloudmersive API key
5. Click **"CREATE SECRET"**

##### Referencing Secrets in Cloud Run:

After creating secrets, go back to Cloud Run service editing:

1. In the **"Variables & Secrets"** section, click **"ADD SECRET"**
2. Select the secret from the dropdown (e.g., `jwt-secret`)
3. Set the **Environment Variable Name** (e.g., `JWT_SECRET`)
4. Repeat for other secrets:
   - `smtp-password` → `SMTP_PASS`
   - `mongodb-uri` → `MONGODB_URI`
   - `cloudmersive-api-key` → `CLOUDMERSIVE_API_KEY`

#### Step 5: Deploy
1. Scroll to the bottom
2. Click **"DEPLOY"** button
3. Wait for deployment to complete (usually 1-3 minutes)

---

### Method 2: Using Google Cloud CLI (gcloud)

#### Step 1: Install Google Cloud SDK
```bash
# Download and install from: https://cloud.google.com/sdk/docs/install
```

#### Step 2: Authenticate
```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
```

#### Step 3: Set Environment Variables

```bash
# Update service with environment variables
gcloud run services update remoedph \
  --region europe-west1 \
  --set-env-vars="FRONTEND_URL=https://remoedph-925242915072.europe-west1.run.app" \
  --set-env-vars="SMTP_HOST=smtp.gmail.com" \
  --set-env-vars="SMTP_PORT=587" \
  --set-env-vars="SMTP_USER=your-email@gmail.com"
```

#### Step 4: Set Secrets (Recommended)

First, create secrets:
```bash
# Create JWT secret
echo -n "your-super-secret-jwt-key-minimum-32-characters-long" | gcloud secrets create jwt-secret --data-file=-

# Create MongoDB URI secret
echo -n "mongodb+srv://username:password@cluster.mongodb.net/database" | gcloud secrets create mongodb-uri --data-file=-

# Create SMTP password secret
echo -n "your-smtp-password" | gcloud secrets create smtp-password --data-file=-

# Create Cloudmersive API key secret
echo -n "your-cloudmersive-api-key" | gcloud secrets create cloudmersive-api-key --data-file=-
```

Then grant Cloud Run access and update service:
```bash
# Grant Cloud Run service account access to secrets
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding jwt-secret \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding mongodb-uri \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding smtp-password \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

gcloud secrets add-iam-policy-binding cloudmersive-api-key \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

# Update service to use secrets
gcloud run services update remoedph \
  --region europe-west1 \
  --update-secrets="JWT_SECRET=jwt-secret:latest,MONGODB_URI=mongodb-uri:latest,SMTP_PASS=smtp-password:latest,CLOUDMERSIVE_API_KEY=cloudmersive-api-key:latest"
```

---

## 📝 Complete Environment Variables List

### 🔴 REQUIRED Variables/Secrets

| Variable Name | Type | Example Value | Notes |
|--------------|------|---------------|-------|
| `MONGODB_URI` | Secret | `mongodb+srv://user:pass@cluster.mongodb.net/dbname?retryWrites=true&w=majority` | MongoDB Atlas connection string |
| `JWT_SECRET` | Secret | `a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6q7r8s9t0u1v2w3x4y5z6` | Must be at least 32 characters long, use random string generator |
| `FRONTEND_URL` | Variable | `https://remoedph-925242915072.europe-west1.run.app` | Your Cloud Run service URL |

### 🟡 OPTIONAL Variables/Secrets

| Variable Name | Type | Example Value | Required For |
|--------------|------|---------------|--------------|
| `CLOUDMERSIVE_API_KEY` | Secret | `abc123def456ghi789` | PPTX to PNG conversion feature |
| `SMTP_HOST` | Variable | `smtp.gmail.com` | Email functionality (password reset) |
| `SMTP_PORT` | Variable | `587` | Email functionality |
| `SMTP_USER` | Variable | `your-email@gmail.com` | Email functionality |
| `SMTP_PASS` | Secret | `abcdefghijklmnop` | Email functionality (app password) |

### 🔵 AUTO-SET (Do NOT configure manually)

| Variable Name | Set By | Value |
|--------------|--------|-------|
| `PORT` | Cloud Run | `8080` (automatically injected) |

---

## 🔐 Generating Secure Values

### JWT_SECRET
Generate a secure JWT secret (minimum 32 characters):

**Using Node.js:**
```bash
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

**Using OpenSSL:**
```bash
openssl rand -hex 32
```

**Using Online Generator:**
- Visit: https://randomkeygen.com/
- Use "CodeIgniter Encryption Keys" - 32 character option

### MongoDB Atlas Connection String

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Click **"Connect"** on your cluster
3. Choose **"Connect your application"**
4. Copy the connection string
5. Replace `<password>` with your database user password
6. Replace `<dbname>` with your database name (e.g., `online-distance-learning`)

**Format:**
```
mongodb+srv://username:password@cluster.mongodb.net/database-name?retryWrites=true&w=majority
```

### Gmail App Password (for SMTP_PASS)

1. Go to [Google Account Settings](https://myaccount.google.com/)
2. Navigate to **Security** → **2-Step Verification**
3. Scroll down to **App passwords**
4. Select **Mail** and **Other (Custom name)**
5. Enter "RemoEdPH" as the name
6. Click **Generate**
7. Copy the 16-character password (use this as `SMTP_PASS`)

---

## ✅ Verification Checklist

After deployment, verify your configuration:

1. **Check Deployment Logs:**
   - Go to Cloud Run → Your Service → **Logs** tab
   - Look for: `✅ Successfully connected to MongoDB`
   - Look for: `🚀 Server is live on port 8080`

2. **Test Health Endpoint:**
   ```bash
   curl https://your-service-url.run.app/api/health
   ```
   Should return:
   ```json
   {
     "status": "OK",
     "message": "Server is running",
     "database": "Connected",
     "timestamp": "2024-..."
   }
   ```

3. **Check Environment Variables:**
   - Go to Cloud Run → Your Service → **Revisions** → Click latest revision
   - Scroll to **"Environment variables"** section
   - Verify all variables are set correctly

---

## 🚨 Common Issues & Solutions

### Issue: "Database not connected"
**Solution:** 
- Verify `MONGODB_URI` is correct
- Ensure MongoDB Atlas IP whitelist includes `0.0.0.0/0` (all IPs)
- Check Secret Manager permissions

### Issue: "JWT_SECRET not found"
**Solution:**
- Verify secret is created in Secret Manager
- Check secret name matches exactly (case-sensitive)
- Ensure Cloud Run service account has `secretAccessor` role

### Issue: "Email not working"
**Solution:**
- Verify `SMTP_USER` and `SMTP_PASS` are set correctly
- For Gmail, ensure you're using an **App Password**, not regular password
- Check if 2FA is enabled on your Gmail account

### Issue: "PPTX conversion failing"
**Solution:**
- Verify `CLOUDMERSIVE_API_KEY` is set correctly
- Check your Cloudmersive account has active credits
- Verify API key hasn't expired

---

## 📚 Additional Resources

- [Google Cloud Run Documentation](https://cloud.google.com/run/docs)
- [Secret Manager Documentation](https://cloud.google.com/secret-manager/docs)
- [MongoDB Atlas Connection Guide](https://www.mongodb.com/docs/atlas/connect-to-cluster/)
- [Gmail App Passwords Guide](https://support.google.com/accounts/answer/185833)

---

## 🔄 Updating Environment Variables

To update environment variables after initial deployment:

1. Go to Cloud Run → Your Service
2. Click **"EDIT & DEPLOY NEW REVISION"**
3. Modify variables in **"Variables & Secrets"** section
4. Click **"DEPLOY"**

**Note:** Changes take effect immediately after deployment (usually 1-3 minutes).

---

## 🛡️ Security Best Practices

1. ✅ **Always use Secrets Manager** for passwords, API keys, and connection strings
2. ✅ **Never commit secrets** to version control
3. ✅ **Rotate secrets regularly** (every 90 days recommended)
4. ✅ **Use strong JWT secrets** (minimum 32 characters, random)
5. ✅ **Limit Secret Manager access** to only necessary service accounts
6. ✅ **Monitor secret access** using Cloud Audit Logs
7. ✅ **Use separate secrets** for development, staging, and production

---

**Last Updated:** 2024
**Application:** RemoEdPH - Online Distance Learning Platform
