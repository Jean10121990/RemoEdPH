# Database Collections in `online-distance-learning`

## Existing Collections (Before Lessons Library)

1. **admins** - Admin users
2. **announcements** - System announcements
3. **bookings** - Class bookings
4. **cancellationrequests** - Cancellation requests
5. **feedbacks** - Student feedback
6. **files** - General file storage
7. **globalsettings** - Global system settings
8. **issuereports** - Issue reports
9. **notifications** - User notifications
10. **rewards** - Reward system
11. **students** - Student accounts
12. **studentnotifications** - Student-specific notifications
13. **teachers** - Teacher accounts
14. **teacherslots** - Teacher time slots
15. **timelogs** - Time logging

## New Collections Added (Lessons Library)

16. **curriculums** - Curriculum/lesson plans by level
    - Stores curriculum information (nursery, kinder, preparatory, etc.)
    - Currently has 3 sample curricula

17. **lessons** - Individual lessons within curricula
    - Linked to curricula via `curriculumId`
    - Currently has 15 sample lessons (5 per curriculum)

18. **lessonfiles** - Permanent lesson files (digital library)
    - Stores PDFs, PPTs, images, videos, etc.
    - Files cannot be deleted (isPermanent: true)
    - Currently empty (ready for file uploads)

19. **lessonprogresses** - Student lesson progress tracking
    - Tracks which lessons students have completed
    - Links to bookings and teachers
    - Currently empty (will be populated as students complete lessons)

## Integration Status

✅ **All collections are in the same database**: `online-distance-learning`
✅ **Models use the same database connection**: Via `server/db.js`
✅ **No conflicts**: New collections don't interfere with existing ones
✅ **Data populated**: Sample curricula and lessons already created

## Collection Names

Mongoose automatically pluralizes model names:
- `Curriculum` model → `curriculums` collection
- `Lesson` model → `lessons` collection
- `LessonFile` model → `lessonfiles` collection
- `LessonProgress` model → `lessonprogresses` collection

## Verification

To verify collections exist, run:
```bash
node -e "const mongoose = require('mongoose'); mongoose.connect('mongodb://localhost:27017/online-distance-learning').then(async () => { const db = mongoose.connection.db; const collections = await db.listCollections().toArray(); console.log('Collections:', collections.map(c => c.name).sort().join(', ')); mongoose.disconnect(); });"
```

