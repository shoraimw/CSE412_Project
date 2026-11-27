(() => {
  const token=new URLSearchParams(location.search).get('token');
  const info=document.getElementById('sharedTripInfo');
  let map=null,marker=null,pathLine=null,timer=null;
  if(!token){info.textContent='This shared-trip link is missing its access token.';return;}
  function initMap(){
    if(map||!window.L)return;
    map=L.map('sharedTripMap',{zoomControl:true}).setView([23.8103,90.4125],12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
  }
  async function refresh(){
    try{
      const data=await driveRequest('/safety/shared/'+encodeURIComponent(token));
      const locations=Array.isArray(data.recentLocations)?data.recentLocations:[];
      const current=data.currentLocation||locations[locations.length-1]||null;
      info.innerHTML=
        '<div class="list-item"><div class="list-item-main"><strong>'+driveEscape(data.destination||'Shared journey')+'</strong><small>Last update: '+driveEscape(driveDate(data.lastUpdatedAt))+'</small></div><span class="pill">'+driveEscape(data.status||'ACTIVE')+'</span></div>'+
        '<div class="list-item"><div class="list-item-main"><strong>Expected arrival</strong><small>'+driveEscape(driveDate(data.expectedArrivalAt))+'</small></div></div>'+
        (data.privacyNote?'<p class="muted small">'+driveEscape(data.privacyNote)+'</p>':'')+
        (data.warnings?.length?'<div class="message warning">'+data.warnings.map(w=>driveEscape(w.message||w.type)).join(' · ')+'</div>':'');
      if(window.L){
        initMap();
        if(marker){map.removeLayer(marker);marker=null;}
        if(pathLine){map.removeLayer(pathLine);pathLine=null;}
        const valid=locations.filter(p=>Number.isFinite(Number(p.lat))&&Number.isFinite(Number(p.lng)));
        if(valid.length>1)pathLine=L.polyline(valid.map(p=>[Number(p.lat),Number(p.lng)]),{color:'#111',weight:4,opacity:.8}).addTo(map);
        if(current&&Number.isFinite(Number(current.lat))&&Number.isFinite(Number(current.lng))){
          marker=L.marker([Number(current.lat),Number(current.lng)]).addTo(map).bindPopup('Latest shared location').openPopup();
        }
        const points=valid.length?valid:(current?[current]:[]);
        if(points.length){map.fitBounds(L.latLngBounds(points.map(p=>[Number(p.lat),Number(p.lng)])),{padding:[30,30],maxZoom:15});}
        setTimeout(()=>map.invalidateSize(),100);
      }
    }catch(error){
      info.textContent=error.message||'This shared-trip link is invalid or has expired.';
      if(timer){clearInterval(timer);timer=null;}
    }
  }
  refresh();
  timer=setInterval(refresh,15000);
})();