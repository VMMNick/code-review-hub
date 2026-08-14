import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

// enableOfflineQueue: false is the fix for a very slow-motion version of
// the crash bug fixed earlier. With the (default) offline queue enabled,
// any command issued while disconnected gets queued and retried up to
// maxRetriesPerRequest (20) times with increasing backoff before it finally
// rejects — measured locally at 40-110 SECONDS per request during a Redis
// outage. Our try/catch in cache.js/sessionCache.js/typingStore.js still
// caught the eventual rejection and fell back correctly, but only after
// that entire multi-second-to-multi-minute wait, making the app feel
// completely broken even though nothing crashed. With the queue disabled,
// a command issued while disconnected fails immediately (synchronously
// rejected), so the fallback to Postgres kicks in right away instead.
const clientOptions = { lazyConnect: false, enableOfflineQueue: false };

// A dedicated client per role: the Socket.io Redis adapter needs its own
// pub/sub connections (a subscribed connection can't run normal commands),
// so we keep those separate from the general-purpose cache client.
export const redisClient = new Redis(env.redisUrl, clientOptions);

export function createRedisClient() {
  return new Redis(env.redisUrl, clientOptions);
}

// ioredis retries a lost connection forever by default (desired — we want
// it to pick back up automatically whenever Redis comes back), but that
// means an extended outage — e.g. local dev without `docker-compose up`,
// Redis simply not running — fires an 'error' event roughly every 2
// seconds, indefinitely. Logging every single one floods the console with
// no new information after the first. This logs once when a client goes
// down, stays silent while it keeps retrying in the background, and logs
// once more on 'ready' if it actually recovers — so a real outage is still
// visible without drowning out everything else.
export function logRedisConnectionState(client, label) {
  let isDown = false;
  client.on('error', (err) => {
    if (isDown) return;
    isDown = true;
    logger.warn({ err: err.message }, `${label}: connection lost, retrying silently until reconnected`);
  });
  client.on('ready', () => {
    if (!isDown) return;
    isDown = false;
    logger.info(`${label}: reconnected`);
  });
}

logRedisConnectionState(redisClient, 'Redis');
