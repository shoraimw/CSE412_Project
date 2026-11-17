// Cloudflare serves the frontend and /api from the same Worker origin.
// For a separately-started local NestJS server, set window.__DRIVE_API_BASE__ before this file.
const DRIVE_API_BASE = window.__DRIVE_API_BASE__ || '/api';
const DRIVE_TOKEN_KEY = 'drive_access_token';
let driveRefreshPromise = null;

function clearDriveSession() {
  localStorage.removeItem(DRIVE_TOKEN_KEY);
  localStorage.removeItem('drive_refresh_token');
  localStorage.removeItem('drive_user');
}

async function refreshDriveSession() {
  const refreshToken = localStorage.getItem('drive_refresh_token');
  if (!refreshToken) throw new Error('Your session has expired. Please log in again.');

  if (!driveRefreshPromise) {
    driveRefreshPromise = (async () => {
      const response = await fetch(DRIVE_API_BASE + '/auth/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken }),
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.accessToken) {
        clearDriveSession();
        throw new Error('Your session has expired. Please log in again.');
      }
      localStorage.setItem(DRIVE_TOKEN_KEY, payload.accessToken);
      if (payload.refreshToken) localStorage.setItem('drive_refresh_token', payload.refreshToken);
      return payload.accessToken;
    })().finally(() => {
      driveRefreshPromise = null;
    });
  }

  return driveRefreshPromise;
}

async function driveRequest(path, options = {}) {
  const makeHeaders = token => ({
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
    ...(token ? { Authorization: 'Bearer ' + token } : {}),
  });

  let token = localStorage.getItem(DRIVE_TOKEN_KEY);
  let response = await fetch(DRIVE_API_BASE + path, { ...options, headers: makeHeaders(token) });

  // Refresh once after an expired access token. The shared promise prevents
  // parallel dashboard requests from rotating the same refresh token twice.
  if (response.status === 401 && token && !path.startsWith('/auth/')) {
    try {
      token = await refreshDriveSession();
      response = await fetch(DRIVE_API_BASE + path, { ...options, headers: makeHeaders(token) });
    } catch {
      throw new Error('Your session has expired. Please log in again.');
    }
  }

  const result = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message || 'The request could not be completed.');
  }
  return result;
}
