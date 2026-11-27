# DRIVE architecture decisions

Audit date: 2026-11-28  
Repository: `shoraimw/CSE412_Project`  
Active branch: `main`

## ADR-001 — Preserve the existing application structure for the first release

**Decision:** Retain the existing static frontend (HTML/CSS/Vanilla JavaScript) and NestJS 11 + TypeScript backend for the first Vercel release.

**Reasoning:**
- The repository already contains passenger, driver, vehicle-owner and admin pages.
- The backend already has separate NestJS modules for authentication, users, rides, rentals, fares, routes, payments, safety, tourist services, notifications and administration.
- The root repository already contains a Vercel serverless adapter and deployment configuration.
- A framework rewrite to Next.js before validating the current implementation would add migration work and delay the first usable release.

Backend code remains TypeScript. A frontend TypeScript migration can be evaluated incrementally after the first stable release.

## ADR-002 — Vercel is the primary application host

**Decision:** Deploy the frontend and API from the repository root on Vercel.

- Static frontend output: `frontend/`
- Vercel function entrypoint: `api/[...path].js`
- NestJS compiled output: `backend/dist/`
- API prefix: `/api`
- Primary function region: Singapore (`sin1`) to reduce round-trip latency to the Supabase Singapore project.

Cloudflare deployment workflows are disabled for the active V2 release. Existing Wrangler configuration remains in Git history and is not used by the Vercel release.

## ADR-003 — Supabase is the application data platform

**Decision:** Use the connected Supabase project for PostgreSQL, Auth and RLS.

All application data access must use user-scoped Supabase clients and server-side role checks. Never expose a service-role key in frontend assets.

## ADR-004 — Main is the active branch

**Decision:** The project owner requested direct development commits to `main`.

The previous implementation is preserved in Git history and the `archive/pre-v2-main-20261128` branch. Do not force-push, reset or delete the archive.

Because a push to `main` may trigger Vercel Production deployment, validate each change before pushing.

## ADR-005 — Database bootstrap is a release blocker

The connected Supabase project was inspected on 2026-11-28:

- The `public` schema contains no DRIVE application tables.
- Supabase migration history is empty.
- The repository contains incremental migrations that assume an earlier base schema.

A fresh, reviewed baseline migration must be reconstructed and validated before applying the incremental migrations. See [DATABASE_BOOTSTRAP_AUDIT.md](DATABASE_BOOTSTRAP_AUDIT.md).

## Deferred decisions

- Whether to migrate the frontend to TypeScript/React/Next.js.
- Whether to add a dedicated routing provider with guaranteed traffic data.
- Whether to integrate live bKash/Nagad merchant APIs.
- Whether to add native mobile background GPS and push notifications.
- Whether to split the modular monolith into separate services.

These decisions require demonstrated product or operational need, not technology preference alone.
