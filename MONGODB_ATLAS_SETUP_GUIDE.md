# MongoDB Atlas Setup Guide - Step by Step

## 🎯 Goal
Create a MongoDB Atlas cluster and get the connection string for Cloud Run deployment.

---

## Step 1: Create MongoDB Atlas Account

1. Go to [https://www.mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
2. Click **"Try Free"** or **"Sign Up"**
3. Sign up with:
   - Email and password, OR
   - Google account, OR
   - GitHub account

---

## Step 2: Create a New Project

1. After logging in, you'll see the Atlas dashboard
2. Click **"New Project"** (or "Create Project")
3. Enter project name: `RemoEdPH` (or any name you prefer)
4. Click **"Next"** then **"Create Project"**

---

## Step 3: Build a Database Cluster

1. In your project, click **"Build a Database"** button
2. Choose **"Shared"** (FREE tier - M0 Sandbox)
3. Select Cloud Provider:
   - **AWS** (recommended)
   - **Google Cloud** (if you want same provider as Cloud Run)
   - **Azure**
4. Select Region:
   - Choose a region close to you (e.g., `us-east-1` for AWS, `europe-west1` for Google Cloud)
   - **Important:** For Cloud Run in `europe-west1`, choose a Google Cloud region close to that
5. Cluster Name: `Cluster0` (default) or `remoedph-cluster`
6. Click **"Create Cluster"**
7. **Wait 1-3 minutes** for cluster to be created

---

## Step 4: Create Database User

1. While cluster is creating, go to **"Database Access"** in left sidebar
2. Click **"Add New Database User"**
3. Choose **"Password"** authentication method
4. Enter:
   - **Username:** `remoedph-admin` (or any username)
   - **Password:** Click **"Autogenerate Secure Password"** OR create your own
   - **⚠️ IMPORTANT:** Save the password! You'll need it for the connection string
5. Under **"Database User Privileges"**, select:
   - **"Read and write to any database"** (or "Atlas admin" for full access)
6. Click **"Add User"**

---

## Step 5: Configure Network Access (CRITICAL!)

1. Go to **"Network Access"** in left sidebar
2. Click **"Add IP Address"**
3. For Cloud Run deployment, you need to allow all IPs:
   - Click **"Allow Access from Anywhere"**
   - OR manually add: `0.0.0.0/0`
   - Add a comment: `Cloud Run access`
4. Click **"Confirm"**

   **⚠️ Security Note:** `0.0.0.0/0` allows access from anywhere. For production, consider restricting IPs later.

---

## Step 6: Get Your Connection String

1. Go back to **"Database"** (or "Clusters") in left sidebar
2. Find your cluster (should show "Available" status)
3. Click **"Connect"** button next to your cluster
4. Choose **"Connect your application"**
5. Select:
   - **Driver:** `Node.js`
   - **Version:** `5.5 or later` (or latest)
6. Copy the connection string - it will look like:
   ```
   mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```

---

## Step 7: Format Your Connection String

Replace the placeholders in the connection string:

**Original:**
```
mongodb+srv://<username>:<password>@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
```

**Replace:**
- `<username>` → Your database username (e.g., `remoedph-admin`)
- `<password>` → Your database password (the one you saved in Step 4)
- `?` → Add database name: `?` becomes `/online-distance-learning?`

**Final format:**
```
mongodb+srv://remoedph-admin:YOUR_PASSWORD@cluster0.xxxxx.mongodb.net/online-distance-learning?retryWrites=true&w=majority
```

**Example:**
```
mongodb+srv://remoedph-admin:MySecurePass123@cluster0.abc123.mongodb.net/online-distance-learning?retryWrites=true&w=majority
```

---

## Step 8: Test Connection (Optional)

### Option A: Test with MongoDB Compass

1. Download [MongoDB Compass](https://www.mongodb.com/products/compass)
2. Open Compass
3. Paste your connection string (with password replaced)
4. Click **"Connect"**
5. You should see your databases

### Option B: Test with Node.js

Create a test file `test-mongodb-connection.js`:

```javascript
const mongoose = require('mongoose');

const MONGODB_URI = 'mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/online-distance-learning?retryWrites=true&w=majority';

mongoose.connect(MONGODB_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas!');
    process.exit(0);
  })
  .catch((err) => {
    console.error('❌ Connection failed:', err.message);
    process.exit(1);
  });
```

Run: `node test-mongodb-connection.js`

---

## Step 9: Use in Cloud Run

1. Copy your final connection string
2. Go to Google Cloud Console → Cloud Run → Your Service
3. Click **"EDIT & DEPLOY NEW REVISION"**
4. Go to **"Variables & Secrets"**
5. Add environment variable:
   - **Name:** `MONGODB_URI`
   - **Value:** Your connection string (paste it)
6. Click **"DEPLOY"**

---

## 🔍 Troubleshooting

### Issue: "Cannot see cluster in Compass"

**Possible causes:**
1. Cluster is still creating (wait 1-3 minutes)
2. Wrong connection string format
3. Network access not configured (Step 5)
4. Wrong username/password

**Solutions:**
1. Check cluster status in Atlas dashboard - should show "Available"
2. Verify connection string format matches exactly
3. Make sure Network Access includes `0.0.0.0/0` or your IP
4. Double-check username and password in Database Access

### Issue: "Authentication failed"

- Verify username and password are correct
- Check if user has proper permissions
- Make sure password doesn't contain special characters that need URL encoding

### Issue: "Connection timeout"

- Check Network Access settings
- Verify cluster is in "Available" status
- Try a different region closer to your location

---

## ✅ Checklist

Before deploying to Cloud Run, verify:

- [ ] MongoDB Atlas account created
- [ ] Cluster created and shows "Available" status
- [ ] Database user created with username and password saved
- [ ] Network Access configured (0.0.0.0/0 for Cloud Run)
- [ ] Connection string copied and formatted correctly
- [ ] Connection tested successfully (Compass or test script)
- [ ] MONGODB_URI set in Cloud Run environment variables

---

## 📝 Quick Reference

**Connection String Format:**
```
mongodb+srv://USERNAME:PASSWORD@CLUSTER.mongodb.net/DATABASE_NAME?retryWrites=true&w=majority
```

**For this project:**
- Database name: `online-distance-learning`
- Example: `mongodb+srv://user:pass@cluster0.xxxxx.mongodb.net/online-distance-learning?retryWrites=true&w=majority`

---

## 🆘 Need Help?

If you're stuck:
1. Check MongoDB Atlas dashboard - cluster status
2. Verify all steps completed
3. Check Cloud Run logs after deployment
4. Test connection locally first before deploying
