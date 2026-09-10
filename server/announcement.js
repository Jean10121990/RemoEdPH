const express = require('express');
const router = express.Router();

const Announcement = require('./models/Announcement');
const { verifyAdminApiAuth, requireAdmin } = require('./authMiddleware');

// Get announcements (optionally filtered by role) — public read for portal dashboards
router.get('/announcement', async (req, res) => {
  try {
    const role = req.query.role;
    let filter = {};
    if (role === 'teacher') {
      // Teachers see all-users + teachers-only (not students-only or admins-only)
      filter = { $or: [ { role: 'admin' }, { role: 'teacher' } ] };
    } else if (role === 'student') {
      filter = { $or: [ { role: 'admin' }, { role: 'student' } ] };
    } else if (role === 'admin') {
      // Admins see all-users + admins-only (and may also see scoped posts when managing)
      filter = { $or: [ { role: 'admin' }, { role: 'admins' }, { role: 'teacher' }, { role: 'student' } ] };
    }
    const anns = await Announcement.find(filter).sort({ updatedAt: -1 });
    
    // Transform the data to include audience field for frontend compatibility
    const transformedAnns = anns.map(ann => ({
      ...ann.toObject(),
      audience: audienceFromRole(ann.role)
    }));
    
    res.json(transformedAnns);
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ success: false, message: 'Error fetching announcements' });
  }
});

function audienceFromRole(role) {
  if (role === 'admin') return 'all'; // legacy: admin role meant all users
  if (role === 'admins') return 'admins';
  if (role === 'teacher') return 'teachers';
  if (role === 'student') return 'students';
  return role;
}

function roleFromAudience(audience) {
  if (audience === 'teachers') return 'teacher';
  if (audience === 'students') return 'student';
  if (audience === 'all') return 'admin'; // legacy mapping
  if (audience === 'admins') return 'admins';
  return null;
}

// Post new announcement (admin only)
router.post('/announcement', verifyAdminApiAuth, requireAdmin, async (req, res) => {
  try {
    const { content, audience } = req.body;
    if (!content || !audience) {
      return res.status(400).json({ success: false, message: 'Content and audience required' });
    }
    
    const role = roleFromAudience(audience);
    if (!role) {
      return res.status(400).json({ success: false, message: 'Invalid audience' });
    }
    
    const ann = new Announcement({ content, role, updatedAt: new Date() });
    await ann.save();
    
    // Create notifications for teachers / students based on audience
    try {
      const { notifyTeacher, notifyStudent } = require('./services/notifyService');
      const Teacher = require('./models/Teacher');
      const Student = require('./models/Student');
      const preview = `New announcement: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`;

      if (audience === 'teachers' || audience === 'all') {
        const teachers = await Teacher.find({}).select('teacherId').lean();
        for (const teacher of teachers) {
          if (!teacher.teacherId) continue;
          await notifyTeacher(teacher.teacherId, 'announcement', preview, {
            actionUrl: '/teacher-dashboard.html',
          });
        }
      }

      if (audience === 'students' || audience === 'all') {
        const students = await Student.find({}).select('username').limit(5000).lean();
        for (const student of students) {
          if (!student.username) continue;
          await notifyStudent(student.username, 'announcement', preview, {
            actionUrl: '/student-dashboard.html',
          });
        }
      }
    } catch (error) {
      console.error('Error creating announcement notifications:', error);
    }
    
    res.json({ success: true, announcement: { ...ann.toObject(), audience: audienceFromRole(ann.role) } });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ success: false, message: 'Error creating announcement' });
  }
});

// Update existing announcement (admin only)
router.put('/announcement/:id', verifyAdminApiAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const { content, audience } = req.body;

    if (!content || !audience) {
      return res.status(400).json({ success: false, message: 'Content and audience required' });
    }

    const role = roleFromAudience(audience);
    if (!role) {
      return res.status(400).json({ success: false, message: 'Invalid audience' });
    }

    const updated = await Announcement.findByIdAndUpdate(
      id,
      { content, role, updatedAt: new Date() },
      { new: true }
    );

    if (!updated) {
      return res.status(404).json({ success: false, message: 'Announcement not found' });
    }

    res.json({ success: true, announcement: { ...updated.toObject(), audience: audienceFromRole(updated.role) } });
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({ success: false, message: 'Error updating announcement' });
  }
});

// Delete announcement (admin only) - POST for robustness
router.post('/announcement/delete', verifyAdminApiAuth, requireAdmin, async (req, res) => {
  try {
    const { id } = req.body;

    if (!id) {
      return res.status(400).json({ success: false, message: 'Missing announcement id' });
    }

    const deleted = await Announcement.findByIdAndDelete(id);

    if (!deleted) {
      return res.status(404).json({ success: false, message: 'Announcement not found or already deleted' });
    }

    res.json({ success: true });
  } catch (error) {
    console.error('Error deleting announcement:', error);
    res.status(500).json({
      success: false,
      message:
        process.env.NODE_ENV === 'production'
          ? 'Error deleting announcement'
          : String(error && error.message ? error.message : 'Error deleting announcement'),
    });
  }
});

module.exports = router;
