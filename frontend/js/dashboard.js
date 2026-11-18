const $=id=>document.getElementById(id);const formatMoney=(amount,currency='BDT')=>{try{return new Intl.NumberFormat(undefined,{style:'currency',currency,maximumFractionDigits:2}).format(Number(amount)||0);}catch{return currency+' '+(Number(amount)||0).toFixed(2);}};const msg=(id,text)=>$(id).textContent=text;const driveUser=JSON.parse(localStorage.getItem('drive_user')||'null');
let womenSafetyWatchId=null,womenSafetySessionId=null,lastSafetyLocationAt=0,womenSafetyDefaultEnabled=false;
function getBrowserPosition(){return new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error('This browser does not support GPS location.'));navigator.geolocation.getCurrentPosition(p=>resolve({lat:p.coords.latitude,lng:p.coords.longitude}),e=>reject(new Error(e.message||'Location permission was not granted.')),{enableHighAccuracy:true,timeout:12000,maximumAge:5000});});}
function stopWomenSafetyWatch(){if(womenSafetyWatchId!==null&&navigator.geolocation){navigator.geolocation.clearWatch(womenSafetyWatchId);womenSafetyWatchId=null;}womenSafetySessionId=null;}
function startWomenSafetyWatch(sessionId){if(!sessionId||!navigator.geolocation)return;if(womenSafetySessionId===sessionId&&womenSafetyWatchId!==null)return;stopWomenSafetyWatch();womenSafetySessionId=sessionId;lastSafetyLocationAt=0;womenSafetyWatchId=navigator.geolocation.watchPosition(async p=>{const now=Date.now();if(now-lastSafetyLocationAt<5000)return;lastSafetyLocationAt=now;try{await driveRequest('/safety/trips/'+encodeURIComponent(sessionId)+'/location',{method:'POST',body:JSON.stringify({lat:p.coords.latitude,lng:p.coords.longitude})});const el=$('womenSafetyStatus');if(el)el.textContent='Live location is being shared securely · updated '+new Date().toLocaleTimeString();}catch(e){const el=$('womenSafetyStatus');if(el)el.textContent='Location update paused: '+e.message;}},e=>{const el=$('womenSafetyStatus');if(el)el.textContent='GPS permission/location unavailable: '+e.message;},{enableHighAccuracy:true,maximumAge:3000,timeout:15000});const el=$('womenSafetyStatus');if(el)el.textContent='Women Safety is active. Keep this dashboard open for continuous GPS updates.';}
function normalizeSafetyPhone(phone){let n=String(phone||'').replace(/[^0-9]/g,'');if(n.startsWith('01'))n='88'+n;else if(n.startsWith('1')&&n.length===10)n='880'+n;return n;}
function renderWomenSafetyHandoff(ride){const root=$('rideMsg');root.replaceChildren();const p=document.createElement('p');p.textContent='Ride request created. Estimated fare: ৳'+ride.estimatedFare+'.';root.append(p);if(!ride.womenSafety?.enabled)return;const ws=ride.womenSafety;const status=$('womenSafetyStatus');if(ws.sessionStarted===false){if(status)status.textContent='Women Safety session could not be initialized. '+(ws.warning||'Please review your safety settings.');const warning=document.createElement('p');warning.textContent='Your ride request was still submitted, but Women Safety tracking is not active: '+(ws.warning||'session setup failed');root.append(warning);return;}if(status)status.textContent='Women Safety session created. Live GPS monitoring starts when your driver starts the trip.';if(!ws.shareToken){const note=document.createElement('p');note.textContent='No trusted/emergency contacts are saved yet. Add contacts in Safety & Travel to enable private live sharing.';root.append(note);return;}const url=new URL('shared-trip.html',window.location.href);url.searchParams.set('token',ws.shareToken);const intro=document.createElement('p');intro.textContent='Private live-trip link created. Send it to your trusted contacts once; their map will update automatically while your trip is active.';root.append(intro);const link=document.createElement('a');link.href=url.toString();link.target='_blank';link.rel='noopener noreferrer';link.textContent='Preview private live location';root.append(link);(ws.contacts||[]).forEach(contact=>{const row=document.createElement('div');row.className='women-safety-contact-actions';const name=document.createElement('strong');name.textContent=contact.name+' · '+contact.type;const text='I have started a DRIVE trip to '+$('destination').value+'. Follow my live location here: '+url.toString();const sms=document.createElement('a');sms.className='button button-dark';sms.href='sms:'+String(contact.phone||'').replace(/[^+0-9]/g,'')+'?body='+encodeURIComponent(text);sms.textContent='SMS';const wa=document.createElement('a');wa.className='button button-accent';wa.href='https://wa.me/'+normalizeSafetyPhone(contact.phone)+'?text='+encodeURIComponent(text);wa.target='_blank';wa.rel='noopener noreferrer';wa.textContent='WhatsApp';row.append(name,sms,wa);root.append(row);});}
async function loadWomenSafetySession(rides){try{const sessions=await driveRequest('/safety/trips/active');const session=(sessions||[]).find(x=>x.rideRequestId&&(rides||[]).some(r=>r.requestId===x.rideRequestId)&&x.status!=='COMPLETED');const ride=session?(rides||[]).find(r=>r.requestId===session.rideRequestId):null;if(session&&ride?.status==='in_progress'){startWomenSafetyWatch(session.id);const el=$('womenSafetyStatus');if(el)el.textContent='Women Safety active · live location updates automatically. Keep this page open.';}else if(session){stopWomenSafetyWatch();const el=$('womenSafetyStatus');if(el)el.textContent='Women Safety is ready. Live GPS monitoring starts when your driver starts the trip.';}else if(womenSafetyWatchId!==null){stopWomenSafetyWatch();const el=$('womenSafetyStatus');if(el)el.textContent='Ride ended or was cancelled. Automatic location sharing has stopped.';}}catch(e){const el=$('womenSafetyStatus');if(el)el.textContent='Could not restore Women Safety tracking: '+e.message;}}
function requireLogin(){if(!localStorage.getItem(DRIVE_TOKEN_KEY)){location.href='login.html';return false;}return true;}
const mapCenter=[23.7808,90.4125];let bookingMap,trackingMap,pickupMarker,destinationMarker,driverMarker,routeLine,trackingLine,nearbyDriverLayer,pickupPoint=null,destinationPoint=null,pickMode='pickup',activeTrackingRide=null,trackingTimer=null,trackingRouteRide=null,lastRouteGeometry=null,lastRouteMetrics=null,lastRouteCallAt=0,nearbyDriverTimer=null,requestWatchTimer=null;
async function ensureLeaflet(){const cssSources=['https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.css','https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.css'];if(!document.querySelector('link[data-drive-leaflet]')){for(const href of cssSources){try{await new Promise((resolve,reject)=>{const link=document.createElement('link');link.rel='stylesheet';link.href=href;link.dataset.driveLeaflet='true';link.onload=resolve;link.onerror=()=>{link.remove();reject(new Error('Map styles CDN unavailable'));};document.head.appendChild(link);});break;}catch{}}}if(window.L)return true;const sources=['https://cdn.jsdelivr.net/npm/leaflet@1.9.4/dist/leaflet.js','https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.js'];for(const src of sources){try{await new Promise((resolve,reject)=>{const script=document.createElement('script');script.src=src;script.crossOrigin='anonymous';script.onload=resolve;script.onerror=()=>reject(new Error('Map library CDN unavailable'));document.head.appendChild(script);});if(window.L)return true;}catch{}}return false;}
async function initMaps(){try{lastRouteGeometry=JSON.parse(sessionStorage.getItem('drive_route_geometry')||'null');lastRouteMetrics=JSON.parse(sessionStorage.getItem('drive_route_metrics')||'null');}catch{lastRouteGeometry=null;lastRouteMetrics=null;}const status=$('mapMessage');if(!await ensureLeaflet()){if(status)status.textContent='Map library could not load. Check your internet connection or allow cdn.jsdelivr.net / unpkg.com in your browser.';return;}try{const attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';bookingMap=L.map('bookingMap',{scrollWheelZoom:true}).setView(mapCenter,12);nearbyDriverLayer=L.layerGroup().addTo(bookingMap);let tileFallbackUsed=false;const primaryTiles=L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution});primaryTiles.addTo(bookingMap);primaryTiles.on('tileerror',()=>{if(tileFallbackUsed)return;tileFallbackUsed=true;bookingMap.removeLayer(primaryTiles);L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,attribution:attribution+' &copy; CARTO'}).addTo(bookingMap);if(status)status.textContent='Using alternate map tile provider.';});bookingMap.on('click',e=>setPoint(pickMode,e.latlng.lat,e.latlng.lng));trackingMap=L.map('trackingMap').setView(mapCenter,12);L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png',{subdomains:'abcd',maxZoom:20,attribution:attribution+' &copy; CARTO'}).addTo(trackingMap);setTimeout(()=>bookingMap.invalidateSize(),150);if(status)status.textContent='Map ready. Select pickup and destination; nearby verified drivers will appear automatically.';refreshNearbyDrivers();if(nearbyDriverTimer)clearInterval(nearbyDriverTimer);nearbyDriverTimer=setInterval(refreshNearbyDrivers,10000);}catch(error){if(status)status.textContent='Map initialization failed: '+error.message;console.error('DRIVE map initialization failed',error);}}
function setPoint(which,lat,lng,label){const point={lat:Number(lat),lng:Number(lng)};lastRouteGeometry=null;lastRouteMetrics=null;sessionStorage.removeItem('drive_route_geometry');sessionStorage.removeItem('drive_route_metrics');if(routeLine){bookingMap.removeLayer(routeLine);routeLine=null;}const inputId=which==='pickup'?'pickup':'destination';if(which==='pickup'){pickupPoint=point;if(pickupMarker)pickupMarker.setLatLng([lat,lng]);else{pickupMarker=L.marker([lat,lng],{draggable:true}).addTo(bookingMap).bindPopup('Pickup');pickupMarker.on('dragend',e=>{const p=e.target.getLatLng();setPoint('pickup',p.lat,p.lng);});}}else{destinationPoint=point;if(destinationMarker)destinationMarker.setLatLng([lat,lng]);else{destinationMarker=L.marker([lat,lng],{draggable:true}).addTo(bookingMap).bindPopup('Destination');destinationMarker.on('dragend',e=>{const p=e.target.getLatLng();setPoint('destination',p.lat,p.lng);});}}$(inputId).value=label||'Map point '+point.lat.toFixed(5)+', '+point.lng.toFixed(5);if(pickupPoint&&destinationPoint){bookingMap.fitBounds(L.latLngBounds([pickupPoint.lat,pickupPoint.lng],[destinationPoint.lat,destinationPoint.lng]).pad(.25));previewRoute().then(()=>refreshFareFromRoute());}}
$('pickPickup').addEventListener('click',()=>{pickMode='pickup';$('pickPickup').classList.add('active');$('pickDestination').classList.remove('active');msg('mapMessage','Tap the map to choose your pickup location.');});
$('pickDestination').addEventListener('click',()=>{pickMode='destination';$('pickDestination').classList.add('active');$('pickPickup').classList.remove('active');msg('mapMessage','Tap the map to choose your destination.');});
$('useMyLocation').addEventListener('click',()=>{if(!navigator.geolocation)return msg('mapMessage','Geolocation is not supported by this browser.');msg('mapMessage','Getting your current location…');navigator.geolocation.getCurrentPosition(p=>{setPoint('pickup',p.coords.latitude,p.coords.longitude,'My current location');bookingMap.setView([p.coords.latitude,p.coords.longitude],15);msg('mapMessage','Your current location is selected as pickup.');},e=>msg('mapMessage',e.message),{enableHighAccuracy:true,timeout:12000,maximumAge:10000});});
async function previewRoute(){
 if(!pickupPoint||!destinationPoint){msg('mapMessage','Select both pickup and destination first.');return false;}
 if(Date.now()-lastRouteCallAt<1100){
  if(lastRouteMetrics)return true;
  msg('mapMessage','Finding your route…');return false;
 }
 lastRouteCallAt=Date.now();
 msg('mapMessage','Finding the best available road route…');
 try{
  const r=await driveRequest('/routes/optimize',{method:'POST',body:JSON.stringify({
   pickupLat:pickupPoint.lat,pickupLng:pickupPoint.lng,
   destinationLat:destinationPoint.lat,destinationLng:destinationPoint.lng,
   preference:$('routePreference').value,
  })});
  if(routeLine)bookingMap.removeLayer(routeLine);
  lastRouteGeometry=r.selectedRoute.geometry?.coordinates||null;
  lastRouteMetrics={
   distanceKm:r.selectedRoute.distanceKm,
   durationMinutes:r.selectedRoute.durationMinutes,
    trafficStatus:'unavailable',
   note:r.note,provider:r.provider,
  };
  sessionStorage.setItem('drive_route_geometry',JSON.stringify(lastRouteGeometry));
  sessionStorage.setItem('drive_route_metrics',JSON.stringify(lastRouteMetrics));
  if(lastRouteGeometry){
   const coords=lastRouteGeometry.map(point=>[point[1],point[0]]);
   routeLine=L.polyline(coords,{color:'#647f27',weight:5,opacity:.9,dashArray:'10 9',lineCap:'round'}).addTo(bookingMap);
   bookingMap.fitBounds(routeLine.getBounds().pad(.18));
  }
  const trafficText='Live traffic is not included; showing standard road-route duration.';
  msg('mapMessage',r.provider+' · '+lastRouteMetrics.distanceKm+' km · '+lastRouteMetrics.durationMinutes+' min. '+trafficText+' '+r.note);
  await refreshFareFromRoute();
  await refreshNearbyDrivers();
  return true;
 }catch(error){
  msg('mapMessage','Route estimate unavailable: '+error.message);
  return false;
 }
}
$('previewRoute').addEventListener('click',previewRoute);
$('routePreference').addEventListener('change',()=>{if(pickupPoint&&destinationPoint)previewRoute().then(refreshFareFromRoute);});
const geocodeCache=new Map();let geocodeTimers={pickup:null,destination:null};let lastGeocodeRequestAt=0;let geocodeQueue=Promise.resolve();
function locationLabel(item){return item.name||item.display_name||'Selected location';}
async function fetchNominatim(url){
 const execute=async()=>{
  const waitMs=Math.max(0,1100-(Date.now()-lastGeocodeRequestAt));
  if(waitMs>0)await new Promise(resolve=>setTimeout(resolve,waitMs));
  lastGeocodeRequestAt=Date.now();
  return fetch(url,{headers:{'Accept':'application/json'}});
 };
 const request=geocodeQueue.then(execute,execute);
 geocodeQueue=request.then(()=>undefined,()=>undefined);
 return request;
}
async function searchPlaces(query){const q=String(query||'').trim();if(q.length<3)return[];const key=q.toLowerCase();if(geocodeCache.has(key))return geocodeCache.get(key);const url='https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=7&countrycodes=bd&q='+encodeURIComponent(q);const res=await fetchNominatim(url);if(!res.ok)throw new Error('Place search is temporarily unavailable. Please select the point on the map.');const data=await res.json();geocodeCache.set(key,data);return data;}
function bindPlaceAutocomplete(which){const input=$(which),list=$(which==='pickup'?'pickupSuggestions':'destinationSuggestions');input.addEventListener('input',()=>{clearTimeout(geocodeTimers[which]);const q=input.value.trim();if(q.length<3)return;geocodeTimers[which]=setTimeout(async()=>{try{const items=await searchPlaces(q);list.replaceChildren();items.forEach(item=>{const option=document.createElement('option');option.value=item.display_name;list.append(option);});}catch(e){msg('mapMessage',e.message);}},1000);});input.addEventListener('change',()=>resolveTypedPlace(which));}
async function resolveTypedPlace(which){const input=$(which),q=input.value.trim();if(q.length<3)return;msg('mapMessage','Finding '+(which==='pickup'?'pickup':'destination')+' on the map…');try{const items=await searchPlaces(q);if(!items.length)throw new Error('No matching Bangladesh location found. Try a nearby landmark or choose on the map.');const exact=items.find(x=>x.display_name.toLowerCase()===q.toLowerCase())||items[0];const lat=Number(exact.lat),lng=Number(exact.lon);setPoint(which==='pickup'?'pickup':'destination',lat,lng,exact.display_name);bookingMap.setView([lat,lng],15);msg('mapMessage','Selected: '+exact.display_name+'.');if(pickupPoint&&destinationPoint)await previewRoute();}catch(e){msg('mapMessage',e.message);}}
bindPlaceAutocomplete('pickup');bindPlaceAutocomplete('destination');
$('findPickup').addEventListener('click',()=>resolveTypedPlace('pickup'));
$('findDestination').addEventListener('click',()=>resolveTypedPlace('destination'));
async function refreshFareFromRoute(){
 if(!lastRouteMetrics?.distanceKm)return;
 $('fareResult').hidden=false;
 $('fareResult').textContent='Calculating fare from road distance…';
 const body=JSON.stringify({
  distanceKm:Number(lastRouteMetrics.distanceKm),
  vehicleType:$('vehicle').value,
  durationMinutes:Number(lastRouteMetrics.durationMinutes),
 });
 try{
  let r;
  try{
   r=await driveRequest('/fare/estimate',{method:'POST',body});
  }catch(error){
   // Existing production Worker versions expose /fare/predict. Keep a
   // temporary compatibility fallback while the updated Worker is deployed.
   if(!/404|Cannot POST|not found/i.test(error.message))throw error;
   r=await driveRequest('/fare/predict',{method:'POST',body});
  }
  const range=r.estimatedRange||r.predictedRange;
  const method=r.calculationMethod||r.predictionMethod||'Automatic fare calculation';
  $('fareResult').hidden=false;
  $('fareResult').textContent='Estimated: ৳'+r.estimatedFare
   +(range?' · Range: ৳'+range.min+'–৳'+range.max:'')
   +' · '+method;
  $('amountBdt').value=r.estimatedFare;
 }catch(error){
  $('fareResult').hidden=false;
  $('fareResult').textContent='Fare estimate unavailable: '+error.message;
 }
}
$('vehicle').addEventListener('change',()=>{refreshFareFromRoute();refreshNearbyDrivers();});

async function loadSharedRides(){try{const rides=await driveRequest('/rides/shared');const root=$('sharedRideList');root.replaceChildren();if(!rides.length){root.textContent='No shared rides with available seats right now.';return;}rides.forEach(ride=>{const card=document.createElement('article');card.className='ride-item';const title=document.createElement('strong');title.textContent=ride.pickup_label+' → '+ride.destination_label;const meta=document.createElement('div');meta.className='ride-meta';meta.textContent=(ride.vehicle_type||'').toUpperCase()+' · '+formatMoney(ride.estimated_fare)+' total estimated fare · '+ride.seats_available+' seat(s) available · '+(ride.distance_km||'—')+' km';const button=document.createElement('button');button.className='primary';button.textContent='Join shared ride';button.addEventListener('click',async()=>{button.disabled=true;try{const result=await driveRequest('/rides/'+ride.ride_id+'/share',{method:'POST'});meta.textContent='Your estimated share: '+formatMoney(result.passengerFare)+' · '+result.seatsRemaining+' seat(s) remain.';button.textContent='Joined ✓';button.disabled=true;await loadRides();await loadSharedRides();}catch(e){meta.textContent=e.message;button.disabled=false;}});const actions=document.createElement('div');actions.className='ride-actions';actions.append(button);card.append(title,meta,actions);root.append(card);});}catch(e){msg('sharedRideList',e.message);}}
async function submitPaymentReference(paymentId){
 const reference=window.prompt('Enter the bKash/Nagad transaction ID (6–64 letters or numbers). The payment will remain pending until an administrator verifies it.');
 if(reference===null)return;
 try{
  const result=await driveRequest('/payments/'+encodeURIComponent(paymentId)+'/reference',{method:'POST',body:JSON.stringify({reference:reference.trim()})});
  msg('rideMsg',result.message);
  await loadPayments();
  await loadRides();
 }catch(error){msg('rideMsg',error.message);}
}
async function beginRidePayment(ride,method){
 try{
  const result=await driveRequest('/payments/intent',{method:'POST',body:JSON.stringify({rideId:ride.id,method,currency:'BDT'})});
  if(method==='cash'){
   msg('rideMsg','Cash payment record created. DRIVE Admin must confirm after physically receiving the cash.');
  }else{
   msg('rideMsg','Payment record created. Complete the transfer using the merchant account details supplied by the project team, then submit the transaction ID.');
   const reference=window.prompt('After completing the '+method.toUpperCase()+' transfer, enter its transaction ID. Press Cancel to submit it later from Payment history.');
   if(reference!==null&&reference.trim()){
    const submitted=await driveRequest('/payments/'+encodeURIComponent(result.payment.id)+'/reference',{method:'POST',body:JSON.stringify({reference:reference.trim()})});
    msg('rideMsg',submitted.message);
   }
  }
  await loadPayments();
  await loadRides();
 }catch(error){msg('rideMsg',error.message);}
}
async function loadRides(){try{const rides=await driveRequest('/rides');let payments=[];try{payments=await driveRequest('/payments/me');}catch{}await loadWomenSafetySession(rides);const root=$('rideList');root.replaceChildren();if(!rides.length){root.textContent='No rides yet. Create your first ride request above.';return;}const paymentByRide=new Map((payments||[]).filter(p=>p.ride_id).map(p=>[p.ride_id,p]));rides.forEach(ride=>{const card=document.createElement('article');card.className='ride-item';const title=document.createElement('strong');title.textContent=ride.pickupAddress+' → '+ride.destinationAddress;const meta=document.createElement('div');meta.className='ride-meta';meta.textContent=ride.vehicleType.toUpperCase()+' · '+(ride.passengerFare!=null?'Your fare share: '+formatMoney(ride.passengerFare):'Estimated fare: '+formatMoney(ride.estimatedFare))+' · '+new Date(ride.createdAt).toLocaleString();const status=document.createElement('span');status.className='ride-status';status.textContent=ride.status.toUpperCase();const actions=document.createElement('div');actions.className='ride-actions';const add=(label,fn,primary=false)=>{const b=document.createElement('button');b.textContent=label;if(primary)b.className='primary';b.addEventListener('click',fn);actions.append(b);};if(ride.status==='requested'){const waiting=document.createElement('small');waiting.className='muted';waiting.textContent='Waiting for an eligible driver to claim this request.';card.append(waiting);}if(['matched','driver_arriving','in_progress'].includes(ride.status))add('Track this ride',()=>startTracking(ride.id),true);const payment=paymentByRide.get(ride.id);if(payment){const paymentState=document.createElement('small');paymentState.className='ride-meta';paymentState.textContent='Payment: '+payment.status.toUpperCase()+' · '+payment.method.toUpperCase()+' · '+formatMoney(payment.amount,payment.currency)+(payment.provider_reference?' · Txn ID submitted':'');card.append(paymentState);if(payment.status==='pending'&&['bkash','nagad'].includes(String(payment.method).toLowerCase())&&!payment.provider_reference)add('Submit transaction ID',()=>submitPaymentReference(payment.id));}else if(ride.status==='completed'){add('Pay / record payment',async()=>{const method=String(window.prompt('Choose payment method: cash, bkash, or nagad','cash')||'').trim().toLowerCase();if(!['cash','bkash','nagad'].includes(method)){msg('rideMsg','Choose cash, bkash or nagad. Card gateway is not connected.');return;}await beginRidePayment(ride,method);},true);}card.append(title,meta,status,actions);root.append(card);});}catch(e){msg('rideList',e.message);}}
async function startTracking(rideId){activeTrackingRide=rideId;trackingRouteRide=null;if(trackingTimer)clearInterval(trackingTimer);if(trackingLine){trackingMap.removeLayer(trackingLine);trackingLine=null;}if(driverMarker){trackingMap.removeLayer(driverMarker);driverMarker=null;}$('trackingPanel').hidden=false;$('trackingStatus').textContent='Connecting…';setTimeout(()=>{trackingMap.invalidateSize();if(trackingLine)trackingMap.fitBounds(trackingLine.getBounds().pad(.2));},180);await refreshTracking();trackingTimer=setInterval(refreshTracking,6000);$('trackingPanel').scrollIntoView({behavior:'smooth',block:'center'});}
async function refreshTracking(){if(!activeTrackingRide)return;try{const t=await driveRequest('/rides/'+activeTrackingRide+'/track');$('trackingStatus').textContent=t.status.replaceAll('_',' ').toUpperCase();if(t.pickup?.lat&&t.destination?.lat&&trackingRouteRide!==activeTrackingRide){trackingRouteRide=activeTrackingRide;const points=lastRouteGeometry?.length?lastRouteGeometry.map(c=>[c[1],c[0]]):[[t.pickup.lat,t.pickup.lng],[t.destination.lat,t.destination.lng]];trackingLine=L.polyline(points,{color:'#94a93c',weight:5,opacity:.85,dashArray:lastRouteGeometry?null:'7 7'}).addTo(trackingMap);trackingMap.fitBounds(trackingLine.getBounds().pad(.2));$('trackingMessage').textContent=lastRouteMetrics?'Route: '+lastRouteMetrics.distanceKm+' km · approximately '+lastRouteMetrics.durationMinutes+' min. '+lastRouteMetrics.note:'Route preview not saved in this browser session; showing pickup-to-destination line until a route is previewed.';}if(t.currentLocation){const p=[t.currentLocation.lat,t.currentLocation.lng];if(driverMarker)driverMarker.setLatLng(p);else driverMarker=L.marker(p).addTo(trackingMap).bindPopup('Live driver location');if(!trackingLine)trackingMap.setView(p,15);$('trackingMessage').textContent='Last GPS update: '+new Date(t.currentLocation.updatedAt).toLocaleTimeString()+(t.currentLocation.speedKph?' · '+t.currentLocation.speedKph+' km/h':'')+'. Refreshes automatically every 6 seconds.';}else{$('trackingMessage').textContent='Waiting for the driver to share GPS. This page checks for updates every 6 seconds.';if(t.pickup?.lat)trackingMap.setView([t.pickup.lat,t.pickup.lng],13);}}catch(e){$('trackingMessage').textContent=e.message;}}
async function watchRideRequest(requestId){
 if(requestWatchTimer)clearInterval(requestWatchTimer);
 let attempts=0;
 requestWatchTimer=setInterval(async()=>{
  attempts++;
  try{
   const rides=await driveRequest('/rides');
   const ride=(rides||[]).find(item=>item.requestId===requestId);
   if(!ride){if(attempts>12){clearInterval(requestWatchTimer);requestWatchTimer=null;}return;}
   if(ride.rideId&&['matched','driver_arriving','in_progress'].includes(ride.status)){
    clearInterval(requestWatchTimer);requestWatchTimer=null;
    msg('rideMsg','A verified driver accepted your request. Opening live driver tracking…');
    await loadRides();
    await startTracking(ride.rideId);
    return;
   }
   if(ride.status==='cancelled'){
    clearInterval(requestWatchTimer);requestWatchTimer=null;
    msg('rideMsg','This ride request was cancelled.');
    await loadRides();
    return;
   }
   if(attempts>=120){
    clearInterval(requestWatchTimer);requestWatchTimer=null;
    msg('rideMsg','Your request is still open. No driver has accepted yet; we will keep it in your ride history.');
   }
  }catch(error){
   if(attempts>=12){clearInterval(requestWatchTimer);requestWatchTimer=null;msg('rideMsg','Ride status refresh paused: '+error.message);}
  }
 },5000);
}

async function refreshNearbyDrivers(){
 if(!bookingMap||!nearbyDriverLayer||!pickupPoint)return;
 try{
  const query=new URLSearchParams({
   lat:String(pickupPoint.lat),lng:String(pickupPoint.lng),
   vehicleType:$('vehicle').value,radiusKm:'15',
  });
  const drivers=await driveRequest('/drivers/nearby?'+query.toString());
  nearbyDriverLayer.clearLayers();
  (drivers||[]).forEach(driver=>{
   const marker=L.circleMarker([Number(driver.latitude),Number(driver.longitude)],{
    radius:7,color:'#fff',weight:2,fillColor:'#7f9d36',fillOpacity:.95,
   }).addTo(nearbyDriverLayer);
   marker.bindPopup(
    '<strong>Verified '+String(driver.vehicle_type||'').toUpperCase()+' driver</strong><br>'
    +Number(driver.distance_km).toFixed(1)+' km from pickup'
   );
  });
  const status=$('nearbyDriverStatus');
  if(status){
   status.textContent=drivers.length
    ?drivers.length+' verified driver(s) online within 15 km. Nearest: '+Number(drivers[0].distance_km).toFixed(1)+' km away. Map updates automatically.'
    :'No verified drivers are online within 15 km right now. Your ride request can still be posted and will remain open for eligible drivers.';
  }
 }catch(error){
  const status=$('nearbyDriverStatus');
  if(status)status.textContent='Nearby driver map is temporarily unavailable: '+error.message;
 }
}

$('newRide').addEventListener('submit',async event=>{
 event.preventDefault();
 if(!pickupPoint||!destinationPoint){
  msg('rideMsg','Choose both pickup and destination on the map first.');
  return;
 }
 const submitButton=$('requestRideButton')||$('newRide').querySelector('button[type="submit"]');
 if(submitButton)submitButton.disabled=true;
 msg('rideMsg','Submitting your ride request and calculating the route…');
 try{
  const enabled=$('womenSafety').checked||womenSafetyDefaultEnabled;
  let initialLocation=null;
  if(enabled){
   try{initialLocation=await getBrowserPosition();}
   catch(error){msg('rideMsg','Location permission was not granted. Submitting the ride request; Women Safety GPS will need permission to start.');}
  }
  const safetyPlannedRoute=enabled&&lastRouteGeometry?.length>1
   ?(lastRouteGeometry.length>100
      ?Array.from({length:100},(_,i)=>lastRouteGeometry[Math.round(i*(lastRouteGeometry.length-1)/99)])
      :lastRouteGeometry).map(([lng,lat])=>({lat,lng}))
   :null;
  const data={
   pickupAddress:$('pickup').value,
   destinationAddress:$('destination').value,
   vehicleType:$('vehicle').value,
   routePreference:$('routePreference').value,
   isShared:$('shared').value==='true',
   seatsRequested:Number($('seatsRequested').value),
   womenSafetyPreference:enabled,
   ...(initialLocation?{safetyInitialLocation:initialLocation}:{}),
   ...(safetyPlannedRoute?{safetyPlannedRoute}:{}),
   pickupLat:pickupPoint.lat,pickupLng:pickupPoint.lng,
   destinationLat:destinationPoint.lat,destinationLng:destinationPoint.lng,
  };
  const ride=await driveRequest('/rides',{method:'POST',body:JSON.stringify(data)});
  renderWomenSafetyHandoff(ride);
  const route=ride.routeSummary;
  const trafficNote='Standard OSRM route estimate: '+(route?.durationMinutes||'—')+' min. Live traffic is not included.';
  const dispatchMessage=document.createElement('p');
  dispatchMessage.textContent='Ride request submitted successfully. Estimated fare: ৳'+ride.estimatedFare+'. '+trafficNote+' Checking nearby drivers…';
  $('rideMsg').append(dispatchMessage);
  await loadRides();
  await refreshNearbyDrivers();
  watchRideRequest(ride.requestId);
 }catch(error){
  msg('rideMsg','Ride request failed: '+error.message);
 }finally{
  if(submitButton)submitButton.disabled=false;
 }
});

async function loadCurrencyOptions(){try{const data=await driveRequest('/payments/rates');const codes=Object.keys(data.rates||{}).sort();for(const id of ['currencyFrom','currencyTo']){const select=$(id),selected=select.value;select.replaceChildren();codes.forEach(code=>{const option=document.createElement('option');option.value=code;option.textContent=code;select.append(option);});if(codes.includes(selected))select.value=selected;else select.value=id==='currencyFrom'?'BDT':'USD';}}catch(e){$('currencyResult').hidden=false;$('currencyResult').textContent='Currency list unavailable: '+e.message;}}
loadCurrencyOptions();
$('currencyForm').addEventListener('submit',async e=>{e.preventDefault();const resultBox=$('currencyResult');resultBox.hidden=false;resultBox.textContent='Fetching latest exchange rates…';try{const from=$('currencyFrom').value,to=$('currencyTo').value,amount=Number($('amountBdt').value);if(!Number.isFinite(amount)||amount<=0)throw new Error('Enter an amount greater than zero.');const data=await driveRequest('/payments/rates');const fromRate=Number(data.rates[from]),toRate=Number(data.rates[to]);if(!fromRate||!toRate)throw new Error('Rate not available for '+from+' or '+to+'.');const converted=amount/fromRate*toRate;const formatted=new Intl.NumberFormat(undefined,{style:'currency',currency:to,maximumFractionDigits:4}).format(converted);resultBox.textContent=new Intl.NumberFormat(undefined,{style:'currency',currency:from,maximumFractionDigits:4}).format(amount)+' ≈ '+formatted+' · '+from+' → '+to+' · Rate timestamp: '+new Date(data.fetchedAt).toLocaleString()+(data.cached?' · Cached rate':' · Latest provider rate')+'. Indicative quote only; no foreign-currency settlement is collected.';}catch(err){resultBox.textContent=err.message;}});

$('stopTracking').addEventListener('click',()=>{if(trackingTimer)clearInterval(trackingTimer);trackingTimer=null;activeTrackingRide=null;$('trackingPanel').hidden=true;});

async function loadPayments(){const root=$('paymentHistory');if(!root)return;try{const rows=await driveRequest('/payments/me');root.replaceChildren();if(!rows.length){root.textContent='No payment records yet.';return;}rows.forEach(row=>{const item=document.createElement('article');item.className='ride-item';const title=document.createElement('strong');title.textContent=formatMoney(row.amount,row.currency)+' · '+String(row.method||'').toUpperCase();const meta=document.createElement('div');meta.className='ride-meta';meta.textContent=row.status.toUpperCase()+' · '+new Date(row.created_at).toLocaleString()+' · '+(row.ride_id?'Ride payment':'Rental payment');item.append(title,meta);if(row.provider_reference){const reference=document.createElement('small');reference.className='ride-meta';reference.textContent='Transaction ID: '+row.provider_reference+' · Awaiting admin verification';item.append(reference);}if(row.status==='pending'&&['bkash','nagad'].includes(String(row.method).toLowerCase())&&!row.provider_reference){const button=document.createElement('button');button.textContent='Submit transaction ID';button.addEventListener('click',()=>submitPaymentReference(row.id));item.append(button);}root.append(item);});}catch(e){root.textContent=e.message;}}

$('logout').addEventListener('click',()=>{localStorage.removeItem(DRIVE_TOKEN_KEY);localStorage.removeItem('drive_refresh_token');localStorage.removeItem('drive_user');location.href='login.html';});
if(requireLogin()){initMaps();driveRequest('/safety/settings').then(settings=>{womenSafetyDefaultEnabled=!!settings.womenSafetyEnabled;if(womenSafetyDefaultEnabled)$('womenSafety').checked=true;}).catch(()=>{});loadRides();loadSharedRides();loadPayments();setInterval(()=>{loadRides();loadSharedRides();loadPayments();},30000);}
