import { redisClient } from '../config/redis.js';

// Caches "refresh token hash -> session" in Redis so /auth/refresh usually
// avoids a Postgres round trip. Postgres (refresh_tokens table) stays the
// source of truth for revocation; the cache is a best-effort speedup and is
// safe to lose (a cache miss just falls back to the DB in authController).
const KEY_PREFIX = 'session:refresh:';

function key(tokenHash) {
  return `${KEY_PREFIX}${tokenHash}`;
}

export async function cacheSession(tokenHash, session, ttlSeconds) {
  if (ttlSeconds <= 0) return;
  await redisClient.set(key(tokenHash), JSON.stringify(session), 'EX', ttlSeconds);
}

export async function getCachedSession(tokenHash) {
  const raw = await redisClient.get(key(tokenHash));
  return raw ? JSON.parse(raw) : null;
}

export async function invalidateSession(tokenHash) {
  await redisClient.del(key(tokenHash));
}
