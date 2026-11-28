const DRIVE_API_BASE = window.__DRIVE_API_BASE__ || '/api';
const DRIVE_TOKEN_KEY = 'drive_access_token';
let driveRefreshPromise = null;

function driveSession() {
  try { return JSON.parse(localStorage.getItem('drive_user') || 'null'); }
  catch { return null; }
}
function driveStoreSession(payload) {
  if (payload.accessToken) localStorage.setItem(DRIVE_TOKEN_KEY, payload.accessToken);
  if (payload.refreshToken) localStorage.setItem('drive_refresh_token', payload.refreshToken);
  if (payload.user) localStorage.setItem('drive_user', JSON.stringify(payload.user));
}
function driveClearSession() {
  localStorage.removeItem(DRIVE_TOKEN_KEY);
  localStorage.removeItem('drive_refresh_token');
  localStorage.removeItem('drive_user');
}
async function driveRefreshSession() {
  const refreshToken = localStorage.getItem('drive_refresh_token');
  if (!refreshToken) throw new Error('Your session has expired. Please log in again.');
  if (!driveRefreshPromise) {
    driveRefreshPromise = (async () => {
      const response = await fetch(DRIVE_API_BASE + '/auth/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refreshToken })
      });
      const payload = await response.json().catch(() => ({}));
      if (!response.ok || !payload.accessToken) {
        driveClearSession();
        throw new Error('Your session has expired. Please log in again.');
      }
      driveStoreSession(payload);
      return payload.accessToken;
    })().finally(() => { driveRefreshPromise = null; });
  }
  return driveRefreshPromise;
}
async function driveRequest(path, options = {}) {
  const makeHeaders = token => ({
    ...(options.body ? { 'Content-Type': 'application/json' } : {}),
    ...(options.headers || {}),
    ...(token ? { Authorization: 'Bearer ' + token } : {})
  });
  let token = localStorage.getItem(DRIVE_TOKEN_KEY);
  // Restore a valid app session when the access token is missing but a refresh token remains.
  if (!token && localStorage.getItem('drive_refresh_token')) {
    try { token = await driveRefreshSession(); }
    catch { throw new Error('Your session has expired. Please log in again.'); }
  }
  let response = await fetch(DRIVE_API_BASE + path, { ...options, headers: makeHeaders(token) });
  if (response.status === 401 && token && !path.startsWith('/auth/')) {
    try {
      token = await driveRefreshSession();
      response = await fetch(DRIVE_API_BASE + path, { ...options, headers: makeHeaders(token) });
    } catch { throw new Error('Your session has expired. Please log in again.'); }
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    const message = Array.isArray(payload.message) ? payload.message.join(', ') : payload.message;
    throw new Error(message || 'The request could not be completed.');
  }
  return payload;
}
function driveRequireAuth(next = 'dashboard.html') {
  if (!localStorage.getItem(DRIVE_TOKEN_KEY) && !localStorage.getItem('drive_refresh_token')) {
    window.location.href = 'login.html?next=' + encodeURIComponent(next);
    return false;
  }
  return true;
}
function driveEscape(value) {
  return String(value ?? '').replace(/[&<>"']/g, char => ({
    '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'
  })[char]);
}
function driveMoney(value) {
  return '৳' + Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits: 0 });
}
function driveDate(value) {
  if (!value) return '—';
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? '—' : date.toLocaleString('en-BD', { dateStyle:'medium', timeStyle:'short' });
}
function driveToast(message, duration = 3000) {
  let node = document.getElementById('driveToast');
  if (!node) {
    node = document.createElement('div');
    node.id = 'driveToast'; node.className = 'toast'; node.setAttribute('role','status');
    document.body.appendChild(node);
  }
  node.textContent = message; node.hidden = false;
  clearTimeout(node._timer);
  node._timer = setTimeout(() => { node.hidden = true; }, duration);
}
function driveRoleHome(role) {
  return ({ admin:'admin.html', driver:'driver.html', vehicle_owner:'owner.html', passenger:'dashboard.html' })[role] || 'dashboard.html';
}
