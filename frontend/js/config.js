(() => {
  const override = window.DRIVE_API_BASE_URL;
  const local = ['localhost', '127.0.0.1'].includes(window.location.hostname);
  const apiBase = override || (local
    ? 'http://localhost:3000/api'
    : window.location.origin + '/api');
  window.DRIVE_CONFIG = Object.freeze({ API_BASE_URL: apiBase.replace(/\/$/, '') });
})();
