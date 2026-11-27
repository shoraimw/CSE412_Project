(() => {
  const token=new URLSearchParams(location.search).get('token');
  const info=document.getElementById('sharedTripInfo');
  if(!token){info.textContent='This shared-trip link is missing its access token.';return;}
  driveRequest('/safety/shared/'+encodeURIComponent(token)).then(data=>{
    const status=data.status||data.trip?.status||'active';
    info.innerHTML='<div class="list-item"><div><strong>'+(driveEscape(data.destination||data.trip?.destination||'Shared journey'))+'</strong><small>Last update: '+driveEscape(driveDate(data.updatedAt||data.updated_at))+'</small></div><span class="pill">'+driveEscape(status)+'</span></div><p class="muted small">Only the trip details made available by the owner of this link are shown here.</p>';
    if(window.L){
      const map=L.map('sharedTripMap').setView([23.8103,90.4125],12);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
      const point=data.currentLocation||data.location;
      if(point?.lat&&point?.lng)L.marker([point.lat,point.lng]).addTo(map).bindPopup('Shared trip location').openPopup();
    }
  }).catch(error=>{info.textContent=error.message||'This shared-trip link is invalid or has expired.';});
})();