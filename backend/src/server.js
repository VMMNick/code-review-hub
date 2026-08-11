import http from 'node:http';
import { createApp } from './app.js';
import { createSocketServer } from './realtime/socketServer.js';
import { env } from './config/env.js';

const app = createApp();
const httpServer = http.createServer(app);
createSocketServer(httpServer);

httpServer.listen(env.port, () => {
  console.log(`API + WebSocket listening on http://localhost:${env.port}`);
});
