const $=id=>document.getElementById(id);
const form=$('applicationForm');
const status=$('applicationStatus');
const note=$('applicationNote');

function setStatus(message,show=true){
  status.textContent=message;
  status.hidden=!show;
}

function setCachedUser(profile){
  const previous=JSON.parse(localStorage.getItem('drive_user')||'{}');
  localStorage.setItem('drive_user',JSON.stringify({...previous,...profile}));
}

function fillApplication(app){
  const number=String(app.license_number||'');
  const nationalId=/^NID:\s*/i.test(number);
  form.elements.verification_type.value=nationalId?'national_id':'driving_license';
  form.elements.license_number.value=number.replace(/^(NID|Driving licence):\s*/i,'');
  form.elements.experience_years.value=app.experience_years??0;
  form.elements.requested_vehicle_type.value=app.requested_vehicle_type||'bike';
  form.elements.note.value=app.note||'';
}

async function refresh(){
  if(!localStorage.getItem(DRIVE_TOKEN_KEY)){
    location.replace('login.html?next=driver-apply');
    return;
  }

  form.hidden=true;
  note.hidden=true;
  setStatus('Checking your DRIVE account and application status…');

  try{
    // Never trust a possibly stale role cached in localStorage. The API
    // resolves the current role from the authenticated profile in Supabase.
    const profile=await driveRequest('/users/me');
    setCachedUser(profile);

    if(profile.role==='driver'&&profile.is_verified){
      setStatus('Your Driver Partner application is approved. Your Driver workspace is now available.',true);
      const link=document.createElement('a');
      link.href='driver.html';
      link.className='button button-dark';
      link.style.marginTop='12px';
      link.textContent='Open Driver workspace →';
      status.append(document.createElement('br'),link);
      return;
    }

    if(profile.role!=='passenger'){
      setStatus('This account currently has the '+String(profile.role||'unknown').replaceAll('_',' ')+' role. Driver applications are submitted from Passenger accounts. Contact DRIVE support if you believe this is incorrect.',true);
      return;
    }

    const app=await driveRequest('/drivers/application');
    if(app?.status==='pending'){
      setStatus('Your Driver Partner application is pending administrator review. You can continue using your Passenger account while you wait. No new application is needed.',true);
      return;
    }
    if(app?.status==='approved'){
      setStatus('Your application is approved. Refreshing your account permissions…',true);
      const fresh=await driveRequest('/users/me');
      setCachedUser(fresh);
      if(fresh.role==='driver'&&fresh.is_verified){
        setStatus('Approved! Your Driver access is active.',true);
        const link=document.createElement('a');
        link.href='driver.html';
        link.className='button button-dark';
        link.style.marginTop='12px';
        link.textContent='Open Driver workspace →';
        status.append(document.createElement('br'),link);
      }else{
        setStatus('Your application is approved. Please sign out and sign in again to refresh your account access.',true);
      }
      return;
    }

    form.hidden=false;
    note.hidden=false;
    if(app?.status==='rejected'){
      fillApplication(app);
      form.querySelector('button[type="submit"]').textContent='Update & resubmit application';
      setStatus('Your previous application was not approved. Review the administrator feedback, update your details if needed, and resubmit. '+(app.rejection_reason||''),true);
    }else{
      form.querySelector('button[type="submit"]').textContent='Submit application';
      setStatus('No Driver Partner application has been submitted yet. Complete this form to apply.',true);
    }
  }catch(error){
    setStatus(error.message||'Your account could not be verified. Please sign in again.',true);
    if(/session|log in|invalid/i.test(error.message||'')){
      setTimeout(()=>location.replace('login.html?next=driver-apply'),900);
    }
  }
}

form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!form.reportValidity())return;
  const button=form.querySelector('button[type="submit"]');
  const original=button.textContent;
  button.disabled=true;
  button.textContent='Submitting…';
  setStatus('Submitting your Driver Partner application…',true);

  const values=Object.fromEntries(new FormData(form).entries());
  const kind=values.verification_type==='national_id'?'NID':'Driving licence';
  const payload={
    license_number:kind+': '+String(values.license_number||'').trim(),
    experience_years:Number(values.experience_years||0),
    requested_vehicle_type:values.requested_vehicle_type||'bike',
    note:values.note||'',
  };

  try{
    const result=await driveRequest('/drivers/application',{method:'POST',body:JSON.stringify(payload)});
    setStatus(result.message+' Your account remains Passenger until an administrator approves the application.',true);
    await refresh();
  }catch(error){
    setStatus(error.message||'Your application could not be submitted. Please try again.',true);
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
});

refresh();