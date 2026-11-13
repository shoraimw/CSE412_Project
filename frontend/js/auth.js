function showAuthMessage(id, message, success = false) {
  const element = document.getElementById(id);
  if (!element) return;
  element.textContent = message;
  element.className = success ? 'message success' : 'message';
}
const registerForm = document.getElementById('registerForm');
if (registerForm) registerForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = registerForm.querySelector('button[type="submit"]');
  button.disabled = true;
  const data = Object.fromEntries(new FormData(registerForm).entries());
  try {
    const result = await driveRequest('/auth/register', { method: 'POST', body: JSON.stringify(data) });
    if (result.accessToken) {
      localStorage.setItem(DRIVE_TOKEN_KEY, result.accessToken);
      if (result.refreshToken) localStorage.setItem('drive_refresh_token', result.refreshToken);
      showAuthMessage('registerMessage', 'Account created. Opening your dashboard…', true);
      window.location.href = 'dashboard.html';
    } else {
      showAuthMessage('registerMessage', result.message || 'Check your email to confirm your account.', true);
    }
  } catch (error) { showAuthMessage('registerMessage', error.message); }
  finally { button.disabled = false; }
});
const loginForm = document.getElementById('loginForm');
if (loginForm) loginForm.addEventListener('submit', async event => {
  event.preventDefault();
  const button = loginForm.querySelector('button[type="submit"]');
  button.disabled = true;
  const data = Object.fromEntries(new FormData(loginForm).entries());
  try {
    const result = await driveRequest('/auth/login', { method: 'POST', body: JSON.stringify(data) });
    localStorage.setItem(DRIVE_TOKEN_KEY, result.accessToken);
    if (result.refreshToken) localStorage.setItem('drive_refresh_token', result.refreshToken);
    showAuthMessage('loginMessage', 'Login successful. Opening your dashboard…', true);
    window.location.href = 'dashboard.html';
  } catch (error) { showAuthMessage('loginMessage', error.message); }
  finally { button.disabled = false; }
});
