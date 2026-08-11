import { redisClient } from '../config/redis.js';

// "Who is typing where" lives in Redis instead of process memory so it's
// shared across every WS server instance behind the load balancer — a
// browser connected to server A needs to see typing from a user on server B.
function typingKey(reviewId) {
  return `typing:${reviewId}`;
}

export async function setTyping(reviewId, socketId, data) {
  await redisClient.hset(typingKey(reviewId), socketId, JSON.stringify(data));
  // Self-heal safety net: if a process crashes without ever emitting
  // 'disconnect', this entry would otherwise linger forever. Refreshing a
  // short TTL on every keystroke means an abandoned hash disappears a few
  // seconds after the last activity in that review.
  await redisClient.expire(typingKey(reviewId), 10);
}

export async function clearTyping(reviewId, socketId) {
  await redisClient.hdel(typingKey(reviewId), socketId);
}

export async function getTypists(reviewId) {
  const raw = await redisClient.hgetall(typingKey(reviewId));
  return Object.values(raw).map((v) => JSON.parse(v));
}
