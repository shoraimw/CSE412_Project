(() => {
  if (!driveRequireAuth('profile.html')) return;
  const $=id=>document.getElementById(id);
  async function load(){
    try{
      const user=await driveRequest('/users/me');
      $('profileName').value=user.full_name||user.name||'';
      $('profilePhone').value=user.phone||'';
      $('profileEmail').value=user.email||'';
      $('profileLanguage').value=user.preferred_language||localStorage.getItem('drive_language')||'en';
      localStorage.setItem('drive_language',$('profileLanguage').value);
      document.documentElement.lang=$('profileLanguage').value;
      $('accountInfo').innerHTML='<div class="list-item"><div><strong>Account role</strong><small>Access level</small></div><span class="pill">'+driveEscape(user.role)+'</span></div><div class="list-item"><div><strong>Verification</strong><small>Partner verification status</small></div><span class="pill '+(user.is_verified?'success':'warning')+'">'+(user.is_verified?'Verified':'Not verified')+'</span></div>';
      if(user.role==='driver'){
        try{
          const rating=await driveRequest('/reviews/driver/'+encodeURIComponent(user.id));
          const stars=rating.averageRating===null?'No ratings yet':'★'.repeat(rating.stars)+'☆'.repeat(5-rating.stars);
          $('accountInfo').insertAdjacentHTML('beforeend','<div class="list-item"><div><strong>Driver rating</strong><small>'+driveEscape(rating.label)+' · '+Number(rating.totalReviews||0)+' reviews</small></div><strong>'+driveEscape(stars)+'</strong></div>');
          if(rating.reviews?.length){
            $('accountInfo').insertAdjacentHTML('beforeend','<div class="list-item"><div class="list-item-main"><strong>Recent feedback</strong><small>'+rating.reviews.slice(0,3).map(item=>driveEscape(item.comment||('Rated '+item.rating+'/5'))).join(' · ')+'</small></div></div>');
          }
        }catch{}
      }
    }catch(error){$('profileMessage').textContent=error.message;}
  }
  $('profileForm').addEventListener('submit',async event=>{
    event.preventDefault();const button=$('profileForm').querySelector('button');button.disabled=true;
    try{await driveRequest('/users/me',{method:'PATCH',body:JSON.stringify({name:$('profileName').value.trim(),phone:$('profilePhone').value.trim(),preferred_language:$('profileLanguage').value})});localStorage.setItem('drive_language',$('profileLanguage').value);document.documentElement.lang=$('profileLanguage').value;$('profileMessage').textContent='Profile updated.';$('profileMessage').className='message success';}
    catch(error){$('profileMessage').textContent=error.message;$('profileMessage').className='message error';}
    finally{button.disabled=false;}
  });
  $('logoutButton').addEventListener('click',()=>{driveClearSession();location.href='index.html';});
  load();
})();