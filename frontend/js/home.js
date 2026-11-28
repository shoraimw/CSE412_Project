(() => {
  const $=id=>document.getElementById(id);
  const pickupInput=$('pickup'),destinationInput=$('destination'),message=$('rideMessage');
  const dhaka=[23.8103,90.4125];
  let map=null,pickupMarker=null,destinationMarker=null,routeLine=null;
  let pickup=null,destination=null,target='pickup',routeDistanceKm=null,routeDurationMin=null,routeCoordinates=[],routeIsApproximate=false,routeRequestVersion=0;
  const FALLBACK_FARE_RATES={
    bike:{base:30,perKm:12,speedKmh:25},
    cng:{base:40,perKm:18,speedKmh:20},
    car:{base:60,perKm:25,speedKmh:20}
  };
  const CURRENCIES=['BDT','USD','EUR','GBP','INR','SGD','MYR','AED','SAR','AUD','CAD','CNY','JPY','THB','NPR','PKR'];
  let selectedCurrency='BDT',exchangeRates={BDT:1},fareQuotes={},fareQuoteSources={},fareRequestVersion=0,nearbyRefreshInFlight=false;
  const autocompleteState={
    pickup:{results:[],timer:null,controller:null,active:-1},
    destination:{results:[],timer:null,controller:null,active:-1}
  };
  const nearbyDriverMarkers=new Map();
  const bdtMoney=value=>'৳'+Number(value||0).toLocaleString('en-BD',{maximumFractionDigits:0});
  const money=value=>{
    const amount=Number(value||0),rate=Number(exchangeRates[selectedCurrency]||1);
    if(selectedCurrency==='BDT')return bdtMoney(amount);
    return new Intl.NumberFormat('en-US',{style:'currency',currency:selectedCurrency,maximumFractionDigits:2}).format(amount*rate)+' · '+bdtMoney(amount);
  };
  const setMessage=(text,kind='')=>{message.textContent=text;message.className='form-message '+kind;};
  function fareLabel(type){
    const amount=Number(fareQuotes[type]);
    if(!Number.isFinite(amount)||amount<=0)return '—';
    const approximate=routeIsApproximate||fareQuoteSources[type]==='fallback';
    return (approximate?'≈ ':'')+money(amount);
  }
  function updateFareLabels(){
    for(const type of ['car','bike','cng']){
      if($(type+'Fare'))$(type+'Fare').textContent=fareQuotes[type]===undefined?'—':fareLabel(type);
    }
    const selected=document.querySelector('input[name="vehicleType"]:checked')?.value;
    if($('selectedFare'))$('selectedFare').textContent=selected&&fareQuotes[selected]!==undefined?fareLabel(selected):'—';
  }
  function clearFareQuotes(){
    fareQuotes={};fareQuoteSources={};fareRequestVersion++;updateFareLabels();
  }
  function haversineKm(from,to){
    const radians=value=>value*Math.PI/180;
    const dLat=radians(to.lat-from.lat),dLng=radians(to.lng-from.lng);
    const a=Math.sin(dLat/2)**2+Math.cos(radians(from.lat))*Math.cos(radians(to.lat))*Math.sin(dLng/2)**2;
    return 6371*2*Math.atan2(Math.sqrt(a),Math.sqrt(Math.max(0,1-a)));
  }
  function approximateRoute(from,to){
    const straightLineKm=haversineKm(from,to);
    if(!Number.isFinite(straightLineKm)||straightLineKm<=0)throw new Error('Choose two different valid locations to calculate a fare.');
    const distanceKm=Math.max(0.2,straightLineKm*1.25);
    return {distanceKm,durationMinutes:Math.max(1,Math.round(distanceKm/18*60))};
  }
  function fallbackFare(type){
    const rates=FALLBACK_FARE_RATES[type];
    if(!rates||!Number.isFinite(routeDistanceKm)||routeDistanceKm<=0)return null;
    return Math.max(1,Math.round(rates.base+routeDistanceKm*rates.perKm));
  }
  async function setCurrency(code,persist=false){
    if(!CURRENCIES.includes(code)||!Number.isFinite(Number(exchangeRates[code]))||Number(exchangeRates[code])<=0)return;
    selectedCurrency=code;
    if($('displayCurrency'))$('displayCurrency').value=code;
    try{localStorage.setItem('drive_currency',code);}catch{}
    updateFareLabels();
    if($('currencyNote'))$('currencyNote').textContent='Converted display only. Actual ride requests and payment settlement remain in BDT.';
    if(persist&&localStorage.getItem(DRIVE_TOKEN_KEY)){
      try{await driveRequest('/users/me',{method:'PATCH',body:JSON.stringify({preferred_currency:code})});}
      catch(error){setMessage('Currency changed for this visit, but the account preference could not be saved: '+error.message,'error');}
    }
  }
  async function loadCurrencySettings(){
    const selector=$('displayCurrency');
    if(!selector)return;
    try{
      const [catalog,rates]=await Promise.all([driveRequest('/payments/currencies'),driveRequest('/payments/rates')]);
      exchangeRates={BDT:1,...(rates.rates||{})};
      const available=(catalog.currencies||CURRENCIES).filter(code=>Number(exchangeRates[code])>0);
      selector.innerHTML=available.map(code=>'<option value="'+driveEscape(code)+'">'+driveEscape(code)+'</option>').join('');
      const stored=localStorage.getItem('drive_currency')||'BDT';
      let preferred=available.includes(stored)?stored:'BDT';
      if(localStorage.getItem(DRIVE_TOKEN_KEY)){
        try{
          const profile=await driveRequest('/users/me');
          if(available.includes(profile.preferred_currency))preferred=profile.preferred_currency;
        }catch{}
      }
      await setCurrency(preferred,false);
      const updated=rates.fetchedAt?new Date(rates.fetchedAt).toLocaleString():'';
      $('currencyNote').textContent='Tourist mode currency display · '+(updated?'Rates updated '+updated+'. ':'')+'Booking and settlement remain in BDT.';
    }catch{
      exchangeRates={BDT:1};selector.innerHTML='<option value="BDT">BDT</option>';await setCurrency('BDT',false);
      $('currencyNote').textContent='Live exchange rates are unavailable. Showing fares in BDT.';
    }
  }

  if(window.L&&$('rideMap')){
    map=L.map('rideMap',{zoomControl:true}).setView(dhaka,12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png',{maxZoom:19,attribution:'&copy; OpenStreetMap contributors'}).addTo(map);
    map.on('click',async event=>{
      const label=await reverseGeocode(event.latlng.lat,event.latlng.lng);
      setPoint(target,event.latlng.lat,event.latlng.lng,label);
    });
  }

  function markerIcon(kind){
    return L.divIcon({className:'drive-map-pin',html:'<span class="pin-core '+kind+'"></span>',iconSize:[20,20],iconAnchor:[10,10]});
  }
  function clearRouteVisuals(){
    if(map&&pickupMarker){map.removeLayer(pickupMarker);pickupMarker=null;}
    if(map&&destinationMarker){map.removeLayer(destinationMarker);destinationMarker=null;}
    if(map&&routeLine){map.removeLayer(routeLine);routeLine=null;}
  }
  function setPoint(kind,lat,lng,label){
    routeCoordinates=[];routeDistanceKm=null;routeDurationMin=null;routeIsApproximate=false;routeRequestVersion++;clearFareQuotes();
    $('routeSummary').hidden=true;
    const point={lat:Number(lat),lng:Number(lng),label:label||'Selected map location'};
    hideSuggestions(kind);
    if(kind==='pickup'){
      pickup=point;pickupInput.value=point.label;
      if(map&&window.L){if(pickupMarker)map.removeLayer(pickupMarker);pickupMarker=L.marker([point.lat,point.lng],{icon:markerIcon('pin-pickup')}).addTo(map).bindPopup('Pickup');}
      refreshNearbyDrivers();
    }else{
      destination=point;destinationInput.value=point.label;
      if(map&&window.L){if(destinationMarker)map.removeLayer(destinationMarker);destinationMarker=L.marker([point.lat,point.lng],{icon:markerIcon('pin-destination')}).addTo(map).bindPopup('Drop-off');}
    }
    if(pickup&&destination){
      if(map&&window.L){
        if(!pickupMarker)pickupMarker=L.marker([pickup.lat,pickup.lng],{icon:markerIcon('pin-pickup')}).addTo(map).bindPopup('Pickup');
        if(!destinationMarker)destinationMarker=L.marker([destination.lat,destination.lng],{icon:markerIcon('pin-destination')}).addTo(map).bindPopup('Drop-off');
      }
      previewRoute();
    }
  }
  function photonLabel(properties){
    const values=[properties.name,properties.street,properties.district,properties.city||properties.locality,properties.state,properties.country]
      .map(value=>String(value||'').trim()).filter(Boolean);
    return values.filter((value,index)=>values.indexOf(value)===index).slice(0,4).join(', ')||'Selected location';
  }
  async function photonSearch(query,signal){
    const params=new URLSearchParams({q:query+', Bangladesh',lat:String(dhaka[0]),lon:String(dhaka[1]),limit:'8',lang:'en'});
    const response=await fetch('https://photon.komoot.io/api/?'+params.toString(),{signal,headers:{Accept:'application/json'}});
    if(!response.ok)throw new Error('Location search is temporarily unavailable.');
    const data=await response.json();
    return (data.features||[]).map(feature=>{
      const properties=feature.properties||{},coordinates=feature.geometry?.coordinates||[];
      if(properties.country&&!String(properties.country).toLowerCase().includes('bangladesh'))return null;
      const lng=Number(coordinates[0]),lat=Number(coordinates[1]);
      if(!Number.isFinite(lat)||!Number.isFinite(lng))return null;
      return {lat,lng,label:photonLabel(properties)};
    }).filter(Boolean);
  }
  async function reverseGeocode(lat,lng){
    try{
      const params=new URLSearchParams({lat:String(lat),lon:String(lng),lang:'en'});
      const response=await fetch('https://photon.komoot.io/reverse?'+params.toString(),{signal:AbortSignal.timeout(8000)});
      if(!response.ok)throw new Error('Reverse geocoding unavailable');
      const data=await response.json();
      return data.features?.[0]?.properties?photonLabel(data.features[0].properties):'Map location';
    }catch{return 'Map location';}
  }
  async function geocode(value){
    const rows=await photonSearch(value,AbortSignal.timeout(8000));
    if(!rows.length)throw new Error('Location not found. Try a more specific address.');
    return rows[0];
  }
  function hideSuggestions(kind){
    const panel=$(kind+'Suggestions'),input=kind==='pickup'?pickupInput:destinationInput,state=autocompleteState[kind];
    if(panel)panel.hidden=true;
    if(input)input.setAttribute('aria-expanded','false');
    state.active=-1;
  }
  function setupAutocomplete(kind){
    const input=kind==='pickup'?pickupInput:destinationInput;
    const panel=$(kind+'Suggestions'),state=autocompleteState[kind];
    if(!input||!panel)return;
    input.addEventListener('input',()=>{
      const value=input.value.trim();
      if(kind==='pickup'&&pickup?.label!==value){
        pickup=null;if(pickupMarker){map?.removeLayer(pickupMarker);pickupMarker=null;}
        if(routeLine){map?.removeLayer(routeLine);routeLine=null;}
        routeCoordinates=[];routeDistanceKm=null;routeDurationMin=null;routeIsApproximate=false;routeRequestVersion++;clearFareQuotes();$('routeSummary').hidden=true;clearNearbyDrivers();
      }
      if(kind==='destination'&&destination?.label!==value){
        destination=null;if(destinationMarker){map?.removeLayer(destinationMarker);destinationMarker=null;}
        if(routeLine){map?.removeLayer(routeLine);routeLine=null;}
        routeCoordinates=[];routeDistanceKm=null;routeDurationMin=null;routeIsApproximate=false;routeRequestVersion++;clearFareQuotes();$('routeSummary').hidden=true;
      }
      if(state.timer)clearTimeout(state.timer);
      if(state.controller)state.controller.abort();
      if(value.length<3){state.results=[];panel.innerHTML='';hideSuggestions(kind);return;}
      state.timer=setTimeout(async()=>{
        state.controller=new AbortController();
        try{
          const results=await photonSearch(value,state.controller.signal);
          state.results=results;state.active=-1;
          panel.innerHTML=results.map((place,index)=>'<button type="button" class="location-suggestion" role="option" aria-selected="false" data-suggestion-index="'+index+'"><span class="suggestion-pin">⌖</span><span>'+driveEscape(place.label)+'</span></button>').join('');
          panel.hidden=!results.length;input.setAttribute('aria-expanded',String(results.length>0));
        }catch(error){
          if(error.name!=='AbortError'){state.results=[];panel.innerHTML='';hideSuggestions(kind);}
        }
      },450);
    });
    panel.addEventListener('mousedown',event=>{
      if(event.target.closest('[data-suggestion-index]'))event.preventDefault();
    });
    panel.addEventListener('click',event=>{
      const button=event.target.closest('[data-suggestion-index]');
      if(!button)return;
      const place=state.results[Number(button.dataset.suggestionIndex)];
      if(place)setPoint(kind,place.lat,place.lng,place.label);
    });
    input.addEventListener('keydown',event=>{
      if(panel.hidden||!state.results.length)return;
      if(event.key==='ArrowDown'||event.key==='ArrowUp'){
        event.preventDefault();
        const delta=event.key==='ArrowDown'?1:-1;
        state.active=(state.active+delta+state.results.length)%state.results.length;
        panel.querySelectorAll('[data-suggestion-index]').forEach((button,index)=>{
          button.classList.toggle('active',index===state.active);
          button.setAttribute('aria-selected',String(index===state.active));
        });
      }else if(event.key==='Enter'&&state.active>=0){
        event.preventDefault();
        const place=state.results[state.active];
        if(place)setPoint(kind,place.lat,place.lng,place.label);
      }else if(event.key==='Escape')hideSuggestions(kind);
    });
    input.addEventListener('blur',()=>setTimeout(()=>hideSuggestions(kind),140));
  }
  function clearNearbyDrivers(){
    for(const marker of nearbyDriverMarkers.values())if(map)map.removeLayer(marker);
    nearbyDriverMarkers.clear();
  }
  async function refreshNearbyDrivers(){
    if(!map||!pickup||!localStorage.getItem(DRIVE_TOKEN_KEY)||nearbyRefreshInFlight)return;
    nearbyRefreshInFlight=true;
    try{
      const vehicleType=document.querySelector('input[name="vehicleType"]:checked')?.value||'car';
      const query=new URLSearchParams({lat:String(pickup.lat),lng:String(pickup.lng),vehicleType,radiusKm:'15'});
      const drivers=await driveRequest('/drivers/nearby?'+query.toString());
      const visible=new Set();
      for(const driver of Array.isArray(drivers)?drivers:[]){
        const id=String(driver.driver_id||'');
        const lat=Number(driver.latitude),lng=Number(driver.longitude);
        if(!id||!Number.isFinite(lat)||!Number.isFinite(lng))continue;
        visible.add(id);
        let marker=nearbyDriverMarkers.get(id);
        if(!marker){
          const icon=L.divIcon({className:'drive-nearby-driver-icon',html:'<span></span>',iconSize:[22,22],iconAnchor:[11,11]});
          marker=L.marker([lat,lng],{icon}).addTo(map);
          nearbyDriverMarkers.set(id,marker);
        }else marker.setLatLng([lat,lng]);
        marker.bindTooltip('Online '+driveEscape(driver.vehicle_type||'driver')+' · '+Number(driver.distance_km||0).toFixed(1)+' km away');
      }
      for(const [id,marker] of nearbyDriverMarkers){
        if(!visible.has(id)){map.removeLayer(marker);nearbyDriverMarkers.delete(id);}
      }
    }catch{
      // Discovery is supplementary; ride booking remains available if the
      // live nearby-driver feed is temporarily unavailable.
    }finally{nearbyRefreshInFlight=false;}
  }
  async function resolveInput(kind){
    const value=(kind==='pickup'?pickupInput:destinationInput).value.trim();
    const current=kind==='pickup'?pickup:destination;
    if(current&&current.label===value)return current;
    if(!value)throw new Error('Enter both pickup and drop-off locations.');
    const point=await geocode(value);
    setPoint(kind,point.lat,point.lng,point.label);
    return kind==='pickup'?pickup:destination;
  }
  async function previewRoute(){
    if(!pickup||!destination)return;
    const currentRoute=++routeRequestVersion;
    routeCoordinates=[];routeDistanceKm=null;routeDurationMin=null;routeIsApproximate=false;clearFareQuotes();
    $('routeSummary').hidden=true;
    try{
      let route=null,routeError=null;
      const url='https://router.project-osrm.org/route/v1/driving/'+pickup.lng+','+pickup.lat+';'+destination.lng+','+destination.lat+'?overview=full&geometries=geojson';
      try{
        const response=await fetch(url,{signal:AbortSignal.timeout(10000)});
        if(!response.ok)throw new Error('Road route service returned HTTP '+response.status+'.');
        const data=await response.json();
        if(!data.routes?.length)throw new Error('No road route was returned for these locations.');
        route=data.routes[0];
      }catch(error){routeError=error;}
      if(currentRoute!==routeRequestVersion)return;
      if(route){
        routeDistanceKm=Number(route.distance)/1000;
        routeDurationMin=Math.max(1,Math.round(Number(route.duration)/60));
        const raw=Array.isArray(route.geometry?.coordinates)?route.geometry.coordinates:[];
        routeCoordinates=raw.length>100
          ?Array.from({length:100},(_,i)=>raw[Math.round(i*(raw.length-1)/99)]).map(([lng,lat])=>({lat,lng}))
          :raw.map(([lng,lat])=>({lat,lng}));
        if(!Number.isFinite(routeDistanceKm)||routeDistanceKm<=0)throw new Error('The route service returned an invalid distance.');
        if(map&&window.L){
          if(routeLine)map.removeLayer(routeLine);
          routeLine=L.geoJSON(route.geometry,{style:{color:'#111',weight:5,opacity:.82}}).addTo(map);
          map.fitBounds(routeLine.getBounds(),{padding:[35,35]});
        }
      }else{
        const approximate=approximateRoute(pickup,destination);
        routeDistanceKm=approximate.distanceKm;
        routeDurationMin=approximate.durationMinutes;
        routeIsApproximate=true;
        routeCoordinates=[];
        if(map&&window.L){
          if(routeLine)map.removeLayer(routeLine);
          routeLine=L.polyline([[pickup.lat,pickup.lng],[destination.lat,destination.lng]],{color:'#777',weight:4,opacity:.75,dashArray:'6 8'}).addTo(map);
          map.fitBounds(L.latLngBounds([[pickup.lat,pickup.lng],[destination.lat,destination.lng]]),{padding:[35,35]});
        }
        console.warn('DRIVE road routing unavailable; using an approximate straight-line-based estimate:',routeError?.message||'Unknown route error');
      }
      if(currentRoute!==routeRequestVersion)return;
      $('routeSummary').hidden=false;
      $('routeDistance').textContent=(routeIsApproximate?'≈ ':'')+routeDistanceKm.toFixed(1)+' km';
      $('routeDuration').textContent=(routeIsApproximate?'≈ ':'')+routeDurationMin+' min';
      await refreshFares();
    }catch(error){
      if(currentRoute!==routeRequestVersion)return;
      routeCoordinates=[];routeDistanceKm=null;routeDurationMin=null;routeIsApproximate=false;clearFareQuotes();
      $('routeSummary').hidden=true;
      setMessage(error.message||'Route preview is unavailable. Check the selected locations and try again.','error');
    }
  }
  async function refreshFares(){
    if(!Number.isFinite(routeDistanceKm)||routeDistanceKm<=0)return {fallbackCount:0};
    const currentFareRequest=++fareRequestVersion;
    const types=['car','bike','cng'];
    const results=await Promise.all(types.map(async type=>{
      try{
        const quote=await driveRequest('/fare/estimate',{method:'POST',signal:AbortSignal.timeout(8000),body:JSON.stringify({distanceKm:routeDistanceKm,vehicleType:type,durationMinutes:routeDurationMin})});
        const amount=Number(quote?.estimatedFare);
        if(!Number.isFinite(amount)||amount<=0)throw new Error('Fare API returned an invalid estimate.');
        return {type,amount,source:'server'};
      }catch(error){
        console.warn('DRIVE '+type+' fare API failed; using the built-in demo rate:',error.message);
        return {type,amount:fallbackFare(type),source:'fallback'};
      }
    }));
    if(currentFareRequest!==fareRequestVersion)return {fallbackCount:0,stale:true};
    for(const result of results){
      if(Number.isFinite(result.amount)&&result.amount>0){
        fareQuotes[result.type]=result.amount;
        fareQuoteSources[result.type]=result.source;
      }else{
        delete fareQuotes[result.type];delete fareQuoteSources[result.type];
      }
    }
    updateFareLabels();
    const fallbackCount=results.filter(result=>result.source==='fallback').length;
    if(routeIsApproximate){
      setMessage('Live road routing is unavailable. Showing approximate distance and fare estimates; confirm before booking.','warning');
    }else if(fallbackCount===types.length){
      setMessage('Fare service is temporarily unavailable. Approximate demo fares are shown using built-in BDT rates.','warning');
    }else if(fallbackCount>0){
      setMessage('Some fare quotes are unavailable. The affected options show approximate demo estimates.','warning');
    }else{
      setMessage('Route ready. Estimated fares are calculated for Car, Bike and CNG.','success');
    }
    return {fallbackCount};
  }

  setupAutocomplete('pickup');
  setupAutocomplete('destination');
  $('displayCurrency')?.addEventListener('change',()=>setCurrency($('displayCurrency').value,true));
  loadCurrencySettings();
  document.querySelectorAll('.map-pick').forEach(button=>button.addEventListener('click',()=>{
    target=button.dataset.target;
    document.querySelectorAll('.map-pick').forEach(item=>item.classList.toggle('active',item===button));
    setMessage('Tap the map to set your '+(target==='pickup'?'pickup':'drop-off')+'.');
  }));
  document.querySelectorAll('.ride-option').forEach(option=>option.addEventListener('click',()=>{
    document.querySelectorAll('.ride-option').forEach(item=>item.classList.toggle('selected',item===option));
    if(routeDistanceKm)refreshFares();
    refreshNearbyDrivers();
  }));
  $('useLocation')?.addEventListener('click',()=>{
    if(!navigator.geolocation)return setMessage('Location access is not available in this browser.','error');
    setMessage('Finding your current location…');
    navigator.geolocation.getCurrentPosition(async position=>{
      const {latitude,longitude}=position.coords;
      const label=await reverseGeocode(latitude,longitude);
      setPoint('pickup',latitude,longitude,label);
      map?.setView([latitude,longitude],15);
      setMessage('Pickup set to your current location.','success');
    },()=>setMessage('Could not access your location. Check browser permission.','error'),{enableHighAccuracy:true,timeout:10000});
  });
  $('swapLocations')?.addEventListener('click',()=>{
    const oldPickup=pickup,oldDestination=destination;
    const oldPickupText=pickupInput.value,oldDestinationText=destinationInput.value;
    pickup=oldDestination;destination=oldPickup;
    pickupInput.value=oldDestinationText;destinationInput.value=oldPickupText;
    routeCoordinates=[];routeDistanceKm=null;routeDurationMin=null;routeIsApproximate=false;routeRequestVersion++;clearFareQuotes();$('routeSummary').hidden=true;
    if(pickup&&destination){
      if(map&&window.L){
        clearRouteVisuals();
        pickupMarker=L.marker([pickup.lat,pickup.lng],{icon:markerIcon('pin-pickup')}).addTo(map);
        destinationMarker=L.marker([destination.lat,destination.lng],{icon:markerIcon('pin-destination')}).addTo(map);
      }
      previewRoute();
    }
  });
  $('recenterMap')?.addEventListener('click',()=>map?.setView(dhaka,12));
  $('pickup')?.addEventListener('change',()=>{pickup=null;routeCoordinates=[];routeDistanceKm=null;routeDurationMin=null;routeIsApproximate=false;routeRequestVersion++;clearFareQuotes();clearRouteVisuals();$('routeSummary').hidden=true;});
  $('destination')?.addEventListener('change',()=>{destination=null;routeCoordinates=[];routeDistanceKm=null;routeDurationMin=null;routeIsApproximate=false;routeRequestVersion++;clearFareQuotes();clearRouteVisuals();$('routeSummary').hidden=true;});
  document.querySelectorAll('input[name="vehicleType"]').forEach(input=>input.addEventListener('change',refreshFares));

  $('rideForm')?.addEventListener('submit',async event=>{
    event.preventDefault();
    if(!driveRequireAuth('index.html'))return;
    const button=$('bookRide');button.disabled=true;button.textContent='Finding your ride…';
    try{
      const from=await resolveInput('pickup');
      const to=await resolveInput('destination');
      const vehicleType=document.querySelector('input[name="vehicleType"]:checked').value;
      const womenSafetyEnabled=$('womenSafety').checked;
      const body={
        pickupAddress:from.label,destinationAddress:to.label,vehicleType,
        pickupLat:from.lat,pickupLng:from.lng,destinationLat:to.lat,destinationLng:to.lng,
        isShared:$('sharedRide').checked,womenSafetyPreference:womenSafetyEnabled,
        routePreference:'balanced',seatsRequested:1
      };
      if(womenSafetyEnabled){
        body.safetyInitialLocation={lat:from.lat,lng:from.lng};
        if(routeCoordinates.length>=2)body.safetyPlannedRoute=routeCoordinates;
      }
      const result=await driveRequest('/rides',{method:'POST',body:JSON.stringify(body)});
      if(result.womenSafety?.shareToken){
        const shareUrl=new URL('shared-trip.html?token='+encodeURIComponent(result.womenSafety.shareToken),window.location.href).toString();
        try{sessionStorage.setItem('drive_pending_share_url',shareUrl);}catch{}
      }
      if(result.womenSafety?.warning){try{sessionStorage.setItem('drive_safety_warning',result.womenSafety.warning);}catch{}}
      setMessage('Ride request created. Open your dashboard to follow the trip.','success');
      driveToast('Your ride request has been placed.');
      window.location.href='dashboard.html';
    }catch(error){setMessage(error.message||'Could not create the ride request.','error');}
    finally{button.disabled=false;button.innerHTML='Find a ride <span>→</span>';}
  });

  const user=driveSession();
  if(user){
    $('navLogin').hidden=true;$('navJoin').hidden=true;$('navAccount').hidden=false;
    if(localStorage.getItem(DRIVE_TOKEN_KEY)){
      driveRequest('/safety/settings').then(settings=>{
        if($('womenSafety'))$('womenSafety').checked=Boolean(settings.womenSafetyEnabled);
      }).catch(()=>{});
    }
  }
  if(map)setTimeout(()=>map.invalidateSize(),150);
  if(driveSession())setInterval(()=>{if(!document.hidden)refreshNearbyDrivers();},15000);
})();