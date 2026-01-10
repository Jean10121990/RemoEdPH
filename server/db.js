const mongoose = require('mongoose');

const MONGO_URI = 'mongodb://localhost:27017/online-distance-learning';

// Connection options for modern Mongoose versions
const connectionOptions = {
  serverSelectionTimeoutMS: 5000, // Timeout after 5s instead of 30s
  socketTimeoutMS: 45000, // Close sockets after 45s of inactivity
  maxPoolSize: 10, // Maintain up to 10 socket connections
  serverApi: {
    version: '1',
    strict: true,
    deprecationErrors: true,
  }
};

// Connect to MongoDB with better error handling
const connectDB = async () => {
  try {
    await mongoose.connect(MONGO_URI, connectionOptions);
    console.log('Successfully connected to MongoDB');
  } catch (err) {
    console.error('MongoDB connection error:', err);
    console.log('Please ensure MongoDB is running on localhost:27017');
    process.exit(1);
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