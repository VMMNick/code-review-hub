import axios from 'axios';

export const api = axios.create({ baseURL: '/api' });

let accessToken = null;
export function setAccessToken(token) {
  accessToken = token;
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
      if (!refreshToken) return Promise.reject(error);

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
        return Promise.reject(refreshErr);
      }
    }
    return Promise.reject(error);
  }
);
