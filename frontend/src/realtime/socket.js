import { io } from 'socket.io-client';
import { getAccessToken } from '../api/client.js';

// One shared socket for the whole app, created lazily on first use and
// reused across page navigations so we don't reconnect on every render.
let socket = null;

export function getSocket() {
  if (!socket) {
    socket = io('/', {
      path: '/socket.io',
      autoConnect: false,
      auth: (cb) => cb({ token: getAccessToken() })
    });
  }
  return socket;
}

export function connectSocket() {
  const s = getSocket();
  if (!s.connected) s.connect();
  return s;
}

export function disconnectSocket() {
  socket?.disconnect();
}
