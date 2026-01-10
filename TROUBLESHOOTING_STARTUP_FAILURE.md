# Troubleshooting: Container Failed to Start on Port 8080

## 🚨 Error Message

```
The user-provided container failed to start and listen on the port defined 
provided by the PORT=8080 environment variable within the allocated timeout.
```

**This means:** Your application didn't start listening on port 8080 fast enough for Cloud Run's health check.

---

## ✅ Step-by-Step Fix

### Step 1: Check Cloud Run Logs

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **Cloud Run** → Your Service → **Logs** tab
3. Look for error messages. Common issues:

#### Issue A: Module Loading Error
```
Error: Cannot find module 'xyz'
```
**Fix:** Missing dependency. Check `package.json` and ensure all dependencies are listed.

#### Issue B: Syntax Error
```
SyntaxError: Unexpected token
```
**Fix:** Check your code for syntax errors. Test locally first.

#### Issue C: MongoDB Connection Blocking
```
MONGODB_URI not set
```
**Fix:** Set `MONGODB_URI` environment variable (see `TROUBLESHOOTING_MONGODB_URI.md`)

#### Issue D: Port Already in Use
```
EADDRINUSE: address already in use
```
**Fix:** This shouldn't happen in Cloud Run, but check if PORT is set correctly.

---

### Step 2: Test Locally First

Before deploying to Cloud Run, test locally:

```bash
# Install dependencies
npm install

# Set environment variables
export PORT=8080
export MONGODB_URI=your-mongodb-uri

# Start server
npm start
```

**Expected output:**
```
🚀 Initializing RemoEdPH server...
🔧 Starting server on port 8080...
🌐 Attempting to listen on 0.0.0.0:8080...
🚀 Server is live on port 8080
```

If it fails locally, fix the issue before deploying.

---

### Step 3: Verify Dockerfile

Ensure your `Dockerfile` is correct:

```dockerfile
FROM node:18-slim
WORKDIR /workspace
COPY package*.json ./
RUN npm ci --only=production || npm install --only=production
COPY . .
EXPOSE 8080
CMD ["npm", "start"]
```

---

### Step 4: Check package.json

Ensure `package.json` has the start script:

```json
{
  "scripts": {
    "start": "node server/index.js"
  }
}
```

---

### Step 5: Verify Environment Variables

**Required:**
- `PORT` - Automatically set by Cloud Run (don't set manually)
- `MONGODB_URI` - Must be set (see setup guide)

**Check in Cloud Run:**
1. Go to Cloud Run → Your Service → **Revisions** → Latest revision
2. Scroll to **"Environment variables"**
3. Verify `MONGODB_URI` is set

---

### Step 6: Increase Startup Timeout (If Needed)

If your app takes longer to start:

1. Go to Cloud Run → Your Service → **EDIT & DEPLOY NEW REVISION**
2. Scroll to **"Container(s), Volumes, Networking, Security"**
3. Expand **"Container"**
4. Set **"Startup timeout"** to `300s` (5 minutes)
5. Click **"DEPLOY"**

---

## 🔍 Debugging Checklist

- [ ] Application starts locally without errors
- [ ] All dependencies are in `package.json`
- [ ] `Dockerfile` is correct
- [ ] `package.json` has `"start": "node server/index.js"`
- [ ] `MONGODB_URI` environment variable is set in Cloud Run
- [ ] No syntax errors in code
- [ ] Server listens on `0.0.0.0:8080` (not `localhost` or `127.0.0.1`)
- [ ] Health check endpoint `/api/health` responds quickly

---

## 🧪 Test Endpoints

After deployment, test these endpoints:

### 1. Root Endpoint
```bash
curl https://your-service.run.app/
```
Should return: `{"status":"OK","message":"RemoEdPH Server is running"}`

### 2. Health Check
```bash
curl https://your-service.run.app/api/health
```
Should return: `{"status":"OK","message":"Server is running","database":"Connected"}`

### 3. Startup Endpoint
```bash
curl https://your-service.run.app/startup
```
Should return: `{"status":"starting","message":"Server is initializing"}`

---

## 🚨 Common Causes & Solutions

### Cause 1: Missing Dependencies
**Symptoms:** `Error: Cannot find module 'xyz'`
**Solution:** 
```bash
# Check package.json includes all dependencies
# Rebuild Docker image
```

### Cause 2: Database Connection Blocking
**Symptoms:** Server waits for MongoDB before starting
**Solution:** Already fixed - DB connects in background. Just ensure `MONGODB_URI` is set.

### Cause 3: Syntax Error
**Symptoms:** `SyntaxError` in logs
**Solution:** Fix syntax error, test locally first

### Cause 4: Wrong Port Binding
**Symptoms:** Server listens on wrong address
**Solution:** Already fixed - server listens on `0.0.0.0:8080`

### Cause 5: Missing Environment Variables
**Symptoms:** App crashes trying to access undefined env vars
**Solution:** Set all required environment variables in Cloud Run

---

## 📝 Quick Fix Commands

### Rebuild and Redeploy
```bash
# If using Cloud Build
gcloud builds submit --tag gcr.io/YOUR_PROJECT_ID/remoedph

# Deploy to Cloud Run
gcloud run deploy remoedph \
  --image gcr.io/YOUR_PROJECT_ID/remoedph \
  --region europe-west1 \
  --platform managed
```

### Check Logs
```bash
gcloud run services logs read remoedph \
  --region europe-west1 \
  --limit 50
```

---

## 🔧 Advanced: Increase Startup Timeout

If your app legitimately needs more time to start:

1. **Via Console:**
   - Cloud Run → Service → Edit → Container tab
   - Set "Startup timeout" to `300s`

2. **Via CLI:**
```bash
gcloud run services update remoedph \
  --region europe-west1 \
  --timeout 300
```

---

## 📚 Related Documentation

- `GOOGLE_CLOUD_RUN_SETUP.md` - Complete setup guide
- `TROUBLESHOOTING_MONGODB_URI.md` - MongoDB connection issues
- `ENV_VARIABLES_QUICK_REFERENCE.md` - Environment variables

---

## ✅ Success Indicators

After fixing, you should see in logs:

```
🚀 Initializing RemoEdPH server...
🔧 Starting server on port 8080...
🌐 Attempting to listen on 0.0.0.0:8080...
🚀 Server is live on port 8080
🌐 Listening on 0.0.0.0:8080
```

And Cloud Run should show: **"Deployment succeeded"** ✅

---

**Last Updated:** 2024
