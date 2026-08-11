import { redisClient } from '../config/redis.js';
import { logger } from '../config/logger.js';

// "Who is typing where" lives in Redis instead of process memory so it's
// shared across every WS server instance behind the load balancer — a
// browser connected to server A needs to see typing from a user on server B.
function typingKey(reviewId) {
  return `typing:${reviewId}`;
}

// Every function here is called directly from Socket.io event listeners in
// socketServer.js (`socket.on('typing:start', async (...) => { await
// setTyping(...) })`), and Socket.io does not catch rejections from async
// listeners — an uncaught rejection there becomes an unhandled promise
// rejection, which crashes the entire Node process by default (not just
// this feature). If Redis is unreachable, ioredis retries a queued command
// up to `maxRetriesPerRequest` times and then rejects with
// MaxRetriesPerRequestError; without a try/catch here, that one rejected
// promise used to take the whole API down, not just typing indicators. Each
// function now degrades to a no-op/empty result and logs a warning instead.
export async function setTyping(reviewId, socketId, data) {
  try {
    await redisClient.hset(typingKey(reviewId), socketId, JSON.stringify(data));
    // Self-heal safety net: if a process crashes without ever emitting
    // 'disconnect', this entry would otherwise linger forever. Refreshing a
    // short TTL on every keystroke means an abandoned hash disappears a few
    // seconds after the last activity in that review.
    await redisClient.expire(typingKey(reviewId), 10);
  } catch (err) {
    logger.warn({ err: err.message, reviewId }, 'Failed to record typing state (Redis unavailable?)');
  }
}

export async function clearTyping(reviewId, socketId) {
  try {
    await redisClient.hdel(typingKey(reviewId), socketId);
  } catch (err) {
    logger.warn({ err: err.message, reviewId }, 'Failed to clear typing state (Redis unavailable?)');
  }
}

export async function getTypists(reviewId) {
  try {
    const raw = await redisClient.hgetall(typingKey(reviewId));
    return Object.values(raw).map((v) => JSON.parse(v));
  } catch (err) {
    logger.warn({ err: err.message, reviewId }, 'Failed to read typing state (Redis unavailable?)');
    return [];
  }
}
