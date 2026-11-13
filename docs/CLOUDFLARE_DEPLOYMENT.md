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
`wrangler.jsonc` is the deployment source of truth:
- `main`: `backend/src/worker.ts`
- `assets.directory`: `./frontend`
- `assets.run_worker_first`: `/api/*`
- `compatibility_flags`: `nodejs_compat`
- Optional NestJS transports unused by this REST-only app are explicitly aliased to a no-op module so Wrangler does not bundle unsupported messaging clients.

## Preview and production isolation
The feature branch uses a dedicated Worker name:
`feature-drive-full-platform-cse412-project`

Preview URL:
https://feature-drive-full-platform-cse412-project.nexorabd.workers.dev

The production Worker remains:
`cse412-project`

Do not change the feature branch's Wrangler name to `cse412-project`; that would risk deploying preview code directly over production. Production should only use the production Worker name from the main branch after all preview smoke tests pass.

## Secrets
Configure encrypted Worker secrets on the feature preview Worker:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

Use the existing DRIVE Supabase project. The application uses the publishable/legacy anon key with RLS. Never use or expose a service-role key.

## Commands
- `npm run build`: `wrangler deploy --dry-run`, validates and bundles without deploying.
- `npm run dev`: local Wrangler Worker runtime.
- `npm run deploy`: deploys to the Worker name declared in `wrangler.jsonc`.

Cloudflare Workers Builds for the feature branch:
- Build command: `npm install && npm run build`
- Deploy command: `npx wrangler deploy`
- Root directory: `/`

## Required runtime tests
After deploying the feature Worker and adding secrets:
1. `GET /api/health` returns 200.
2. Homepage and all CSS/JS/image assets load.
3. Supabase registration/login work.
4. Profile, ride booking, driver claim, safety/SOS, rental and admin APIs work.
5. Verify RLS isolation with two separate test users.
6. Run staged k6 tests before any capacity claim.

A successful Wrangler dry-run only proves the bundle compiles. It is not proof that the Worker runtime or all application workflows work.
