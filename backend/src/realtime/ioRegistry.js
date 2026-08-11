// Simple module-level singleton so REST controllers (which don't have a
// reference to the Socket.io server) can broadcast events after writing to
// the DB, e.g. commentController emitting 'comment:new' after INSERT.
let ioInstance = null;

export function setIo(io) {
  ioInstance = io;
}

export function getIo() {
  return ioInstance;
}

export function reviewRoom(reviewId) {
  return `review:${reviewId}`;
}

// Every socket auto-joins its own user room on connect (see socketServer.js)
// so notifications can be pushed to "whoever is user X, on any tab/device"
// without tracking individual socket ids.
export function userRoom(userId) {
  return `user:${userId}`;
}
