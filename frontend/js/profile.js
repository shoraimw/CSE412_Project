(() => {
  if (!driveRequireAuth('profile.html')) return;
  const $=id=>document.getElementById(id);
  async function load(){
    try{
      const user=await driveRequest('/users/me');
      $('profileName').value=user.full_name||user.name||'';
      $('profilePhone').value=user.phone||'';
      $('profileEmail').value=user.email||'';
      $('accountInfo').innerHTML='<div class="list-item"><div><strong>Account role</strong><small>Access level</small></div><span class="pill">'+driveEscape(user.role)+'</span></div><div class="list-item"><div><strong>Verification</strong><small>Partner verification status</small></div><span class="pill '+(user.is_verified?'success':'warning')+'">'+(user.is_verified?'Verified':'Not verified')+'</span></div>';
    }catch(error){$('profileMessage').textContent=error.message;}
  }
  $('profileForm').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('profileForm').querySelector('button');button.disabled=true;
    try{await driveRequest('/users/me',{method:'PATCH',body:JSON.stringify({name:$('profileName').value.trim(),phone:$('profilePhone').value.trim()})});$('profileMessage').textContent='Profile updated.';$('profileMessage').className='message success';}
    catch(error){$('profileMessage').textContent=error.message;$('profileMessage').className='message error';}
    finally{button.disabled=false;}
  });
  $('logoutButton').addEventListener('click',()=>{driveClearSession();location.href='index.html';});
  load();
})();