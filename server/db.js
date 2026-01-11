const mongoose = require('mongoose');

// Use environment variable for MongoDB URI, fallback to localhost for local development only
// Cloud Run detection: K_SERVICE is automatically set by Google Cloud Run
const isCloudRun = !!process.env.K_SERVICE;
const MONGO_URI = process.env.MONGODB_URI || (!isCloudRun ? 'mongodb://localhost:27017/online-distance-learning' : undefined);

// Connection options for modern Mongoose versions
const connectionOptions = {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s (reduced to fail faster if wrong URI)
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
    
    // Log connection attempt (hide password if present)
    if (MONGO_URI) {
      const uriForLogging = MONGO_URI.includes('@') 
        ? MONGO_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@')
        : MONGO_URI;
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
    console.error('❌ MongoDB connection error:', err.message);
    if (err.message.includes('ENOTFOUND') || err.message.includes('getaddrinfo')) {
      console.error('⚠️  DNS resolution failed. Check if MONGODB_URI is correct.');
    } else if (err.message.includes('ECONNREFUSED') || err.message.includes('127.0.0.1')) {
      console.error('⚠️  Connection refused - MONGODB_URI not set or pointing to localhost.');
      console.error('⚠️  In Cloud Run, you MUST set MONGODB_URI to your MongoDB Atlas connection string.');
    } else if (err.message.includes('authentication failed')) {
      console.error('⚠️  Authentication failed. Check username and password in MONGODB_URI.');
    } else if (err.message.includes('timeout')) {
      console.error('⚠️  Connection timeout. Check network connectivity and MongoDB server status.');
    }
    console.warn('⚠️  Server will continue without database connection. Some features may not work.');
    // Don't exit the process - allow server to start without DB
    return false;
  }
};

const db = mongoose.connection;

// Connection event handlers
db.on('error', (err) => {
  console.error('MongoDB connection error:', err);
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