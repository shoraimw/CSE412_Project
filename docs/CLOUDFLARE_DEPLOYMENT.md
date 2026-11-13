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
- Feature Preview name: `feature/drive-full-platform`
- Preview URL: https://feature-drive-full-platform-cse412-project.nexorabd.workers.dev
- Latest unique deployment URL: https://cab6a6b7-cse412-project.nexorabd.workers.dev

The feature branch is deployed using `wrangler preview`, not `wrangler deploy`. Do not promote it to production until browser and API smoke tests pass.

## Preview secrets
The Cloudflare Build trigger has two build-time variables:
- `SUPABASE_URL` (non-secret project URL)
- `SUPABASE_ANON_KEY` (stored as a secret; value is the Supabase publishable key)

The deployment command writes these to a temporary env file inside the isolated build container, then uses:
- `wrangler preview base-config secret bulk` to configure future previews.
- `wrangler preview secret bulk` to configure the current feature preview.

The temporary file is deleted after successful secret upload. Secret values are not committed to Git and are not printed in build logs. The Worker uses only the Supabase publishable key with RLS; never use a service-role key.

## Commands
- `npm run build`: `wrangler deploy --dry-run`, validates and bundles without deploying.
- `npm run dev`: local Wrangler Worker runtime.
- `npm run deploy`: production deployment. Do not run from the feature branch.

Cloudflare Workers Builds feature-branch deploy command:
`npx wrangler preview --worker-name cse412-project --name feature-drive-full-platform`, followed by preview secret setup.

## Verification status
- Wrangler dry-run build: passed.
- NestJS backend build: passed.
- Frontend JavaScript syntax check: passed.
- Cloudflare Preview deployment: successful; Worker module and static assets uploaded.
- Supabase Preview secrets: both configured successfully.

Still required before production:
1. Open the Preview URL in a browser and verify `GET /api/health` returns 200.
2. Test registration/login against Supabase Auth.
3. Test profile, ride booking, driver claim, safety/SOS, rental and admin APIs.
4. Verify RLS isolation with two separate test users.
5. Run staged k6 tests before any capacity claim.

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
