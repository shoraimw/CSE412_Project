(() => {
  if(!driveRequireAuth('driver.html'))return;
  const $=id=>document.getElementById(id);
  const activeStates=['matched','driver_arriving','in_progress'];
  let watchId=null,lastPosition=null,available=false,assignedTrips=[],locationSending=false,firstGpsFix=true;
  const setMessage=(id,text,kind='')=>{const el=$(id);if(el){el.textContent=text;el.className='message '+kind;}};
  const stateClass=s=>['completed','approved'].includes(s)?'success':['pending','requested','matched','driver_arriving','in_progress'].includes(s)?'warning':['rejected','cancelled'].includes(s)?'danger':'';
  const activeTrips=()=>assignedTrips.filter(ride=>activeStates.includes(ride.status));
  const setPresence=(label,buttonText,disabled=false)=>{
    $('presenceLabel').textContent=label;
    $('onlineToggle').textContent=buttonText;
    $('onlineToggle').disabled=disabled;
  };

  async function load(){
    try{
      const user=await driveRequest('/users/me');
      if(user.role==='passenger'){await showApplication();return;}
      if(user.role!=='driver'){
        $('driverStatus').textContent='Driver access required';$('driverStatus').className='pill danger';
        $('driverApplication').hidden=true;$('driverConsole').hidden=true;return;
      }
      $('driverApplication').hidden=true;$('driverConsole').hidden=false;
      $('driverStatus').textContent=user.is_verified?'Verified driver':'Verification required';
      $('driverStatus').className='pill '+(user.is_verified?'success':'warning');
      if(!user.is_verified){setMessage('gpsMessage','Your driver account is awaiting verification. You cannot go online yet.','error');$('onlineToggle').disabled=true;}
      await refresh();
      if(activeTrips().length)startLocationWatch(false);
      setInterval(()=>{if(!document.hidden)refresh().catch(error=>setMessage('gpsMessage',error.message,'error'));},15000);
    }catch(error){$('driverStatus').textContent='Unable to load';setMessage('gpsMessage',error.message,'error');}
  }

  async function showApplication(){
    $('driverApplication').hidden=false;$('driverConsole').hidden=true;
    try{
      const app=await driveRequest('/drivers/application');
      if(app){
        $('driverApplicationState').innerHTML='<div class="list-item"><div><strong>Application status</strong><small>'+driveEscape(app.rejection_reason||'Submitted '+driveDate(app.created_at))+'</small></div><span class="pill '+stateClass(app.status)+'">'+driveEscape(app.status)+'</span></div>';
        if(app.status==='pending'||app.status==='approved')$('driverApplyForm').hidden=true;
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
      $('driverApplicationState').innerHTML='<span class="pill warning">Pending review</span>';$('driverApplyForm').hidden=true;
    }catch(error){setMessage('driverApplyMessage',error.message,'error');}
    finally{button.disabled=false;}
  });

  async function updateDriverLocation(isAvailable){
    if(!lastPosition||locationSending)return;
    locationSending=true;
    try{
      const c=lastPosition.coords;
      await driveRequest('/drivers/location',{method:'POST',body:JSON.stringify({
        lat:c.latitude,lng:c.longitude,heading:c.heading??undefined,
        speedKph:c.speed?c.speed*3.6:undefined,isAvailable
      })});
    }finally{locationSending=false;}
  }

  async function updateActiveRideLocations(){
    const c=lastPosition?.coords;if(!c)return;
    const rides=activeTrips();
    await Promise.all(rides.map(ride=>driveRequest('/rides/'+encodeURIComponent(ride.id)+'/location',{
      method:'POST',body:JSON.stringify({
        lat:c.latitude,lng:c.longitude,heading:c.heading??undefined,
        speedKph:c.speed?c.speed*3.6:undefined
      })
    }).catch(error=>setMessage('gpsMessage','Trip GPS update: '+error.message,'error'))));
  }

  function startLocationWatch(makeAvailable){
    if(!navigator.geolocation){setMessage('gpsMessage','This browser does not support GPS location.','error');return;}
    available=Boolean(makeAvailable)&&activeTrips().length===0;
    if(watchId!==null)return;
    firstGpsFix=true;
    setMessage('gpsMessage','Requesting GPS permission…');
    watchId=navigator.geolocation.watchPosition(async position=>{
      lastPosition=position;
      const onTrip=activeTrips().length>0;
      if(onTrip)available=false;
      try{
        await updateDriverLocation(available&&!onTrip);
        if(onTrip){
          await updateActiveRideLocations();
          setPresence('On trip','Trip in progress',true);
          setMessage('gpsMessage','Your availability is paused while you complete this trip. Live trip location is being shared.','success');
        }else if(available){
          setPresence('Online','Go offline',false);
          setMessage('gpsMessage','You are online. Nearby ride requests refresh automatically.','success');
        }else{
          setPresence('Offline','Go online',false);
          setMessage('gpsMessage','You are offline.','');
        }
      }catch(error){setMessage('gpsMessage',error.message,'error');}
      if(firstGpsFix){firstGpsFix=false;refresh().catch(()=>{});}
    },error=>{
      if(watchId!==null)navigator.geolocation.clearWatch(watchId);
      watchId=null;available=false;
      setMessage('gpsMessage',error.message||'Location permission is required.','error');
      if(activeTrips().length)setPresence('Location unavailable','Retry GPS',false);
      else setPresence('Offline','Go online',false);
    },{enableHighAccuracy:true,maximumAge:5000,timeout:15000});
  }

  async function stopLocationWatch(){
    available=false;
    if(watchId!==null){navigator.geolocation.clearWatch(watchId);watchId=null;}
    if(lastPosition){try{await updateDriverLocation(false);}catch(error){setMessage('gpsMessage',error.message,'error');}}
    setPresence('Offline','Go online',false);
    setMessage('gpsMessage','You are offline.','');
  }

  async function refresh(){
    const [requests,trips]=await Promise.all([
      driveRequest('/rides/open-requests').catch(()=>[]),
      driveRequest('/rides').catch(()=>[])
    ]);
    assignedTrips=Array.isArray(trips)?trips:[];
    $('openCount').textContent=requests.length;$('driverTripCount').textContent=assignedTrips.length;
    $('openRequests').innerHTML=requests.length?requests.map(ride=>{
      const requestId=ride.requestId||ride.id;
      return '<div class="list-item"><div class="list-item-main"><strong>'+driveEscape(ride.pickupAddress||ride.pickup_label||'Pickup')+' → '+driveEscape(ride.destinationAddress||ride.destination_label||'Destination')+'</strong><small>'+driveEscape(ride.vehicleType||ride.requested_vehicle)+' · '+driveMoney(ride.estimatedFare||ride.estimated_fare)+' · '+driveDate(ride.createdAt||ride.created_at)+'</small></div><button class="button-mini dark" data-claim="'+driveEscape(requestId)+'">Accept</button></div>';
    }).join(''):'<div class="empty-state">No nearby requests right now. Go online and keep this page open to receive requests.</div>';
    $('assignedTrips').innerHTML=assignedTrips.length?assignedTrips.map(ride=>{
      const status=ride.status||'matched';let next='';
      if(status==='matched')next='driver_arriving';
      else if(status==='driver_arriving')next='in_progress';
      else if(status==='in_progress')next='completed';
      const label=({driver_arriving:'Arrived at pickup',in_progress:'Start trip',completed:'Complete trip'})[next]||'';
      return '<div class="list-item"><div class="list-item-main"><strong>'+driveEscape(ride.pickupAddress||'Pickup')+' → '+driveEscape(ride.destinationAddress||'Destination')+'</strong><small>'+driveDate(ride.createdAt)+' · '+driveMoney(ride.estimatedFare)+'</small><span class="pill '+stateClass(status)+'">'+driveEscape(status.replaceAll('_',' '))+'</span></div>'+(next?'<button class="button-mini dark" data-status="'+driveEscape(ride.id)+'" data-next="'+next+'">'+label+'</button>':'')+'</div>';
    }).join(''):'<div class="empty-state">Accepted trips will appear here.</div>';

    $('openRequests').querySelectorAll('[data-claim]').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;
      try{
        await driveRequest('/rides/requests/'+encodeURIComponent(button.dataset.claim)+'/claim',{method:'POST'});
        available=false;await refresh();
        if(activeTrips().length){startLocationWatch(false);setPresence('On trip','Trip in progress',true);}
        driveToast('Ride accepted. Your live trip tracking is active.');
      }catch(error){driveToast(error.message);button.disabled=false;}
    }));
    $('assignedTrips').querySelectorAll('[data-status]').forEach(button=>button.addEventListener('click',async()=>{
      button.disabled=true;
      try{
        await driveRequest('/rides/'+encodeURIComponent(button.dataset.status)+'/status',{method:'PATCH',body:JSON.stringify({status:button.dataset.next})});
        await refresh();
        if(activeTrips().length){available=false;if(watchId===null)startLocationWatch(false);setPresence('On trip','Trip in progress',true);}
        else if(watchId!==null)await stopLocationWatch();
        driveToast(button.dataset.next==='completed'?'Trip completed.':'Trip status updated.');
      }catch(error){driveToast(error.message);button.disabled=false;}
    }));

    if(activeTrips().length){
      available=false;
      if(watchId===null)startLocationWatch(false);
      setPresence('On trip','Trip in progress',true);
    }else if(watchId!==null&&!available){
      await stopLocationWatch();
    }
  }

  $('onlineToggle')?.addEventListener('click',()=>{
    if(activeTrips().length){if(watchId===null)startLocationWatch(false);return;}
    if(available){stopLocationWatch();return;}
    startLocationWatch(true);
  });
  $('refreshRequests')?.addEventListener('click',()=>refresh().catch(error=>driveToast(error.message)));
  $('logoutButton')?.addEventListener('click',async()=>{if(activeTrips().length&&!confirm('You have an active trip. Logging out will stop live GPS updates. Continue?'))return;await stopLocationWatch();driveClearSession();location.href='index.html';});
  load();
})();