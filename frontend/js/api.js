// Cloudflare serves the frontend and /api from the same Worker origin.
// For a separately-started local NestJS server, set window.__DRIVE_API_BASE__ before this file.
const DRIVE_API_BASE = window.__DRIVE_API_BASE__ || '/api';
const DRIVE_TOKEN_KEY = 'drive_access_token';
async function driveRequest(path, options = {}) {
  const headers = { ...(options.body ? { 'Content-Type': 'application/json' } : {}), ...(options.headers || {}) };
  const token = localStorage.getItem(DRIVE_TOKEN_KEY);
  if (token) headers.Authorization = 'Bearer ' + token;
  const response = await fetch(DRIVE_API_BASE + path, { ...options, headers });
  const result = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(Array.isArray(result.message) ? result.message.join(' ') : result.message || 'The request could not be completed.');
  return result;
}