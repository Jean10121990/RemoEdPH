# Troubleshooting: MONGODB_URI Not Set Error

## 🚨 Error Message

If you see this in your Cloud Run logs:
```
❌ MONGODB_URI environment variable is NOT SET!
⚠️  Using default localhost connection (will fail in Cloud Run)
```

**This means:** Your Cloud Run service doesn't have the `MONGODB_URI` environment variable configured.

---

## ✅ Quick Fix: Set MONGODB_URI in Cloud Run

### Option 1: Using Google Cloud Console (Recommended)

1. **Go to Cloud Run:**
   - Navigate to [Google Cloud Console](https://console.cloud.google.com/)
   - Select your project
   - Go to **Cloud Run** → Click your service name (e.g., "remoedph")

2. **Edit the Service:**
   - Click **"EDIT & DEPLOY NEW REVISION"**
   - Scroll to **"Variables & Secrets"** section

3. **Add MONGODB_URI as a Secret (Recommended):**
   
   **Step A: Create Secret in Secret Manager**
   - Go to **Secret Manager** (left sidebar)
   - Click **"CREATE SECRET"**
   - **Secret name:** `mongodb-uri`
   - **Secret value:** Your MongoDB Atlas connection string
     - Example: `mongodb+srv://username:password@cluster.mongodb.net/online-distance-learning?retryWrites=true&w=majority`
   - Click **"CREATE SECRET"**
   
   **Step B: Reference Secret in Cloud Run**
   - Go back to Cloud Run service editing page
   - In **"Variables & Secrets"** section, click **"ADD SECRET"**
   - Select `mongodb-uri` from dropdown
   - Set **Environment Variable Name** to: `MONGODB_URI`
   - Click **"DONE"**

4. **Deploy:**
   - Scroll down and click **"DEPLOY"**
   - Wait 1-3 minutes for deployment

### Option 2: Using gcloud CLI

```bash
# 1. Create the secret
echo -n "mongodb+srv://username:password@cluster.mongodb.net/online-distance-learning?retryWrites=true&w=majority" | \
  gcloud secrets create mongodb-uri --data-file=-

# 2. Grant Cloud Run access
PROJECT_NUMBER=$(gcloud projects describe YOUR_PROJECT_ID --format="value(projectNumber)")
SERVICE_ACCOUNT="${PROJECT_NUMBER}-compute@developer.gserviceaccount.com"

gcloud secrets add-iam-policy-binding mongodb-uri \
  --member="serviceAccount:${SERVICE_ACCOUNT}" \
  --role="roles/secretmanager.secretAccessor"

# 3. Update Cloud Run service to use the secret
gcloud run services update remoedph \
  --region europe-west1 \
  --update-secrets="MONGODB_URI=mongodb-uri:latest"
```

---

## 📝 Getting Your MongoDB Connection String

### If using MongoDB Atlas:

1. Go to [MongoDB Atlas](https://www.mongodb.com/cloud/atlas)
2. Click **"Connect"** on your cluster
3. Choose **"Connect your application"**
4. Select **"Node.js"** and copy the connection string
5. Replace `<password>` with your database user password
6. Replace `<dbname>` with `online-distance-learning` (or your database name)

**Format:**
```
mongodb+srv://<username>:<password>@<cluster>.mongodb.net/<database>?retryWrites=true&w=majority
```

### If using self-hosted MongoDB:

```
mongodb://username:password@your-mongodb-host:27017/online-distance-learning
```

---

## ✅ Verification

After setting `MONGODB_URI`, check your Cloud Run logs:

**Good signs:**
```
🔗 Connecting to MongoDB: mongodb+srv://username:***@cluster.mongodb.net/database
✅ Successfully connected to MongoDB
📊 Database name: online-distance-learning
```

**Bad signs (still need to fix):**
```
❌ MONGODB_URI environment variable is NOT SET!
⚠️  Using default localhost connection (will fail in Cloud Run)
```

---

## 🔍 Common Issues

### Issue: "Secret not found" or "Permission denied"
**Solution:**
- Make sure you created the secret in Secret Manager
- Grant the Cloud Run service account access to the secret
- Check the secret name matches exactly (case-sensitive)

### Issue: "Authentication failed"
**Solution:**
- Verify username and password in connection string are correct
- Check MongoDB Atlas user has proper permissions
- Ensure IP whitelist includes `0.0.0.0/0` (all IPs) in MongoDB Atlas

### Issue: "Connection timeout"
**Solution:**
- Verify MongoDB Atlas cluster is running
- Check network connectivity
- Ensure MongoDB Atlas IP whitelist allows Cloud Run IPs

---

## 📚 Related Documentation

- See `GOOGLE_CLOUD_RUN_SETUP.md` for complete environment variable setup guide
- See `ENV_VARIABLES_QUICK_REFERENCE.md` for quick reference

---

**Last Updated:** 2024
