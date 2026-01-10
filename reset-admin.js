const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/online-distance-learning', {
  useNewUrlParser: true,
  useUnifiedTopology: true
});

async function resetAdmin() {
  try {
    console.log('🔍 Checking admin account...');
    
    const Admin = require('./server/models/Admin');
    
    // Check if admin exists
    const admin = await Admin.findOne({ username: 'admin@remoedph.com' });
    
    if (admin) {
      console.log('✅ Admin account found');
      console.log('Username:', admin.username);
      console.log('Status:', admin.status);
      console.log('Created:', admin.createdAt);
    } else {
      console.log('❌ Admin account not found, creating...');
    }
    
    // Create or update admin account
    const hashedPassword = await bcrypt.hash('admin123', 10);
    
    await Admin.findOneAndUpdate(
      { username: 'admin@remoedph.com' },
      {
        username: 'admin@remoedph.com',
        password: hashedPassword,
        status: 'active',
        hasGeneratedPassword: false
      },
      { upsert: true, new: true }
    );
    
    console.log('✅ Admin account ready!');
    console.log('Username: admin@remoedph.com');
    console.log('Password: admin123');
    console.log('Status: active');
    
  } catch (error) {
    console.error('❌ Error:', error);
  } finally {
    mongoose.connection.close();
  }
}

resetAdmin();
