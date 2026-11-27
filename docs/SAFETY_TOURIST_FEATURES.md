# Women Safety, Smart Emergency & Tourist Mode

## Women Safety Mode
- Authenticated users can enable/disable Women Safety Mode.
- Users can save a verified-driver preference.
- Users can manage trusted contacts and emergency contacts.
- The API exposes clearly labelled sample driver verification records.
- When Women Safety is enabled for a ride, booking creates a private, expiring live-trip link for saved **trusted contacts only**; emergency contacts remain reserved for SOS.
- The passenger can share the link from the phone share sheet or open a prefilled SMS/WhatsApp message for each trusted contact. The passenger must confirm and send the message; no SMS/WhatsApp provider is configured for silent automatic delivery.
- When the driver starts the ride, the passenger's foreground browser GPS updates the trip session. The trusted contact's shared-trip page refreshes the map every five seconds and stops polling after trip completion or link expiry.
- Keep the passenger dashboard open and allow location permission while the ride is active. Browser background suspension can pause GPS updates.

## Smart Emergency & Safe Trip
- Authenticated users can start a trip with destination and estimated duration.
- Browser geolocation can send periodic location updates after permission is granted.
- If at least two planned route coordinates are supplied, the API checks distance from the route polyline and records a warning when the passenger is more than 500 metres away.
- If the expected arrival time is exceeded by more than 10 minutes, the API records an unexpected-delay warning.
- SOS records an alert, includes the saved emergency contacts in the contact handoff, and changes the linked trip status to EMERGENCY. SMS/WhatsApp still requires the passenger to press Send.
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
The current API persists these workflows through Supabase PostgreSQL and Row Level Security. Before public launch, validate the baseline schema, role-isolation policies, expiring share tokens, access logs and rate limits. Obtain clear user consent before collecting or sharing location.

- Tourist plans can optionally use the passenger's browser-provided current coordinates as the first route origin; permission is requested only when the user presses the location button.
