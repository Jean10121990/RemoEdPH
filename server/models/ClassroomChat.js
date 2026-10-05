const mongoose = require('mongoose');

/**
 * Live-class chat for one room, kept only until the class ends.
 * Deleted on Finish / end-session. The updatedAt TTL is a backstop so a class
 * that is never finished does not keep its chat forever.
 */
const classroomChatSchema = new mongoose.Schema(
  {
    room: { type: String, required: true, unique: true },
    messages: { type: [mongoose.Schema.Types.Mixed], default: [] },
    updatedAt: { type: Date, default: Date.now },
  },
  { collection: 'classroom_chats' }
);

classroomChatSchema.index({ updatedAt: 1 }, { expireAfterSeconds: 24 * 60 * 60 });

module.exports = mongoose.model('ClassroomChat', classroomChatSchema);
