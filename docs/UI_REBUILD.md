# DRIVE UI rebuild — 2026-11-28

## Goal

Remove the old mixed-style frontend pages from the active website and provide one consistent DRIVE multi-service experience. The map-first ride-booking screen is one entry point only; Rentals, shared rides/cost sharing, Owner workflows, Women Safety, emergency/safe-trip functions and Tourist Mode remain part of the product. Familiar map-based booking conventions are interaction references only. Keep original DRIVE branding, wording and layout; do not copy Uber logos, artwork, text or proprietary screen assets. Follow PRODUCT_SCOPE_GUARDRAILS.md before any redesign or feature change.

## Source preservation

- Backup branch: `archive/pre-fresh-uber-inspired-rebuild-20261128`
- Working branch: `rebuild/drive-clean-ui-20261128`
- Production branch after validation: `main`

No force-push or repository history rewrite is required.

## Active frontend routes

| Route | Purpose |
|---|---|
| `index.html` | Map-first passenger ride booking, pickup/drop-off, vehicle choice, fare preview and safety/shared preferences |
| `login.html` / `register.html` | Authentication |
| `dashboard.html` | Passenger trips, live driver map, trip history, payment intents, safety contacts, foreground Women Safety route monitoring, private share link and SOS contact actions |
| `driver.html` | Driver application, availability, automatically refreshed nearby requests, trip acceptance, foreground driver GPS and active-trip location updates |
| `owner.html` | Vehicle-owner application, vehicle listing and rental approvals |
| `admin.html` | Admin overview, review queues, users, rides, rentals, safety alerts, payments and audit logs |
| `vehicles.html` | Verified vehicle catalogue, rental requests and manual/demo rental payment intents |
| `profile.html` | Profile management |
| `notifications.html` | Notification centre |
| `explore.html` | Tourist destination discovery and saved plans |
| `shared-trip.html` | Expiring public trip-share view |

## Removed from the active frontend

- `driver-apply.html`
- `owner-apply.html`
- `presentation.html`
- `safety-tourist.html`
- `js/drive-home.js`
- `js/driver-apply.js`
- `js/owner-apply.js`
- `js/rental.js`
- `js/safety-tourist.js`
- `js/user.js`
- `css/style.css`

The old pages/scripts are not copied into the active frontend. They remain recoverable from the backup branch and Git history.

## Retained infrastructure

- NestJS API modules and TypeScript services
- Supabase Auth, PostgreSQL tables, migrations and RLS policies
- Cloudflare Pages/Workers deployment adapters
- Existing API contracts used by the new frontend

These are retained intentionally to avoid breaking the database and the established role/security workflows. A separate backend rewrite would require a new API acceptance test cycle and must not be implied by this UI release.

## Verification

GitHub Actions `DRIVE validation` must pass:
- Backend TypeScript typecheck and build
- JavaScript syntax checks for every active frontend script
- Local asset reference smoke check
- Worker bundle dry-run
- No service-role key exposed in frontend assets

Manual acceptance is still required with separate Passenger, Driver, Vehicle Owner and Admin accounts:
1. Register and log in as Passenger.
2. Set pickup and drop-off, preview route/fare and create a ride request.
3. Confirm request appears in Passenger dashboard.
4. Log in as an approved Driver, go online, accept the request, advance trip status and send GPS.
5. Confirm passenger sees the trip and status.
6. Apply for Vehicle Owner, approve through Admin, add a vehicle, verify it, and submit a rental request.
7. Confirm owner/admin can review the rental request.
8. Trigger a test SOS and confirm the admin alert appears.
9. Verify role isolation and unauthorized actions are rejected.

A passing build is not evidence that all end-to-end flows have passed.
