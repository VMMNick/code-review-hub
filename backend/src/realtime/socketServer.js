import { Server } from 'socket.io';
import { verifyAccessToken } from '../utils/tokens.js';
import { getReviewOrThrow } from '../controllers/reviewController.js';
import { env } from '../config/env.js';
import { setIo, reviewRoom } from './ioRegistry.js';

// In-memory "who is typing where" per review, keyed by review id then socket
// id. Good enough for a single process; horizontal scaling (multiple
// WS servers) needs this moved to Redis pub/sub — that's Тиждень 6.
const typingByReview = new Map(); // reviewId -> Map<socketId, { userId, name, lineNumber }>

function broadcastTyping(io, reviewId) {
  const typists = typingByReview.get(reviewId);
  const list = typists ? Array.from(typists.values()) : [];
  io.to(reviewRoom(reviewId)).emit('typing:update', { reviewId, typists: list });
}

function clearTyping(io, reviewId, socketId) {
  const typists = typingByReview.get(reviewId);
  if (!typists || !typists.has(socketId)) return;
  typists.delete(socketId);
  if (typists.size === 0) typingByReview.delete(reviewId);
  broadcastTyping(io, reviewId);
}

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigin, credentials: true }
  });

  // Handshake auth: client sends the JWT access token, not a cookie/header,
  // since Socket.io's transport doesn't reuse the axios interceptor.
  io.use((socket, next) => {
    try {
      const token = socket.handshake.auth?.token;
      if (!token) throw new Error('Missing token');
      const payload = verifyAccessToken(token);
      socket.user = { id: payload.sub, role: payload.role, email: payload.email, name: payload.name };
      next();
    } catch {
      next(new Error('Unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    // A socket only ever sits in one review room at a time in this UI, so
    // track it here instead of asking the client to send reviewId on every event.
    let currentReviewId = null;

    socket.on('review:join', async (reviewId, ack) => {
      try {
        await getReviewOrThrow(reviewId, socket.user.id); // throws if no access
        if (currentReviewId && currentReviewId !== reviewId) {
          socket.leave(reviewRoom(currentReviewId));
          clearTyping(io, currentReviewId, socket.id);
        }
        currentReviewId = reviewId;
        socket.join(reviewRoom(reviewId));
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, error: 'Access denied' });
      }
    });

    socket.on('review:leave', () => {
      if (!currentReviewId) return;
      socket.leave(reviewRoom(currentReviewId));
      clearTyping(io, currentReviewId, socket.id);
      currentReviewId = null;
    });

    socket.on('typing:start', ({ lineNumber } = {}) => {
      if (!currentReviewId) return;
      if (!typingByReview.has(currentReviewId)) typingByReview.set(currentReviewId, new Map());
      typingByReview.get(currentReviewId).set(socket.id, {
        userId: socket.user.id,
        name: socket.user.name ?? socket.user.email,
        lineNumber: lineNumber ?? null
      });
      broadcastTyping(io, currentReviewId);
    });

    socket.on('typing:stop', () => {
      if (!currentReviewId) return;
      clearTyping(io, currentReviewId, socket.id);
    });

    socket.on('disconnect', () => {
      if (currentReviewId) clearTyping(io, currentReviewId, socket.id);
    });
  });

  setIo(io);
  return io;
}
