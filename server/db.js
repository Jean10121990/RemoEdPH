const mongoose = require('mongoose');

// Use environment variable for MongoDB URI, fallback to localhost for development
const MONGO_URI = process.env.MONGODB_URI || 'mongodb://localhost:27017/online-distance-learning';

// Connection options for modern Mongoose versions
const connectionOptions = {
  serverSelectionTimeoutMS: 10000, // Timeout after 10s (increased for Cloud Run)
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  maxPoolSize: 10, // Maintain up to 10 socket connections
};

// Connect to MongoDB with better error handling (non-blocking)
const connectDB = async () => {
  try {
    // Check if MONGODB_URI is actually set (not using default)
    const isUsingDefault = !process.env.MONGODB_URI || MONGO_URI === 'mongodb://localhost:27017/online-distance-learning';
    
    if (isUsingDefault) {
      console.error('❌ MONGODB_URI environment variable is NOT SET!');
      console.error('⚠️  Using default localhost connection (will fail in Cloud Run)');
      console.error('📝 To fix: Set MONGODB_URI environment variable or secret in Cloud Run');
      console.error('📝 Example: mongodb+srv://username:password@cluster.mongodb.net/database');
    } else {
      // Log connection attempt (hide password)
      const uriForLogging = MONGO_URI.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
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