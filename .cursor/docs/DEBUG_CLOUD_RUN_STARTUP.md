# Debugging Cloud Run Startup Failure

## Current Error
Container failed to start and listen on port 8080 within allocated timeout.

## Immediate Steps to Diagnose

### Step 1: Check Cloud Run Logs
The logs will show the **exact error**. To check:

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **Cloud Run** → Your Service (`remoedph`)
3. Click on **"Logs"** tab
4. Look for error messages (red icons)
5. **Copy the actual error message** - this will tell us what's wrong

Common errors you might see:

#### A. Module Not Found
```
Error: Cannot find module 'xyz'
```
**Fix:** Missing dependency in package.json

#### B. Syntax Error  
```
SyntaxError: Unexpected token
```
**Fix:** Code has syntax error

#### C. MongoDB Connection Error
```
MongoDB connection error: ...
```
**Fix:** Set MONGODB_URI environment variable (but this shouldn't block startup)

#### D. Missing File/Directory
```
Error: ENOENT: no such file or directory
```
**Fix:** Missing required files in Docker image

### Step 2: Test Locally First
Before deploying, test locally with the same environment:

```powershell
# In PowerShell
$env:PORT = "8080"
$env:MONGODB_URI = "mongodb+srv://user:pass@cluster.mongodb.net/online-distance-learning"
npm start
```

**Expected output:**
```
🔧 Starting server on port 8080...
🌐 Attempting to listen on 0.0.0.0:8080...
🚀 Server is live on port 8080
```

If it fails locally, fix that issue first.

### Step 3: Verify Docker Build
Make sure your Docker image builds correctly:

```bash
docker build -t test-image .
docker run -p 8080:8080 -e MONGODB_URI="mongodb+srv://..." test-image
```

### Step 4: Increase Startup Timeout
If the server takes time to start:

1. Cloud Run → Your Service → **EDIT & DEPLOY NEW REVISION**
2. **Container(s), Volumes, Networking, Security** → **Container**
3. Set **Startup timeout** to `300s` (5 minutes)
4. Click **DEPLOY**

## What We've Already Fixed

✅ Cleanup functions no longer run at startup (they run after DB connection)
✅ Server listens on `0.0.0.0:8080` (not localhost)
✅ Database connection is non-blocking
✅ Code syntax is correct

## Next Steps

1. **Check the actual logs** - this is the most important step
2. **Share the error message** from Cloud Run logs
3. **Test locally** to reproduce the issue
4. **Verify MONGODB_URI** is set in Cloud Run (even if it's wrong, server should still start)

## Quick Checklist

- [ ] Checked Cloud Run logs for actual error
- [ ] Tested server locally (`npm start`)
- [ ] Verified Dockerfile is correct
- [ ] Verified package.json has all dependencies
- [ ] Set MONGODB_URI in Cloud Run
- [ ] Increased startup timeout if needed
- [ ] Rebuilt Docker image

## Common Solutions

### If "Cannot find module" error:
```bash
# Rebuild with all dependencies
npm install
# Rebuild Docker image
```

### If "MONGODB_URI not set" error:
- Set MONGODB_URI in Cloud Run environment variables
- Server should still start (DB connects in background)

### If timeout error:
- Increase startup timeout in Cloud Run settings
- Check if server is actually starting (look for "Server is live" in logs)
