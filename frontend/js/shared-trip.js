const token = new URLSearchParams(window.location.search).get('token');
const message = document.getElementById('sharedTripMessage');
const details = document.getElementById('sharedTripDetails');
function node(tag, cls, text) {
  const element = document.createElement(tag);
  if (cls) element.className = cls;
  if (text !== undefined) element.textContent = text;
  return element;
}
async function refreshSharedTrip() {
  if (!token) { message.textContent = 'This link is missing its sharing token.'; return; }
  try {
    const trip = await driveRequest('/safety/shared/' + encodeURIComponent(token));
    message.textContent = 'Trip information refreshed at ' + new Date().toLocaleTimeString();
    details.replaceChildren(
      node('h2', '', trip.destination),
      node('p', 'status-pill ' + trip.status.toLowerCase(), trip.status),
      node('p', '', 'Started: ' + new Date(trip.startedAt).toLocaleString()),
      node('p', '', 'Expected arrival: ' + new Date(trip.expectedArrivalAt).toLocaleString()),
      node('p', '', trip.currentLocation
        ? 'Last known coordinates: ' + trip.currentLocation.lat.toFixed(5) + ', ' + trip.currentLocation.lng.toFixed(5)
        : 'Waiting for the passenger to share their first location update.'),
      node('p', 'muted', 'Last location update: ' + new Date(trip.lastUpdatedAt).toLocaleString())
    );
    if (trip.currentLocation) {
      const mapLink = node('a', 'primary-button', 'View last location on map');
      mapLink.href = 'https://www.google.com/maps?q=' + trip.currentLocation.lat + ',' + trip.currentLocation.lng;
      mapLink.target = '_blank';
      mapLink.rel = 'noopener noreferrer';
      details.append(mapLink);
    }
    if (trip.warnings && trip.warnings.length) {
      const list = node('ul', 'trip-warning-list');
      trip.warnings.forEach(warning => list.append(node('li', '', warning.message)));
      details.append(node('h3', '', 'Safety warnings'), list);
    }
    details.append(node('p', 'feature-footnote', trip.privacyNote));
  } catch (error) {
    message.textContent = error.message;
    message.className = 'feature-message error-message';
  }
}
refreshSharedTrip();
window.setInterval(refreshSharedTrip, 15000);
