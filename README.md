# DRIVE — Smart Ride & Vehicle Rental Platform

DRIVE is an East West University CSE412 academic project for ride booking, shared journeys, vehicle rental, passenger safety, and tourist planning.

## Technology
- Frontend: HTML, CSS and Vanilla JavaScript
- Backend: Node.js, NestJS and TypeScript
- Runtime/hosting: Cloudflare Workers + Workers Static Assets
- Database and authentication: Supabase PostgreSQL, Supabase Auth and Row Level Security
- Maps/geocoding/routing: OpenStreetMap Nominatim + Leaflet + OSRM (no Google Maps API key)
- API prefix: `/api`

## Cloudflare deployment (current target)
The repository is configured for Cloudflare. Vercel is not the deployment target.

- `wrangler.jsonc` is the source of truth.
- Worker entrypoint: `backend/src/worker.ts`.
- Frontend static directory: `frontend/`.
- The Worker routes `/api/*` to NestJS and delegates all other paths to `env.ASSETS.fetch(request)`.
- Required encrypted Worker secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (Supabase publishable/anon key only; never service-role).
- Local dev: copy `.dev.vars.example` to `.dev.vars`, fill the Supabase values, run `npm install`, then `npm run dev`.
- Validate bundle: `npm run build`.
- Deploy production only from the protected `production/verified` branch after CI, Preview and acceptance checks. Cloudflare Workers Builds is the production deploy source; do not deploy from `main` or contributor branches.

### Cloudflare Preview
Verified release branch: `production/verified`

The feature branch is deployed through Wrangler Preview and must not overwrite the production Worker. Preview URL aliases and unique deployment URLs are shown in Cloudflare Workers & Pages → cse412-project → Deployments.

## Supabase setup
The connected Supabase migration history is reconciled with the tracked SQL files in this release branch through `20261120160721`. Five original bootstrap migrations (`20261113102824`, `20261113112351`, `20261113112425`, `20261113112536`, `20261113112650`) are still not checked into this repository. Therefore, this migration folder alone is not a complete fresh-database bootstrap. Do not run it against a new project until a reviewed baseline schema export is added; do not replay migrations manually against the connected production project.

Use Supabase Dashboard → Authentication → URL Configuration to set the production and Preview Site URLs and allowed redirect URLs. Email confirmation settings affect whether signup returns a session immediately.

## Local development
1. Use Node.js 22+.
2. Copy `.dev.vars.example` to `.dev.vars`.
3. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.dev.vars`.
4. Run `npm install`.
5. Run `npm run dev` and open the Wrangler URL.

## Presentation Guide

Open the live walkthrough at `/presentation.html` for the Passenger, Driver, Vehicle Owner and Admin role links, five-minute demo sequence and live API/destination/currency status checks.

## Requirement traceability

See [docs/REQUIREMENTS_TRACEABILITY.md](docs/REQUIREMENTS_TRACEABILITY.md) for the 12 functional and five non-functional requirements, current implementation status, verification evidence and honest integration boundaries. The document is the release checklist; do not treat the feature list below as proof of production readiness.

## Implemented modules
- Supabase Auth registration, password login, refresh, email OTP and profile management
- Passenger, driver, vehicle owner and admin role-based workflows
- Vehicle catalogue, vehicle-owner listings, verification and rental booking
- Map-based ride requests, OpenStreetMap OSRM road-route estimates, server-calculated fares, nearest-first driver discovery, online driver GPS presence, 20 km nearby-only dispatch, Supabase Realtime/in-app/browser ride alerts with polling fallback, online catch-up alerts, atomic first-accept matching, seat-aware shared rides and foreground live GPS tracking through Supabase Realtime with polling fallback
- Automatic BDT fare estimation from the server-calculated road route, vehicle rate and OSRM standard route duration. The fare formula is deterministic and transparent. No ML model or training pipeline is used. Multi-currency conversion quotes remain available.
- Women Safety Mode with enforced verified-driver matching, trusted/emergency contacts, monitored safety trips, private trip sharing and SOS records
- Tourist destination catalogue, saved multi-stop plans and OSRM road-stop optimization for Car/Bike journeys (with clearly labelled fallback estimates)
- Ride and rental payment intents, cash settlement review, bKash/Nagad transaction-reference submission and administrator verification; currency conversion remains an indicative quote
- In-app notifications and admin review endpoints
- Health endpoint

## Important service limitations
This is an academic project and Preview deployment. Do not describe the following as production integrations:
- **Payments:** no automatic bKash, Nagad or card gateway/webhook is connected. bKash/Nagad transaction IDs can be submitted and manually verified by an administrator against the merchant account; cash can be confirmed only after physical receipt. A pending intent is not proof that money was collected.
- **SOS delivery:** SOS is persisted and admin in-app notifications are generated; no police/emergency-service, SMS, WhatsApp or guaranteed external contact dispatch is configured.
- **Driver dispatch:** verified drivers must explicitly go online and allow browser GPS. Their fresh locations appear to nearby passengers; only matching, online, approved drivers within 20 km receive persisted ride alerts. The Driver workspace subscribes to Supabase Realtime and falls back to 7-second polling. If a driver goes online after a request was created, a deduplicated catch-up alert is generated. Browser notifications appear while the workspace is open if permission is granted. The first eligible driver to claim wins atomically. No native background GPS or push notification is configured.
- **Maps:** the visual map and geocoding use OpenStreetMap services. OSRM supplies standard road routes and estimated durations without an API key. Live traffic data is not included. The public OSRM demo is best-effort and subject to its usage policy; for sustained or commercial traffic, host your own routing service or use a provider with an appropriate plan.
- **Notifications:** database triggers create in-app alerts for eligible drivers and passengers. Browser notifications require the driver workspace to remain open and notification permission; background Web Push, SMS and email delivery are not configured.
- **Scale:** no load-test evidence establishes a user/concurrency capacity. Run staged tests and monitor database/Worker limits before making capacity claims.

## Security and release checklist
- Public registration creates Passenger accounts only.
- Driver/vehicle-owner access requires application and verification workflows.
- Authenticated API calls validate Supabase access tokens and use user-scoped Supabase clients.
- RLS is enabled on application tables; review Supabase Security Advisor findings before production.
- Do not expose service-role keys in browser code, Worker build logs, Git or this repository.
- Configure Supabase Auth Site URL/redirect allow-list for the actual domains.
- Configure Cloudflare production branch control to `main`; keep feature Preview separate.
- Verify CSS/JS/static asset delivery, registration, login, profile, ride request/claim, rental, safety/SOS, notifications and admin workflows on Preview.
- Test cross-user data isolation with at least two separate test accounts.
- Run security and load tests, backups, monitoring and recovery checks before real-world use.

## API overview
- `POST /api/auth/register`, `POST /api/auth/login`
- `GET/PATCH /api/users/me`
- `GET /api/rental/vehicles`, `POST /api/rental/bookings`
- `GET/POST /api/rides`, driver claim and ride tracking endpoints
- `/api/fare/*`, `/api/routes/*`, `/api/drivers/nearby`, `POST /api/drivers/location`, `/api/payments/*`
- `/api/safety/*`, `/api/tourist/*`, `/api/notifications/*`, `/api/admin/*`
- `GET /api/health`

## Team
East West University · CSE412 · Fall 2026


## Shared rides and safety administration
- Drivers claim requests through a row-locked database function. A shared car/CNG ride receives a fixed demo seat capacity; the original passenger is inserted as the first occupant.
- Passengers can discover only matched shared rides with remaining seats. Joining is handled by a row-locked database function that checks capacity and recalculates each passenger's fare share atomically.
- Administrators can review vehicle-owner applications and acknowledge/resolve recorded SOS alerts. SOS recording does not contact emergency services.


## First administrator
Follow [docs/ADMIN_BOOTSTRAP.md](docs/ADMIN_BOOTSTRAP.md) to provision the first trusted admin account safely through the Supabase SQL Editor.
