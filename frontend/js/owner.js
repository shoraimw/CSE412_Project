(() => {
  if (!driveRequireAuth('owner.html')) return;
  const $=id=>document.getElementById(id);
  const statusClass=s=>['approved','active','completed'].includes(s)?'success':['pending'].includes(s)?'warning':['rejected','cancelled'].includes(s)?'danger':'';
  async function load(){
    try{
      const user=await driveRequest('/users/me');
      if(user.role==='passenger'){await showApplication();return;}
      if(!['vehicle_owner','admin'].includes(user.role)){ $('ownerStatus').textContent='Owner access required';$('ownerStatus').className='pill danger';return;}
      $('ownerApplication').hidden=true;$('ownerConsole').hidden=false;$('ownerStatus').textContent='Partner workspace';$('ownerStatus').className='pill success';
      await refresh();
    }catch(error){$('ownerStatus').textContent='Unable to load';}
  }
  async function showApplication(){
    $('ownerApplication').hidden=false;$('ownerConsole').hidden=true;
    try{
      const app=await driveRequest('/owners/application');
      if(app){
        $('ownerApplicationState').innerHTML='<div class="list-item"><div><strong>Application status</strong><small>'+driveEscape(app.rejection_reason||'Submitted '+driveDate(app.created_at))+'</small></div><span class="pill '+statusClass(app.status)+'">'+driveEscape(app.status)+'</span></div>';
        if(app.status==='pending'||app.status==='approved')$('ownerApplyForm').hidden=true;
      }
    }catch(error){$('ownerApplyMessage').textContent=error.message;}
  }
  $('ownerApplyForm')?.addEventListener('submit',async event=>{
    event.preventDefault();const button=$('ownerApplyForm').querySelector('button');button.disabled=true;
    try{
      const result=await driveRequest('/owners/application',{method:'POST',body:JSON.stringify({
        business_name:$('businessName').value.trim(),contact_phone:$('contactPhone').value.trim(),
        business_address:$('businessAddress').value.trim(),note:$('ownerNote').value.trim()
      })});
      $('ownerApplyMessage').textContent=result.message||'Application submitted.';$('ownerApplyMessage').className='message success';
      $('ownerApplicationState').innerHTML='<span class="pill warning">Pending review</span>';$('ownerApplyForm').hidden=true;
    }catch(error){$('ownerApplyMessage').textContent=error.message;$('ownerApplyMessage').className='message error';}
    finally{button.disabled=false;}
  });
  $('vehicleForm')?.addEventListener('submit',async event=>{
    event.preventDefault();const button=$('vehicleForm').querySelector('button');button.disabled=true;
    try{
      const result=await driveRequest('/rental/vehicles',{method:'POST',body:JSON.stringify({
        make:$('vehicleMake').value.trim(),model:$('vehicleModel').value.trim(),vehicle_type:$('vehicleType').value,
        plate_number:$('plateNumber').value.trim(),city:$('vehicleCity').value.trim(),seats:Number($('vehicleSeats').value),
        price_per_day:Number($('vehiclePrice').value),model_year:$('vehicleYear').value?Number($('vehicleYear').value):undefined,
        description:$('vehicleDescription').value.trim()
      })});
      $('vehicleMessage').textContent=result.message||'Vehicle submitted for verification.';$('vehicleMessage').className='message success';$('vehicleForm').reset();await refresh();
    }catch(error){$('vehicleMessage').textContent=error.message;$('vehicleMessage').className='message error';}
    finally{button.disabled=false;}
  });
  async function refresh(){
    const [vehicles,bookings]=await Promise.all([
      driveRequest('/rental/owner/vehicles').catch(()=>[]),
      driveRequest('/rental/owner/bookings').catch(()=>[])
    ]);
    $('ownerVehicles').innerHTML=vehicles.length?vehicles.map(v=>'<div class="list-item"><div class="list-item-main"><strong>'+driveEscape(v.make+' '+v.model)+'</strong><small>'+driveEscape(v.plate_number)+' · '+driveMoney(v.price_per_day)+'/day</small></div><span class="pill '+statusClass(v.verification_status)+'">'+driveEscape(v.verification_status||'pending')+'</span></div>').join(''):'<div class="empty-state">Your vehicle listings will appear here.</div>';
    $('ownerBookings').innerHTML=bookings.length?bookings.map(b=>{
      const vehicle=b.vehicles||{};const canReview=b.status==='pending';
      return '<div class="list-item"><div class="list-item-main"><strong>'+driveEscape((vehicle.make||'Vehicle')+' '+(vehicle.model||''))+'</strong><small>'+driveDate(b.start_at)+' – '+driveDate(b.end_at)+' · '+driveMoney(b.total_amount)+'</small></div><div class="row-actions"><span class="pill '+statusClass(b.status)+'">'+driveEscape(b.status)+'</span>'+(canReview?'<button class="button-mini dark" data-booking="'+driveEscape(b.id)+'" data-next="approved">Approve</button><button class="button-mini danger" data-booking="'+driveEscape(b.id)+'" data-next="rejected">Reject</button>':'')+'</div></div>';
    }).join(''):'<div class="empty-state">Rental requests will appear here.</div>';
    $('ownerBookings').querySelectorAll('[data-booking]').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;
      try{await driveRequest('/rental/bookings/'+button.dataset.booking+'/status',{method:'PATCH',body:JSON.stringify({status:button.dataset.next})});driveToast('Booking updated.');await refresh();}
      catch(error){driveToast(error.message);button.disabled=false;}
    }));
  }
  $('logoutButton')?.addEventListener('click',()=>{driveClearSession();location.href='index.html';});
  load();
})();