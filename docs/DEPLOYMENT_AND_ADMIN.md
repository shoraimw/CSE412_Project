# DRIVE v2 — deployment, roles and external services

## Runtime architecture

- Frontend: static HTML/CSS/JavaScript in `frontend/`.
- API: NestJS + TypeScript in `backend/`, exposed through the Cloudflare Workers Node HTTP bridge in `backend/src/worker.ts`.
- Hosting: one Cloudflare Worker serves both static assets and `/api/*`.
- Authentication and data: Supabase Auth + Postgres, using the user's access token and RLS. The Worker must use the publishable/anon key only; never put a Supabase service-role key in the browser or Worker.
- Routing: public OSRM demo endpoint; geocoding uses Photon; map tiles use OpenStreetMap with a CARTO fallback.
- Currency: open.er-api.com published FX rates. Rates are indicative and update on the provider's schedule; they are not a tick-by-tick trading feed.

## Cloudflare deployment

The root `wrangler.toml` configures:
- `backend/src/worker.ts` as the Worker entry point.
- `frontend/` as static assets.
- the Node.js HTTP server compatibility required by the NestJS Express adapter.
- a `previews.vars` block because Worker Previews do not inherit production settings.

Workers Builds trigger:
- Build: `npm install && npm run build`
- Preview: `npx wrangler preview`
- Root directory: repository root.

After changing Wrangler config, verify the build logs and test both `/` and `/api/health`. A successful TypeScript build alone does not prove the Worker runtime works.

## Local development

1. Run `npm install` from the repository root.
2. Copy `backend/.env.example` to `backend/.env` and fill in the Supabase project URL and publishable key.
3. Run the API with `cd backend && npm run start:dev`.
4. Serve `frontend/` on `http://localhost:5500` (for example, VS Code Live Server).
5. The local frontend config points to `http://localhost:3000/api`; deployed pages use the same-origin `/api` path.

## Roles and initial administrator

The database role enum currently supports `passenger`, `driver`, `vehicle_owner`, and `admin`. It does not have a separate `super_admin` role. The intended platform owner should be the only initial `admin` account. Do not allow public signup to choose or update roles.

The initial admin is bootstrapped manually using `supabase/operations/bootstrap-admin.sql` after confirming the exact, email-confirmed account. The script updates exactly one matching profile and fails if it matches zero or multiple rows. Do not run it with the placeholder unchanged.

## External services and honest limitations

| Capability | Current academic/free implementation | Needed for production-grade service |
|---|---|---|
| Maps and geocoding | Leaflet, Photon, OSM tiles | A provider plan/SLA for high-volume use |
| Road routing | Public OSRM demo | Dedicated routing capacity or paid provider |
| Currency | Published daily FX feed, cross-currency quotes | Commercial FX feed if intraday/guaranteed rates are required |
| Payment | Quote/record-only; no settlement | Merchant account and sandbox/production credentials (e.g. a supported Bangladesh gateway) |
| SOS | Stored in DRIVE and shown to admins | SMS/voice/email delivery provider credentials and delivery monitoring |
| Trusted contacts | Contact records and share-link workflow | A delivery provider to automatically send links; recipients need a secure tokenized page |
| Load | Functional test plan and bounded free-tier services | Load testing and a capacity plan; no 100k-user capacity claim without evidence |

Never describe a stored SOS alert as a dispatched emergency call. Never mark a quote as a completed payment. Never claim free public routing services have an uptime or throughput guarantee.
