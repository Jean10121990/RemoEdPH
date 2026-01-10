const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const Teacher = require('./models/Teacher');
const Student = require('./models/Student');

const JWT_SECRET = process.env.JWT_SECRET || 'your_jwt_secret';

// Middleware to verify JWT token
const verifyToken = (req, res, next) => {
  console.log('Verifying token...');
  console.log('Authorization header:', req.headers.authorization);
  
  const token = req.headers.authorization?.split(' ')[1] || req.body.token || req.query.token;
  console.log('Extracted token:', token ? 'Token found' : 'No token');
  
  if (!token) {
    console.log('No token provided');
    return res.status(401).json({ error: 'Access denied. No token provided.' });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    console.log('Token decoded successfully:', decoded);
    req.user = decoded;
    next();
  } catch (error) {
    console.log('Token verification failed:', error.message);
    console.log('JWT_SECRET used:', JWT_SECRET ? 'Secret exists' : 'No secret');
    return res.status(401).json({ error: 'Invalid token.' });
  }
};

// Middleware to ensure user is a teacher
const requireTeacher = async (req, res, next) => {
  try {
    console.log('requireTeacher middleware - req.user:', req.user);
    if (!req.user) {
      console.log('No req.user found in requireTeacher middleware');
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Try to resolve the teacher by multiple identifiers for robustness
    const orConditions = [];
    if (req.user.teacherId) {
      orConditions.push({ teacherId: req.user.teacherId });
      if (mongoose.isValidObjectId(req.user.teacherId)) {
        orConditions.push({ _id: req.user.teacherId });
      }
    }
    if (req.user.username) {
      orConditions.push({ username: req.user.username });
      orConditions.push({ email: req.user.username });
    }

    const teacher = await Teacher.findOne({ $or: orConditions });
    
    if (!teacher) {
      console.log('Teacher not found for identifiers:', {
        teacherId: req.user.teacherId,
        username: req.user.username
      });
      return res.status(403).json({ error: 'Access denied. Teacher privileges required.' });
    }

    req.teacher = teacher;
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Server error during authentication.' });
  }
};

// Middleware to ensure user is a student
const requireStudent = async (req, res, next) => {
  try {
    console.log('requireStudent middleware - req.user:', req.user);
    if (!req.user) {
      console.log('No req.user found in requireStudent middleware');
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Try to resolve the student by multiple identifiers for robustness
    const orConditions = [];
    if (req.user.studentId) {
      orConditions.push({ _id: req.user.studentId });
    }
    if (req.user.username) {
      orConditions.push({ username: req.user.username });
      orConditions.push({ email: req.user.username });
    }

    const student = await Student.findOne({ $or: orConditions });
    
    if (!student) {
      console.log('Student not found for identifiers:', {
        studentId: req.user.studentId,
        username: req.user.username
      });
      return res.status(403).json({ error: 'Access denied. Student privileges required.' });
    }

    req.student = student;
    next();
  } catch (error) {
    console.log('Error in requireStudent middleware:', error);
    console.log('Decoded user:', req.user);
    return res.status(500).json({ error: 'Server error during authentication.' });
  }
};

// Middleware to ensure teacher can only access their own data
const requireOwnTeacherData = async (req, res, next) => {
  try {
    const requestedTeacherId = req.params.teacherId || req.body.teacherId || req.query.teacherId;
    
    if (requestedTeacherId && requestedTeacherId !== req.user.teacherId) {
      return res.status(403).json({ error: 'Access denied. You can only access your own data.' });
    }
    
    next();
  } catch (error) {
    return res.status(500).json({ error: 'Server error during authorization.' });
  }
};

// Middleware to ensure student can only access their own data
const requireOwnStudentData = async (req, res, next) => {
  try {
    const requestedStudentId = req.params.studentId || req.body.studentId || req.query.studentId;
    
    if (requestedStudentId && requestedStudentId !== req.user.studentId) {
      return res.status(403).json({ error: 'Access denied. You can only access your own data.' });
    }
    
    next();
  } catch (error) {
    console.log('Decoded user:', req.user);
    return res.status(500).json({ error: 'Server error during authorization.' });
  }
};

// Middleware to ensure user is an admin
const requireAdmin = async (req, res, next) => {
  try {
    console.log('requireAdmin middleware - req.user:', req.user);
    if (!req.user) {
      console.log('No req.user found in requireAdmin middleware');
      return res.status(401).json({ error: 'Authentication required.' });
    }

    // Check if user is admin (you can customize this based on your admin identification)
    if (req.user.username === 'admin' || req.user.role === 'admin' || req.user.isAdmin) {
      req.admin = req.user;
      next();
    } else {
      console.log('User is not admin:', req.user.username);
      return res.status(403).json({ error: 'Access denied. Admin privileges required.' });
    }
  } catch (error) {
    return res.status(500).json({ error: 'Server error during authentication.' });
  }
};

// Middleware to log access attempts for security monitoring
const logAccess = (req, res, next) => {
  const timestamp = new Date().toISOString();
  const userType = req.user?.teacherId ? 'teacher' : req.user?.studentId ? 'student' : req.user?.username === 'admin' ? 'admin' : 'unknown';
  const userId = req.user?.teacherId || req.user?.studentId || req.user?.username || 'unknown';
  const endpoint = req.originalUrl;
  const method = req.method;
  
  console.log(`[${timestamp}] ${method} ${endpoint} - User: ${userType}:${userId} - IP: ${req.ip}`);
  next();
};

module.exports = {
  verifyToken,
  requireTeacher,
  requireStudent,
  requireAdmin,
  requireOwnTeacherData,
  requireOwnStudentData,
  logAccess
}; 