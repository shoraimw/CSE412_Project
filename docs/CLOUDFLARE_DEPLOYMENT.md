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
- Verified release branch: `production/verified`
- The current Preview URL is generated for the feature branch and is visible in Workers & Pages → `cse412-project` → Deployments. Use the latest deployment entry for this branch rather than a saved unique deployment URL.

Only `production/verified` is allowed to produce the production deployment. Contributor branches and `main` are not deployment sources. Preview builds are restricted to the verified release branch while it is being tested; they are disabled after promotion.

## Preview secrets
Cloudflare Workers Builds supplies two build-time variables for the Preview build:
- `SUPABASE_URL` (the public project URL)
- `SUPABASE_ANON_KEY` (the legacy Supabase anon/publishable key; never use the service-role key)

The Preview build command runs `scripts/configure-preview-secrets.mjs`. It writes the two values to a temporary JSON file, runs `wrangler preview base-config secret bulk`, then deletes the file. Each new Preview receives these secrets. Production uses separately configured Worker secrets with the same names. Secret values are not committed to Git or printed in logs.

## Commands
- `npm run build`: `wrangler deploy --dry-run`, validates and bundles without deploying.
- `npm run dev`: local Wrangler Worker runtime.
- `npm run deploy`: production deployment. Run only from `production/verified` after CI and acceptance checks.

Cloudflare Workers Builds Preview command: `npx wrangler preview`. The configured build step runs `npm run build && node scripts/configure-preview-secrets.mjs` first, so the Preview base secrets are applied before the branch Preview is deployed.

## Verification status

- Release isolation branch: `production/verified`; `main` and contributor branches remain unchanged.
- The Cloudflare Workers Builds and Pages production sources are being moved to `production/verified` only after CI and Preview checks pass.
- The production Worker and Pages site must not be considered promoted until the Cloudflare settings and latest deployment commit are verified.
- Current SQL regression checks: atomic Women Safety preference/contact save passed inside a rolled-back transaction; rental date-availability correctly excluded a vehicle with an overlapping pending booking inside a rolled-back transaction.
- Supabase Security Advisor currently reports one remaining warning: leaked-password protection is disabled. Enable it in Dashboard → Authentication → Security before public launch.
- Full browser-based Passenger/Driver/Owner/Admin acceptance, real mobile GPS, Realtime delivery and load tests remain required. A successful bundle build does not prove these workflows end-to-end.

## Authentication setup for email OTP
The API exposes `POST /api/auth/email-otp` and `POST /api/auth/verify-email-otp`.
In Supabase Dashboard → Authentication → Email Templates → Magic Link, change the template body to include the one-time code variable `{{ .Token }}` (and remove the magic-link-only content) before testing the six-digit code flow. Supabase's default template may send a magic link instead of a numeric OTP. Email delivery and rate limits remain subject to the Supabase free plan. SMS phone OTP is not included because a configured SMS provider is required and is not guaranteed to be free.

## Maps and currency services
- Maps use Leaflet with OpenStreetMap tiles; geocoding uses the public Nominatim service and route estimates use the public OSRM demo service. Follow their attribution and fair-use policies; they are community services, not an SLA-backed commercial map platform.
- Currency conversion uses a public exchange-rate endpoint and caches rates in the Worker isolate. It is a display/quote feature only; the currency amount does not change the BDT settlement amount.
- Driver GPS is foreground browser geolocation. It requires HTTPS and the driver's permission, and stops when the browser/page is closed or suspended. It is not background mobile tracking.

## First administrator setup
Public signup always creates a Passenger. Do not add a public admin-registration route. After creating a trusted team account, assign the first administrator role manually from the Supabase SQL Editor using the exact account email and a reviewed, one-time SQL statement. Keep admin role changes restricted to trusted database operators; never expose the service-role key in the browser or repository.
