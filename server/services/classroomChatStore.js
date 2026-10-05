'use strict';

/**
 * Persist live-class chat so a refresh (or a server restart) still shows it,
 * then delete the room when the class is finished. Teacher/admin Messages are a
 * different store and are not touched here.
 */
const ClassroomChat = require('../models/ClassroomChat');

const MAX_MESSAGES = 50;

async function loadRoom(room) {
  const roomId = String(room || '').trim();
  if (!roomId) return [];
  const doc = await ClassroomChat.findOne({ room: roomId }).lean();
  return doc && Array.isArray(doc.messages) ? doc.messages.slice(-MAX_MESSAGES) : [];
}

async function saveRoom(room, messages) {
  const roomId = String(room || '').trim();
  if (!roomId) return;
  const list = (Array.isArray(messages) ? messages : []).slice(-MAX_MESSAGES);
  await ClassroomChat.updateOne(
    { room: roomId },
    { $set: { messages: list, updatedAt: new Date() } },
    { upsert: true }
  );
}

async function deleteRoom(room) {
  const roomId = String(room || '').trim();
  if (!roomId) return;
  await ClassroomChat.deleteOne({ room: roomId });
}

module.exports = { loadRoom, saveRoom, deleteRoom, MAX_MESSAGES };
