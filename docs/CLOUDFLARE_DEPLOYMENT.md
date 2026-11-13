# DRIVE — Cloudflare deployment

DRIVE is deployed as a Cloudflare Worker with Workers Static Assets. The same Worker serves the frontend and routes `/api/*` requests to the NestJS application through Cloudflare's Node.js HTTP server compatibility layer. Supabase remains the PostgreSQL/Auth provider.

## Cloudflare architecture
- Cloudflare Workers: frontend edge delivery and API runtime.
- Workers Static Assets: the existing multi-page HTML/CSS/JS frontend from `frontend/`.
- NestJS + Express: existing API, adapted through `cloudflare:node` `httpServerHandler`.
- Supabase: PostgreSQL, Auth and row-level security.

No Vercel deployment is required.

## Local development
Use Node.js 22.18 or later.

1. Copy `.dev.vars.example` to `.dev.vars`.
2. Fill in the existing Supabase project URL and publishable/anon key. Keep `.dev.vars` private and never commit it.
3. Install dependencies: `npm install`.
4. Start the Cloudflare Workers local runtime: `npm run dev`.
5. Open the local URL printed by `cf dev`. The frontend and `/api` are same-origin.

For the standalone NestJS development server, run `cd backend && npm install && npm run start:dev`; if using a separate static server, set `window.__DRIVE_API_BASE__` to that API's `/api` URL before loading `frontend/js/api.js`.

## Configure Cloudflare secrets
The Worker requires these secrets:
- `SUPABASE_URL`
- `SUPABASE_ANON_KEY`

They are declared as required secrets in `cloudflare.config.ts`. Set them in the Cloudflare Worker settings or with the Cloudflare CLI secret workflow. Never put their values in Git or in `cloudflare.config.ts`.

`CORS_ORIGIN` is optional; leave it empty for the same-origin frontend/API deployment. If a separate trusted frontend origin is added later, configure an explicit comma-separated allowlist.

## Build and deploy
- `npm run build` — build and validate Cloudflare Worker output without deploying.
- `npm run preview` — deploy a Cloudflare Worker Preview.
- `npm run deploy` — deploy the Worker to Cloudflare.

The connected Workers Builds project should use:
- Root directory: `/`
- Build command: `npm run build`
- Deploy command: `npx cf deploy`
- Preview command: `npx cf previews deploy`

Preview builds need preview secrets configured separately from production secrets.

## Runtime verification required
The NestJS-on-Workers adapter uses Node.js HTTP server compatibility. A successful TypeScript build is not sufficient to prove runtime compatibility. Verify these in a Cloudflare Preview before promoting:
1. `GET /api/health` returns 200.
2. Registration/login works against the existing Supabase Auth project.
3. Authenticated profile and ride APIs work.
4. Static HTML, CSS, JS and image assets load.
5. CORS and error responses behave as expected.

Cloudflare Workers Free currently has a 100,000-request daily limit and 10 ms CPU per invocation. Review current account limits and measure actual concurrent load before making any capacity claim. See [Cloudflare Workers limits](https://developers.cloudflare.com/workers/platform/limits/) and [pricing](https://developers.cloudflare.com/workers/platform/pricing/).
