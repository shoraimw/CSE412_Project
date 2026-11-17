const $=id=>document.getElementById(id);
if(!localStorage.getItem(DRIVE_TOKEN_KEY))location.href='login.html';
const user=JSON.parse(localStorage.getItem('drive_user')||'null');
const form=$('applicationForm');
const status=$('applicationStatus');
async function refresh(){
  if(user?.role!=='passenger'){
    form.hidden=true;
    status.textContent='Only passenger accounts can apply to become a driver.';
    return;
  }
  try{
    const app=await driveRequest('/drivers/application');
    if(app){
      form.hidden=true;
      const kind=app.license_number?.startsWith('NID:')?'National ID':'Driving licence';
      status.textContent='Application status: '+String(app.status).toUpperCase()+' · '+kind+' number: '+app.license_number.replace(/^(NID|Driving licence):\\s*/,'');
      if(app.status==='approved')status.textContent+=' · Driver access is enabled. Sign out and sign in again to refresh your account.';
      if(app.status==='rejected'&&app.rejection_reason)status.textContent+=' · '+app.rejection_reason;
    }else{
      form.hidden=false;
      status.textContent='No application submitted yet. Enter your NID or driving licence number to apply.';
    }
  }catch(error){
    form.hidden=false;
    status.textContent=error.message;
  }
}
form.addEventListener('submit',async event=>{
  event.preventDefault();
  const button=form.querySelector('button[type="submit"]');
  const original=button.textContent;
  button.disabled=true;
  button.textContent='Submitting…';
  status.textContent='Submitting your application…';
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
    status.textContent=result.message+' Your application is pending administrator review.';
    await refresh();
  }catch(error){
    status.textContent=error.message;
  }finally{
    button.disabled=false;
    button.textContent=original;
  }
});
refresh();