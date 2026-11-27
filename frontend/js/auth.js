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
    if (requested && /^(index|dashboard|driver|owner|admin|vehicles|explore|profile|notifications)\.html$/.test(requested)) return requested;
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
        body:JSON.stringify({ email:loginForm.email.value.trim(), password:loginForm.password.value })
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
          name:registerForm.name.value.trim(), email:registerForm.email.value.trim(),
          phone:registerForm.phone.value.trim() || undefined, password:registerForm.password.value
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

  const phoneRequest = document.getElementById('phoneOtpRequestForm');
  const phoneVerify = document.getElementById('phoneOtpVerifyForm');
  const phoneMessage = document.getElementById('phoneOtpMessage');
  const phoneStatus = (value,kind='') => { if(phoneMessage){phoneMessage.textContent=value;phoneMessage.className='message '+kind;} };
  phoneRequest?.addEventListener('submit',async event=>{
    event.preventDefault();if(!phoneRequest.reportValidity())return;
    const button=document.getElementById('phoneOtpSend');button.disabled=true;
    try{
      const phone=document.getElementById('phoneOtpNumber').value.trim();
      const result=await driveRequest('/auth/phone-otp',{method:'POST',body:JSON.stringify({phone})});
      phoneVerify.hidden=false;phoneVerify.dataset.phone=phone;
      phoneStatus(result.message||'SMS code requested.','success');
    }catch(error){phoneStatus(error.message,'error');}
    finally{button.disabled=false;}
  });
  phoneVerify?.addEventListener('submit',async event=>{
    event.preventDefault();if(!phoneVerify.reportValidity())return;
    const button=document.getElementById('phoneOtpVerify');button.disabled=true;
    try{
      const payload=await driveRequest('/auth/verify-phone-otp',{method:'POST',body:JSON.stringify({
        phone:phoneVerify.dataset.phone,token:document.getElementById('phoneOtpCode').value.trim()
      })});
      driveStoreSession(payload);phoneStatus('Phone verified. Opening DRIVE…','success');
      location.href=destination(payload.user);
    }catch(error){phoneStatus(error.message,'error');}
    finally{button.disabled=false;}
  });

  const recoveryForm=document.getElementById('recoveryForm');
  recoveryForm?.addEventListener('submit',async event=>{
    event.preventDefault();if(!recoveryForm.reportValidity())return;
    const button=document.getElementById('recoveryButton');button.disabled=true;
    const status=document.getElementById('recoveryMessage');
    try{
      const result=await driveRequest('/auth/password-recovery',{method:'POST',body:JSON.stringify({email:recoveryForm.email.value.trim()})});
      status.textContent=result.message;status.className='message success';
    }catch(error){status.textContent=error.message;status.className='message error';}
    finally{button.disabled=false;}
  });

  const resetForm=document.getElementById('resetPasswordForm');
  if(resetForm){
    const hash=new URLSearchParams(location.hash.replace(/^#/,''));
    const accessToken=hash.get('access_token');
    const isRecovery=hash.get('type')==='recovery'&&Boolean(accessToken);
    const status=document.getElementById('resetPasswordMessage');
    if(!isRecovery){
      status.textContent='This password reset link is invalid or expired. Request a new one.';
      status.className='message error';resetForm.hidden=true;
    }
    resetForm.addEventListener('submit',async event=>{
      event.preventDefault();if(!isRecovery||!resetForm.reportValidity())return;
      const password=document.getElementById('newPassword').value;
      const confirm=document.getElementById('confirmPassword').value;
      if(password!==confirm){status.textContent='The passwords do not match.';status.className='message error';return;}
      const button=document.getElementById('resetPasswordButton');button.disabled=true;
      try{
        const response=await fetch('/api/auth/password-update',{method:'POST',headers:{'Content-Type':'application/json',Authorization:'Bearer '+accessToken},body:JSON.stringify({password})});
        const payload=await response.json().catch(()=>({}));
        if(!response.ok)throw new Error(Array.isArray(payload.message)?payload.message.join(', '):(payload.message||'Password could not be updated.'));
        status.textContent=payload.message||'Password updated. Please log in.';status.className='message success';
        setTimeout(()=>location.href='login.html',900);
      }catch(error){status.textContent=error.message;status.className='message error';}
      finally{button.disabled=false;}
    });
  }
})();
