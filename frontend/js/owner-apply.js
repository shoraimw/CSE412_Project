const $=id=>document.getElementById(id);
const form=$('ownerApplicationForm');
const status=$('applicationStatus');
const message=$('ownerApplyMessage');
let user=null;

function setUser(profile){
  user=profile;
  const cached=JSON.parse(localStorage.getItem('drive_user')||'{}');
  localStorage.setItem('drive_user',JSON.stringify({...cached,...profile}));
}

async function loadApplication(){
  try{
    const app=await driveRequest('/owners/application');
    if(!app){
      status.hidden=true;
      form.hidden=false;
      return;
    }
    status.hidden=false;
    const submitted=app.created_at?new Date(app.created_at).toLocaleString():'';
    if(app.status==='pending'){
      form.hidden=true;
      status.textContent='Application pending administrator review. Submitted '+submitted+'. You can continue using your current DRIVE account while you wait.';
      return;
    }
    if(app.status==='approved'){
      const profile=await driveRequest('/users/me');
      setUser(profile);
      if(profile.role==='vehicle_owner')location.replace('owner.html');
      else{
        form.hidden=true;
        status.textContent='Your application is approved. Please sign out and sign in again to refresh your Vehicle Owner access.';
      }
      return;
    }
    if(app.status==='rejected'){
      form.hidden=false;
      form.elements.business_name.value=app.business_name||'';
      form.elements.contact_phone.value=app.contact_phone||'';
      form.elements.business_address.value=app.business_address||'';
      form.elements.note.value=app.note||'';
      form.querySelector('button[type="submit"]').textContent='Update & resubmit application →';
      status.textContent='Your previous application was not approved. Correct your details and resubmit. '+(app.rejection_reason||'');
    }
  }catch(error){
    message.textContent=error.message||'Could not load your application.';
  }
}

async function init(){
  if(!localStorage.getItem(DRIVE_TOKEN_KEY)){
    location.replace('login.html?next=owner-apply');
    return;
  }
  try{
    const profile=await driveRequest('/users/me');
    setUser(profile);
    if(profile.role==='vehicle_owner'){
      location.replace('owner.html');
      return;
    }
    if(profile.role!=='passenger'){
      form.hidden=true;
      message.textContent='Only Passenger accounts can apply to become a Vehicle Owner.';
      return;
    }
    await loadApplication();
  }catch(error){
    form.hidden=true;
    message.textContent=error.message||'Please sign in again.';
  }
}

form.addEventListener('submit',async event=>{
  event.preventDefault();
  if(!form.reportValidity())return;
  const button=form.querySelector('button[type="submit"]');
  const original=button.textContent;
  button.disabled=true;
  button.textContent='Submitting…';
  try{
    const payload=Object.fromEntries(new FormData(form).entries());
    const result=await driveRequest('/owners/application',{method:'POST',body:JSON.stringify(payload)});
    message.textContent=result.message;
    await loadApplication();
  }catch(error){
    message.textContent=error.message||'Your application could not be submitted.';
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
});

init();