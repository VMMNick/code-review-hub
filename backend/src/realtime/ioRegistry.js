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
