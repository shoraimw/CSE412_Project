# DRIVE requirement traceability and honest verification status

Audit date: 2026-11-19  
Basis: the CSE412 project requirement document, current `main` code/database, the current feature branch, Supabase schema/policies/advisors, and the documented academic deployment constraints.

## Status legend

- **Core implemented** — code and persistent data path exist; end-to-end acceptance testing is still required.
- **Partial / integration-limited** — the core flow exists, but a required external provider, production capability, or important boundary is not present.
- **Not verified** — implementation may exist, but no reliable automated/manual evidence currently proves the requirement at its target load or across devices.

A page, button, database table, successful build, or demo response alone is not proof that a requirement is complete.

## Functional requirements

| # | Requirement | Current implementation | Status and remaining verification |
|---|---|---|---|
| FR-01 | Authentication and Security | Supabase email/password signup and login, email OTP, session refresh, AuthGuard token validation, role checks, RLS and sensitive-write guards. | **Partial.** Phone/SMS OTP is not configured. Supabase leaked-password protection remains disabled. Distributed API rate limiting and abuse testing are not evidenced. |
| FR-02 | User Management | Passenger profiles, Driver Partner applications, Vehicle Owner applications, admin approval/rejection, profile editing and role-specific workspaces. Rejected applications can be corrected and resubmitted; applicant/admin notifications are persisted. | **Core implemented.** Test all four roles, stale sessions, rejection/resubmission and role isolation with separate accounts. |
| FR-03 | Vehicle Rental | Verified vehicle catalogue, owner applications/listings, admin vehicle review, rental requests, owner/admin approval, a database exclusion constraint preventing overlapping pending/approved/active bookings and database-enforced booking state transitions. | **Core implemented.** Booking state transitions are now validated in the API. Test overlapping and adjacent date ranges and unauthorized owner actions. |
| FR-04 | Smart Ride Booking | Map-selected pickup/destination, geocoding, OSRM route quote, server-side BDT fare calculation and persistent ride requests. | **Core implemented.** Test real Dhaka addresses, unavailable routing provider, invalid coordinates and passenger cancellation. |
| FR-05 | Smart Ride Match and Cost Sharing | Approved-driver vehicle matching, online/fresh GPS requirement, 20 km claim guard, atomic first-claim RPC, seat capacity, shared-ride joining and per-passenger fare shares. Shared-ride payment intents now use the authenticated passenger's own fare share. | **Core implemented.** Test two concurrent driver claims, full capacity, concurrent joins and individual payment-intent amounts. |
| FR-06 | Real-Time Ride Tracking | Driver foreground GPS updates, passenger tracking refresh, trip status changes and Supabase Realtime notifications with polling fallback. | **Partial.** GPS tracking is foreground/browser-tab dependent and uses polling for location updates. Native background GPS and background Web Push are not configured. Test on actual Android/iOS browsers. |
| FR-07 | Automatic Fare Prediction | Server-calculated OSRM route distance/duration plus a transparent deterministic vehicle-rate formula in BDT. | **Partial by design.** This is a rule-based estimate, not a trained ML prediction model. Live traffic, demand-based surge pricing and a verified final-distance fare are not implemented. |
| FR-08 | Route Optimization | OSRM/OpenStreetMap alternatives with Fastest, Shortest and Balanced selection. | **Partial by design.** This is API-based route selection, not an AI/ML model. Public OSRM demo availability and live traffic are not guaranteed. |
| FR-09 | Multi-Currency Payment | Live BDT exchange-rate quotes, payment-intent records and admin review of cash received. | **Partial.** No bKash, Nagad, card gateway, payment webhook, foreign-currency settlement or automated refund is connected. A pending intent does not mean money was collected. |
| FR-10 | Women Safety Mode | Safety preferences, verified-driver requirement, trusted/emergency contacts, private expiring trip-share links and trip-route monitoring. | **Partial.** The share link is generated, but SMS/WhatsApp delivery is a user handoff; no guaranteed third-party delivery is configured. Foreground location sharing requires the page to remain active. |
| FR-11 | Smart Emergency and Safe Trip | SOS incident persistence, admin in-app alert, expected-arrival delay checks and route-deviation warnings. | **Partial.** No police/emergency-service dispatch, automatic SMS/WhatsApp delivery or guaranteed emergency-contact notification is configured. |
| FR-12 | Tourist Mode | Curated destination catalogue, interest-tag recommendations and saved multi-stop plans. | **Partial.** Recommendations use curated data; route distance/duration are approximate and not live navigation or a live attraction feed. |

## Non-functional requirements

| # | Requirement | Current evidence | Status and remaining work |
|---|---|---|---|
| NFR-01 | Performance | Indexed Postgres queries, bounded result lists, route caching/request spacing, server-side validation and CI build checks. | **Not verified against an SLO.** No measured p50/p95/p99 latency or error-rate report has been produced. Several unused-index INFO notices are expected in this low-volume project; do not remove indexes without query-plan evidence. |
| NFR-02 | Usability | Responsive HTML/CSS/JS pages, consistent forms, map-based booking, role-specific workspaces and notification history. | **Partially verified.** Complete mobile/desktop, keyboard, screen-reader, empty/error-state and real-device testing. |
| NFR-03 | Scalability | Cloudflare Workers + Supabase managed Postgres; a k6 test script is present. | **Not verified.** The k6 script has not been run and no evidence supports 100,000 concurrent users. Test only in a dedicated environment and record p95/p99, error rate, database usage and provider quotas. |
| NFR-04 | Security | Supabase Auth, RLS, user-scoped database clients, server-side role checks, atomic RPCs, sensitive-write guards and audit logs. Public trip-share wrapper now uses SECURITY INVOKER; the SECURITY DEFINER implementation stays in the private schema and requires a high-entropy expiring token hash. Application UPDATE policies were consolidated. | **Partial.** Supabase still reports leaked-password protection disabled. Enable it in Supabase Dashboard → Authentication → Security and run role-isolation, abuse and recovery tests. |
| NFR-05 | Portability | Browser-based web frontend and Cloudflare Worker deployment configuration. | **Partial.** Validate Chrome, Edge, Firefox and Safari, including mobile browsers. Native mobile app behavior, background GPS and background push are outside the current web build. |

## Driver notification acceptance criteria

1. A driver must have an approved application, active/verified Driver profile, matching vehicle type, be explicitly online and have a GPS heartbeat no older than 45 seconds.
2. A new ride request must notify only eligible drivers within 20 km of pickup.
3. If a driver goes online after a request already exists, a deduplicated catch-up notification must be created.
4. The Driver workspace must receive notification inserts through Supabase Realtime while open; 7-second polling is the fallback.
5. Browser notifications require the user to grant browser permission. The Driver workspace must remain open for foreground browser alerts.
6. The driver request feed must hide requests outside the 20 km radius and must not offer claim while offline/stale.
7. The database claim RPC must allow only one eligible driver to win.
8. The passenger must receive an in-app notification when a driver claims the ride.

The current database trigger and catch-up path were exercised with temporary transactions against the existing test request/driver; each transaction was rolled back and no test rows were left behind. Real two-browser Realtime delivery still requires an end-to-end browser test.

## Required external settings and honest demo boundaries

- Enable Supabase leaked-password protection in the Dashboard.
- Configure and verify Supabase Auth Site URL, redirect allow-list and email OTP template.
- Keep only Supabase publishable/anon keys in the browser/Worker; never expose a service-role key.
- Configure a real payment provider only after merchant eligibility, webhook verification and compliance are approved.
- Configure a real SMS/WhatsApp/push provider only after delivery credentials and user consent are available.
- Public OSM/Nominatim/OSRM services are best-effort, not commercial navigation SLAs.
- Do not claim 100,000-user capacity, background GPS, guaranteed notifications, payment collection or emergency-service dispatch without evidence.

## Test evidence currently available

- Supabase migrations for nearby driver dispatch, notification deduplication, applicant notifications and RLS cleanup are applied to the connected project.
- Driver ride-notification trigger test: one eligible nearby driver alert and one admin alert were generated inside a transaction; rollback left no test request/notification rows.
- Driver-online catch-up notification test generated the expected in-transaction notification; rollback left no persisted test alert.
- Supabase Security Advisor no longer reports the exposed SECURITY DEFINER trip-share wrapper or multiple permissive application UPDATE policies. Leaked-password protection remains the one Security Advisor warning.
- JavaScript syntax checks pass locally for the updated Driver workspace, notification center and Vehicle Owner application scripts.
- GitHub Actions backend/frontend build checks and a deployed two-browser end-to-end test are still required before declaring this branch production-ready.
