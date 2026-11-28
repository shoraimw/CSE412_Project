# DRIVE verification and load testing

## Automated checks
- Backend: the active GitHub Actions workflow runs the root `npm run build`, which installs the backend, type-checks and builds NestJS, runs asset smoke checks, and validates the Cloudflare Worker bundle.
- Frontend: GitHub Actions runs `node --check` on every JavaScript file under `frontend/js` and checks that no server-only Supabase key reference is shipped to the browser.
- Supabase: 31 public application tables have RLS enabled. The 2026-11-28 Security Advisor reports 9 authenticated SECURITY DEFINER function warnings and one private-schema RLS-without-policy INFO finding; the performance advisor reports 4 unindexed foreign keys and 10 RLS auth-initplan warnings. The health advisor returned no lints. Re-review these findings after schema changes; the private integration-secret table intentionally has no client policies.
- Deployment: Cloudflare Pages hosts the static frontend and the `cse412-project` Cloudflare Worker serves the NestJS API. Pages Git integration deploys the frontend; Workers Builds creates preview Worker deployments; the production Worker workflow requires `CLOUDFLARE_API_TOKEN`. A Pages preview service binding targets the production API Worker, so use the separate Workers Builds preview for branch API testing until a dedicated preview API service is configured.

## Current integration readiness — 2026-11-28

- The `CSE412_Project` Supabase database is reachable and contains 31 public DRIVE tables; all 31 have RLS enabled. Final fare recording is now server-authorized with the dedicated Worker secret DRIVE_FARE_FINALIZATION_SECRET; the former direct authenticated RPC path is revoked so drivers cannot submit arbitrary fares from the browser. The secret and its SHA-256 hash must be provisioned securely for any new environment; neither belongs in Git.
- The database currently has **zero Auth users and zero profiles**. Seven tourist-place seed records exist. End-to-end role testing therefore requires separate Passenger, Driver, Vehicle Owner and Admin accounts to be registered and approved first.
- The linked database has 61 recorded migrations. The 59 available migration files are aligned to their remote version IDs, including the security-advisor cleanup migration restored from the existing idempotent cleanup SQL. Two historical migrations are still missing from this repository: the initial baseline schema and tourist-place UUID compatibility migration. This repository is not yet a clean-room Supabase bootstrap; export and commit a full baseline schema before provisioning a brand-new Supabase project.
- Follow [ADMIN_BOOTSTRAP.md](ADMIN_BOOTSTRAP.md) to promote the first trusted team account to Admin. Do not add a public admin bootstrap endpoint.
- Cloudflare Pages production and preview configurations both have a `DRIVE_API` service binding to the `cse412-project` Worker.
- The payment service includes SSLCOMMERZ session creation and server-side validation callbacks. Cloudflare currently has `SUPABASE_URL`, `SUPABASE_ANON_KEY` and `DRIVE_PAYMENT_WEBHOOK_SECRET`, but does not have `SSLCOMMERZ_STORE_ID` or `SSLCOMMERZ_STORE_PASSWORD`; therefore live/sandbox card checkout remains disabled until the merchant supplies those credentials. Cash can be recorded and bKash/Nagad transaction IDs are submitted for manual admin verification; no automatic wallet collection is connected.
- Women Safety uses foreground browser GPS. Add trusted/emergency contacts in Passenger Dashboard, save the preference, then request a ride with Women Safety enabled. The passenger dashboard must remain open and have location permission to update the safety session; the private share link expires after 24 hours. SMS/WhatsApp delivery is not configured. The KYC storage bucket `drive-kyc` is private and limited to JPG, PNG and PDF files up to 10 MB.

## Local integration test
1. Configure `backend/.env` from `.env.example` with the DRIVE Supabase project URL and publishable key.
2. Run `cd backend && npm install && npm run start:dev`.
3. Serve the `frontend` folder on a local static server.
4. Register a passenger, confirm the email if required, sign in, and test profile retrieval.
5. Create a ride request using real Dhaka addresses; verify it appears in the passenger dashboard.
6. Submit a driver application. An admin approves it and verifies the driver profile.
7. The approved driver opens Driver workspace, selects **Go online**, and grants browser location permission. Confirm the driver's fresh location appears in the passenger tracking map and the nearby request feed refreshes automatically.
8. Submit a passenger ride request while an eligible driver is online with a fresh GPS heartbeat. Confirm only matching vehicle-type drivers within 20 km receive a persisted alert; the open Driver workspace receives it through Supabase Realtime, with 7-second polling as fallback. If a driver goes online after a request already exists, confirm the deduplicated catch-up alert appears once. If browser notifications are allowed, a browser alert also appears.
9. Confirm the Driver request feed hides requests outside the 20 km radius and is empty while the driver is offline or the GPS heartbeat is stale. Have two eligible online drivers try to accept the same request. The first valid claim wins; the other receives a no-longer-available response. After accepting, the driver's availability is paused while GPS continues to update the active trip. Confirm the passenger receives an acceptance notification and sees the driver's live location on the dashboard map (10-second refresh).
10. Test rental listing, owner approval, rejection/resubmission, pending→approved→active→completed booking transitions, invalid direct status changes, approved-rental payment intents, ride payment intents, manual bKash/Nagad reference submission, safety contact management, Women Safety route monitoring, 24-hour trip sharing, SOS contact links, tourist plan persistence and shared-ride payment shares.
11. Verify that a passenger cannot read another passenger's records, a non-driver cannot claim a ride, and clients cannot mark payments or vehicles verified.

## k6 load test
Install k6, then run:

```sh
k6 run tests/load/ride-api.js
```

Configure the target and optional test token with environment variables:
- `API_BASE_URL`: API origin, without the `/api` suffix.
- `DRIVE_ACCESS_TOKEN`: dedicated test user's Supabase access token.

The default scenario ramps from 10 to 250 virtual users. Increase stages gradually only after checking database pool usage, Supabase quotas, Cloudflare Worker CPU/runtime and Supabase limits, error rates and p95/p99 latency. Do not run large load tests against production without approval. A 100,000-user registration target is not evidence of 100,000 concurrent-user capacity; concurrency must be measured separately.

## Requirement coverage and honest demo boundaries

The team requirement PDF defines 12 functional requirement groups and five non-functional requirements. Use this matrix during the demonstration; do not present a quote, simulated notification, or foreground GPS update as a production payment or emergency service.

| Requirement | Current implementation in this branch | Verification / boundary |
|---|---|---|
| Authentication & Security | Supabase email/password authentication, session tokens, role checks, password visibility toggle | Phone OTP requires an SMS provider; do not claim it is configured |
| User Management | Passenger profiles, driver applications, owner applications, role-controlled admin approval | Verify with passenger, driver, owner and admin accounts |
| Vehicle Rental | Vehicle catalogue, owner workflow, rental booking and database overlap guard | Test two overlapping bookings for the same vehicle |
| Smart Ride Booking | Map-selected pickup/destination, ride type, fare quote and persistent ride request | Requires browser location permission only for current-location pickup |
| Smart Ride Match & Cost Sharing | Atomic verified-driver claim RPC; passenger shared-ride discovery/join; seat-capacity guard and per-passenger fare recalculation | Verify concurrent joins, full-ride rejection and final fare shares |
| Real-Time Ride Tracking | Driver foreground GPS sends position changes plus a 15-second heartbeat while online or on-trip; the passenger tracking map refreshes every 10 seconds | Browser tab must remain open; trip GPS is foreground-only. Ride alerts use Supabase Realtime while the Driver workspace is open, with polling fallback; native background GPS and push are not configured |
| Automatic Fare Estimate | Automatic BDT estimate from server-calculated OpenStreetMap OSRM road distance | OSRM provides standard route estimates; live traffic is not included. The fare uses a deterministic formula, not machine learning; final fare is subject to trip conditions |
| Route Optimization | OpenStreetMap OSRM route alternatives with fastest, shortest and balanced selection | OSRM uses standard road-network data, not live traffic. Balanced scoring minimizes normalized distance and duration using a deterministic route comparison |
| Multi-Currency Payment | Live BDT-to-currency conversion quotes and payment-intent records | Cash payment intents can be recorded and manually confirmed by an admin after cash is physically received; no card/bKash/Nagad gateway or foreign-currency settlement is connected |
| Women Safety Mode | Preference stored with ride request; verified-driver claim guard; trusted contacts, expiring private trip-share links and planned-route monitoring during an active trip | SMS/WhatsApp delivery is not configured; keep the passenger dashboard open for foreground GPS |
| Smart Emergency & Safe Trip | SOS incident records, emergency contacts, expected-arrival delay and route-deviation checks | No emergency-services dispatch or guaranteed contact notification |
| Tourist Mode | Seeded tourist places, recommendations and saved multi-stop plans | Validate location accuracy and route provider availability |
| Performance | Indexed relational schema, bounded list endpoints, request validation and CI build checks | No latency SLO or load capacity is claimed until k6 runs are measured |
| Usability | Responsive pages, consistent forms, map-based booking, accessible show/hide password control | Test desktop and mobile viewport sizes |
| Scalability | Cloudflare Pages + Cloudflare Workers + Supabase managed Postgres; k6 test script included | Free-tier quotas apply; 100,000 concurrent users are not verified |
| Security | Supabase RLS on public tables, user-scoped clients, server-side role checks and guarded RPCs | Shared-ride privileged functions live in the private schema behind SECURITY INVOKER wrappers. The anonymous live-share RPC is intentionally SECURITY DEFINER and accepts only a high-entropy, expiring token hash. Enable Supabase leaked-password protection before public launch and run role-isolation/abuse tests |
| Portability | Responsive web frontend on modern browsers | Native mobile background GPS and push notifications are outside this web build |

## $0 academic deployment envelope

- Cloudflare Workers and Supabase Free have usage, CPU, database and function limits. Verify current plan limits before load testing; do not promise unlimited traffic.
- Supabase Free currently includes a 500 MB database and 50,000 monthly active users; free projects may pause after one week of inactivity.
- OpenStreetMap map tiles and the public OSRM routing demo are community/best-effort services, not commercial SLAs. OSRM's public demo is best-effort, intended for reasonable non-commercial use, and asks users not to exceed one request per second. The backend throttles requests and caches repeated route queries within a Worker instance.
- Ride booking uses map-selected coordinates and does not geocode typed addresses. If geocoding is added later, public Nominatim has a maximum of one request per second per application; avoid autocomplete or bulk geocoding.
- The above services can support a university demonstration at low traffic. They do not guarantee zero cost at arbitrary traffic, commercial uptime, or 100,000 concurrent users. No paid service or payment gateway should be added without explicit approval.

## Manual acceptance sequence

1. Register two passenger accounts, one driver account and one owner account. Verify a normal user cannot self-promote to driver, owner or admin.
2. Submit a driver application and approve it from the admin account. Confirm an unverified driver cannot claim a ride.
3. From passenger A, choose pickup/destination on the map, preview a route and request a ride. Confirm it appears in the verified driver's open requests.
4. Claim the same request from two driver sessions at nearly the same time; exactly one claim must succeed.
5. Start the ride, start foreground GPS sharing from the driver browser, and verify passenger A sees the marker update on the tracking map.
6. Confirm a different passenger cannot read the ride or its tracking data.
7. Test rental booking overlap (including a concurrent insert), owner-only booking updates, valid and invalid rental state transitions, fare quote, currency quote, safety settings, private share expiry, SOS record, tourist plan and notification history.
8. Attempt direct PostgREST updates that skip ride lifecycle states or alter fare/ownership fields; the database trigger must reject them. Open a valid private trip-share link in a logged-out/private browser and verify it loads; test a random or expired token and verify it returns an invalid/expired message.
9. Add one Trusted Contact and one Emergency Contact. Enable Women Safety, submit a ride request, and confirm only the Trusted Contact receives a live-share link while Emergency Contacts are reserved for SOS.
10. Open the share action on a mobile browser, send the prefilled link to the Trusted Contact, open it on a second phone/browser, and confirm the map refreshes with the passenger GPS every five seconds while the passenger dashboard remains open.
11. Verify GPS starts when the driver changes the ride to `in_progress`, not while the request is waiting; verify the safety session closes and the contact page stops polling when the ride completes or is cancelled.
12. Test the manual Safe Trip flow separately: start a trip, allow location permission, share with selected trusted contacts, and complete the trip.
11. Confirm the automatic fare estimate and saved ride-request fare match for the same route and vehicle; test Fastest, Shortest and Balanced route preferences.
12. Test an expired access token with a valid refresh token, then verify the profile name, email and phone render and save correctly.
10. Run the staged k6 profile against a dedicated test environment. Record error rate and p50/p95/p99 latency; never infer 100k concurrency from registered-user count.

## Manual UI and route tests
- On the passenger dashboard, select pickup and destination on the Leaflet map, drag markers, use current location, preview OSRM alternatives, and submit a ride. Confirm human-readable addresses resolve and server-side fare/distance use the road route when OSRM is available.
- In a second verified driver account, claim the request, transition through arriving/in-progress, allow browser location permission and keep the driver page open. Confirm the passenger's tracking map refreshes with the driver's latest GPS position.
- Create a shared car/CNG request. After a verified driver claims it, sign in as another passenger, join it, and verify the seat count and per-passenger fare share. Attempt a second join after capacity is full and confirm it is rejected.
- Test email OTP only after changing the Supabase email template to use `{{ .Token }}`. Test password login and refresh after access-token expiry.
- Confirm non-admin users cannot update `profiles.role`, `is_verified`, or `is_active` directly through PostgREST.
