import { Server } from 'socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { verifyAccessToken } from '../utils/tokens.js';
import { getReviewOrThrow } from '../controllers/reviewController.js';
import { env } from '../config/env.js';
import { createRedisClient } from '../config/redis.js';
import { setIo, reviewRoom } from './ioRegistry.js';
import { setTyping, clearTyping, getTypists } from './typingStore.js';

async function broadcastTyping(io, reviewId) {
  const typists = await getTypists(reviewId);
  io.to(reviewRoom(reviewId)).emit('typing:update', { reviewId, typists });
}

async function stopTyping(io, reviewId, socketId) {
  await clearTyping(reviewId, socketId);
  await broadcastTyping(io, reviewId);
}

export function createSocketServer(httpServer) {
  const io = new Server(httpServer, {
    cors: { origin: env.corsOrigin, credentials: true }
  });

  // The Redis adapter fans io.to(room).emit(...) out across every WS server
  // instance via pub/sub, so 'comment:new' and 'typing:update' reach clients
  // regardless of which process they're connected to. A subscribed Redis
  // connection can't run other commands, so pub/sub gets its own two
  // connections separate from the general-purpose cache client.
  const pubClient = createRedisClient();
  const subClient = pubClient.duplicate();
  io.adapter(createAdapter(pubClient, subClient));

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
          await stopTyping(io, currentReviewId, socket.id);
        }
        currentReviewId = reviewId;
        socket.join(reviewRoom(reviewId));
        ack?.({ ok: true });
      } catch {
        ack?.({ ok: false, error: 'Access denied' });
      }
    });

    socket.on('review:leave', async () => {
      if (!currentReviewId) return;
      socket.leave(reviewRoom(currentReviewId));
      await stopTyping(io, currentReviewId, socket.id);
      currentReviewId = null;
    });

    socket.on('typing:start', async ({ lineNumber } = {}) => {
      if (!currentReviewId) return;
      await setTyping(currentReviewId, socket.id, {
        userId: socket.user.id,
        name: socket.user.name ?? socket.user.email,
        lineNumber: lineNumber ?? null
      });
      await broadcastTyping(io, currentReviewId);
    });

    socket.on('typing:stop', async () => {
      if (!currentReviewId) return;
      await stopTyping(io, currentReviewId, socket.id);
    });

    socket.on('disconnect', async () => {
      if (currentReviewId) await stopTyping(io, currentReviewId, socket.id);
    });
  });

  setIo(io);
  return io;
}
