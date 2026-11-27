# DRIVE product scope guardrails

**Decision date:** 2026-11-28  
**Applies to:** product design, frontend rebuilds, API changes, database changes and demonstrations.

## 1. Product identity

DRIVE is an East West University CSE412 academic project for a **smart car/bike rental and ride-sharing platform**. It is not a single-purpose ride-hailing clone.

Ride booking is only one part of the product. The defining scope also includes:
- shared rides and per-passenger cost sharing;
- vehicle rental with independent Vehicle Owner workflows and booking availability;
- verified Driver and Vehicle Owner onboarding, with administrator approval;
- Women Safety Mode and consent-based trip sharing;
- emergency and safe-trip monitoring, including delay and route-deviation warnings;
- Tourist Mode with destination discovery and multi-stop trip planning;
- fare estimates, currency conversion information, payment records and administration.

The submitted requirement document remains the primary source of truth. A visual reference must never override a stated DRIVE requirement.

## 2. What may be borrowed from ride-hailing UX references

Common interaction conventions may be used where they make DRIVE easier to understand:
- a map for choosing pickup and destination;
- a visible fare estimate before requesting a ride;
- clear driver/vehicle information and trip status;
- live trip location for authorized participants;
- simple, responsive forms and clear error states.

These are interaction patterns, not product requirements or permission to copy another company's product.

## 3. What must not happen

- Do not replace DRIVE branding, terminology, workflows or information architecture with Uber branding or a close copy.
- Do not turn DRIVE into a ride-only product or remove/visually bury Rentals, shared rides/cost sharing, Tourist Mode, Women Safety, emergency/safe-trip functions or the Owner role.
- Do not add unrelated commercial features, subscriptions, tiers, delivery services, surge-pricing policies or other features merely because another platform has them.
- Do not silently change the project's Bangladesh academic-prototype boundary or add paid services without approval.
- Do not describe a visual control, simulated response, provider quote or foreground GPS flow as a completed production integration.
- Do not mark a requirement complete because a page exists, a button is clickable, a build passes or a database table exists. Require the relevant acceptance test.

## 4. Primary functional requirement groups

The submitted CSE412 requirement document defines these 12 groups. Every new screen, endpoint, schema change and acceptance test must map to one or more of them.

| ID | Required group | DRIVE-specific outcome |
|---|---|---|
| FR-01 | Authentication & Security | Secure registration/login, identity/verification methods, session protection and account security |
| FR-02 | User Management | Passenger, Driver and Vehicle Owner profiles, role-specific information and service history |
| FR-03 | Vehicle Rental | Search and rent available cars/bikes by type, location, price and rental period |
| FR-04 | Smart Ride Booking | Pickup, destination, vehicle selection, estimated fare/time and booking-state updates |
| FR-05 | Smart Ride Match & Cost Sharing | Match eligible drivers and allow multiple passengers to share a ride and its cost |
| FR-06 | Real-Time Ride Tracking | Authorized passenger view of driver location, route, ETA and ride status |
| FR-07 | Smart Fare Prediction | Estimate using distance, ride type and, where available, traffic/time/demand inputs; show estimate and breakdown |
| FR-08 | AI Route Optimization | Recommend efficient and alternative routes using available road/traffic information; distinguish a map-service baseline from a validated AI model |
| FR-09 | Multi-Currency Payment | Show supported currencies, identifiable exchange rates, payment status/history and receipts; distinguish quote-only conversion from actual settlement |
| FR-10 | Women Safety Mode | Passenger-controlled safety preference, verified-driver preference/information and consent-based trusted-contact trip sharing |
| FR-11 | Smart Emergency & Safe Trip | SOS, emergency contacts, trip-delay and route-deviation monitoring, warnings and clear escalation boundaries |
| FR-12 | Tourist Mode | Destination/nearby-place discovery and multi-stop travel planning for tourists |

The supplemental Drive Requirement Analysis also calls out notifications, administration, feedback/ratings and complaints. These are additional detailed requirements to trace, not reasons to remove or replace the 12 primary groups.

## 5. Non-functional requirements and acceptance targets

The submitted requirement document names five NFR categories: Performance, Usability, Scalability, Security and Portability. The supplemental analysis adds the following measurable checks. These targets must be tested; they must not be claimed from architecture diagrams or code inspection alone.

| NFR | Acceptance evidence |
|---|---|
| Performance | For 100 concurrent users, 95% of ordinary requests complete within 3 seconds, excluding external-service delays. |
| Tracking responsiveness | A displayed driver location refreshes within 10 seconds after the system receives a new location update. |
| Usability | At least 8 of 10 first-time test users complete a booking within 2 minutes without assistance. |
| Scalability | Run a controlled load test and report p95/p99 latency, error rate, database/provider usage and test conditions. Do not claim 100,000 concurrent users without evidence. |
| Security and access control | HTTPS, salted password hashing through the authentication provider, role-based authorization and user-scoped access. |
| Privacy | Live locations and identity documents are visible only to authorized users; trip sharing requires passenger consent. |
| Reliability | Retrying a booking or payment request must not create duplicate bookings or charges. |
| Portability / compatibility | Test the selected mobile and desktop browsers and document the supported matrix. |
| Maintainability | Fare rules, currencies and tourist destinations should be configurable without code changes. |
| Failure handling | When an external provider fails, show the limitation/status and preserve the user's booking record. |

## 6. Domain rules that must remain authoritative

- Only approved drivers and approved vehicles may be used for eligible rides/bookings.
- A driver cannot accept conflicting active rides.
- The same vehicle cannot have overlapping confirmed rental periods.
- Ride status must follow valid transitions: Requested, Accepted, Arrived, Started and Completed; cancellation is allowed only in permitted states.
- Fare estimates must be labelled as estimates; final-charge rules and any cancellation charge must be clear before confirmation.
- Currency conversion must expose the exchange rate and its timestamp; a conversion quote is not a payment.
- A failed or pending payment must never be represented as paid.
- Trip sharing must be opt-in and restricted to authorized contacts.
- If live tracking stops, the UI must show the last location update time rather than implying the location is current.

## 7. Current implementation boundaries to disclose

The active codebase is a web academic prototype. Current documentation/code describes these boundaries:
- email/password and email OTP are present; phone/SMS OTP and full account recovery still need verification/configuration;
- fare calculation is a deterministic server-side estimate, not a trained prediction model;
- OSRM/OpenStreetMap provides standard road estimates, not guaranteed live traffic or an AI model;
- exchange-rate quotes are available, but bKash/Nagad gateway settlement and foreign-currency settlement are not connected;
- browser GPS is foreground-only; mobile browser suspension can pause it;
- SOS creates an internal record and user-initiated contact handoff; it is not police or emergency-service dispatch;
- no load-capacity claim is valid until measured.

Detailed status must be kept in REQUIREMENTS_TRACEABILITY.md and verified through TESTING.md. Incomplete integrations must remain visibly labelled as partial.


## 7A. Active-branch requirement review — 2026-11-28

This is a code/documentation review, **not end-to-end acceptance sign-off**. The following boundaries were observed in the active main branch:

| Requirement | Current evidence / gap |
|---|---|
| FR-01 Authentication | Email/password and email OTP are present. Phone/SMS OTP and an account-recovery endpoint are not present in the active auth controller. Supabase leaked-password protection is still documented as disabled. |
| FR-02 User Management | Passenger profiles, Driver/Vehicle Owner applications, admin review and role-specific workspaces exist in code. Separate real accounts are still needed for role-isolation acceptance. |
| FR-03 Vehicle Rental | Verified vehicle catalogue, owner workflow, rental booking and overlap protection exist. The active vehicle DTO also permits scooter, van and other types, while the submitted primary requirement names cars and bikes; keep this expansion only if the team explicitly approves it. |
| FR-04 Smart Ride Booking | Map-based pickup/drop-off, route/fare estimate and ride requests exist. Current passenger cancellation is limited to an unaccepted request; no cancellation-charge display/rule is evidenced. |
| FR-05 Match & Cost Sharing | Shared-ride discovery/joining, seat-capacity checks and per-passenger fare shares exist. Concurrent joins, capacity edge cases and separate passenger payment amounts still need acceptance tests. |
| FR-06 Tracking | Foreground driver GPS and passenger tracking exist. Background GPS is not provided by this browser build. Verify the 10-second display target on real devices. |
| FR-07 Fare Prediction | The active fare service uses a transparent deterministic BDT formula. Live traffic, demand/time-based prediction and a trained prediction model are not implemented. |
| FR-08 Route Optimization | OSRM/OpenStreetMap route alternatives and fastest/shortest/balanced selection exist. This is a map-service baseline, not an AI model or live-traffic optimizer. |
| FR-09 Multi-Currency Payment | Exchange-rate quotes and payment-intent/manual-review workflows exist. Actual bKash/Nagad gateway settlement and foreign-currency settlement are not connected; a quote is not a payment. An explicit receipt-generation flow is not evidenced. |
| FR-10 Women Safety | Safety preferences, trusted/emergency contacts, private expiring trip links and foreground route monitoring exist. The user must initiate the contact handoff; automatic SMS/WhatsApp delivery and background GPS are not configured. |
| FR-11 Emergency & Safe Trip | SOS records/admin alerts and delay/route-deviation warnings exist. No external emergency-service dispatch or guaranteed contact delivery is configured. |
| FR-12 Tourist Mode | Curated destinations, interest-based recommendations and saved multi-stop plans exist. Language preference selection is not present in the active Tourist API/UI; walking/public-transport estimates are approximate. |

The supplemental Drive Requirement Analysis also specifies Notifications, Administration, Feedback/Ratings and Complaints. Notification and admin workflows exist in the active code. A passenger rating/feedback/complaint submission flow was not found in the active frontend/API route set and must be treated as **not implemented or not verified**, not silently assumed complete.

### Supplemental non-functional acceptance

- **Performance:** the analysis proposes 100 concurrent users with 95% of ordinary requests completing within 3 seconds, excluding external-provider delays. No measured result is available.
- **Tracking:** the analysis proposes display refresh within 10 seconds after a new location update. The current web UI is designed around a 10-second refresh, but real-device acceptance is still required.
- **Usability:** the analysis proposes at least 8 of 10 first-time users completing a booking within 2 minutes without help. No user-study result is available.
- **Scalability:** the k6 script is present, but a completed load-test report is not. No concurrent-user capacity is claimed.
- **Security/privacy:** Supabase Auth, user-scoped API clients, role checks and RLS are present; leaked-password protection remains disabled in the documented settings. Abuse/rate-limit and full role-isolation tests remain open.
- **Portability:** responsive browser UI exists; the selected desktop/mobile browser matrix has not been signed off.
- **Reliability:** atomic ride claims and rental overlap constraints exist; duplicate retry behavior for all booking/payment operations still needs acceptance testing.
- **Maintainability:** fare rates and supported currency codes are currently code-defined. Configurability without code changes has not been demonstrated.
- **Failure handling:** routing fallback and provider-status messaging exist in part; test each provider outage and confirm the booking record remains consistent.

**Release rule:** do not claim complete FR/NFR coverage until the corresponding acceptance case has passed. The current zero-user Supabase project state documented in TESTING.md means real Passenger/Driver/Owner/Admin end-to-end testing must be completed with separate accounts.

## 8. Change-control rule

Before implementing a proposed feature or redesign:
1. Identify the FR/NFR/domain rule it supports.
2. State the DRIVE-specific user outcome.
3. Define the acceptance test and failure case.
4. Confirm it does not remove or demote another required DRIVE module.
5. Confirm cost/provider implications and disclose any unavailable external integration.

**Design principle:** improve the quality of the experience without changing the identity or scope of DRIVE.
