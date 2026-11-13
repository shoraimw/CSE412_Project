# DRIVE — Smart Ride & Vehicle Rental Platform

DRIVE is an East West University CSE412 academic project for ride booking, shared journeys, vehicle rental, passenger safety, and tourist planning.

## Technology
- Frontend: HTML, CSS and Vanilla JavaScript
- Backend: Node.js, NestJS and TypeScript
- Runtime/hosting: Cloudflare Workers + Workers Static Assets
- Database and authentication: Supabase PostgreSQL, Supabase Auth and Row Level Security
- Maps/geocoding: OpenStreetMap Nominatim and OSRM routing
- API prefix: `/api`

## Cloudflare deployment (current target)
The repository is configured for Cloudflare. Vercel is not the deployment target.

- `wrangler.jsonc` is the source of truth.
- Worker entrypoint: `backend/src/worker.ts`.
- Frontend static directory: `frontend/`.
- The Worker routes `/api/*` to NestJS and delegates all other paths to `env.ASSETS.fetch(request)`.
- Required encrypted Worker secrets: `SUPABASE_URL`, `SUPABASE_ANON_KEY` (Supabase publishable/anon key only; never service-role).
- Local dev: copy `.dev.vars.example` to `.dev.vars`, fill the two Supabase values, run `npm install`, then `npm run dev`.
- Validate bundle: `npm run build`.
- Deploy production only from the protected `main` branch after Preview verification: `npm run deploy`.

### Cloudflare Preview
Feature branch: `feature/drive-full-platform`

The feature branch is deployed through Wrangler Preview and must not overwrite the production Worker. Preview URL aliases and unique deployment URLs are shown in Cloudflare Workers & Pages → cse412-project → Deployments.

## Supabase setup
The connected Supabase project is synchronized through migration `20261113192334`. The repository includes matching migration version identifiers for the applied profile guards, owner applications, shared rides, driver location, and automatic Women Safety workflows. For a fresh Supabase project, apply the versioned SQL migrations in order, then configure Auth redirect URLs. Do not apply migrations to production manually outside the reviewed migration process.

Use Supabase Dashboard → Authentication → URL Configuration to set the production and Preview Site URLs and allowed redirect URLs. Email confirmation settings affect whether signup returns a session immediately.

## Local development
1. Use Node.js 22+.
2. Copy `.dev.vars.example` to `.dev.vars`.
3. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` in `.dev.vars`.
4. Run `npm install`.
5. Run `npm run dev` and open the Wrangler URL.

## Implemented modules
- Supabase Auth registration, password login, refresh, email OTP and profile management
- Passenger, driver, vehicle owner and admin role-based workflows
- Vehicle catalogue, vehicle-owner listings, verification and rental booking
- Map-based ride requests, OSRM route/fare estimates, verified-driver claiming, seat-aware shared rides with transactional fare splitting, ride status and foreground live GPS tracking
- Rule-based BDT fare estimation using OSRM road distance when available, plus multi-currency conversion quotes
- Women Safety Mode, trusted/emergency contacts, monitored safety trips, trip sharing and SOS records
- Tourist destination catalogue and saved trip plans
- Payment intent records and currency conversion quotes
- In-app notifications and admin review endpoints
- Health endpoint

## Important service limitations
This is an academic project and Preview deployment. Do not describe the following as production integrations:
- **Payments:** no bKash, Nagad, card or other payment gateway is connected; payment records are pending intents only.
- **SOS delivery:** SOS is persisted and admin in-app notifications are generated; no police/emergency-service, SMS, WhatsApp or guaranteed external contact dispatch is configured.
- **Driver dispatch:** ride claim is database-backed, but a real commercial driver network, background dispatch, and operational monitoring are not established.
- **Maps:** geocoding/routing depends on public OpenStreetMap ecosystem services and their availability/rate limits.
- **Notifications:** current database triggers create in-app notifications; external email/SMS/push delivery requires a configured provider.
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
- `/api/fare/*`, `/api/routes/*`, `/api/payments/*`
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
