# Lessons Library Database Collections

## Collections Created Automatically

When you use the lesson models, MongoDB automatically creates these collections (pluralized and lowercased):

1. **`curricula`** - Stores curriculum information
   - Fields: title, description, level, order, isActive, createdBy, createdAt
   - Levels: nursery, kinder, preparatory, elementary, intermediate, advanced

2. **`lessons`** - Stores individual lessons within curricula
   - Fields: curriculumId (ref), title, description, lessonNumber, order, estimatedDuration, isActive, createdBy
   - Linked to curricula via curriculumId

3. **`lessonfiles`** - Stores permanent lesson files (cannot be deleted)
   - Fields: curriculumId, lessonId, fileName, fileType, fileSize, fileData (base64), uploadedBy, isPermanent
   - These are permanent digital library files

4. **`lessonprogresses`** - Tracks student progress through lessons
   - Fields: studentId, lessonId, curriculumId, bookingId, status, completedAt, teacherId, notes
   - Status: not_started, in_progress, completed

## API Endpoints

All endpoints are under `/api/lessons`:

- `GET /api/lessons/curricula` - Get all curricula
- `GET /api/lessons/curriculum/:curriculumId/lessons` - Get lessons for a curriculum
- `GET /api/lessons/lesson/:lessonId/files` - Get files for a lesson
- `GET /api/lessons/lesson-file/:fileId` - Get a specific file with data
- `POST /api/lessons/lesson/:lessonId/upload-file` - Upload lesson file (teacher only)
- `GET /api/lessons/progress/:studentId` - Get student's lesson progress
- `POST /api/lessons/progress/update` - Update lesson progress (teacher only)
- `GET /api/lessons/curriculum/:curriculumId/full` - Get full curriculum with lessons and progress

## Initializing the Database

To create sample data, run:

```bash
node server/seed-lessons.js
```

This will create:
- 3 sample curricula (nursery, kinder, preparatory)
- 5 lessons for each curriculum (15 total lessons)

## Collections in MongoDB

You can verify the collections exist by checking MongoDB Compass or running:

```javascript
// In MongoDB shell or Compass
use online-distance-learning
show collections
```

You should see:
- curricula
- lessons
- lessonfiles
- lessonprogresses

