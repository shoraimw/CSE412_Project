# DRIVE requirement traceability and honest verification status

Baseline audit: 2026-11-19  
Product-scope and active-UI supplement: 2026-11-28  
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
| FR-06 | Real-Time Ride Tracking | Driver foreground GPS updates; passenger dashboard subscribes to Supabase Realtime for trip-location inserts/updates and ride-status changes; both Driver alerts and Passenger tracking fall back to polling if the channel is unavailable. | **Core web workflow implemented.** Tracking still requires the browser workspace to remain open; native background GPS and background Web Push are not configured. Test on actual Android/iOS browsers. |
| FR-07 | Automatic Fare Prediction | Server-calculated OSRM route distance/duration plus a transparent deterministic vehicle-rate formula in BDT. | **Partial by design.** This is a rule-based estimate, not a trained ML prediction model. Live traffic, demand-based surge pricing and a verified final-distance fare are not implemented. |
| FR-08 | Route Optimization | OSRM/OpenStreetMap alternatives with Fastest, Shortest and Balanced selection for rides; Tourist Mode uses OSRM multi-stop stop-order optimization for Car/Bike plans. | **Core route workflow implemented.** This is API-based route selection, not an AI/ML model. Walking/public-transport tourist estimates remain approximate; public OSRM availability and live traffic are not guaranteed. |
| FR-09 | Multi-Currency Payment | Live exchange-rate quotes; ride and rental payment intents; cash settlement; bKash/Nagad transaction-ID submission; admin verification and audit trail. | **Core academic workflow implemented.** External payment gateway/webhook and foreign-currency settlement remain unconnected. Wallet proof is manually checked in the merchant app before admin marks paid; no pending intent is represented as collected money. |
| FR-10 | Women Safety Mode | Ride booking preference; verified/approved active driver enforcement; separate trusted and emergency contacts; expiring live-trip link created for trusted contacts; native phone share sheet and prefilled SMS/WhatsApp handoff; passenger foreground GPS; shared contact map refreshes every five seconds; ride lifecycle stops GPS when completed/cancelled. | **Core web workflow implemented.** The passenger must confirm/send the message; no silent automatic SMS/WhatsApp provider is configured. Background GPS can be suspended by mobile browsers. Test on real Android/iOS devices. |
| FR-11 | Smart Emergency and Safe Trip | SOS incident persistence, admin in-app notification, contact-specific SMS/WhatsApp handoff links, expected-arrival delay checks and route-deviation warnings. | **Core academic workflow implemented.** No police/emergency-service dispatch, automatic SMS/WhatsApp delivery or guaranteed emergency-contact notification is configured. |
| FR-12 | Tourist Mode | Curated destination catalogue, interest-tag recommendations, saved multi-stop plans and OSRM road-stop optimization for Car/Bike. | **Core academic workflow implemented.** Walking/public-transport estimates remain approximate; no live attraction feed or live traffic is provided. |

## Non-functional requirements

| # | Requirement | Current evidence | Status and remaining work |
|---|---|---|---|
| NFR-01 | Performance | Indexed Postgres queries, bounded result lists, five-minute ride-route caching, OSRM request coalescing/throttling, Realtime updates instead of repeated passenger GPS polling, server-side validation and CI build checks. | **Not verified against an SLO.** No measured p50/p95/p99 latency or error-rate report has been produced. Several unused-index INFO notices are expected in this low-volume project; do not remove indexes without query-plan evidence. |
| NFR-02 | Usability | Responsive HTML/CSS/JS pages, consistent forms, map-based booking, role-specific workspaces and notification history. | **Partially verified.** Complete mobile/desktop, keyboard, screen-reader, empty/error-state and real-device testing. |
| NFR-03 | Scalability | Cloudflare Workers + Supabase managed Postgres; a k6 test script is present. | **Not verified.** The existing k6 script stages from 1 to 250 virtual users, but it has not been run. No measured concurrency capacity or p95/p99 report exists. Test only in a dedicated environment and record p95/p99, error rate, database usage and provider quotas before setting a capacity target. |
| NFR-04 | Security | Supabase Auth, RLS, user-scoped database clients, server-side role checks, atomic RPCs, sensitive-write guards, payment-reference ownership checks, duplicate transaction-ID protection, response security headers and audit logs. Public trip-share wrapper now uses SECURITY INVOKER; the SECURITY DEFINER implementation stays in the private schema and requires a high-entropy expiring token hash. Application UPDATE policies were consolidated. | **Partial.** Supabase still reports leaked-password protection disabled. Enable it in Supabase Dashboard → Authentication → Security and run role-isolation, abuse and recovery tests. |
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
- The old `/presentation.html` route was removed in the 2026-11-28 frontend rebuild. Use the manual acceptance sequence in `docs/TESTING.md` and the active route map in `docs/UI_REBUILD.md`.
- Keep only Supabase publishable/anon keys in the browser/Worker; never expose a service-role key.
- For manual wallet payments, configure merchant account details with the project team and verify each submitted transaction ID in the official merchant app. Configure automatic gateway/webhook only after merchant eligibility and compliance are approved.
- Configure a real SMS/WhatsApp/push provider only after delivery credentials and user consent are available.
- Public OSM/Nominatim/OSRM services are best-effort, not commercial navigation SLAs.
- Do not claim a specific high-concurrency capacity, background GPS, guaranteed notifications, payment collection or emergency-service dispatch without evidence.

## Test evidence currently available

- Supabase migrations for nearby driver dispatch, notification deduplication, applicant notifications and RLS cleanup are applied to the connected project.
- Driver ride-notification trigger test: one eligible nearby driver alert and one admin alert were generated inside a transaction; rollback left no test request/notification rows.
- Driver-online catch-up notification test generated the expected in-transaction notification; rollback left no persisted test alert.
- Manual wallet-payment proof test: Passenger submitted valid bKash and Nagad references through the public SECURITY INVOKER wrapper to the private SECURITY DEFINER implementation; an admin notification was generated; temporary booking/payment rows were rolled back.
- Payment acceptance test: Admin-side verification moved a referenced pending wallet payment to `paid` and generated a passenger status notification. Reusing the same provider transaction ID was rejected; all test rows were rolled back.
- Duplicate mobile-wallet transaction references are prevented by a unique partial index.
- Supabase Security Advisor no longer reports the exposed SECURITY DEFINER trip-share wrapper or multiple permissive application UPDATE policies. Leaked-password protection remains the one Security Advisor warning.
- Frontend JavaScript syntax checks pass for the updated dashboard, rental, admin and Safety/Tourist scripts. GitHub Actions NestJS build, backend type-check, frontend validation and Cloudflare bundle validation passed for the release branch; the merged main commit also passed `npm run build`.
- The 2026-11-28 frontend rebuild has a Cloudflare Pages production deployment. Deployment success is not evidence that all functional requirements passed manual acceptance; check Cloudflare Pages for the latest deployed commit before a demonstration.
- Cloudflare Worker deployment is separate from Pages. Verify that the Worker revision matches the active backend commit before a demonstration; a Pages-only deployment does not update the API Worker.
- Production API readiness returned HTTP 200 with Supabase connected; the currency-catalog API returned HTTP 200 with 24 supported quote currencies.
- The authenticated Realtime endpoint correctly rejects unauthenticated access. A real authenticated two-browser Passenger→Driver Realtime delivery test is still required before calling that specific end-to-end notification workflow fully verified.
- Women Safety sharing was reviewed: live share tokens are generated for trusted contacts only; the mobile share sheet and contact-specific SMS/WhatsApp handoff are available; the shared map polls every five seconds. Full recipient delivery and mobile background GPS still require real-device acceptance testing and an SMS provider for automatic delivery.


## Active UI rebuild and supplemental requirement review — 2026-11-28

The new map-first screen is a UI convention only. DRIVE remains a multi-service ride-sharing and car/bike rental project. See `docs/PRODUCT_SCOPE_GUARDRAILS.md` for the binding product identity, 12 primary functional groups, domain rules and supplementary acceptance targets.

The supplemental `Drive_Requirement_Analysis.pdf` adds detailed checks not fully enumerated as separate top-level groups in the submitted requirement PDF:
- account recovery and verified identity submission;
- ride cancellation and any applicable cancellation charge shown before confirmation;
- final fare breakdown and successful-payment receipt;
- supported currency, exchange rate and charge currency shown before confirmation;
- notifications for booking, arrival, cancellation and payment;
- passenger ratings/feedback and complaints;
- Tourist Mode language and currency preferences.

Code inspection of the active main branch found that account recovery, a dedicated rating/feedback/complaint flow, Tourist Mode language preference, explicit cancellation-charge disclosure and receipt generation are not evidenced in the current active route/API set. Treat these as gaps until implemented and tested or formally scoped with the faculty/team. The active vehicle DTO permits vehicle categories beyond the submitted cars/bikes scope; do not expand those categories without team approval.

The numeric supplementary NFR acceptance targets are 100 concurrent users with p95 ordinary-request latency no greater than 3 seconds (excluding external-provider delay), tracking display refresh within 10 seconds after a new location update, and 8 of 10 first-time users completing a booking within 2 minutes without assistance. None is considered passed until measured. The existing k6 script is not a load-test result.

This supplement is based on source inspection and documentation, not a completed end-to-end acceptance run. Separate Passenger, Driver, Vehicle Owner and Admin test accounts and real-device tests are still required.
