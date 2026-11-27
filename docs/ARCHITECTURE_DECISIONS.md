# DRIVE architecture decisions

Audit date: 2026-11-28  
Repository: `shoraimw/CSE412_Project`  
Active branch: `main`

## ADR-001 — Retain the existing application structure

Keep the existing static HTML/CSS/Vanilla JavaScript frontend and NestJS 11 + TypeScript backend for the current release. The repository already contains role-specific pages and modular API services. A framework rewrite is deferred until the deployed release is stable.

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
