# Women Safety, Smart Emergency & Tourist Mode

## Women Safety Mode
- Authenticated users can enable/disable Women Safety Mode.
- Users can save a verified-driver preference.
- Users can manage trusted contacts and emergency contacts.
- The API exposes clearly labelled sample driver verification records.
- A user can create a private live-trip share token and choose saved trusted contacts.

## Smart Emergency & Safe Trip
- Authenticated users can start a trip with destination and estimated duration.
- Browser geolocation can send periodic location updates after permission is granted.
- If at least two planned route coordinates are supplied, the API checks distance from the route polyline and records a warning when the passenger is more than 500 metres away.
- If the expected arrival time is exceeded by more than 10 minutes, the API records an unexpected-delay warning.
- SOS records an alert, associates emergency contacts and changes the linked trip status to EMERGENCY.
- The shared-trip page displays limited destination, status, expected arrival, last location and warnings.

## Tourist Mode
- Curated sample destination recommendations are available for Dhaka, Chattogram, Cox's Bazar and Sylhet.
- Recommendations are ranked by user interest tags.
- Users can create multi-stop plans and choose Car, Bike, Public Transport or Walking.
- Distances and durations are explicitly approximate, not live navigation.

## API examples
\`\`\`json
{
  "destination": "East West University",
  "estimatedDurationMinutes": 45,
  "plannedRoute": [
    { "lat": 23.75, "lng": 90.39 },
    { "lat": 23.72, "lng": 90.41 }
  ]
}
\`\`\`

\`\`\`json
{
  "city": "Dhaka",
  "placeIds": ["dhaka-lalbagh", "dhaka-ahsan"],
  "transportPreference": "Car"
}
\`\`\`

## Production follow-up
Replace in-memory stores with the team's shared database. Integrate a real maps/directions provider, verified driver source and notification provider. Obtain clear user consent before collecting or sharing location, expire share tokens, and add access logs and rate limiting.
