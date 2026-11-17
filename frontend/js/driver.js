const el=id=>document.getElementById(id);
const user=JSON.parse(localStorage.getItem('drive_user')||'null');
if(!localStorage.getItem(DRIVE_TOKEN_KEY))location.href='login.html';
if(user?.role!=='driver'){
  el('driverMessage').textContent='This workspace is only available to approved driver accounts.';
  el('openRequests').textContent='Your account role is '+(user?.role||'unknown')+'.';
}

let driverOnline=localStorage.getItem('drive_driver_online')==='true';
let driverMap=null,driverMarker=null,driverRouteLayers=[];
let presenceWatchId=null,lastPresenceSentAt=0,lastDriverPoint=null;
let activeRideIds=new Set(),knownNotificationIds=new Set(),notificationsLoaded=false;
let refreshInFlight=false;

function card(title,meta){
  const item=document.createElement('article');
  item.className='driver-item';
  const heading=document.createElement('strong');
  heading.textContent=title;
  const detail=document.createElement('div');
  detail.className='driver-meta';
  detail.textContent=meta;
  item.append(heading,detail);
  return item;
}

function action(parent,label,fn,disabled=false){
  const button=document.createElement('button');
  button.textContent=label;
  button.disabled=disabled;
  button.addEventListener('click',async()=>{
    button.disabled=true;
    try{await fn();await refresh();}
    catch(error){el('driverMessage').textContent=error.message;button.disabled=!driverOnline;}
  });
  parent.append(button);
  return button;
}

function gpsDistanceKm(a,b){
  const rad=n=>n*Math.PI/180;
  const lat=rad(b.lat-a.lat),lng=rad(b.lng-a.lng);
  const x=Math.sin(lat/2)**2+Math.cos(rad(a.lat))*Math.cos(rad(b.lat))*Math.sin(lng/2)**2;
  return 6371*2*Math.atan2(Math.sqrt(x),Math.sqrt(1-x));
}

function initDriverMap(){
  if(!window.L||driverMap)return;
  driverMap=L.map('driverMap').setView([23.7808,90.4125],12);
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{
    maxZoom:19,
    attribution:'&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>',
  }).addTo(driverMap);
}

async function showRideOnMap(q){
  if(!driverMap)return;
  driverRouteLayers.forEach(layer=>driverMap.removeLayer(layer));
  driverRouteLayers=[];
  const pickup=q.pickup_lat!=null?[Number(q.pickup_lat),Number(q.pickup_lng)]:null;
  const destination=q.destination_lat!=null?[Number(q.destination_lat),Number(q.destination_lng)]:null;
  if(pickup)driverRouteLayers.push(L.marker(pickup).addTo(driverMap).bindPopup('Pickup · '+(q.pickup_label||'')));
  if(destination)driverRouteLayers.push(L.marker(destination).addTo(driverMap).bindPopup('Destination · '+(q.destination_label||'')));
  if(pickup&&destination){
    driverMap.fitBounds(L.latLngBounds(pickup,destination).pad(.2));
    try{
      const route=await driveRequest('/routes/optimize',{method:'POST',body:JSON.stringify({
        pickupLat:pickup[0],pickupLng:pickup[1],
        destinationLat:destination[0],destinationLng:destination[1],
        preference:'fastest',
      })});
      if(route.selectedRoute.geometry?.coordinates){
        const line=L.polyline(route.selectedRoute.geometry.coordinates.map(point=>[point[1],point[0]]),{
          color:'#94a93c',weight:4,opacity:.85,
        }).addTo(driverMap);
        driverRouteLayers.push(line);
      }
    }catch(error){
      el('driverMessage').textContent='Route preview unavailable: '+error.message;
    }
  }else if(pickup)driverMap.setView(pickup,15);
}

function showTripOnMap(trip){
  const q=trip.request||{};
  return showRideOnMap({
    pickup_lat:q.pickup_lat,pickup_lng:q.pickup_lng,pickup_label:trip.pickupAddress,
    destination_lat:q.destination_lat,destination_lng:q.destination_lng,destination_label:trip.destinationAddress,
  });
}

function updatePresenceStatus(text){
  const status=el('driverPresenceStatus');
  if(status)status.textContent=text;
  const toggle=el('driverOnlineToggle');
  if(toggle){
    toggle.textContent=driverOnline?'Go offline':'Go online';
    toggle.classList.toggle('is-online',driverOnline);
    toggle.setAttribute('aria-pressed',String(driverOnline));
  }
}

async function sendPresence(point){
  if(!point)return;
  const now=Date.now();
  if(now-lastPresenceSentAt<8000)return;
  lastPresenceSentAt=now;
  const isAvailable=driverOnline&&activeRideIds.size===0;
  try{
    await driveRequest('/drivers/location',{method:'POST',body:JSON.stringify({
      lat:point.lat,lng:point.lng,
      heading:point.heading,
      speedKph:point.speedKph,
      isAvailable,
    })});
    updatePresenceStatus(activeRideIds.size
      ?'On trip · location sharing active'
      :driverOnline?'Online · visible to nearby passengers':'Offline · not accepting new rides');
  }catch(error){
    updatePresenceStatus('Location update failed · '+error.message);
  }
}

function startPresenceWatch(){
  if(presenceWatchId!==null||!navigator.geolocation)return;
  presenceWatchId=navigator.geolocation.watchPosition(async position=>{
    const point={
      lat:position.coords.latitude,
      lng:position.coords.longitude,
      heading:position.coords.heading==null?undefined:position.coords.heading,
      speedKph:position.coords.speed==null?undefined:position.coords.speed*3.6,
    };
    lastDriverPoint=point;
    if(driverMap){
      const mapPoint=[point.lat,point.lng];
      if(driverMarker)driverMarker.setLatLng(mapPoint);
      else driverMarker=L.circleMarker(mapPoint,{radius:9,color:'#fff',weight:3,fillColor:'#84a83c',fillOpacity:1})
        .addTo(driverMap).bindPopup('Your live location');
    }
    await sendPresence(point);
    for(const rideId of activeRideIds){
      try{
        await driveRequest('/rides/'+rideId+'/location',{method:'POST',body:JSON.stringify({lat:point.lat,lng:point.lng})});
      }catch(error){
        el('driverMessage').textContent='Trip GPS update failed: '+error.message;
      }
    }
  },error=>{
    updatePresenceStatus('GPS unavailable · '+error.message);
    el('driverMessage').textContent='Allow location access to go online and receive nearby ride requests.';
  },{enableHighAccuracy:true,maximumAge:3000,timeout:15000});
}

function stopPresenceWatchIfIdle(){
  if(driverOnline||activeRideIds.size>0||presenceWatchId===null)return;
  navigator.geolocation.clearWatch(presenceWatchId);
  presenceWatchId=null;
  lastPresenceSentAt=0;
}

async function setDriverOnline(online){
  if(online){
    const currentTrips=await driveRequest('/rides');
    activeRideIds=new Set((currentTrips||[]).filter(trip=>['matched','driver_arriving','in_progress'].includes(trip.status)).map(trip=>trip.id));
    if('Notification'in window&&Notification.permission==='default'){
      try{await Notification.requestPermission();}catch{}
    }
    if(!navigator.geolocation)throw new Error('This browser does not support GPS location.');
    await new Promise((resolve,reject)=>{
      navigator.geolocation.getCurrentPosition(
        position=>{lastDriverPoint={lat:position.coords.latitude,lng:position.coords.longitude};resolve();},
        error=>reject(new Error('Allow location access before going online: '+error.message)),
        {enableHighAccuracy:true,timeout:15000,maximumAge:5000},
      );
    });
    driverOnline=true;
    localStorage.setItem('drive_driver_online','true');
    startPresenceWatch();
    await sendPresence(lastDriverPoint);
    updatePresenceStatus('Online · checking nearby ride requests');
  }else{
    driverOnline=false;
    localStorage.removeItem('drive_driver_online');
    if(lastDriverPoint)await driveRequest('/drivers/location',{method:'POST',body:JSON.stringify({
      lat:lastDriverPoint.lat,lng:lastDriverPoint.lng,isAvailable:false,
    })});
    stopPresenceWatchIfIdle();
    updatePresenceStatus(activeRideIds.size?'On trip · GPS remains active':'Offline · not accepting new rides');
  }
}

el('driverOnlineToggle')?.addEventListener('click',async()=>{
  const button=el('driverOnlineToggle');
  button.disabled=true;
  try{await setDriverOnline(!driverOnline);await refresh();}
  catch(error){el('driverMessage').textContent=error.message;}
  finally{button.disabled=false;}
});

async function loadDriverNotifications(){
  try{
    const result=await driveRequest('/notifications');
    const root=el('driverAlerts');
    if(!root)return;
    const unread=(result.items||[]).filter(item=>item.type==='ride_request'&&!item.read_at);
    root.replaceChildren();
    if(!unread.length){
      root.textContent='No new ride alerts.';
    }else{
      unread.slice(0,8).forEach(item=>{
        const alert=document.createElement('article');
        alert.className='driver-alert';
        const title=document.createElement('strong');
        title.textContent=item.title;
        const body=document.createElement('p');
        body.textContent=item.body;
        const meta=document.createElement('small');
        meta.textContent=new Date(item.created_at).toLocaleTimeString();
        alert.append(title,body,meta);
        root.append(alert);
        if(notificationsLoaded&&!knownNotificationIds.has(item.id)&&'Notification'in window&&Notification.permission==='granted'){
          new Notification(item.title,{body:item.body});
        }
        knownNotificationIds.add(item.id);
      });
    }
    notificationsLoaded=true;
  }catch(error){
    const root=el('driverAlerts');
    if(root)root.textContent='Alerts unavailable: '+error.message;
  }
}

async function refresh(){
  if(user?.role!=='driver'||refreshInFlight)return;
  refreshInFlight=true;
  try{
    const [requests,trips]=await Promise.all([
      driveRequest('/rides/open-requests'),
      driveRequest('/rides'),
    ]);

    activeRideIds=new Set((trips||[])
      .filter(trip=>['matched','driver_arriving','in_progress'].includes(trip.status))
      .map(trip=>trip.id));

    if(driverOnline||activeRideIds.size>0)startPresenceWatch();
    stopPresenceWatchIfIdle();
    if(driverOnline&&activeRideIds.size===0&&lastDriverPoint)await sendPresence(lastDriverPoint);
    updatePresenceStatus(activeRideIds.size
      ?'On trip · live location is being shared'
      :driverOnline?'Online · visible to nearby passengers':'Offline · go online to accept rides');

    const open=el('openRequests');
    open.replaceChildren();
    const ordered=[...(requests||[])].sort((a,b)=>{
      if(!lastDriverPoint)return new Date(a.created_at)-new Date(b.created_at);
      const distanceA=gpsDistanceKm(lastDriverPoint,{lat:Number(a.pickup_lat),lng:Number(a.pickup_lng)});
      const distanceB=gpsDistanceKm(lastDriverPoint,{lat:Number(b.pickup_lat),lng:Number(b.pickup_lng)});
      return distanceA-distanceB;
    });
    if(!ordered.length)open.textContent='No open requests at the moment.';
    ordered.forEach(request=>{
      const distance=lastDriverPoint
        ?gpsDistanceKm(lastDriverPoint,{lat:Number(request.pickup_lat),lng:Number(request.pickup_lng)})
        :null;
      const meta=(request.requested_vehicle||'').toUpperCase()
        +' · ৳'+(request.estimated_fare||0)
        +' · '+(request.estimated_distance_km||'—')+' km'
        +(distance!==null?' · '+distance.toFixed(1)+' km from you':'')
        +(request.is_shared?' · Shared ride · '+(request.seats_requested||1)+' seat(s)':'')
        +(request.women_safety_preference?' · Verified driver required':'');
      const item=card(request.pickup_label+' → '+request.destination_label,meta);
      action(item,'Show on map',()=>showRideOnMap(request));
      action(item,'Accept ride',async()=>{
        if(!driverOnline)throw new Error('Go online and enable GPS before accepting a ride.');
        await driveRequest('/rides/requests/'+request.id+'/claim',{method:'POST'});
        activeRideIds.add(request.id);
        el('driverMessage').textContent='Ride accepted. Your location is now shared with the passenger while you approach pickup.';
      },!driverOnline);
      open.append(item);
    });

    const assigned=el('assignedTrips');
    assigned.replaceChildren();
    if(!trips.length)assigned.textContent='No assigned trips yet.';
    trips.forEach(trip=>{
      const item=card(trip.pickupAddress+' → '+trip.destinationAddress,trip.status.toUpperCase()+' · ৳'+trip.estimatedFare);
      action(item,'Show route',()=>showTripOnMap(trip));
      if(trip.status==='matched'){
        action(item,'Confirm & approach',()=>driveRequest('/rides/'+trip.id+'/status',{
          method:'PATCH',body:JSON.stringify({status:'driver_arriving'}),
        }));
      }
      if(trip.status==='driver_arriving'){
        action(item,'Start trip',()=>driveRequest('/rides/'+trip.id+'/status',{
          method:'PATCH',body:JSON.stringify({status:'in_progress'}),
        }));
      }
      if(['matched','driver_arriving','in_progress'].includes(trip.status)){
        activeRideIds.add(trip.id);
        if(driverOnline||activeRideIds.size>0)startPresenceWatch();
        const state=document.createElement('small');
        state.className='driver-meta';
        state.textContent='Live location sharing is active for this accepted trip.';
        item.append(state);
      }
      assigned.append(item);
    });

    await loadDriverNotifications();
    el('driverMessage').textContent='Updated '+new Date().toLocaleTimeString()+'.';
  }catch(error){
    el('driverMessage').textContent=error.message;
  }finally{
    refreshInFlight=false;
  }
}

el('driverLogout').addEventListener('click',async()=>{
  try{
    driverOnline=false;
    localStorage.removeItem('drive_driver_online');
    if(lastDriverPoint)await driveRequest('/drivers/location',{method:'POST',body:JSON.stringify({
      lat:lastDriverPoint.lat,lng:lastDriverPoint.lng,isAvailable:false,
    })});
  }catch{}
  if(presenceWatchId!==null&&navigator.geolocation)navigator.geolocation.clearWatch(presenceWatchId);
  presenceWatchId=null;
  localStorage.removeItem(DRIVE_TOKEN_KEY);
  localStorage.removeItem('drive_refresh_token');
  localStorage.removeItem('drive_user');
  location.href='login.html';
});

if(user?.role==='driver'){
  initDriverMap();
  updatePresenceStatus(driverOnline?'Connecting to GPS…':'Offline · go online to accept rides');
  refresh();
  setInterval(refresh,7000);
}
