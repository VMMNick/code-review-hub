import { redisClient } from '../config/redis.js';
import { logger } from '../config/logger.js';

// Read-through cache helper on top of the existing Redis client (the same
// one already used for refresh-token sessions and the Socket.io adapter).
// Every call is defensive: if Redis is unreachable — local dev without
// `docker-compose up`, or a transient outage — we log once at `warn` and
// fall straight through to `fetchFn`, so a cache outage can never become an
// API outage, only a slower one.
export async function cached(key, ttlSeconds, fetchFn) {
  try {
    const hit = await redisClient.get(key);
    if (hit !== null) return JSON.parse(hit);
  } catch (err) {
    logger.warn({ err: err.message, key }, 'Cache read failed, falling back to source');
  }

  const value = await fetchFn();

  try {
    await redisClient.set(key, JSON.stringify(value), 'EX', ttlSeconds);
  } catch (err) {
    logger.warn({ err: err.message, key }, 'Cache write failed');
  }

  return value;
}

// Deletes one or more exact keys — cheap and precise when a mutation maps
// to a single known cache entry (e.g. one review row by id).
export async function invalidateKeys(...keys) {
  const targets = keys.filter(Boolean);
  if (targets.length === 0) return;
  try {
    await redisClient.del(...targets);
  } catch (err) {
    logger.warn({ err: err.message, keys: targets }, 'Cache invalidation failed');
  }
}

// Version-tagged keys let us invalidate an entire *family* of cache entries
// (every filter/page combination of a project's review list, or every page
// of a review's comment threads) in O(1) by bumping a counter, instead of
// tracking or SCANning every concrete key that was ever cached for that
// project/review. Bumping the version just makes older keys unreachable —
// they still expire on their own via TTL, so nothing needs active cleanup.
export async function bumpVersion(versionKey) {
  try {
    await redisClient.incr(versionKey);
  } catch (err) {
    logger.warn({ err: err.message, versionKey }, 'Cache version bump failed');
  }
}

export async function getVersion(versionKey) {
  try {
    const v = await redisClient.get(versionKey);
    return v ?? '0';
  } catch (err) {
    logger.warn({ err: err.message, versionKey }, 'Cache version read failed');
    return '0';
  }
}
