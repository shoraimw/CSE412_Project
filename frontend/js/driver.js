(() => {
  if (!driveRequireAuth('driver.html')) return;
  const $=id=>document.getElementById(id);
  let online=false, watchId=null, lastPosition=null, sending=false;
  const setMessage=(id,text,kind='')=>{const el=$(id);if(el){el.textContent=text;el.className='message '+kind;}};
  const stateClass=s=>['completed','approved'].includes(s)?'success':['pending','requested','matched','driver_arriving','in_progress'].includes(s)?'warning':['rejected','cancelled'].includes(s)?'danger':'';
  async function load(){
    try{
      const user=await driveRequest('/users/me');
      if(user.role==='passenger'){await showApplication();return;}
      if(user.role!=='driver'){ $('driverStatus').textContent='Driver access required'; $('driverStatus').className='pill danger'; $('driverApplication').hidden=true; $('driverConsole').hidden=true; return;}
      $('driverApplication').hidden=true; $('driverConsole').hidden=false;
      $('driverStatus').textContent=user.is_verified?'Verified driver':'Verification required';
      $('driverStatus').className='pill '+(user.is_verified?'success':'warning');
      if(!user.is_verified){setMessage('gpsMessage','Your driver account is awaiting verification. You cannot go online yet.','error');$('onlineToggle').disabled=true;}
      await refresh();
    }catch(error){$('driverStatus').textContent='Unable to load';setMessage('gpsMessage',error.message,'error');}
  }
  async function showApplication(){
    $('driverApplication').hidden=false;$('driverConsole').hidden=true;
    try{
      const app=await driveRequest('/drivers/application');
      if(app){
        $('driverApplicationState').innerHTML='<div class="list-item"><div><strong>Application status</strong><small>'+driveEscape(app.rejection_reason||'Submitted '+driveDate(app.created_at))+'</small></div><span class="pill '+stateClass(app.status)+'">'+driveEscape(app.status)+'</span></div>';
        if(app.status==='pending'||app.status==='approved') $('driverApplyForm').hidden=true;
      }
    }catch(error){setMessage('driverApplyMessage',error.message,'error');}
  }
  $('driverApplyForm')?.addEventListener('submit',async event=>{
    event.preventDefault();const button=$('driverApplyForm').querySelector('button');button.disabled=true;
    try{
      const result=await driveRequest('/drivers/application',{method:'POST',body:JSON.stringify({
        license_number:$('licenseNumber').value.trim(),experience_years:Number($('experienceYears').value),
        requested_vehicle_type:$('driverVehicleType').value,note:$('driverNote').value.trim()
      })});
      setMessage('driverApplyMessage',result.message||'Application submitted.','success');
      $('driverApplicationState').innerHTML='<span class="pill warning">Pending review</span>';
      $('driverApplyForm').hidden=true;
    }catch(error){setMessage('driverApplyMessage',error.message,'error');}
    finally{button.disabled=false;}
  });
  async function refresh(){
    const [requests,trips]=await Promise.all([
      driveRequest('/rides/open-requests').catch(()=>[]),
      driveRequest('/rides').catch(()=>[])
    ]);
    $('openCount').textContent=requests.length;$('driverTripCount').textContent=trips.length;
    $('openRequests').innerHTML=requests.length?requests.map(ride=>{
      const requestId=ride.requestId||ride.id;
      return '<div class="list-item"><div class="list-item-main"><strong>'+driveEscape(ride.pickupAddress||ride.pickup_label||'Pickup')+' → '+driveEscape(ride.destinationAddress||ride.destination_label||'Destination')+'</strong><small>'+driveEscape(ride.vehicleType||ride.requested_vehicle)+' · '+driveMoney(ride.estimatedFare||ride.estimated_fare)+' · '+driveDate(ride.createdAt||ride.created_at)+'</small></div><button class="button-mini dark" data-claim="'+driveEscape(requestId)+'">Accept</button></div>';
    }).join(''):'<div class="empty-state">No nearby requests right now. Stay online to receive new trips.</div>';
    $('assignedTrips').innerHTML=trips.length?trips.map(ride=>{
      const status=ride.status||'matched';let next='';
      if(status==='matched')next='driver_arriving';
      else if(status==='driver_arriving')next='in_progress';
      else if(status==='in_progress')next='completed';
      const label=({driver_arriving:'Arrived at pickup',in_progress:'Start trip',completed:'Complete trip'})[next]||'';
      return '<div class="list-item"><div class="list-item-main"><strong>'+driveEscape(ride.pickupAddress||'Pickup')+' → '+driveEscape(ride.destinationAddress||'Destination')+'</strong><small>'+driveDate(ride.createdAt)+' · '+driveMoney(ride.estimatedFare)+'</small><span class="pill '+stateClass(status)+'">'+driveEscape(status.replaceAll('_',' '))+'</span></div>'+(next?'<button class="button-mini dark" data-status="'+driveEscape(ride.id)+'" data-next="'+next+'">'+label+'</button>':'')+'</div>';
    }).join(''):'<div class="empty-state">Accepted trips will appear here.</div>';
    $('openRequests').querySelectorAll('[data-claim]').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;
      try{await driveRequest('/rides/requests/'+button.dataset.claim+'/claim',{method:'POST'});driveToast('Ride accepted.');await refresh();}
      catch(error){driveToast(error.message);button.disabled=false;}
    }));
    $('assignedTrips').querySelectorAll('[data-status]').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;
      try{await driveRequest('/rides/'+button.dataset.status+'/status',{method:'PATCH',body:JSON.stringify({status:button.dataset.next})});driveToast('Trip status updated.');await refresh();}
      catch(error){driveToast(error.message);button.disabled=false;}
    }));
  }
  function sendLocation(isAvailable){
    if(!lastPosition)return Promise.reject(new Error('Waiting for GPS location.'));
    if(sending)return Promise.resolve();
    sending=true;
    return driveRequest('/drivers/location',{method:'POST',body:JSON.stringify({
      lat:lastPosition.coords.latitude,lng:lastPosition.coords.longitude,
      heading:lastPosition.coords.heading??undefined,speedKph:lastPosition.coords.speed?lastPosition.coords.speed*3.6:undefined,
      isAvailable
    })}).finally(()=>{sending=false;});
  }
  $('onlineToggle')?.addEventListener('click',()=>{
    if(online){
      online=false;if(watchId!==null)navigator.geolocation.clearWatch(watchId);watchId=null;
      if(lastPosition)sendLocation(false).catch(()=>{});
      $('onlineToggle').textContent='Go online';$('presenceLabel').textContent='Offline';setMessage('gpsMessage','You are offline.');
      return;
    }
    if(!navigator.geolocation){setMessage('gpsMessage','This browser does not support GPS.','error');return;}
    $('onlineToggle').disabled=true;setMessage('gpsMessage','Requesting location permission…');
    watchId=navigator.geolocation.watchPosition(async position=>{
      lastPosition=position;
      if(!online){
        online=true;$('onlineToggle').disabled=false;$('onlineToggle').textContent='Go offline';$('presenceLabel').textContent='Online';
      }
      try{await sendLocation(true);setMessage('gpsMessage','Online · location updated. Keep this tab open while accepting trips.','success');}
      catch(error){setMessage('gpsMessage',error.message,'error');}
    },error=>{
      $('onlineToggle').disabled=false;setMessage('gpsMessage',error.message||'Location permission is required.','error');
    },{enableHighAccuracy:true,maximumAge:5000,timeout:12000});
  });
  $('refreshRequests')?.addEventListener('click',()=>refresh().catch(error=>driveToast(error.message)));
  $('logoutButton')?.addEventListener('click',()=>{if(watchId!==null)navigator.geolocation.clearWatch(watchId);driveClearSession();location.href='index.html';});
  load();
})();