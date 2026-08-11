import http from 'node:http';
import { createApp } from './app.js';
import { createSocketServer } from './realtime/socketServer.js';
import { env } from './config/env.js';
import { logger } from './config/logger.js';

const app = createApp();
const httpServer = http.createServer(app);
createSocketServer(httpServer);

httpServer.listen(env.port, () => {
  logger.info(`API + WebSocket listening on http://localhost:${env.port}`);
  logger.info(`API docs at http://localhost:${env.port}/api/docs`);
});
