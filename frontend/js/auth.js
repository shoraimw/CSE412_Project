(() => {
  const loginForm = document.getElementById('loginForm');
  const registerForm = document.getElementById('registerForm');
  const message = document.getElementById('authMessage');
  const setMessage = (text, kind='') => {
    if (!message) return;
    message.textContent = text; message.className = 'message ' + kind;
  };
  function destination(user) {
    const requested = new URLSearchParams(location.search).get('next');
    if (requested && /^(dashboard|driver|owner|admin)\.html$/.test(requested)) return requested;
    return driveRoleHome(user?.role);
  }
  loginForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!loginForm.reportValidity()) return;
    const button = document.getElementById('loginButton');
    button.disabled = true; setMessage('Signing you in…');
    try {
      const payload = await driveRequest('/auth/login', {
        method:'POST',
        body:JSON.stringify({
          email:loginForm.email.value.trim(),
          password:loginForm.password.value
        })
      });
      driveStoreSession(payload);
      setMessage('Welcome back. Opening your workspace…','success');
      location.href = destination(payload.user);
    } catch (error) { setMessage(error.message || 'Unable to log in.','error'); }
    finally { button.disabled = false; }
  });
  registerForm?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!registerForm.reportValidity()) return;
    const button = document.getElementById('registerButton');
    button.disabled = true; setMessage('Creating your account…');
    try {
      const payload = await driveRequest('/auth/register', {
        method:'POST',
        body:JSON.stringify({
          name:registerForm.name.value.trim(),
          email:registerForm.email.value.trim(),
          phone:registerForm.phone.value.trim() || undefined,
          password:registerForm.password.value
        })
      });
      if (payload.accessToken) {
        driveStoreSession(payload);
        setMessage('Your account is ready. Opening DRIVE…','success');
        location.href = destination(payload.user);
      } else {
        setMessage(payload.message || 'Account created. Check your email to confirm your account.','success');
        registerForm.reset();
      }
    } catch (error) { setMessage(error.message || 'Unable to create your account.','error'); }
    finally { button.disabled = false; }
  });
})();