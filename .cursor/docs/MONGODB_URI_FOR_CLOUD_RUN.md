# MongoDB URI for Cloud Run

## Your MongoDB Atlas Connection String

You provided:
```
mongodb+srv://remoedph-admin:21313252@remoedph.ysbbgey.mongodb.net/?appName=remoedph
```

## ✅ Corrected Connection String (with database name)

For this project, you need to add the database name `online-distance-learning`:

```
mongodb+srv://remoedph-admin:21313252@remoedph.ysbbgey.mongodb.net/online-distance-learning?retryWrites=true&w=majority
```

**Key changes:**
- Added `/online-distance-learning` before the `?` (database name)
- Changed `?appName=remoedph` to `?retryWrites=true&w=majority` (standard MongoDB connection options)

## 📝 How to Set in Cloud Run

1. Go to [Google Cloud Console](https://console.cloud.google.com/)
2. Navigate to **Cloud Run** → Your Service (`remoedph`)
3. Click **EDIT & DEPLOY NEW REVISION**
4. Scroll to **Variables & Secrets** section
5. Click **ADD VARIABLE**
6. Set:
   - **Name:** `MONGODB_URI`
   - **Value:** `mongodb+srv://remoedph-admin:21313252@remoedph.ysbbgey.mongodb.net/online-distance-learning?retryWrites=true&w=majority`
7. Click **DEPLOY**

## ⚠️ Security Note

**Important:** This connection string contains your password in plain text. For better security, consider:

1. **Using Secret Manager** (Recommended):
   - Create a secret in Secret Manager with this connection string
   - Reference it in Cloud Run as a secret instead of a regular variable

2. **Change your MongoDB password** after testing:
   - Go to MongoDB Atlas → Database Access
   - Change your database user password
   - Update the connection string in Cloud Run

## ✅ After Setting MONGODB_URI

After you set `MONGODB_URI` in Cloud Run and redeploy:

1. The server should start successfully
2. It will connect to MongoDB Atlas instead of localhost
3. You should see in logs: `🔗 Connecting to MongoDB: mongodb+srv://remoedph-admin:***@remoedph.ysbbgey.mongodb.net/...`
4. You should see: `✅ Successfully connected to MongoDB`
