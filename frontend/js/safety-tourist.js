const safetyState = {
  settings: { womenSafetyEnabled: false, preferVerifiedDrivers: false, trustedContacts: [], emergencyContacts: [] },
  activeTrip: null,
  watchId: null,
  places: [],
  selectedPlaceIds: [],
  touristOrigin: null
};
const byId = id => document.getElementById(id);
function setText(id, message) { const node = byId(id); if (node) node.textContent = message; }
function makeNode(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function showPageMessage(message, isError = false) {
  const node = byId('pageMessage');
  node.textContent = message;
  node.className = isError ? 'feature-message error-message' : 'feature-message';
}
function stopLocationWatch() {
  if (safetyState.watchId !== null && navigator.geolocation) {
    navigator.geolocation.clearWatch(safetyState.watchId);
    safetyState.watchId = null;
  }
}
async function loadSettings() {
  const settings = await driveRequest('/safety/settings');
  safetyState.settings = settings;
  byId('womenSafetyEnabled').checked = settings.womenSafetyEnabled;
  byId('preferVerifiedDrivers').checked = settings.preferVerifiedDrivers;
  renderContacts();
}
function renderContacts() {
  [['trustedContactList', 'trustedContacts'], ['emergencyContactList', 'emergencyContacts']].forEach(([containerId, key]) => {
    const container = byId(containerId);
    container.replaceChildren();
    const contacts = safetyState.settings[key];
    if (!contacts.length) { container.append(makeNode('p', 'muted', 'No contacts added yet.')); return; }
    contacts.forEach(contact => {
      const row = makeNode('div', 'contact-row');
      const details = makeNode('div');
      details.append(makeNode('strong', '', contact.name), makeNode('small', '', contact.phone + (contact.relation ? ' · ' + contact.relation : '')));
      const remove = makeNode('button', 'text-button', 'Remove');
      remove.type = 'button';
      remove.addEventListener('click', async () => {
        safetyState.settings[key] = contacts.filter(item => item.id !== contact.id);
        await saveSettings(false);
      });
      row.append(details, remove);
      container.append(row);
    });
  });
  renderShareContactChoices();
}
async function saveSettings(showSuccess = true) {
  try {
    const result = await driveRequest('/safety/settings', {
      method: 'PUT',
      body: JSON.stringify({
        womenSafetyEnabled: byId('womenSafetyEnabled').checked,
        preferVerifiedDrivers: byId('preferVerifiedDrivers').checked,
        trustedContacts: safetyState.settings.trustedContacts,
        emergencyContacts: safetyState.settings.emergencyContacts
      })
    });
    safetyState.settings = result;
    renderContacts();
    if (showSuccess) showPageMessage('Safety settings saved successfully.');
  } catch (error) { showPageMessage(error.message, true); }
}
function addContact(formId, prefix, key) {
  byId(formId).addEventListener('submit', async event => {
    event.preventDefault();
    const name = byId(prefix + 'Name').value.trim();
    const phone = byId(prefix + 'Phone').value.trim();
    const relation = byId(prefix + 'Relation').value.trim();
    safetyState.settings[key].push({ name, phone, relation: relation || 'Trusted contact' });
    event.target.reset();
    await saveSettings(false);
  });
}
async function loadVerifiedDrivers() {
  const drivers = await driveRequest('/safety/drivers/verified');
  const container = byId('verifiedDrivers');
  container.replaceChildren();
  drivers.forEach(driver => {
    const card = makeNode('div', 'driver-row');
    const details = makeNode('div');
    details.append(makeNode('strong', '', driver.name), makeNode('small', '', driver.vehicle + ' · Rating ' + driver.rating));
    card.append(details, makeNode('span', 'demo-verified', driver.verificationStatus));
    container.append(card);
  });
}
function renderShareContactChoices() {
  const container = byId('shareContactChoices');
  container.replaceChildren();
  const contacts = safetyState.settings.trustedContacts;
  if (!contacts.length) { container.append(makeNode('p', 'muted', 'Add trusted contacts first.')); return; }
  contacts.forEach(contact => {
    const label = makeNode('label', 'share-contact-option');
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.name = 'shareContact';
    checkbox.value = contact.id;
    label.append(checkbox, makeNode('span', '', contact.name + ' · ' + contact.phone));
    container.append(label);
  });
}
function getPosition() {
  return new Promise((resolve, reject) => {
    if (!navigator.geolocation) return reject(new Error('Geolocation is not supported by this browser.'));
    navigator.geolocation.getCurrentPosition(
      position => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
      error => reject(new Error(error.message || 'Location permission was not granted.')),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
  });
}
function renderActiveTrip() {
  const trip = safetyState.activeTrip;
  const details = byId('activeTripDetails');
  details.replaceChildren();
  if (!trip) {
    details.append(makeNode('p', 'muted', 'Start a trip to enable live monitoring and sharing.'));
    byId('tripStatus').textContent = 'No active trip';
    byId('shareTripButton').disabled = true;
    byId('completeTripButton').disabled = true;
    return;
  }
  byId('tripStatus').textContent = trip.status;
  byId('tripStatus').className = 'status-pill ' + trip.status.toLowerCase();
  details.append(
    makeNode('p', 'trip-destination', trip.destination),
    makeNode('p', 'muted', 'Expected arrival: ' + new Date(trip.expectedArrivalAt).toLocaleString()),
    makeNode('p', 'muted', trip.currentLocation ? 'Latest location: ' + trip.currentLocation.lat.toFixed(5) + ', ' + trip.currentLocation.lng.toFixed(5) : 'Waiting for a location update.')
  );
  if (trip.warnings && trip.warnings.length) {
    const warningList = makeNode('ul', 'trip-warning-list');
    trip.warnings.slice(-3).forEach(warning => warningList.append(makeNode('li', '', warning.message)));
    details.append(warningList);
  }
  byId('shareTripButton').disabled = trip.status === 'COMPLETED';
  byId('completeTripButton').disabled = trip.status === 'COMPLETED';
}
async function loadActiveTrip() {
  const trips = await driveRequest('/safety/trips/active');
  safetyState.activeTrip = trips.length ? trips[trips.length - 1] : null;
  renderActiveTrip();
  if (safetyState.activeTrip) startLocationWatch(safetyState.activeTrip.id);
}
function startLocationWatch(tripId) {
  stopLocationWatch();
  if (!navigator.geolocation) { setText('tripMessage', 'Browser location is unavailable; trip monitoring will use the information entered.'); return; }
  safetyState.watchId = navigator.geolocation.watchPosition(async position => {
    try {
      const result = await driveRequest('/safety/trips/' + encodeURIComponent(tripId) + '/location', {
        method: 'POST',
        body: JSON.stringify({ lat: position.coords.latitude, lng: position.coords.longitude })
      });
      safetyState.activeTrip = result.trip;
      renderActiveTrip();
      if (result.latestWarnings && result.latestWarnings.length) setText('tripMessage', result.latestWarnings[result.latestWarnings.length - 1].message);
    } catch (error) { setText('tripMessage', 'Location update failed: ' + error.message); }
  }, error => setText('tripMessage', 'Live location is paused: ' + error.message), {
    enableHighAccuracy: true, maximumAge: 5000, timeout: 15000
  });
}
byId('startTripForm').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    let initialLocation = null;
    try { initialLocation = await getPosition(); } catch (error) { setText('tripMessage', error.message + ' Starting without an initial location.'); }
    const routeText = byId('plannedRoute').value.trim();
    const plannedRoute = routeText ? JSON.parse(routeText) : [];
    if (!Array.isArray(plannedRoute)) throw new Error('Planned route must be a JSON array of latitude/longitude points.');
    const payload = {
      destination: byId('tripDestination').value.trim(),
      estimatedDurationMinutes: Number(byId('tripDuration').value),
      plannedRoute
    };
    if (initialLocation) payload.initialLocation = initialLocation;
    const result = await driveRequest('/safety/trips', { method: 'POST', body: JSON.stringify(payload) });
    safetyState.activeTrip = result.trip;
    renderActiveTrip();
    setText('tripMessage', result.note);
    startLocationWatch(result.trip.id);
  } catch (error) { setText('tripMessage', error.message); }
});
byId('shareTripButton').addEventListener('click', async () => {
  if (!safetyState.activeTrip) return;
  const contactIds = Array.from(document.querySelectorAll('input[name="shareContact"]:checked')).map(input => input.value);
  try {
    const result = await driveRequest('/safety/trips/' + encodeURIComponent(safetyState.activeTrip.id) + '/share', {
      method: 'POST', body: JSON.stringify({ contactIds })
    });
    const shareUrl = new URL('shared-trip.html', window.location.href);
    shareUrl.searchParams.set('token', result.shareToken);
    const container = byId('shareLinkResult');
    container.replaceChildren(makeNode('p', '', result.message));
    const link = makeNode('a', 'share-url', shareUrl.toString());
    link.href = shareUrl.toString();
    link.target = '_blank';
    link.rel = 'noopener noreferrer';
    const copy = makeNode('button', 'secondary-button', 'Copy link');
    copy.type = 'button';
    copy.addEventListener('click', async () => {
      try { await navigator.clipboard.writeText(shareUrl.toString()); copy.textContent = 'Copied'; }
      catch { setText('tripMessage', 'Copy is unavailable. Select and copy the link manually.'); }
    });
    container.append(link, copy);
  } catch (error) { setText('tripMessage', error.message); }
});
byId('completeTripButton').addEventListener('click', async () => {
  if (!safetyState.activeTrip) return;
  try {
    const result = await driveRequest('/safety/trips/' + encodeURIComponent(safetyState.activeTrip.id) + '/complete', { method: 'POST' });
    safetyState.activeTrip = result.trip;
    stopLocationWatch();
    renderActiveTrip();
    setText('tripMessage', result.message);
  } catch (error) { setText('tripMessage', error.message); }
});
byId('sosButton').addEventListener('click', async () => {
  if (!window.confirm('Record an SOS emergency alert? This demo does not contact emergency services.')) return;
  try {
    let location = safetyState.activeTrip && safetyState.activeTrip.currentLocation;
    if (!location) { try { location = await getPosition(); } catch (_) { location = null; } }
    const payload = { message: 'Passenger requested emergency assistance.' };
    if (safetyState.activeTrip) payload.tripId = safetyState.activeTrip.id;
    if (location) payload.location = { lat: location.lat, lng: location.lng };
    const result = await driveRequest('/safety/sos', { method: 'POST', body: JSON.stringify(payload) });
    setText('sosMessage', result.message);
    await loadAlerts();
    if (safetyState.activeTrip) { safetyState.activeTrip.status = 'EMERGENCY'; renderActiveTrip(); }
  } catch (error) { setText('sosMessage', error.message); }
});
async function loadAlerts() {
  const alerts = await driveRequest('/safety/alerts');
  const container = byId('safetyAlerts');
  container.replaceChildren();
  if (!alerts.length) { container.append(makeNode('p', 'muted', 'No alerts recorded.')); return; }
  alerts.forEach(alert => {
    const item = makeNode('div', 'alert-item');
    item.append(makeNode('strong', '', 'SOS · ' + new Date(alert.createdAt).toLocaleString()));
    item.append(makeNode('p', '', alert.message));
    item.append(makeNode('small', '', alert.status + ' · ' + alert.notifiedContacts.length + ' emergency contact(s) listed'));
    container.append(item);
  });
}
byId('refreshAlertsButton').addEventListener('click', () => loadAlerts().catch(error => showPageMessage(error.message, true)));

function selectedInterests() {
  return Array.from(document.querySelectorAll('input[name="interest"]:checked')).map(input => input.value);
}
byId('useTouristLocation').addEventListener('click', async () => {
  try {
    safetyState.touristOrigin = await getPosition();
    setText('touristLocationStatus', 'Starting point saved: ' + safetyState.touristOrigin.lat.toFixed(5) + ', ' + safetyState.touristOrigin.lng.toFixed(5));
  } catch (error) {
    safetyState.touristOrigin = null;
    setText('touristLocationStatus', 'Location not selected: ' + error.message);
  }
});
async function loadRecommendations() {
  const params = new URLSearchParams({
    city: byId('touristCity').value,
    interests: selectedInterests().join(',')
  });
  const places = await driveRequest('/tourist/recommendations?' + params.toString());
  safetyState.places = places;
  const container = byId('touristRecommendations');
  container.replaceChildren();
  if (!places.length) { container.append(makeNode('p', 'muted', 'No sample recommendations for this city yet.')); return; }
  places.forEach(place => {
    const card = makeNode('article', 'place-card');
    card.append(makeNode('span', 'place-category', place.category), makeNode('h4', '', place.name), makeNode('p', '', place.description));
    card.append(makeNode('small', 'muted', 'Nearby: ' + place.nearbyFacilities.join(' · ')));
    const button = makeNode('button', 'secondary-button', safetyState.selectedPlaceIds.includes(place.id) ? 'Remove from plan' : 'Add to plan');
    button.type = 'button';
    button.addEventListener('click', () => {
      if (safetyState.selectedPlaceIds.includes(place.id)) {
        safetyState.selectedPlaceIds = safetyState.selectedPlaceIds.filter(id => id !== place.id);
      } else if (safetyState.selectedPlaceIds.length < 10) {
        safetyState.selectedPlaceIds.push(place.id);
      } else { setText('pageMessage', 'A travel plan can contain up to 10 stops.', true); return; }
      renderSelectedPlaces();
      loadRecommendations().catch(error => showPageMessage(error.message, true));
    });
    card.append(button);
    container.append(card);
  });
}
function renderSelectedPlaces() {
  const container = byId('selectedPlaces');
  container.replaceChildren();
  const selected = safetyState.selectedPlaceIds.map(id => safetyState.places.find(place => place.id === id)).filter(Boolean);
  if (!selected.length) container.append(makeNode('p', 'muted', 'Choose places from the recommendations.'));
  selected.forEach((place, index) => container.append(makeNode('p', 'selected-place', (index + 1) + '. ' + place.name)));
  byId('createTouristPlan').disabled = selected.length === 0;
}
byId('touristSearchForm').addEventListener('submit', event => {
  event.preventDefault();
  safetyState.selectedPlaceIds = [];
  renderSelectedPlaces();
  loadRecommendations().catch(error => showPageMessage(error.message, true));
});
byId('createTouristPlan').addEventListener('click', async () => {
  try {
    const payload = {
      city: byId('touristCity').value,
      placeIds: safetyState.selectedPlaceIds,
      transportPreference: byId('transportPreference').value
    };
    if (byId('travelDate').value) payload.travelDate = byId('travelDate').value;
    if (safetyState.touristOrigin) payload.origin = safetyState.touristOrigin;
    const plan = await driveRequest('/tourist/plans', { method: 'POST', body: JSON.stringify(payload) });
    const container = byId('touristPlanResult');
    container.replaceChildren(
      makeNode('strong', '', plan.city + ' · ' + plan.transportPreference),
      makeNode('p', 'muted', 'Approx. ' + plan.totalDistanceKm + ' km · ' + plan.approximateTravelMinutes + ' minutes travel time' + (plan.origin ? ' · starting from your current location' : ''))
    );
    const list = makeNode('ol', 'plan-stop-list');
    plan.stops.forEach(stop => list.append(makeNode('li', '', stop.name + (stop.distanceFromPreviousKm ? ' — ' + stop.distanceFromPreviousKm + ' km from previous stop' : ' — first stop'))));
    container.append(list, makeNode('small', 'muted', plan.estimateType));
  } catch (error) { setText('pageMessage', error.message); }
});

async function initializeFeaturePage() {
  addContact('trustedContactForm', 'trusted', 'trustedContacts');
  addContact('emergencyContactForm', 'emergency', 'emergencyContacts');
  byId('saveSafetySettings').addEventListener('click', () => saveSettings(true));
  try {
    await loadSettings();
    await Promise.all([loadVerifiedDrivers(), loadActiveTrip(), loadAlerts()]);
    showPageMessage('Safety tools are ready. Add contacts before using trip sharing or SOS notifications.');
  } catch (error) {
    showPageMessage(error.message + ' Please log in first, then reload this page.', true);
  }
  loadRecommendations().catch(error => showPageMessage(error.message, true));
  renderSelectedPlaces();
}
initializeFeaturePage();
