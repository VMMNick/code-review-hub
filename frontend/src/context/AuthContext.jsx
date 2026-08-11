import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setAccessToken, setAuthFailureHandler } from '../api/client.js';
import { connectSocket, disconnectSocket } from '../realtime/socket.js';

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // No silent "am I logged in" endpoint yet — we simply wait for the first
    // API call to trigger a refresh via the axios interceptor if needed.
    setLoading(false);
  }, []);

  // If a silent token refresh fails (expired/revoked refresh token — e.g.
  // the user logged out elsewhere, or it just expired), the axios
  // interceptor in api/client.js has no React state of its own to fix the
  // "still shows logged in" UI, so it calls back in here. This is a local
  // cleanup only (no /auth/logout round trip) since the refresh token is
  // already confirmed dead server-side.
  useEffect(() => {
    setAuthFailureHandler(() => {
      setAccessToken(null);
      setUser(null);
      disconnectSocket();
    });
    return () => setAuthFailureHandler(null);
  }, []);

  // The socket connects once here, app-wide, so notifications (and anything
  // else socket-based) work regardless of which page is mounted — pages
  // like ReviewDetailPage just join/leave specific rooms on an already-live
  // connection instead of managing their own connect/disconnect lifecycle.
  const login = useCallback(async (email, password) => {
    const { data } = await api.post('/auth/login', { email, password });
    setAccessToken(data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data.user);
    connectSocket();
    return data.user;
  }, []);

  const register = useCallback(async (email, password, name) => {
    const { data } = await api.post('/auth/register', { email, password, name });
    setAccessToken(data.accessToken);
    localStorage.setItem('refreshToken', data.refreshToken);
    setUser(data.user);
    connectSocket();
    return data.user;
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = localStorage.getItem('refreshToken');
    try {
      await api.post('/auth/logout', { refreshToken });
    } finally {
      setAccessToken(null);
      localStorage.removeItem('refreshToken');
      setUser(null);
      disconnectSocket();
    }
  }, []);

  return (
    <AuthContext.Provider value={{ user, loading, login, register, logout }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error('useAuth must be used within AuthProvider');
  return ctx;
}
