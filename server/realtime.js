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

function socketRole(sock) {
  return String((sock && sock.userType) || '').toLowerCase();
}

function isClassroomObserver(sock) {
  return socketRole(sock) === 'observer';
}

function classroomPeerSockets(room) {
  if (!ioInstance || !room) return [];
  const ids = ioInstance.sockets.adapter.rooms.get(room);
  const peers = [];
  if (!ids) return peers;
  ids.forEach((id) => {
    const sock = ioInstance.sockets.sockets.get(id);
    if (sock && !isClassroomObserver(sock)) peers.push(sock);
  });
  return peers;
}

function emitToClassroomPeers(room, event, payload, exceptId) {
  classroomPeerSockets(room).forEach((sock) => {
    if (exceptId && sock.id === exceptId) return;
    try {
      sock.emit(event, payload);
    } catch (_e) {}
  });
}

/** Camera signaling stays between the current teacher tab and the current student tab. */
function emitToOppositeRole(room, socket, event, payload) {
  const role = socketRole(socket);
  const targetRole = role === 'teacher' ? 'student' : role === 'student' ? 'teacher' : '';
  if (!targetRole) return;
  const peers = classroomPeerSockets(room).filter((sock) => socketRole(sock) === targetRole);
  const target = peers[peers.length - 1];
  if (!target) return;
  try {
    target.emit(event, payload);
  } catch (_e) {}
}

function latestTeacherAndStudent(room) {
  let teacher = null;
  let student = null;
  classroomPeerSockets(room).forEach((sock) => {
    const role = socketRole(sock);
    if (role === 'teacher') teacher = sock;
    if (role === 'student') student = sock;
  });
  if (!teacher || !student) return [];
  return [teacher, student];
}

/** Drop an older tab of the same role so it cannot keep the camera or answer the call. */
function releaseOlderSameRole(room, socket) {
  const role = socketRole(socket);
  if (role !== 'teacher' && role !== 'student') return;
  classroomPeerSockets(room).forEach((sock) => {
    if (sock.id === socket.id || socketRole(sock) !== role) return;
    try {
      sock.emit('classroom-replaced', { room });
      sock.disconnect(true);
    } catch (_e) {}
  });
}

function emitClassroomPairReady(room) {
  latestTeacherAndStudent(room).forEach((sock) => {
    try {
      sock.emit('ready');
    } catch (_e) {}
  });
}

/** Teacher and student only. An observer join must not start or steal the call. */
function noteClassroomPeerJoined(room, socket) {
  if (!socket || !room || isClassroomObserver(socket)) return;
  releaseOlderSameRole(room, socket);
  const peers = classroomPeerSockets(room);
  if (peers.length <= 1) {
    socket.emit('joined');
    return;
  }
  const pair = latestTeacherAndStudent(room);
  if (pair.length === 2) {
    emitClassroomPairReady(room);
    socket.to(room).emit('user-joined', {
      userType: socket.userType,
      userId: socket.userId,
      username: socket.username,
      room,
    });
  }
}

const peerReadyTimers = new Map();

function schedulePeerReady(room) {
  if (!room || peerReadyTimers.has(room)) return;
  const timer = setTimeout(() => {
    peerReadyTimers.delete(room);
    emitClassroomPairReady(room);
  }, 2000);
  peerReadyTimers.set(room, timer);
}

module.exports = {
  setIo,
  emitAll,
  emitToRoom,
  getIo,
  isClassroomObserver,
  emitToClassroomPeers,
  emitToOppositeRole,
  noteClassroomPeerJoined,
  schedulePeerReady,
};
