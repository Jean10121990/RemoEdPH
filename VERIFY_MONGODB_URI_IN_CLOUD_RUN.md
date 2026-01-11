# Verify MONGODB_URI in Cloud Run

## ❌ Current Error
```
Please ensure MongoDB is running on localhost:27017
```

**This means:** `MONGODB_URI` environment variable is **NOT SET** in Cloud Run.

## ✅ Step-by-Step: Set MONGODB_URI in Cloud Run

### Step 1: Open Cloud Run Service
1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **Cloud Run** (left sidebar)
3. Click on your service: **`remoedph`**

### Step 2: Edit the Service
1. Click **"EDIT & DEPLOY NEW REVISION"** button (top of page)

### Step 3: Find Variables & Secrets Section
1. Scroll down to **"Variables & Secrets"** section
2. Expand it if collapsed

### Step 4: Add MONGODB_URI Environment Variable

#### Option A: Add as Regular Variable (Easier)
1. Click **"ADD VARIABLE"** button
2. Fill in:
   - **Name:** `MONGODB_URI`
   - **Value:** `mongodb+srv://remoedph-admin:21313252@remoedph.ysbbgey.mongodb.net/online-distance-learning?retryWrites=true&w=majority`
3. Click **"DONE"** or **"SAVE"**

#### Option B: Add as Secret (More Secure)
1. First, create secret in Secret Manager:
   - Go to **Secret Manager** (left sidebar)
   - Click **"CREATE SECRET"**
   - **Secret name:** `mongodb-uri`
   - **Secret value:** `mongodb+srv://remoedph-admin:21313252@remoedph.ysbbgey.mongodb.net/online-distance-learning?retryWrites=true&w=majority`
   - Click **"CREATE SECRET"**

2. Then, reference it in Cloud Run:
   - Go back to Cloud Run service editing page
   - **Variables & Secrets** → Click **"ADD SECRET"**
   - Select `mongodb-uri` from dropdown
   - Set **Environment Variable Name** to: `MONGODB_URI`
   - Click **"DONE"**

### Step 5: Verify It's Added
Before deploying, verify in the **Variables & Secrets** section:
- You should see: `MONGODB_URI` in the list
- Make sure the value is correct (should start with `mongodb+srv://`)

### Step 6: Deploy
1. Scroll down and click **"DEPLOY"** button
2. Wait 1-3 minutes for deployment
3. Check logs to verify connection

## ✅ After Deployment - Verify in Logs

After deployment, check Cloud Run logs:

**Good signs (MONGODB_URI is set):**
```
🔗 Connecting to MongoDB: mongodb+srv://remoedph-admin:***@remoedph.ysbbgey.mongodb.net/...
✅ Successfully connected to MongoDB
📊 Database name: online-distance-learning
```

**Bad signs (MONGODB_URI still not set):**
```
❌ MONGODB_URI environment variable is NOT SET!
⚠️  Using default localhost connection (will fail in Cloud Run)
Please ensure MongoDB is running on localhost:27017
```

## 🔍 Troubleshooting

### Issue: MONGODB_URI not showing in logs

**Check:**
1. Did you click **"DEPLOY"** after adding the variable?
2. Is the variable name exactly `MONGODB_URI` (case-sensitive)?
3. Check **Variables & Secrets** section - is `MONGODB_URI` listed?
4. Make sure there are no extra spaces in the name or value

### Issue: Still seeing localhost error

**Solutions:**
1. **Verify variable is set:**
   - Cloud Run → Service → **Revisions** tab
   - Click on latest revision
   - Scroll to **Environment variables**
   - Verify `MONGODB_URI` is listed

2. **Redeploy after setting:**
   - Make sure you clicked **DEPLOY** after adding the variable
   - The variable only applies to new revisions

3. **Check for typos:**
   - Variable name must be exactly: `MONGODB_URI` (uppercase)
   - No spaces before or after

## 📝 Quick Checklist

Before deploying, verify:
- [ ] `MONGODB_URI` is added in **Variables & Secrets**
- [ ] Variable name is exactly `MONGODB_URI` (case-sensitive)
- [ ] Value starts with `mongodb+srv://`
- [ ] Value includes database name: `/online-distance-learning`
- [ ] Clicked **DEPLOY** button
- [ ] Checked logs after deployment

## 🎯 Connection String to Use

**Copy this exact string:**
```
mongodb+srv://remoedph-admin:21313252@remoedph.ysbbgey.mongodb.net/online-distance-learning?retryWrites=true&w=majority
```

Paste it as the **Value** for `MONGODB_URI` in Cloud Run.
