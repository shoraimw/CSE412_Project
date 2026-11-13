const el=id=>document.getElementById(id);
const user=JSON.parse(localStorage.getItem('drive_user')||'null');
if(!localStorage.getItem(DRIVE_TOKEN_KEY))location.href='login.html';
if(user?.role!=='driver'){el('driverMessage').textContent='This workspace is only available to approved driver accounts.';el('openRequests').textContent='Your account role is '+(user?.role||'unknown')+'.';}
function card(title,meta){const c=document.createElement('article');c.className='driver-item';const h=document.createElement('strong');h.textContent=title;const p=document.createElement('div');p.className='driver-meta';p.textContent=meta;c.append(h,p);return c;}
function action(parent,label,fn){const b=document.createElement('button');b.textContent=label;b.addEventListener('click',async()=>{b.disabled=true;try{await fn();await refresh();}catch(e){alert(e.message);b.disabled=false;}});parent.append(b);}
async function refresh(){
 if(user?.role!=='driver')return;
 try{
  const [requests,trips]=await Promise.all([driveRequest('/rides/open-requests'),driveRequest('/rides')]);
  const open=el('openRequests');open.replaceChildren();
  if(!requests.length)open.textContent='No open requests at the moment.';
  requests.forEach(q=>{const c=card(q.pickup_label+' → '+q.destination_label,(q.requested_vehicle||'').toUpperCase()+' · ৳'+(q.estimated_fare||0)+' · '+(q.estimated_distance_km||'—')+' km'+(q.women_safety_preference?' · Women Safety preference':''));action(c,'Claim this ride',async()=>{await driveRequest('/rides/requests/'+q.id+'/claim',{method:'POST'});});open.append(c);});
  const assigned=el('assignedTrips');assigned.replaceChildren();
  if(!trips.length)assigned.textContent='No assigned trips yet.';
  trips.forEach(t=>{const c=card(t.pickupAddress+' → '+t.destinationAddress,t.status.toUpperCase()+' · ৳'+t.estimatedFare);if(t.status==='matched')action(c,'Confirm & approach',()=>driveRequest('/rides/'+t.id+'/status',{method:'PATCH',body:JSON.stringify({status:'driver_arriving'})}));if(t.status==='driver_arriving')action(c,'Start trip',()=>driveRequest('/rides/'+t.id+'/status',{method:'PATCH',body:JSON.stringify({status:'in_progress'})}));if(t.status==='in_progress'){action(c,'Share GPS',()=>new Promise((resolve,reject)=>{if(!navigator.geolocation)return reject(new Error('Geolocation is unavailable.'));navigator.geolocation.getCurrentPosition(async p=>{try{await driveRequest('/rides/'+t.id+'/location',{method:'POST',body:JSON.stringify({lat:p.coords.latitude,lng:p.coords.longitude})});resolve();}catch(e){reject(e);}},reject,{enableHighAccuracy:true,timeout:10000});}));action(c,'Complete trip',()=>driveRequest('/rides/'+t.id+'/status',{method:'PATCH',body:JSON.stringify({status:'completed'})}));}assigned.append(c);});
  el('driverMessage').textContent='Updated '+new Date().toLocaleTimeString()+'.';
 }catch(e){el('driverMessage').textContent=e.message;}
}
el('driverLogout').addEventListener('click',()=>{localStorage.removeItem(DRIVE_TOKEN_KEY);localStorage.removeItem('drive_refresh_token');localStorage.removeItem('drive_user');location.href='login.html';});
if(user?.role==='driver')refresh();
