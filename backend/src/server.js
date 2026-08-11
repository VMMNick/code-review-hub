import http from 'node:http';
import { createApp } from './app.js';
import { createSocketServer } from './realtime/socketServer.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';
import { Sentry, isSentryEnabled } from './config/sentry.js';

// Redis is intentionally a soft dependency everywhere in this app (see
// utils/cache.js, config/redis.js, realtime/typingStore.js) — a Redis outage
// should degrade features, not take down the whole API. That guarantee has
// a hole third-party code can still fall through: @socket.io/redis-adapter
// issues its own Redis commands internally (e.g. a subscribe() call right
// when the adapter is attached, before any client ever connects) and, in
// practice, a rejected promise from that internal call surfaces here as an
// unhandled rejection — which crashes the entire Node process by default,
// not just the WS layer. Since every Redis-touching code path we own already
// catches its own errors (typingStore.js, cache.js, sessionCache via its
// callers), anything reaching this handler is, by construction, coming from
// somewhere we don't control the promise of — log it and keep running
// rather than taking the whole API down over what's meant to be a
// best-effort feature.
process.on('unhandledRejection', (err) => {
  logger.error({ err: err?.message ?? err }, 'Unhandled promise rejection (process kept running)');
  if (isSentryEnabled()) Sentry.captureException(err);
});

const app = createApp();
const httpServer = http.createServer(app);
createSocketServer(httpServer);

httpServer.listen(env.port, () => {
  logger.info(`API + WebSocket listening on http://localhost:${env.port}`);
  logger.info(`API docs at http://localhost:${env.port}/api/docs`);
});
