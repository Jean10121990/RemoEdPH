const express = require('express');
const bcrypt = require('bcrypt');
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');
const Admin = require('./models/Admin');
const router = express.Router();
const jwt = require('jsonwebtoken');
const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret'; // Use a strong secret in production
const crypto = require('crypto');
const mongoose = require('mongoose');
const { sendPasswordResetEmail } = require('./emailService');

// Middleware to authenticate JWT token
const authenticateToken = (req, res, next) => {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1]; // Bearer TOKEN

  if (!token) {
    return res.status(401).json({ success: false, message: 'Access token required' });
  }

  jwt.verify(token, JWT_SECRET, (err, user) => {
    if (err) {
      return res.status(403).json({ success: false, message: 'Invalid or expired token' });
    }
    req.user = user;
    next();
  });
};

// Function to generate strong password (10 characters) - NO SPECIAL CHARACTERS
function generateStrongPassword() {
  const uppercase = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
  const lowercase = 'abcdefghijklmnopqrstuvwxyz';
  const numbers = '0123456789';
  
  let password = '';
  
  // Ensure at least one character from each category
  password += uppercase[Math.floor(Math.random() * uppercase.length)];
  password += lowercase[Math.floor(Math.random() * lowercase.length)];
  password += numbers[Math.floor(Math.random() * numbers.length)];
  
  // Fill the remaining 7 characters with random characters from all categories
  const allChars = uppercase + lowercase + numbers;
  for (let i = 0; i < 7; i++) {
    password += allChars[Math.floor(Math.random() * allChars.length)];
  }
  
  // Shuffle the password to make it more random
  return password.split('').sort(() => Math.random() - 0.5).join('');
}

// Helper: generate teacherId in the format T<initials><MYYYY><#####>
async function generateTeacherIdFor(teacherData) {
  const { firstName = '', middleName = '', lastName = '', username = '' } = teacherData || {};
  const takeInitial = (s) => (s && s.trim().length > 0 ? s.trim()[0].toUpperCase() : 'X');

  let initials = '';
  if (firstName || middleName || lastName) {
    initials = `${takeInitial(firstName)}${takeInitial(middleName)}${takeInitial(lastName)}`;
  } else {
    // Fallback: derive up to 3 initials from username segments
    const parts = (username || '').split(/[^A-Za-z]+/).filter(Boolean);
    const chars = parts.map(p => p[0]?.toUpperCase()).slice(0, 3);
    while (chars.length < 3) chars.push('X');
    initials = chars.join('');
  }

  const now = new Date();
  const monthNoPad = String(now.getMonth() + 1); // per spec, no leading zero e.g., 7 for July
  const year = String(now.getFullYear());
  const prefix = `T${initials}${monthNoPad}${year}`; // e.g., TKBF72025

  // Count existing teachers with this prefix to assign next sequence
  const count = await Teacher.countDocuments({ teacherId: { $regex: `^${prefix}` } });
  const seq = String(count + 1).padStart(5, '0');
  return `${prefix}${seq}`; // e.g., TKBF7202500001
}

// Seed default admin if not present
const seedDefaultAdmin = async () => {
  try {
    const admin = await Admin.findOne({ username: 'admin@remoedph.com' });
    if (!admin) {
      const bcrypt = require('bcrypt');
      const hashed = await bcrypt.hash('admin123', 10);
      await Admin.create({ username: 'admin@remoedph.com', password: hashed });
      console.log('Default admin created: admin@remoedph.com / admin123');
    }
  } catch (error) {
    console.log('Could not seed default admin (database may not be ready):', error.message);
  }
};

// Call the function after a delay to ensure database is ready
setTimeout(seedDefaultAdmin, 2000);

// Admin login endpoint
router.post('/admin-login', async (req, res) => {
  const { username, password } = req.body;
  const admin = await Admin.findOne({ username });
  if (!admin) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  
  // Check if admin is suspended
  if (admin.status === 'suspended') {
    console.log('Admin is suspended:', admin.username);
    return res.status(403).json({ success: false, message: 'Your account has been suspended. Please contact the system administrator.' });
  }
  
  const bcrypt = require('bcrypt');
  const match = await bcrypt.compare(password, admin.password);
  if (!match) {
    return res.status(401).json({ success: false, message: 'Invalid credentials' });
  }
  const jwt = require('jsonwebtoken');
  const token = jwt.sign({ username: admin.username, isAdmin: true }, JWT_SECRET, { expiresIn: '1h' });
  res.json({ success: true, token, username: admin.username });
});

router.post('/login', async (req, res) => {
  console.log('=== TEACHER LOGIN ATTEMPT ===');
  console.log('Request headers:', req.headers);
  console.log('Request body:', req.body);
  
  const { username, password } = req.body;
  
  if (!username || !password) {
    console.log('Missing username or password');
    return res.status(400).json({ success: false, message: 'Username and password are required' });
  }
  
  try {
    const teacher = await Teacher.findOne({ username });
    console.log('Login attempt for username:', username);
    console.log('Teacher found:', !!teacher);
    
    if (!teacher) {
      console.log('User not found');
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    // Check if user is suspended
    if (teacher.status === 'suspended') {
      console.log('User is suspended:', teacher.username);
      return res.status(403).json({ success: false, message: 'Your account has been suspended. Please contact the administrator.' });
    }
    
    const passwordMatch = await bcrypt.compare(password, teacher.password);
    console.log('Password match:', passwordMatch);
    
    if (passwordMatch) {
      const token = jwt.sign({ username: teacher.username, teacherId: teacher.teacherId }, JWT_SECRET, { expiresIn: '24h' });
      console.log('Token generated successfully');
      console.log('Sending response:', { success: true, token: token.substring(0, 20) + '...', teacherId: teacher.teacherId });
      
      // Set CORS headers explicitly
      res.header('Access-Control-Allow-Origin', req.headers.origin || '*');
      res.header('Access-Control-Allow-Credentials', 'true');
      res.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
      res.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
      
      // Check if user has a generated password and needs to change it
      const needsPasswordChange = teacher.hasGeneratedPassword;
      console.log('Teacher hasGeneratedPassword:', teacher.hasGeneratedPassword);
      console.log('needsPasswordChange:', needsPasswordChange);
      
      res.json({ 
        success: true, 
        token, 
        teacherId: teacher.teacherId,
        needsPasswordChange: needsPasswordChange
      });
    } else {
      console.log('Password incorrect');
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

router.post('/register', async (req, res) => {
  const { username, password, firstName = '', middleName = '', lastName = '' } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password are required.' });
  }
  try {
    const existing = await Teacher.findOne({ username });
    if (existing) {
      return res.status(409).json({ success: false, message: 'Username already exists.' });
    }
    
    // Generate unique teacherId using new format
    const teacherId = await generateTeacherIdFor({ firstName, middleName, lastName, username });
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const teacher = new Teacher({ 
      username,
      password: hashedPassword,
      teacherId: teacherId,
      firstName,
      middleName,
      lastName
    });
    await teacher.save();
    res.json({ success: true, teacherId: teacherId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: 'Server error' });
  }
});

// Student login endpoint
router.post('/student-login', async (req, res) => {
  const { username, password } = req.body;
  console.log('=== STUDENT LOGIN ATTEMPT ===');
  console.log('Request body:', { username, password: '***' });
  try {
    // Check if database is connected
    if (mongoose.connection.readyState !== 1) {
      console.error('❌ Database not connected. Connection state:', mongoose.connection.readyState);
      return res.status(503).json({ 
        success: false, 
        message: 'Database connection unavailable. Please try again in a moment.' 
      });
    }
    
    const student = await Student.findOne({ username });
    console.log('Student found:', !!student);
    console.log('Searching for username:', username);
    if (!student) {
      console.log('Student not found');
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
    
    // Check if user is suspended
    if (student.status === 'suspended') {
      console.log('Student is suspended:', student.username);
      return res.status(403).json({ success: false, message: 'Your account has been suspended. Please contact the administrator.' });
    }
    
    const passwordMatch = await bcrypt.compare(password, student.password);
    console.log('Password match:', passwordMatch);
    if (passwordMatch) {
      const token = jwt.sign({ username: student.username, studentId: student._id }, JWT_SECRET, { expiresIn: '24h' });
      // Check if user has a generated password and needs to change it
      const needsPasswordChange = student.hasGeneratedPassword;
      console.log('Student hasGeneratedPassword:', student.hasGeneratedPassword);
      console.log('needsPasswordChange:', needsPasswordChange);
      
      const response = { 
        success: true, 
        token, 
        studentId: student._id,
        needsPasswordChange: needsPasswordChange
      };
      console.log('Sending response:', { ...response, token: '***' });
      res.json(response);
    } else {
      console.log('Password incorrect');
      res.status(401).json({ success: false, message: 'Invalid credentials' });
    }
  } catch (err) {
    console.error('❌ Student login error:', err);
    console.error('Error details:', {
      message: err.message,
      name: err.name,
      code: err.code
    });
    
    // Check if it's a database connection error
    if (err.name === 'MongoServerError' || err.message.includes('Mongo') || err.message.includes('connection')) {
      return res.status(503).json({ 
        success: false, 
        message: 'Database connection error. Please try again in a moment.' 
      });
    }
    
    // Provide more specific error messages
    const errorMessage = err.message || 'Server error';
    res.status(500).json({ 
      success: false, 
      message: errorMessage 
    });
  }
});

// Student registration endpoint
router.post('/student-register', async (req, res) => {
  const { username, email, password } = req.body;
  if (!username || !password) {
    return res.status(400).json({ success: false, message: 'Username and password required' });
  }
  if (!email) {
    return res.status(400).json({ success: false, message: 'Email address is required' });
  }
  
  // Check if database is connected
  const mongoose = require('mongoose');
  if (mongoose.connection.readyState !== 1) {
    console.error('❌ Database not connected. Connection state:', mongoose.connection.readyState);
    return res.status(503).json({ 
      success: false, 
      message: 'Database connection unavailable. Please try again in a moment.' 
    });
  }
  
  try {
    // Check if username already exists
    const existingUsername = await Student.findOne({ username });
    if (existingUsername) {
      return res.status(409).json({ success: false, message: 'Username already exists' });
    }
    
    // Check if email already exists
    const existingEmail = await Student.findOne({ email });
    if (existingEmail) {
      return res.status(409).json({ success: false, message: 'Email address already registered' });
    }
    
    const hashedPassword = await bcrypt.hash(password, 10);
    const student = new Student({ 
      username, 
      email: email,
      password: hashedPassword,
      parentName: req.body.parentName || ''
      // firstName and lastName will be set when they update their profile
    });
    await student.save();
    res.json({ success: true, message: 'Student registered successfully', studentId: student._id });
  } catch (err) {
    console.error('❌ Student registration error:', err);
    console.error('Error details:', {
      message: err.message,
      name: err.name,
      code: err.code,
      stack: err.stack
    });
    
    // Provide more specific error messages
    let errorMessage = 'Server error';
    if (err.name === 'ValidationError') {
      errorMessage = `Validation error: ${err.message}`;
    } else if (err.name === 'MongoServerError' && err.code === 11000) {
      // Duplicate key error
      const field = Object.keys(err.keyPattern)[0];
      errorMessage = `${field} already exists`;
    } else if (err.message) {
      errorMessage = err.message;
    }
    
    res.status(500).json({ 
      success: false, 
      message: errorMessage,
      error: process.env.NODE_ENV === 'development' ? err.message : undefined
    });
  }
});

// Add forgot password endpoint for teachers - generates new password
router.post('/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if email is provided
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }
    
    // Look for user by username or email field
    const user = await Teacher.findOne({ 
      $or: [
        { username: email },
        { email: email }
      ]
    });
    
    if (!user) {
      // Email doesn't exist in database
      return res.status(404).json({ success: false, message: 'Email address not found. Please check your email or contact support.' });
    }
    
    // Verify that the entered email matches the user's registered email
    const userEmail = user.email || user.username;
    if (userEmail !== email) {
      // Email doesn't match the user's registered email
      return res.status(404).json({ success: false, message: 'Email address not found. Please check your email or contact support.' });
    }
    
    // Generate a strong password (10 characters)
    const newPassword = generateStrongPassword();
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update user's password
    user.password = hashedPassword;
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    
    // Send email with new password to the entered email address
    const emailResult = await sendPasswordResetEmail(
      email, // Use the email address that was entered
      user.username, 
      newPassword, 
      'Teacher'
    );
    
    if (emailResult.success) {
      res.json({ 
        success: true, 
        message: 'A new password has been generated and sent to your email address.'
      });
    } else if (emailResult.fallback) {
      // Email not configured - return password for testing
      console.log('Email not configured - returning password for testing');
      res.json({ 
        success: true, 
        message: 'A new password has been generated. Please check your email or contact support if you don\'t receive it.',
        newPassword: newPassword // Only for testing when email not configured
      });
    } else {
      // If email fails, still update password but notify user
      console.error('Email sending failed:', emailResult.error);
      res.json({ 
        success: true, 
        message: 'A new password has been generated. Please check your email or contact support if you don\'t receive it.'
      });
    }
  } catch (error) {
    console.error('Error in forgot password:', error);
    res.status(500).json({ success: false, message: 'An error occurred while processing your request.' });
  }
});

// Add reset password endpoint
router.post('/reset-password', async (req, res) => {
  const { token, password } = req.body;
  console.log('Token received:', token);
  const user = await Teacher.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() }
  });
  console.log('User found for token:', user);
  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
  }
  user.password = await bcrypt.hash(password, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  res.json({ success: true });
});



// Student schema (already imported from models/Student.js)

// Student login endpoint (duplicate removed - using the one above)

// Student forgot password endpoint - generates new password
router.post('/student-forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    
    // Check if email is provided
    if (!email) {
      return res.status(400).json({ success: false, message: 'Email address is required.' });
    }
    
    // Look for user by username or email field
    const user = await Student.findOne({ 
      $or: [
        { username: email },
        { email: email }
      ]
    });
    
    if (!user) {
      // Email doesn't exist in database
      return res.status(404).json({ success: false, message: 'Email address not found. Please check your email or contact support.' });
    }
    
    // Verify that the entered email matches the user's registered email
    const userEmail = user.email || user.username;
    if (userEmail !== email) {
      // Email doesn't match the user's registered email
      return res.status(404).json({ success: false, message: 'Email address not found. Please check your email or contact support.' });
    }
    
    // Generate a strong password (10 characters)
    const newPassword = generateStrongPassword();
    
    // Hash the new password
    const hashedPassword = await bcrypt.hash(newPassword, 10);
    
    // Update user's password and set hasGeneratedPassword flag
    user.password = hashedPassword;
    user.hasGeneratedPassword = true; // Set flag to force password change
    user.resetPasswordToken = undefined;
    user.resetPasswordExpires = undefined;
    await user.save();
    
    // Send email with new password to the entered email address
    const emailResult = await sendPasswordResetEmail(
      email, // Use the email address that was entered
      user.username, 
      newPassword, 
      'Student'
    );
    
    if (emailResult.success) {
      res.json({ 
        success: true, 
        message: 'A new password has been generated and sent to your email address.'
      });
    } else if (emailResult.fallback) {
      // Email not configured - return password for testing
      console.log('Email not configured - returning password for testing');
      res.json({ 
        success: true, 
        message: 'A new password has been generated. Please check your email or contact support if you don\'t receive it.',
        newPassword: newPassword // Only for testing when email not configured
      });
    } else {
      // If email fails, still update password but notify user
      console.error('Email sending failed:', emailResult.error);
      res.json({ 
        success: true, 
        message: 'A new password has been generated. Please check your email or contact support if you don\'t receive it.'
      });
    }
  } catch (error) {
    console.error('Error in student forgot password:', error);
    res.status(500).json({ success: false, message: 'An error occurred while processing your request.' });
  }
});

// Add reset password endpoint (duplicate removed - using the one above)

// Student reset password endpoint
router.post('/student-reset-password', async (req, res) => {
  const { token, password } = req.body;
  const user = await Student.findOne({
    resetPasswordToken: token,
    resetPasswordExpires: { $gt: Date.now() }
  });
  if (!user) {
    return res.status(400).json({ success: false, message: 'Invalid or expired token.' });
  }
  user.password = await bcrypt.hash(password, 10);
  user.resetPasswordToken = undefined;
  user.resetPasswordExpires = undefined;
  await user.save();
  res.json({ success: true });
});

// Get users by role
router.get('/users', async (req, res) => {
  const role = req.query.role;
  if (role === 'teacher') {
    const teachers = await Teacher.find({}, 'username');
    return res.json(teachers.map(t => ({ username: t.username, role: 'teacher' })));
  } else if (role === 'student') {
    const students = await Student.find({}, 'username');
    return res.json(students.map(s => ({ username: s.username, role: 'student' })));
  } else if (role === 'admin') {
    const admins = await Admin.find({}, 'username');
    return res.json(admins.map(a => ({ username: a.username, role: 'admin' })));
  } else {
    return res.status(400).json({ success: false, message: 'Invalid role' });
  }
});

// Change user role (move between collections)
router.post('/user-role', async (req, res) => {
  const { username, fromRole, toRole } = req.body;
  if (!username || !fromRole || !toRole || fromRole === toRole) {
    return res.status(400).json({ success: false, message: 'Invalid request' });
  }
  let userDoc = null;
  if (fromRole === 'teacher') {
    userDoc = await Teacher.findOneAndDelete({ username });
  } else if (fromRole === 'student') {
    userDoc = await Student.findOneAndDelete({ username });
  } else if (fromRole === 'admin') {
    userDoc = await Admin.findOneAndDelete({ username });
  }
  if (!userDoc) {
    return res.status(404).json({ success: false, message: 'User not found' });
  }
  // Move to new collection
  if (toRole === 'teacher') {
    await Teacher.create({ username, password: userDoc.password });
  } else if (toRole === 'student') {
    await Student.create({ username, password: userDoc.password });
  } else if (toRole === 'admin') {
    await Admin.create({ username, password: userDoc.password });
  }
  res.json({ success: true });
});

// Migration endpoint to add hasGeneratedPassword field to all users
router.post('/migrate-generated-password-field', async (req, res) => {
  try {
    // Update all teachers
    const teacherResult = await Teacher.updateMany(
      { hasGeneratedPassword: { $exists: false } },
      { $set: { hasGeneratedPassword: false } }
    );
    
    // Update all students
    const studentResult = await Student.updateMany(
      { hasGeneratedPassword: { $exists: false } },
      { $set: { hasGeneratedPassword: false } }
    );
    
    // Update all admins
    const adminResult = await Admin.updateMany(
      { hasGeneratedPassword: { $exists: false } },
      { $set: { hasGeneratedPassword: false } }
    );
    
    res.json({ 
      success: true, 
      message: 'Migration completed',
      teachersUpdated: teacherResult.modifiedCount,
      studentsUpdated: studentResult.modifiedCount,
      adminsUpdated: adminResult.modifiedCount
    });
  } catch (error) {
    console.error('Migration error:', error);
    res.status(500).json({ success: false, message: 'Migration failed' });
  }
});

// Test endpoint to set hasGeneratedPassword flag for testing
router.post('/test-set-generated-password', async (req, res) => {
  try {
    const { username, userType } = req.body;
    
    let user;
    if (userType === 'teacher') {
      user = await Teacher.findOne({ username });
    } else if (userType === 'student') {
      user = await Student.findOne({ username });
    } else {
      return res.status(400).json({ success: false, message: 'Invalid user type' });
    }
    
    if (!user) {
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    
    user.hasGeneratedPassword = true;
    await user.save();
    
    res.json({ 
      success: true, 
      message: `hasGeneratedPassword flag set to true for ${username}` 
    });
  } catch (error) {
    console.error('Error setting generated password flag:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

// Change password endpoint
router.post('/change-password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword, userType } = req.body;
    const userId = req.user.teacherId || req.user.studentId; // Get the appropriate ID from token

    console.log('=== CHANGE PASSWORD ATTEMPT ===');
    console.log('User ID from token:', userId);
    console.log('User type:', userType);
    console.log('Request body:', { currentPassword: '***', newPassword: '***', userType });

    if (!currentPassword || !newPassword || !userType) {
      return res.status(400).json({ success: false, message: 'All fields are required' });
    }

    // Validate new password strength (no special characters required)
    const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)[A-Za-z\d]{8,}$/;
    if (!passwordRegex.test(newPassword)) {
      return res.status(400).json({ 
        success: false, 
        message: 'New password must be at least 8 characters long and contain uppercase, lowercase, and number' 
      });
    }

    let user;
    let UserModel;

    // Determine which model to use based on userType
    if (userType === 'teacher') {
      UserModel = Teacher;
    } else if (userType === 'student') {
      UserModel = Student;
    } else if (userType === 'admin') {
      UserModel = Admin;
    } else {
      return res.status(400).json({ success: false, message: 'Invalid user type' });
    }

    // Find user by the appropriate ID based on user type
    if (userType === 'teacher') {
      console.log('Looking for teacher with teacherId:', userId);
      user = await UserModel.findOne({ teacherId: userId });
    } else if (userType === 'student') {
      console.log('Looking for student with studentId:', userId);
      user = await UserModel.findOne({ _id: userId });
    } else if (userType === 'admin') {
      console.log('Looking for admin with adminId:', userId);
      user = await UserModel.findOne({ _id: userId });
    }
    console.log('User found:', !!user);
    if (!user) {
      console.log('User not found in database');
      return res.status(404).json({ success: false, message: 'User not found' });
    }
    console.log('User found successfully:', user.username);

    // Verify current password
    const isCurrentPasswordValid = await bcrypt.compare(currentPassword, user.password);
    if (!isCurrentPasswordValid) {
      return res.status(400).json({ success: false, message: 'Current password is incorrect' });
    }

    // Check if new password is same as current
    const isNewPasswordSame = await bcrypt.compare(newPassword, user.password);
    if (isNewPasswordSame) {
      return res.status(400).json({ success: false, message: 'New password must be different from current password' });
    }

    // Hash new password
    const hashedNewPassword = await bcrypt.hash(newPassword, 10);

    // Update password and clear the generated password flag
    user.password = hashedNewPassword;
    user.hasGeneratedPassword = false; // Clear the flag since user now has a personal password
    await user.save();

    res.json({ success: true, message: 'Password updated successfully' });

  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({ success: false, message: 'Internal server error' });
  }
});

module.exports = router; 