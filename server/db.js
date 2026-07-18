const mongoose = require('mongoose');

// Cloud Run detection: K_SERVICE is automatically set by Google Cloud Run
const isCloudRun = !!process.env.K_SERVICE;
const isProduction = process.env.NODE_ENV === 'production';

const LOCAL_MONGO_DEFAULT = 'mongodb://localhost:27017/online-distance-learning';

function trimEnv(value) {
  if (value == null) return '';
  return String(value).trim();
}

const MONGODB_URI_SERVER = trimEnv(process.env.MONGODB_URI);
const MONGODB_URI_LOCAL = trimEnv(process.env.MONGODB_URI_LOCAL) || LOCAL_MONGO_DEFAULT;

/**
 * MongoDB connection mode (MONGODB_CONNECTION_MODE):
 * - auto   — try MONGODB_URI (server/Atlas) first, fall back to MONGODB_URI_LOCAL (local dev only)
 * - server — use MONGODB_URI only
 * - local  — use MONGODB_URI_LOCAL only
 */
function resolveConnectionMode() {
  const raw = trimEnv(process.env.MONGODB_CONNECTION_MODE).toLowerCase();
  if (raw === 'server' || raw === 'local' || raw === 'auto') return raw;
  if (isCloudRun || isProduction) return 'server';
  return 'auto';
}

const connectionMode = resolveConnectionMode();

/** @type {{ label: 'server' | 'local' | null, uri: string | null }} */
let activeConnection = { label: null, uri: null };

function maskUri(uri) {
  if (!uri) return '(not set)';
  let masked = uri;
  masked = masked.replace(/\/\/([^:]+):([^@]+)@/, '//$1:***@');
  masked = masked.replace(/([?&])(password|pass|pwd)=[^&]*/gi, '$1$2=***');
  return masked;
}

function buildConnectionCandidates() {
  switch (connectionMode) {
    case 'local':
      return [{ label: 'local', uri: MONGODB_URI_LOCAL }];
    case 'server':
      if (MONGODB_URI_SERVER) return [{ label: 'server', uri: MONGODB_URI_SERVER }];
      if (isCloudRun || isProduction) return [];
      return [{ label: 'local', uri: MONGODB_URI_LOCAL }];
    case 'auto':
    default: {
      const candidates = [];
      if (MONGODB_URI_SERVER) {
        candidates.push({ label: 'server', uri: MONGODB_URI_SERVER });
      }
      candidates.push({ label: 'local', uri: MONGODB_URI_LOCAL });
      return candidates;
    }
  }
}

// Connection options for modern Mongoose versions
const connectionOptions = {
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
  maxPoolSize: 10,
};

function sanitizeErrorMessage(err) {
  let errorMessage = err && err.message ? err.message : String(err);
  errorMessage = errorMessage.replace(/\/\/([^:]+):([^@]+)@/g, '//$1:***@');
  errorMessage = errorMessage.replace(/([?&])(password|pass|pwd)=[^&\s]*/gi, '$1$2=***');
  return errorMessage;
}

function logConnectionHints(errorMessage) {
  if (errorMessage.includes('ENOTFOUND') || errorMessage.includes('getaddrinfo')) {
    console.error('⚠️  DNS resolution failed. Check if the MongoDB URI is correct.');
  } else if (errorMessage.includes('ECONNREFUSED') || errorMessage.includes('127.0.0.1')) {
    console.error('⚠️  Connection refused. Is MongoDB running locally?');
    console.error('⚠️  Start local MongoDB or set MONGODB_CONNECTION_MODE=server with a valid MONGODB_URI.');
  } else if (errorMessage.includes('authentication failed')) {
    console.error('⚠️  Authentication failed. Check username and password in the MongoDB URI.');
  } else if (errorMessage.includes('timeout')) {
    console.error('⚠️  Connection timeout. Check network connectivity and MongoDB server status.');
  }
}

async function dropLegacyAdminIndexes() {
  try {
    const coll = mongoose.connection.collection('admins');
    const idx = await coll.indexes();
    for (let i = 0; i < idx.length; i++) {
      const spec = idx[i];
      const k = spec.key || {};
      const keys = Object.keys(k);
      const field = keys.length === 1 ? keys[0] : '';
      if (
        spec.unique &&
        (field === 'employeeId' || field === 'referralCode') &&
        spec.name &&
        spec.name !== '_id_'
      ) {
        await coll.dropIndex(spec.name);
        console.log(`✅ Dropped legacy unique index ${spec.name} on admins.${field}`);
      }
    }
  } catch (e) {
    const m = e && e.message ? String(e.message) : String(e);
    if (!/ns not found|NamespaceNotFound/i.test(m)) {
      console.warn('⚠️ admins index cleanup:', m);
    }
  }
}

async function connectWithUri(label, uri) {
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }

  console.log(`🔗 Connecting to MongoDB (${label}): ${maskUri(uri)}`);
  await mongoose.connect(uri, connectionOptions);
  activeConnection = { label, uri };

  console.log(`✅ Successfully connected to MongoDB (${label})`);
  const dbName = mongoose.connection.db?.databaseName;
  if (dbName) {
    console.log(`📊 Database name: ${dbName}`);
  }

  await dropLegacyAdminIndexes();
  return true;
}

const connectDB = async () => {
  const candidates = buildConnectionCandidates();

  if (candidates.length === 0) {
    if (isCloudRun) {
      console.error('❌ MONGODB_URI environment variable is NOT SET in Cloud Run!');
      console.error('⚠️  Cloud Run requires MONGODB_URI to be set as an environment variable or secret');
      console.error('📝 Example: mongodb+srv://username:password@cluster.mongodb.net/database');
    } else {
      console.error('❌ CRITICAL: MONGODB_URI is missing in production environment!');
    }
    return false;
  }

  console.log(`🔧 MongoDB connection mode: ${connectionMode}`);

  for (let i = 0; i < candidates.length; i++) {
    const { label, uri } = candidates[i];
    const hasFallback = connectionMode === 'auto' && i < candidates.length - 1;

    try {
      return await connectWithUri(label, uri);
    } catch (err) {
      const errorMessage = sanitizeErrorMessage(err);
      console.error(`❌ MongoDB connection error (${label}):`, errorMessage);
      logConnectionHints(errorMessage);

      if (hasFallback) {
        const next = candidates[i + 1];
        console.warn(
          `⚠️  ${label} database unavailable — falling back to ${next.label} (${maskUri(next.uri)})`
        );
      }
    }
  }

  console.warn('⚠️  Server will continue without database connection. Some features may not work.');
  return false;
};

function getDbConnectionInfo() {
  return {
    mode: connectionMode,
    target: activeConnection.label,
    connected: mongoose.connection.readyState === 1,
    database: mongoose.connection.db?.databaseName || null,
  };
}

const db = mongoose.connection;

db.on('error', (err) => {
  console.error('MongoDB connection error:', sanitizeErrorMessage(err));
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

module.exports = { db, connectDB, getDbConnectionInfo, connectionMode };
