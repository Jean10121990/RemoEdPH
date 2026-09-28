const express = require('express');
const router = express.Router();

const Announcement = require('./models/Announcement');
const { verifyAdminApiAuth, requireAdmin } = require('./authMiddleware');

// Get announcements (optionally filtered by role) — public read for portal dashboards
router.get('/announcement', async (req, res) => {
  try {
    const role = req.query.role;
    const topic = req.query.topic ? String(req.query.topic).trim() : '';
    const clauses = [];
    if (topic && ANNOUNCEMENT_TOPICS.has(topic)) {
      if (topic === 'others') {
        clauses.push({
          $or: [{ topic: 'others' }, { topic: null }, { topic: { $exists: false } }],
        });
      } else {
        clauses.push({ topic });
      }
    }
    if (role === 'teacher') {
      clauses.push({ $or: [{ role: 'admin' }, { role: 'teacher' }] });
    } else if (role === 'student') {
      clauses.push({ $or: [{ role: 'admin' }, { role: 'student' }] });
    } else if (role === 'admin') {
      clauses.push({
        $or: [{ role: 'admin' }, { role: 'admins' }, { role: 'teacher' }, { role: 'student' }],
      });
    }
    const filter = clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0] : { $and: clauses };
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

const ANNOUNCEMENT_TOPICS = new Set([
  'family-day',
  'teachers-day',
  'students-day',
  'feeding-program',
  'waste-management',
  'mental-health',
  'sustainability',
  'others',
]);

function normalizeTopic(raw) {
  const topic = String(raw || 'others').trim();
  return ANNOUNCEMENT_TOPICS.has(topic) ? topic : null;
}

// Post new announcement (admin only)
router.post('/announcement', verifyAdminApiAuth, requireAdmin, async (req, res) => {
  try {
    const { content, audience, topic: topicRaw, topicOther: topicOtherRaw } = req.body;
    if (!content || !audience) {
      return res.status(400).json({ success: false, message: 'Content and audience required' });
    }
    
    const role = roleFromAudience(audience);
    if (!role) {
      return res.status(400).json({ success: false, message: 'Invalid audience' });
    }
    const topic = normalizeTopic(topicRaw || 'others');
    if (!topic) {
      return res.status(400).json({ success: false, message: 'Invalid announcement topic' });
    }
    const topicOther = topic === 'others' ? String(topicOtherRaw || '').trim().slice(0, 80) : '';
    if (topic === 'others' && !topicOther) {
      return res.status(400).json({ success: false, message: 'Enter a name for Other announcements' });
    }
    
    const ann = new Announcement({ content, role, topic, topicOther, updatedAt: new Date() });
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
    const { content, audience, topic: topicRaw, topicOther: topicOtherRaw } = req.body;

    if (!content || !audience) {
      return res.status(400).json({ success: false, message: 'Content and audience required' });
    }

    const role = roleFromAudience(audience);
    if (!role) {
      return res.status(400).json({ success: false, message: 'Invalid audience' });
    }
    const topic = normalizeTopic(topicRaw || 'others');
    if (!topic) {
      return res.status(400).json({ success: false, message: 'Invalid announcement topic' });
    }
    const topicOther = topic === 'others' ? String(topicOtherRaw || '').trim().slice(0, 80) : '';
    if (topic === 'others' && !topicOther) {
      return res.status(400).json({ success: false, message: 'Enter a name for Other announcements' });
    }

    const updated = await Announcement.findByIdAndUpdate(
      id,
      { content, role, topic, topicOther, updatedAt: new Date() },
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
