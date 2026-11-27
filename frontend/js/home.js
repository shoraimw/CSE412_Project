(() => {
  const $ = id => document.getElementById(id);
  const pickupInput = $('pickup'), destinationInput = $('destination');
  const message = $('rideMessage');
  const dhaka = [23.8103, 90.4125];
  let map, pickupMarker = null, destinationMarker = null, routeLine = null;
  let pickup = null, destination = null, target = 'pickup', routeDistanceKm = null, routeDurationMin = null, routeCoordinates = [];
  const money = value => '৳' + Number(value || 0).toLocaleString('en-BD', { maximumFractionDigits:0 });
  const setMessage = (text, kind='') => { message.textContent = text; message.className = 'form-message ' + kind; };

  if (window.L && $('rideMap')) {
    map = L.map('rideMap', { zoomControl:true }).setView(dhaka, 12);
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom:19, attribution:'&copy; OpenStreetMap contributors'
    }).addTo(map);
    map.on('click', async event => { const label = await reverseGeocode(event.latlng.lat,event.latlng.lng); setPoint(target,event.latlng.lat,event.latlng.lng,label); });
  }

  function markerIcon(kind) {
    return L.divIcon({
      className:'drive-map-pin',
      html:'<span class="pin-core '+kind+'"></span>',
      iconSize:[20,20], iconAnchor:[10,10]
    });
  }
  function setPoint(kind, lat, lng, label) {
    const point = { lat:Number(lat), lng:Number(lng), label:label || 'Selected map location' };
    if (kind === 'pickup') {
      pickup = point; pickupInput.value = point.label;
      if (pickupMarker) map.removeLayer(pickupMarker);
      pickupMarker = L.marker([point.lat,point.lng], {icon:markerIcon('pin-pickup')}).addTo(map).bindPopup('Pickup');
    } else {
      destination = point; destinationInput.value = point.label;
      if (destinationMarker) map.removeLayer(destinationMarker);
      destinationMarker = L.marker([point.lat,point.lng], {icon:markerIcon('pin-destination')}).addTo(map).bindPopup('Drop-off');
    }
    if (pickup && destination) previewRoute();
  }
  async function reverseGeocode(lat,lng) {
    try {
      const response = await fetch('https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat='+lat+'&lon='+lng+'&zoom=16');
      const data = await response.json();
      return data.display_name ? data.display_name.split(',').slice(0,3).join(', ') : 'Map location';
    } catch { return 'Map location'; }
  }
  async function geocode(value) {
    const response = await fetch('https://nominatim.openstreetmap.org/search?format=jsonv2&limit=1&countrycodes=bd&q='+encodeURIComponent(value+', Bangladesh'));
    if (!response.ok) throw new Error('Location search is temporarily unavailable.');
    const rows = await response.json();
    if (!rows.length) throw new Error('Location not found. Try a more specific address.');
    return {lat:Number(rows[0].lat),lng:Number(rows[0].lon),label:rows[0].display_name.split(',').slice(0,3).join(', ')};
  }
  async function resolveInput(kind) {
    const value = kind === 'pickup' ? pickupInput.value.trim() : destinationInput.value.trim();
    const current = kind === 'pickup' ? pickup : destination;
    if (current && current.label === value) return current;
    if (!value) throw new Error('Enter both pickup and drop-off locations.');
    const point = await geocode(value);
    setPoint(kind, point.lat, point.lng, point.label);
    return kind === 'pickup' ? pickup : destination;
  }
  async function previewRoute() {
    if (!pickup || !destination) return;
    try {
      const url = 'https://router.project-osrm.org/route/v1/driving/'+pickup.lng+','+pickup.lat+';'+destination.lng+','+destination.lat+'?overview=full&geometries=geojson';
      const response = await fetch(url);
      const data = await response.json();
      if (!data.routes?.length) throw new Error('No route found.');
      const route = data.routes[0];
      routeDistanceKm = route.distance / 1000;
      routeDurationMin = Math.max(1, Math.round(route.duration / 60));\n      const rawCoordinates=Array.isArray(route.geometry?.coordinates)?route.geometry.coordinates:[];\n      routeCoordinates=rawCoordinates.length>100?Array.from({length:100},(_,i)=>rawCoordinates[Math.round(i*(rawCoordinates.length-1)/99)]).map(([lng,lat])=>({lat,lng})):rawCoordinates.map(([lng,lat])=>({lat,lng}));
      if (routeLine) map.removeLayer(routeLine);
      routeLine = L.geoJSON(route.geometry, {style:{color:'#111',weight:5,opacity:.82}}).addTo(map);
      map.fitBounds(routeLine.getBounds(), {padding:[35,35]});
      $('routeSummary').hidden = false;
      $('routeDistance').textContent = routeDistanceKm.toFixed(1)+' km';
      $('routeDuration').textContent = routeDurationMin+' min';
      await refreshFares();
    } catch (error) {
      setMessage(error.message || 'Route preview is unavailable. You can still request a ride.', 'error');
    }
  }
  async function refreshFares() {
    if (!routeDistanceKm) return;
    const options = ['car','bike','cng'];
    for (const type of options) {
      try {
        const quote = await driveRequest('/fare/estimate', {
          method:'POST', body:JSON.stringify({distanceKm:routeDistanceKm,vehicleType:type,durationMinutes:routeDurationMin})
        });
        const id = type+'Fare';
        if ($(id)) $(id).textContent = money(quote.estimatedFare);
        if (document.querySelector('input[name="vehicleType"]:checked')?.value === type) {
          $('selectedFare').textContent = money(quote.estimatedFare);
        }
      } catch { $(type+'Fare').textContent = '—'; }
    }
  }
  document.querySelectorAll('.map-pick').forEach(button => button.addEventListener('click', () => {
    target = button.dataset.target;
    document.querySelectorAll('.map-pick').forEach(item => item.classList.toggle('active', item === button));
    setMessage('Tap the map to set your '+(target === 'pickup' ? 'pickup' : 'drop-off')+'.');
  }));
  document.querySelectorAll('.ride-option').forEach(option => {
    option.addEventListener('click', () => {
      document.querySelectorAll('.ride-option').forEach(item => item.classList.toggle('selected', item === option));
      if (routeDistanceKm) refreshFares();
    });
  });
  $('useLocation')?.addEventListener('click', () => {
    if (!navigator.geolocation) return setMessage('Location access is not available in this browser.', 'error');
    setMessage('Finding your current location…');
    navigator.geolocation.getCurrentPosition(async position => {
      const {latitude,longitude} = position.coords;
      const label = await reverseGeocode(latitude,longitude);
      setPoint('pickup',latitude,longitude,label);
      map?.setView([latitude,longitude],15);
      setMessage('Pickup set to your current location.', 'success');
    }, () => setMessage('Could not access your location. Check browser permission.', 'error'), {enableHighAccuracy:true,timeout:10000});
  });
  $('swapLocations')?.addEventListener('click', () => {
    const oldPickup = pickup, oldDestination = destination;
    const oldPickupText = pickupInput.value, oldDestinationText = destinationInput.value;
    pickup = oldDestination; destination = oldPickup;
    pickupInput.value = oldDestinationText; destinationInput.value = oldPickupText;
    if (pickup && destination) {
      if (pickupMarker) map.removeLayer(pickupMarker);
      if (destinationMarker) map.removeLayer(destinationMarker);
      pickupMarker = L.marker([pickup.lat,pickup.lng],{icon:markerIcon('pin-pickup')}).addTo(map);
      destinationMarker = L.marker([destination.lat,destination.lng],{icon:markerIcon('pin-destination')}).addTo(map);
      previewRoute();
    }
  });
  $('recenterMap')?.addEventListener('click', () => map?.setView(dhaka,12));
  $('pickup')?.addEventListener('change', () => { pickup = null; });
  $('destination')?.addEventListener('change', () => { destination = null; });
  document.querySelectorAll('input[name="vehicleType"]').forEach(input => input.addEventListener('change', refreshFares));

  $('rideForm')?.addEventListener('submit', async event => {
    event.preventDefault();
    if (!driveRequireAuth('index.html')) return;
    const button = $('bookRide'); button.disabled = true; button.textContent = 'Finding your ride…';
    try {
      const from = await resolveInput('pickup');
      const to = await resolveInput('destination');
      const vehicleType = document.querySelector('input[name="vehicleType"]:checked').value;
      const result = await driveRequest('/rides', {
        method:'POST',
        body:JSON.stringify({
          pickupAddress:from.label, destinationAddress:to.label, vehicleType,
          pickupLat:from.lat, pickupLng:from.lng, destinationLat:to.lat, destinationLng:to.lng,
          isShared:$('sharedRide').checked, womenSafetyPreference:$('womenSafety').checked,
          routePreference:'balanced', seatsRequested:1,\n          safetyInitialLocation:$('womenSafety').checked?{lat:from.lat,lng:from.lng}:undefined,\n          safetyPlannedRoute:$('womenSafety').checked&&routeCoordinates.length>=2?routeCoordinates:undefined
        })
      });
      if(result.womenSafety?.shareToken){\n        const shareUrl=new URL('shared-trip.html?token='+encodeURIComponent(result.womenSafety.shareToken),window.location.href).toString();\n        try{sessionStorage.setItem('drive_pending_share_url',shareUrl);}catch{}\n      }\n      setMessage('Ride request created. Open your dashboard to follow the trip.', 'success');
      driveToast('Your ride request has been placed.');
      window.location.href='dashboard.html';
    } catch (error) { setMessage(error.message || 'Could not create the ride request.', 'error'); }
    finally { button.disabled = false; button.innerHTML = 'Find a ride <span>→</span>'; }
  });

  const user = driveSession();
  if (user) {
    $('navLogin').hidden = true; $('navJoin').hidden = true; $('navAccount').hidden = false;
  }
  if (map) setTimeout(() => map.invalidateSize(), 150);
})();