const mongoose = require('mongoose');

// Use environment variable for MongoDB URI, fallback to localhost for local development only
// Cloud Run detection: K_SERVICE is automatically set by Google Cloud Run
const isCloudRun = !!process.env.K_SERVICE;// this is a comment
const MONGO_URI = process.env.MONGODB_URI || (!isCloudRun ? 'mongodb://localhost:27017/online-distance-learning' : undefined);

// Connection options for modern Mongoose versions
const connectionOptions = {
  serverSelectionTimeoutMS: 10000, // Timeout after 10s (increased for localhost)
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  maxPoolSize: 10, // Maintain up to 10 socket connections
};

// Connect to MongoDB with better error handling (non-blocking)
const connectDB = async () => {
  try {
    // Check if MONGODB_URI is actually set
    if (!MONGO_URI) {
      if (isCloudRun) {
        console.error('❌ MONGODB_URI environment variable is NOT SET in Cloud Run!');
        console.error('⚠️  Cloud Run requires MONGODB_URI to be set as an environment variable or secret');
        console.error('📝 To fix: Set MONGODB_URI environment variable or secret in Cloud Run');
        console.error('📝 Example: mongodb+srv://username:password@cluster.mongodb.net/database');
        console.warn('⚠️  Skipping MongoDB connection attempt (MONGODB_URI not set in Cloud Run)');
      } else {
        console.error('❌ MONGODB_URI environment variable is NOT SET!');
        console.error('⚠️  Using fallback localhost connection for local development');
        console.error('📝 To use MongoDB Atlas locally, set MONGODB_URI environment variable');
        console.error('📝 Example: mongodb+srv://username:password@cluster.mongodb.net/database');
        console.log('🔗 Attempting localhost connection (make sure MongoDB is running locally)');
      }
      // Only skip if in Cloud Run without MONGODB_URI
      if (isCloudRun) {
        return false;
      }
    }
    
<<<<<<< HEAD
    if (isUsingDefault || MONGO_URI.includes('localhost') || MONGO_URI.includes('127.0.0.1')) {
      console.log('🔗 Connecting to local MongoDB: mongodb://localhost:27017/online-distance-learning');
      console.log('📝 Make sure MongoDB is running locally. Use start-mongodb.bat or start-mongodb.ps1 to start it.');
    } else {
      // Log connection attempt (hide password)
      const uriForLogging = MONGO_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
=======
    // Log connection attempt (hide password if present)
    if (MONGO_URI) {
      // Mask credentials in MongoDB URI (handles both mongodb:// and mongodb+srv://)
      let uriForLogging = MONGO_URI;
      // Match: mongodb:// or mongodb+srv:// followed by username:password@
      uriForLogging = uriForLogging.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
      // Also handle cases where password might be in query string
      uriForLogging = uriForLogging.replace(/([?&])(password|pass|pwd)=[^&]*/gi, '$1$2=***');
>>>>>>> da9de468fb1fb771b8de4b4f25ba3d9a1815209f
      console.log(`🔗 Connecting to MongoDB: ${uriForLogging}`);
    }
    
    await mongoose.connect(MONGO_URI, connectionOptions);
    console.log('✅ Successfully connected to MongoDB');
    
    // Log database name
    const dbName = mongoose.connection.db?.databaseName;
    if (dbName) {
      console.log(`📊 Database name: ${dbName}`);
    }
    
    return true;
  } catch (err) {
    // Safely extract error message without exposing credentials
    let errorMessage = err.message || String(err);
    // Remove any potential credential leaks from error messages
    errorMessage = errorMessage.replace(/\/\/([^:]+):([^@]+)@/g, '//$1:***@');
    errorMessage = errorMessage.replace(/([?&])(password|pass|pwd)=[^&\s]*/gi, '$1$2=***');
    
    console.error('❌ MongoDB connection error:', errorMessage);
    if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
      console.error('⚠️  DNS resolution failed. Check if MONGODB_URI is correct.');
    } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('127.0.0.1')) {
      console.error('⚠️  Connection refused - MONGODB_URI not set or pointing to localhost.');
      console.error('⚠️  In Cloud Run, you MUST set MONGODB_URI to your MongoDB Atlas connection string.');
    } else if (errorMessage.includes('authentication failed')) {
      console.error('⚠️  Authentication failed. Check username and password in MONGODB_URI.');
    } else if (errorMessage.includes('timeout')) {
      console.error('⚠️  Connection timeout. Check network connectivity and MongoDB server status.');
    }
    console.warn('⚠️  Server will continue without database connection. Some features may not work.');
    console.warn('⚠️  Database-dependent features (login, registration, etc.) will fail.');
    // Don't exit the process - allow server to start without DB
    return false;
  }
};

const db = mongoose.connection;

// Connection event handlers
db.on('error', (err) => {
  // Safely log error without exposing credentials
  let errorMessage = err.message || String(err);
  // Remove any potential credential leaks from error messages
  errorMessage = errorMessage.replace(/\/\/([^:]+):([^@]+)@/g, '//$1:***@');
  errorMessage = errorMessage.replace(/([?&])(password|pass|pwd)=[^&\s]*/gi, '$1$2=***');
  console.error('MongoDB connection error:', errorMessage);
  if (err.name === 'MongoNetworkError') {
    console.log('Network error - please check if MongoDB is running');
  }
});

db.on('disconnected', () => {
  console.log('MongoDB disconnected');
});

db.on('reconnected', () => {
  console.log('MongoDB reconnected');
});

db.once('open', () => {
  console.log('Connected to MongoDB');
});

module.exports = { db, connectDB }; 