# DRIVE architecture decisions

Audit date: 2026-11-28  
Repository: `shoraimw/CSE412_Project`  
Active branch: `main`

## ADR-001 — Rebuild the active frontend; retain the API and database foundation

The active frontend is a clean HTML/CSS/Vanilla JavaScript rebuild with a map-first ride-booking experience and original DRIVE branding. The old landing, passenger, driver, owner, admin, rental and utility screens were replaced; obsolete pages and scripts were removed from the active frontend. The previous complete repository state is preserved in branch `archive/pre-fresh-uber-inspired-rebuild-20261128`.

The NestJS 11 + TypeScript API and Supabase schema/migrations remain in place as the service/data foundation so the new interface can use the existing authenticated workflows. Therefore this change is a fresh UI rebuild, not a full backend rewrite.

## ADR-002 — Cloudflare Pages + Workers is the active production host

The actual connected production project is Cloudflare Pages `drive-ewu`, connected to `shoraimw/CSE412_Project` with production branch `main`.

- Static assets: `frontend/`
- Pages API catch-all: `functions/api/[[path]].js`
- API service binding: `DRIVE_API`
- Worker: `cse412-project`
- Worker entrypoint: `backend/src/worker.ts`
- Worker config: `wrangler.jsonc`
- Supabase URL and publishable key are stored as Worker secrets.

The stale-build root cause was a restrictive Pages `path_includes` filter. It is now `["*"]`, so backend, database, deployment and frontend commits all trigger a production Pages build.

The current Pages deployment from commit `8e1c67c25b4e863f294dbf065923d00c69ab4aa2` completed successfully.

## ADR-003 — Supabase is the data platform

Use Supabase PostgreSQL, Auth and RLS. All authenticated API database access uses user-scoped Supabase clients. Do not expose a service-role key in browser assets.

## ADR-004 — Main is the active branch

The project owner requested direct work on `main`. Previous implementation remains in Git history. Do not force-push or reset `main`.

## ADR-005 — Deploy frontend and API independently

Cloudflare Pages serves static frontend assets. The `DRIVE_API` service binding forwards `/api/*` to the separate Worker. A Pages build does not update the Worker source. Therefore, backend/config changes must also run the Cloudflare Worker deployment workflow.

The GitHub Actions Worker deployment workflow requires `CLOUDFLARE_API_TOKEN`. It emits a warning rather than claiming deployment success if the secret is absent.

## ADR-006 — Vercel is not currently linked

A Vercel configuration is retained as a possible future hosting option, but the Vercel team has no DRIVE project linked to this repository. The Vercel connection currently lacks permission to create a project. Do not call Vercel the active host until the owner approves team access and a successful production deployment is verified.

## Deferred

- Frontend TypeScript/React migration.
- Live traffic routing provider.
- Automatic bKash/Nagad merchant gateway.
- Native mobile background GPS and push notifications.
- Separate microservices.
