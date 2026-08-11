import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

let accessToken = null;
export function setAccessToken(token) {
  accessToken = token;
}
export function getAccessToken() {
  return accessToken;
}

// AuthContext registers itself here so this module — which has no React
// state of its own — can trigger a local logout when a silent refresh
// fails. Without this, a stale accessToken stayed set after the failure
// below, so the UI kept showing the user as logged in while every request
// silently 401'd forever, with no way out short of a manual logout or
// page reload.
let authFailureHandler = null;
export function setAuthFailureHandler(handler) {
  authFailureHandler = handler;
}

api.interceptors.request.use((config) => {
  if (accessToken) {
    config.headers.Authorization = `Bearer ${accessToken}`;
  }
  return config;
});

// On 401, try one silent refresh using the stored refresh token, then retry
// the original request. If refresh also fails, propagate the error so the
// caller (AuthContext) can log the user out.
let refreshPromise = null;

api.interceptors.response.use(
  (response) => response,
  async (error) => {
    const original = error.config;
    if (error.response?.status === 401 && !original._retry) {
      original._retry = true;
      const refreshToken = localStorage.getItem('refreshToken');
      if (!refreshToken) {
        authFailureHandler?.();
        return Promise.reject(error);
      }

      refreshPromise ??= api
        .post('/auth/refresh', { refreshToken })
        .finally(() => {
          refreshPromise = null;
        });

      try {
        const { data } = await refreshPromise;
        setAccessToken(data.accessToken);
        localStorage.setItem('refreshToken', data.refreshToken);
        original.headers.Authorization = `Bearer ${data.accessToken}`;
        return api(original);
      } catch (refreshErr) {
        localStorage.removeItem('refreshToken');
        authFailureHandler?.();
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);
