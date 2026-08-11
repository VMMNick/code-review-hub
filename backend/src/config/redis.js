import Redis from 'ioredis';
import { env } from './env.js';
import { logger } from './logger.js';

// A dedicated client per role: the Socket.io Redis adapter needs its own
// pub/sub connections (a subscribed connection can't run normal commands),
// so we keep those separate from the general-purpose cache client.
export const redisClient = new Redis(env.redisUrl, { lazyConnect: false });

export function createRedisClient() {
  return new Redis(env.redisUrl, { lazyConnect: false });
}

redisClient.on('error', (err) => {
  logger.error({ err: err.message }, 'Redis error');
});
