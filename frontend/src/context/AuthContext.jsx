import { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { api, setAccessToken } from '../api/client.js';
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
