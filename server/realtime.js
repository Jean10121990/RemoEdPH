/**
 * Socket.IO bridge — avoids circular require(index ↔ teacher routes).
 * index.js calls setIo(io) after creating the Server; routes use emitAll.
 */
let ioInstance = null;

function setIo(io) {
  ioInstance = io;
}

function emitAll(event, payload) {
  try {
    if (ioInstance) ioInstance.emit(event, payload);
  } catch (e) {
    console.error('realtime emitAll error:', event, e);
  }
}

function emitToRoom(room, event, payload) {
  try {
    if (ioInstance && room) ioInstance.to(room).emit(event, payload);
  } catch (e) {
    console.error('realtime emitToRoom error:', event, e);
  }
}

function getIo() {
  return ioInstance;
}

module.exports = { setIo, emitAll, emitToRoom, getIo };
