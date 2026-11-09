# DRIVE – Vehicle Rental, Safety and Tourist Assistance

An alternative to Uber developed by a group of students for CSE412, East West University.

## Technology
- Frontend: HTML, CSS and Vanilla JavaScript
- Backend: Node.js, TypeScript and NestJS
- Communication: REST API using JSON
- Current demo data: in-memory (no persistent database connected yet)

## Backend setup
1. Install Node.js 20 or later.
2. Open a terminal in the \`backend\` folder.
3. Install dependencies:
   \`\`\`bash
   npm install
   \`\`\`
4. Set a private \`JWT_SECRET\` environment variable before deployment. Never commit real secrets.
5. Start the API:
   \`\`\`bash
   npm run start:dev
   \`\`\`
6. API base URL: \`http://localhost:3000/api\`.

## Frontend setup
1. Start Apache in XAMPP.
2. Keep the project inside your XAMPP \`htdocs\` folder.
3. Open \`http://localhost:8080/CSE412_Project/frontend/vehicles.html\` (adjust port/folder as needed).
4. Open \`safety-tourist.html\` for Women Safety, Emergency & Safe Trip, and Tourist Mode.
5. Login first; protected features require the JWT saved by the frontend.

## Existing API
| Method | Endpoint | Purpose |
|---|---|---|
| POST | \`/api/auth/register\` | Register |
| POST | \`/api/auth/login\` | Login and receive JWT |
| POST | \`/api/auth/logout\` | Logout client session |
| GET | \`/api/users/me\` | View profile |
| PATCH | \`/api/users/me\` | Update profile |
| GET | \`/api/rental/vehicles\` | List/filter vehicles |
| POST | \`/api/rental/bookings\` | Submit vehicle booking |

## Safety and Tourist API
| Method | Endpoint | Purpose |
|---|---|---|
| GET/PUT | \`/api/safety/settings\` | Women Safety preference and trusted/emergency contacts |
| GET | \`/api/safety/drivers/verified\` | Sample verified-driver records |
| POST | \`/api/safety/trips\` | Start monitored trip |
| GET | \`/api/safety/trips/active\` | List active trips |
| POST | \`/api/safety/trips/:tripId/share\` | Create private live-trip share token |
| POST | \`/api/safety/trips/:tripId/location\` | Update trip location and evaluate warnings |
| POST | \`/api/safety/trips/:tripId/complete\` | Complete a trip |
| POST | \`/api/safety/sos\` | Record an SOS alert |
| GET | \`/api/safety/alerts\` | View the user's safety alerts |
| GET | \`/api/safety/shared/:token\` | Public limited trip view for a share token |
| GET | \`/api/tourist/places\` | Browse curated sample destinations |
| GET | \`/api/tourist/recommendations\` | Recommend destinations by city/interests |
| POST | \`/api/tourist/plans\` | Create a multi-stop travel plan |
| GET | \`/api/tourist/plans\` | List the user's plans |

## Important demo limitations
- User, trip, contact, alert, booking and travel-plan data are currently stored in memory and reset when the NestJS server restarts.
- Driver verification entries and tourist attractions are curated sample data for academic demonstration; they are not live verified driver or tourism-provider feeds.
- SOS alerts are recorded in the application only. No emergency service, SMS, email or WhatsApp provider is connected.
- Live trip location uses browser geolocation and requires user permission. Use localhost or HTTPS.
- Route-deviation checks require at least two planned route coordinates and use a 500-metre demo threshold. This is not a production navigation engine.
- Tourist distance/time values are rough estimates based on straight-line coordinates, not live road routing or traffic.
- A production release needs a shared persistent database, real driver verification, secure notification provider, maps/directions provider, rate limits, audit logs and privacy/consent review.
