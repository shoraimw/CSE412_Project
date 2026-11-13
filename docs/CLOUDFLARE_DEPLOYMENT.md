# DRIVE — Cloudflare-only deployment

## Architecture
- Cloudflare Worker serves the static multi-page frontend from `frontend/`.
- The same Worker routes `/api/*` to the NestJS REST API through Cloudflare's documented `cloudflare:node` `httpServerHandler` integration.
- Supabase provides PostgreSQL, Auth and RLS.
- No Vercel dependency.

## Local development
Use Node.js 22+.
1. Copy `.dev.vars.example` to `.dev.vars`.
2. Set `SUPABASE_URL` and `SUPABASE_ANON_KEY` locally.
3. Run `npm install`.
4. Run `npm run dev` and open the URL printed by Wrangler.

## Worker configuration
`wrangler.jsonc` is the only deployment configuration:
- `main`: `backend/src/worker.ts`
- `assets.directory`: `./frontend`
- `assets.run_worker_first`: `/api/*`
- `compatibility_flags`: `nodejs_compat`
- `previews`: Preview configuration block
- Optional NestJS messaging and websocket transports not used by this REST-only app are aliased to a no-op module so Wrangler does not bundle unsupported transport clients.

## Preview and production isolation
- Production Worker: `cse412-project`
- Feature Preview branch: `feature/complete-system-integration`
- Latest unique Preview deployment (commit `29308b2`): https://1fc62c83-cse412-project.nexorabd.workers.dev
- The branch alias remains stable and is visible in Workers & Pages → `cse412-project` → Deployments.

The feature branch is deployed using `wrangler preview`, not `wrangler deploy`. The connected `main` branch is configured to auto-deploy production with `wrangler deploy` after a merge; keep changes in Preview until browser and API smoke tests pass.

## Preview secrets
Cloudflare Workers Builds supplies two build-time variables for the Preview build:
- `SUPABASE_URL` (the public project URL)
- `SUPABASE_ANON_KEY` (the legacy Supabase anon/publishable key; never use the service-role key)

The Preview build command runs `scripts/configure-preview-secrets.mjs`. It writes the two values to a temporary JSON file, runs `wrangler preview base-config secret bulk`, then deletes the file. Each new Preview receives these secrets. Production uses separately configured Worker secrets with the same names. Secret values are not committed to Git or printed in logs.

## Commands
- `npm run build`: `wrangler deploy --dry-run`, validates and bundles without deploying.
- `npm run dev`: local Wrangler Worker runtime.
- `npm run deploy`: production deployment. Do not run from the feature branch.

Cloudflare Workers Builds Preview command: `npx wrangler preview`. The configured build step runs `npm run build && node scripts/configure-preview-secrets.mjs` first, so the Preview base secrets are applied before the branch Preview is deployed.

## Verification status
- Wrangler dry-run build: passed.
- NestJS backend build: passed.
- Frontend JavaScript syntax check: passed.
- Cloudflare Workers Builds Preview: latest build for `feature/complete-system-integration` completed successfully.
- Preview base secrets: Supabase URL and publishable key are configured through the temporary-file setup script.
- Production Worker secrets: `SUPABASE_URL` and `SUPABASE_ANON_KEY` are configured as Worker secrets.

Still required before production promotion:
1. Open the current Preview URL in a browser and verify `GET /api/health` returns 200.
2. Test registration/login against Supabase Auth.
3. Test passenger ride booking, driver claim/status changes, GPS, Women Safety, SOS, shared rides and fare splitting.
4. Test owner application, admin approval, vehicle listing and rental booking.
5. Verify RLS isolation with two separate test users and separate driver/owner/admin accounts.
6. Run staged k6 tests before any capacity claim.

A successful build/deploy does not prove all workflows work end-to-end. Production has not been promoted or overwritten.


Latest fix: non-API paths are delegated to the Workers Static Assets binding (`envBindings.ASSETS.fetch(request)`); API requests continue through NestJS.
## Authentication setup for email OTP
The API exposes `POST /api/auth/email-otp` and `POST /api/auth/verify-email-otp`.
In Supabase Dashboard → Authentication → Email Templates → Magic Link, change the template body to include the one-time code variable `{{ .Token }}` (and remove the magic-link-only content) before testing the six-digit code flow. Supabase's default template may send a magic link instead of a numeric OTP. Email delivery and rate limits remain subject to the Supabase free plan. SMS phone OTP is not included because a configured SMS provider is required and is not guaranteed to be free.

## Maps and currency services
- Maps use Leaflet with OpenStreetMap tiles; geocoding uses the public Nominatim service and route estimates use the public OSRM demo service. Follow their attribution and fair-use policies; they are community services, not an SLA-backed commercial map platform.
- Currency conversion uses a public exchange-rate endpoint and caches rates in the Worker isolate. It is a display/quote feature only; the currency amount does not change the BDT settlement amount.
- Driver GPS is foreground browser geolocation. It requires HTTPS and the driver's permission, and stops when the browser/page is closed or suspended. It is not background mobile tracking.

## First administrator setup
Public signup always creates a Passenger. Do not add a public admin-registration route. After creating a trusted team account, assign the first administrator role manually from the Supabase SQL Editor using the exact account email and a reviewed, one-time SQL statement. Keep admin role changes restricted to trusted database operators; never expose the service-role key in the browser or repository.
