# DRIVE verification and load testing

## Automated checks
- Backend: GitHub Actions runs `npm install` and `npm run build`.
- Frontend: GitHub Actions runs `node --check` on every JavaScript file under `frontend/js`.
- Supabase: migrations are versioned under `supabase/migrations`; security advisor should be checked after schema changes.

## Local integration test
1. Configure `backend/.env` from `.env.example` with the DRIVE Supabase project URL and publishable key.
2. Run `cd backend && npm install && npm run start:dev`.
3. Serve the `frontend` folder on a local static server.
4. Register a passenger, confirm the email if required, sign in, and test profile retrieval.
5. Create a ride request using real Dhaka addresses; verify it appears in the passenger dashboard.
6. Submit a driver application. An admin approves it, then the driver submits all three required document references.
7. An admin verifies the documents. The driver can then claim a request and share GPS during a trip.
8. Test rental listing, owner approval, notifications, safety trip sharing, SOS record creation, tourist plan persistence and payment-intent creation.
9. Verify that a passenger cannot read another passenger's records, a non-driver cannot claim a ride, and clients cannot mark payments or vehicles verified.

## k6 load test
Install k6, then run:

```sh
k6 run tests/load/ride-api.js
```

Configure the target and optional test token with environment variables:
- `API_BASE_URL`: API origin, without the `/api` suffix.
- `DRIVE_ACCESS_TOKEN`: dedicated test user's Supabase access token.

The default scenario ramps from 10 to 250 virtual users. Increase stages gradually only after checking database pool usage, Supabase quotas, Cloudflare limits, error rates and p95/p99 latency. Do not run large load tests against production without approval. A 100,000-user registration target is not evidence of 100,000 concurrent-user capacity; concurrency must be measured separately.

## Requirement coverage and honest demo boundaries

The team requirement PDF defines 12 functional requirement groups and five non-functional requirements. Use this matrix during the demonstration; do not present a quote, simulated notification, or foreground GPS update as a production payment or emergency service.

| Requirement | Current implementation in this branch | Verification / boundary |
|---|---|---|
| Authentication & Security | Supabase email/password authentication, session tokens, role checks, password visibility toggle | Phone OTP requires an SMS provider; do not claim it is configured |
| User Management | Passenger profiles, driver applications, owner applications, role-controlled admin approval | Verify with passenger, driver, owner and admin accounts |
| Vehicle Rental | Vehicle catalogue, owner workflow, rental booking and database overlap guard | Test two overlapping bookings for the same vehicle |
| Smart Ride Booking | Map-selected pickup/destination, ride type, fare quote and persistent ride request | Requires browser location permission only for current-location pickup |
| Smart Ride Match & Cost Sharing | Atomic verified-driver claim RPC; passenger shared-ride discovery/join; seat-capacity guard and per-passenger fare recalculation | Verify concurrent joins, full-ride rejection and final fare shares |
| Real-Time Ride Tracking | Driver foreground GPS watchPosition; authenticated location writes; passenger map refreshes every 6 seconds | Browser tab must remain open; this is not native background tracking or WebSocket streaming |
| Smart Fare Prediction | Rule-based BDT estimate with distance, vehicle, traffic, demand and time multipliers | Not a trained ML model; final fare is subject to trip conditions |
| AI Route Optimization | OSRM fastest/shortest road-route selection and alternatives when returned | Algorithmic route selection, not AI/ML; public demo endpoint is best-effort |
| Multi-Currency Payment | Live BDT-to-currency conversion quotes and payment-intent records | No card/bKash/Nagad gateway is connected; no foreign-currency settlement or money collection occurs |
| Women Safety Mode | Preference stored with ride request; verified-driver claim guard; trusted contacts and expiring private trip-share links | SMS/WhatsApp notification delivery is not configured |
| Smart Emergency & Safe Trip | SOS incident records, emergency contacts, expected-arrival delay and route-deviation checks | No emergency-services dispatch or guaranteed contact notification |
| Tourist Mode | Seeded tourist places, recommendations and saved multi-stop plans | Validate location accuracy and route provider availability |
| Performance | Indexed relational schema, bounded list endpoints, request validation and CI build checks | No latency SLO or load capacity is claimed until k6 runs are measured |
| Usability | Responsive pages, consistent forms, map-based booking, accessible show/hide password control | Test desktop and mobile viewport sizes |
| Scalability | Cloudflare Worker + Supabase managed Postgres; k6 test script included | Free-tier quotas apply; 100,000 concurrent users are not verified |
| Security | Supabase RLS on public tables, user-scoped clients, server-side role checks and guarded RPCs | RLS and role checks are enabled; privileged shared-ride operations now live in the non-exposed private schema behind SECURITY INVOKER public RPC wrappers. The Supabase security advisor returned no lints after this change; still run role-isolation and abuse tests |
| Portability | Responsive web frontend on modern browsers | Native mobile background GPS and push notifications are outside this web build |

## $0 academic deployment envelope

- Cloudflare Workers Free currently includes 100,000 requests per day and a 10 ms CPU limit per invocation. Stay within the published free quota.
- Supabase Free currently includes a 500 MB database and 50,000 monthly active users; free projects may pause after one week of inactivity.
- OpenStreetMap map tiles and the public OSRM routing demo are community/best-effort services, not commercial SLAs. OSRM's public demo asks for no more than one request per second and reasonable non-commercial use.
- Ride booking uses map-selected coordinates and does not geocode typed addresses. If geocoding is added later, public Nominatim has a maximum of one request per second per application; avoid autocomplete or bulk geocoding.
- The above services can support a university demonstration at low traffic. They do not guarantee zero cost at arbitrary traffic, commercial uptime, or 100,000 concurrent users. No paid service or payment gateway should be added without explicit approval.

## Manual acceptance sequence

1. Register two passenger accounts, one driver account and one owner account. Verify a normal user cannot self-promote to driver, owner or admin.
2. Submit a driver application and approve it from the admin account. Confirm an unverified driver cannot claim a ride.
3. From passenger A, choose pickup/destination on the map, preview a route and request a ride. Confirm it appears in the verified driver's open requests.
4. Claim the same request from two driver sessions at nearly the same time; exactly one claim must succeed.
5. Start the ride, start foreground GPS sharing from the driver browser, and verify passenger A sees the marker update on the tracking map.
6. Confirm a different passenger cannot read the ride or its tracking data.
7. Test rental booking overlap, owner approval, fare quote, currency quote, safety settings, private share expiry, SOS record, tourist plan and notification history.
8. Run the staged k6 profile against a dedicated test environment. Record error rate and p50/p95/p99 latency; never infer 100k concurrency from registered-user count.

## Manual UI and route tests
- On the passenger dashboard, select pickup and destination on the Leaflet map, drag markers, use current location, preview OSRM alternatives, and submit a ride. Confirm human-readable addresses resolve and server-side fare/distance use the road route when OSRM is available.
- In a second verified driver account, claim the request, transition through arriving/in-progress, allow browser location permission and keep the driver page open. Confirm the passenger's tracking map refreshes with the driver's latest GPS position.
- Create a shared car/CNG request. After a verified driver claims it, sign in as another passenger, join it, and verify the seat count and per-passenger fare share. Attempt a second join after capacity is full and confirm it is rejected.
- Test email OTP only after changing the Supabase email template to use `{{ .Token }}`. Test password login and refresh after access-token expiry.
- Confirm non-admin users cannot update `profiles.role`, `is_verified`, or `is_active` directly through PostgREST.
