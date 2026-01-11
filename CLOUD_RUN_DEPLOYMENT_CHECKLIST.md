# Cloud Run Deployment Checklist

Since your server **starts locally**, the code is correct. The issue is with Cloud Run deployment.

## ✅ Verify These in Cloud Run

### 1. Environment Variables
Go to **Cloud Run** → Your Service → **EDIT & DEPLOY NEW REVISION** → **Variables & Secrets**

**Required (minimum to start):**
- `MONGODB_URI` - Set to your MongoDB Atlas connection string
- `PORT` - **DO NOT SET** (Cloud Run sets this automatically)

**Also Recommended:**
- `JWT_SECRET` - At least 32 characters
- `FRONTEND_URL` - Your Cloud Run service URL

**Note:** Even if `MONGODB_URI` is wrong, server should still start (DB connects in background).

### 2. Increase Startup Timeout
Sometimes the first deployment takes longer:

1. Cloud Run → Your Service → **EDIT & DEPLOY NEW REVISION**
2. **Container(s), Volumes, Networking, Security** → **Container**
3. Set **Startup timeout** to `300s` (5 minutes)
4. Click **DEPLOY**

### 3. Verify Docker Build
Make sure your Docker image builds correctly:

```bash
# Test Docker build locally
docker build -t test-image .

# Test run the Docker container
docker run -p 8080:8080 \
  -e PORT=8080 \
  -e MONGODB_URI="mongodb://localhost:27017/online-distance-learning" \
  test-image
```

If Docker build fails, fix that first.

### 4. Check Cloud Run Logs
**This is the most important step!**

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. **Cloud Run** → Your Service (`remoedph`)
3. Click **Logs** tab
4. Look for error messages (red icons)
5. **Copy the exact error message**

Common errors you might see:

#### A. "Cannot find module"
- Missing dependency in package.json
- Dependencies not installed in Docker image
- **Fix:** Rebuild Docker image

#### B. "ENOENT: no such file or directory"
- Missing file in Docker image
- Wrong path in code
- **Fix:** Check COPY commands in Dockerfile

#### C. "Connection timeout" or "Connection refused"
- MONGODB_URI not set (but server should still start)
- Network issue (unlikely)

#### D. No errors, just timeout
- Startup taking too long
- **Fix:** Increase startup timeout

### 5. Verify Dockerfile
Your Dockerfile looks correct, but verify:

```dockerfile
FROM node:18-slim
WORKDIR /workspace
COPY package*.json ./
RUN npm ci --only=production || npm install --only=production
COPY . .
EXPOSE 8080
CMD ["npm", "start"]
```

Make sure:
- All files are copied (COPY . .)
- Dependencies are installed
- CMD uses `npm start` (not `node server/index.js` directly)

### 6. Check Build Logs
If using Cloud Build:

1. Go to **Cloud Build** → **History**
2. Check latest build logs
3. Look for errors during build

## 🚀 Quick Fix Steps

### Step 1: Check Logs (Do This First!)
1. Cloud Run → Logs tab
2. Copy the error message
3. Share it to identify the issue

### Step 2: Increase Timeout
1. Edit service → Container tab
2. Startup timeout → `300s`
3. Deploy

### Step 3: Verify Environment Variables
1. Edit service → Variables & Secrets
2. Make sure `MONGODB_URI` is set (even if wrong, server should start)
3. Deploy

### Step 4: Rebuild Docker Image
If logs show "Cannot find module":
```bash
# Rebuild
gcloud builds submit --tag gcr.io/YOUR_PROJECT/remoedph

# Redeploy
gcloud run deploy remoedph \
  --image gcr.io/YOUR_PROJECT/remoedph \
  --region europe-west1
```

## 🔍 What to Check Next

1. **Cloud Run Logs** - Most important! Check what error appears
2. **Docker Build Logs** - If using Cloud Build, check build errors
3. **Environment Variables** - Make sure MONGODB_URI is set
4. **Startup Timeout** - Increase to 300s
5. **Dockerfile** - Verify it's correct

## 💡 Most Likely Issues

Based on "server starts locally but fails in Cloud Run":

1. **Missing MONGODB_URI** - But this shouldn't block startup
2. **Startup timeout too short** - Increase to 300s
3. **Docker build issue** - Dependencies not installed correctly
4. **Missing files in Docker image** - Check COPY . . in Dockerfile

## 📝 Next Steps

**Please share:**
1. The exact error message from Cloud Run logs
2. Whether Docker build succeeds
3. What environment variables you've set in Cloud Run

This will help identify the exact issue!
