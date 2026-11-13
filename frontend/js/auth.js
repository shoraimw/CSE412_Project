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
      if (result.user) localStorage.setItem('drive_user', JSON.stringify(result.user));
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
    if (result.user) localStorage.setItem('drive_user', JSON.stringify(result.user));
    if (result.refreshToken) localStorage.setItem('drive_refresh_token', result.refreshToken);
    showAuthMessage('loginMessage', 'Login successful. Opening your dashboard…', true);
    window.location.href = 'dashboard.html';
  } catch (error) { showAuthMessage('loginMessage', error.message); }
  finally { button.disabled = false; }
});


document.querySelectorAll('[data-password-toggle]').forEach(toggle=>{const field=document.getElementById(toggle.dataset.passwordToggle);if(!field)return;toggle.addEventListener('click',()=>{const visible=field.type==='password';field.type=visible?'text':'password';toggle.setAttribute('aria-pressed',String(visible));toggle.setAttribute('aria-label',visible?'Hide password':'Show password');const label=toggle.querySelector('span');if(label)label.textContent=visible?'Hide':'Show';toggle.classList.toggle('is-visible',visible);});});
