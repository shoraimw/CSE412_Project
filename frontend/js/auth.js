function getAuthDestination(form){
  const requested=new URLSearchParams(window.location.search).get('next');
  return form?.id==='loginForm'&&requested==='admin'?'admin':'dashboard.html';
}

function showAuthMessage(id,message,success=false){
  const element=document.getElementById(id);
  if(!element)return;
  element.textContent=message;
  element.className=success?'message success':'message';
}

// Attach exactly one handler to each password control. The previous script
// registered two click handlers on the same button, so one click toggled the
// input twice and appeared to do nothing.
document.querySelectorAll('.password-field').forEach(wrapper=>{
  const input=wrapper.querySelector('input[type="password"],input[type="text"]');
  const toggle=wrapper.querySelector('.password-toggle');
  if(!input||!toggle)return;
  toggle.addEventListener('click',()=>{
    const show=input.type==='password';
    input.type=show?'text':'password';
    toggle.setAttribute('aria-label',show?'Hide password':'Show password');
    toggle.setAttribute('aria-pressed',String(show));
    wrapper.classList.toggle('is-visible',show);
    input.focus({preventScroll:true});
  });
});

async function submitAuth(form,endpoint,messageId,successText){
  form?.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!form.reportValidity())return;
    const button=form.querySelector('button[type="submit"]');
    button.disabled=true;
    button.classList.add('is-loading');
    const data=Object.fromEntries(new FormData(form).entries());
    try{
      const result=await driveRequest(endpoint,{method:'POST',body:JSON.stringify(data)});
      if(result.accessToken){
        localStorage.setItem(DRIVE_TOKEN_KEY,result.accessToken);
        if(result.user)localStorage.setItem('drive_user',JSON.stringify(result.user));
        if(result.refreshToken)localStorage.setItem('drive_refresh_token',result.refreshToken);
        showAuthMessage(messageId,successText,true);
        window.location.href=getAuthDestination(form);
      }else{
        showAuthMessage(messageId,result.message||'Check your email to confirm your account.',true);
      }
    }catch(error){
      showAuthMessage(messageId,error.message||'Something went wrong. Please try again.');
    }finally{
      button.disabled=false;
      button.classList.remove('is-loading');
    }
  });
}

submitAuth(document.getElementById('registerForm'),'/auth/register','registerMessage','Account created. Opening your dashboard…');
submitAuth(document.getElementById('loginForm'),'/auth/login','loginMessage','Login successful. Opening your dashboard…');

const otpToggle=document.getElementById('otpModeToggle');
const otpPanel=document.getElementById('emailOtpPanel');
otpToggle?.addEventListener('click',()=>{
  const open=otpPanel.hidden;
  otpPanel.hidden=!open;
  otpToggle.textContent=open?'Use password instead':'Sign in with an email code instead';
  if(open){
    const email=document.querySelector('#loginForm input[name="email"]')?.value||'';
    document.getElementById('otpEmail').value=email;
    document.getElementById('otpEmail').focus();
  }
});

document.getElementById('sendOtpButton')?.addEventListener('click',async()=>{
  const email=document.getElementById('otpEmail').value.trim();
  const button=document.getElementById('sendOtpButton');
  if(!email){showAuthMessage('otpMessage','Enter your account email first.');return;}
  button.disabled=true;
  try{
    const result=await driveRequest('/auth/email-otp',{method:'POST',body:JSON.stringify({email})});
    showAuthMessage('otpMessage',result.message,true);
  }catch(error){
    showAuthMessage('otpMessage',error.message);
  }finally{
    button.disabled=false;
  }
});

document.getElementById('verifyOtpButton')?.addEventListener('click',async()=>{
  const email=document.getElementById('otpEmail').value.trim();
  const token=document.getElementById('otpCode').value.trim();
  const button=document.getElementById('verifyOtpButton');
  if(!email||!/^[0-9]{6}$/.test(token)){
    showAuthMessage('otpMessage','Enter a valid email and 6-digit code.');
    return;
  }
  button.disabled=true;
  try{
    const result=await driveRequest('/auth/verify-email-otp',{method:'POST',body:JSON.stringify({email,token})});
    localStorage.setItem(DRIVE_TOKEN_KEY,result.accessToken);
    localStorage.setItem('drive_refresh_token',result.refreshToken);
    localStorage.setItem('drive_user',JSON.stringify(result.user));
    showAuthMessage('otpMessage','Verified. Opening your dashboard…',true);
    location.href=getAuthDestination(document.getElementById('loginForm'));
  }catch(error){
    showAuthMessage('otpMessage',error.message);
  }finally{
    button.disabled=false;
  }
});
