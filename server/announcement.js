const express = require('express');
const router = express.Router();

// Import Announcement model
const Announcement = require('./models/Announcement');

// Get announcements (optionally filtered by role)
router.get('/announcement', async (req, res) => {
  try {
    const role = req.query.role;
    let filter = {};
    if (role === 'teacher') {
      filter = { $or: [ { role: 'admin' }, { role: 'teacher' } ] };
    } else if (role === 'student') {
      filter = { $or: [ { role: 'admin' }, { role: 'student' } ] };
    }
    const anns = await Announcement.find(filter).sort({ updatedAt: -1 });
    
    // Transform the data to include audience field for frontend compatibility
    const transformedAnns = anns.map(ann => ({
      ...ann.toObject(),
      audience: ann.role === 'admin' ? 'all' : ann.role + 's' // 'admin' -> 'all', 'teacher' -> 'teachers', 'student' -> 'students'
    }));
    
    res.json(transformedAnns);
  } catch (error) {
    console.error('Error fetching announcements:', error);
    res.status(500).json({ success: false, message: 'Error fetching announcements' });
  }
});

// Post new announcement (admin only)
router.post('/announcement', async (req, res) => {
  try {
    const { content, audience } = req.body;
    // (In production, check admin token here)
    if (!content || !audience) {
      return res.status(400).json({ success: false, message: 'Content and audience required' });
    }
    
    // Map audience to role for the database
    let role;
    if (audience === 'teachers') {
      role = 'teacher';
    } else if (audience === 'students') {
      role = 'student';
    } else if (audience === 'all') {
      role = 'admin'; // For all users, we'll use admin role
    } else {
      return res.status(400).json({ success: false, message: 'Invalid audience' });
    }
    
    const ann = new Announcement({ content, role, updatedAt: new Date() });
    await ann.save();
    
    // Create notifications for teachers if announcement is for teachers or all
    if (audience === 'teachers' || audience === 'all') {
      try {
        const Notification = require('./models/Notification');
        const Teacher = require('./models/Teacher');
        const teachers = await Teacher.find({});
        
        for (const teacher of teachers) {
          await Notification.create({
            teacherId: teacher._id.toString(),
            type: 'announcement',
            message: `New announcement: "${content.substring(0, 50)}${content.length > 50 ? '...' : ''}"`,
            read: false
          });
        }
      } catch (error) {
        console.error('Error creating announcement notifications:', error);
      }
    }
    
    res.json({ success: true, announcement: ann });
  } catch (error) {
    console.error('Error creating announcement:', error);
    res.status(500).json({ success: false, message: 'Error creating announcement' });
  }
});

// Update existing announcement (admin only)
router.put('/announcement/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const { content, audience } = req.body;

    if (!content || !audience) {
      return res.status(400).json({ success: false, message: 'Content and audience required' });
    }

    // Map audience back to role
    let role;
    if (audience === 'teachers') {
      role = 'teacher';
    } else if (audience === 'students') {
      role = 'student';
    } else if (audience === 'all') {
      role = 'admin';
    } else {
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

    res.json({ success: true, announcement: updated });
  } catch (error) {
    console.error('Error updating announcement:', error);
    res.status(500).json({ success: false, message: 'Error updating announcement' });
  }
});

// Delete announcement (admin only) - POST for robustness
router.post('/announcement/delete', async (req, res) => {
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
    res.status(500).json({ success: false, message: error.message || 'Error deleting announcement' });
  }
});

module.exports = router;
