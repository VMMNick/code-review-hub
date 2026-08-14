import { redisClient } from '../config/redis.js';
import { logger } from '../config/logger.js';

// Caches "refresh token hash -> session" in Redis so /auth/refresh usually
// avoids a Postgres round trip. Postgres (refresh_tokens table) stays the
// source of truth for revocation; the cache is a best-effort speedup and is
// safe to lose (a cache miss just falls back to the DB in authController).
//
// Every function below swallows Redis errors instead of letting them
// propagate: authController awaits these directly inside register/login/
// refresh/logout, so an uncaught rejection here would turn a perfectly
// valid login into a 500 whenever Redis is unavailable, even though
// Postgres (the source of truth) succeeded. Same "degrade, don't crash"
// rule already applied to cache.js and typingStore.js.
const KEY_PREFIX = 'session:refresh:';

function key(tokenHash) {
  return `${KEY_PREFIX}${tokenHash}`;
}

export async function cacheSession(tokenHash, session, ttlSeconds) {
  if (ttlSeconds <= 0) return;
  try {
    await redisClient.set(key(tokenHash), JSON.stringify(session), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err: err.message }, 'sessionCache: cacheSession failed, continuing without cache');
  }
}

export async function getCachedSession(tokenHash) {
  try {
    const raw = await redisClient.get(key(tokenHash));
    return raw ? JSON.parse(raw) : null;
  } catch (err) {
    logger.warn({ err: err.message }, 'sessionCache: getCachedSession failed, falling back to database');
    return null;
  }
}

export async function invalidateSession(tokenHash) {
  try {
    await redisClient.del(key(tokenHash));
  } catch (err) {
    logger.warn({ err: err.message }, 'sessionCache: invalidateSession failed, continuing');
  }
}
