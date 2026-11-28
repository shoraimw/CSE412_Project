# DRIVE — Smart Ride & Vehicle Rental Platform

DRIVE is an East West University CSE412 project for ride booking, shared journeys, vehicle rental, passenger safety and tourist planning.

## Active production architecture (verified 2026-11-28)

- **Frontend:** HTML, CSS and Vanilla JavaScript in `frontend/`
- **API:** NestJS 11 + TypeScript in `backend/`
- **Static hosting:** Cloudflare Pages project `drive-ewu`
- **API runtime:** Cloudflare Worker `cse412-project`
- **Pages-to-API routing:** Cloudflare Pages Function `functions/api/[[path]].js` using the `DRIVE_API` service binding
- **Database and authentication:** Supabase PostgreSQL, Supabase Auth and Row Level Security
- **Maps:** Leaflet/OpenStreetMap, Nominatim and OSRM
- **API prefix:** `/api`

The production site is `https://drive-ewu.pages.dev`. The active Pages production branch is `main`.

## Fresh UI rebuild — 2026-11-28

The active frontend uses a map-first ride-booking screen and consistent, original DRIVE branding. Familiar ride-hailing conventions are only interaction references; they do not define DRIVE's product scope. DRIVE remains a combined ride-sharing and car/bike rental platform, with shared cost, owner workflows, Women Safety, emergency/safe-trip and Tourist Mode requirements. The rebuild must not remove or bury those modules and does not reuse Uber branding, artwork, text or proprietary screen assets.

- Old landing, dashboard, partner, admin and utility pages were replaced.
- Legacy driver-apply, owner-apply, presentation and old safety-tourist pages were removed from the active frontend.
- Old frontend scripts and the unused stylesheet were removed from the active deployment.
- The previous repository state is preserved in branch `archive/pre-fresh-uber-inspired-rebuild-20261128`.
- The NestJS API and Supabase schema/migrations are retained as the service and data foundation. This is a fresh frontend rebuild, not a claim that the backend has been rewritten from zero.

See [docs/UI_REBUILD.md](docs/UI_REBUILD.md) for the route map and verification scope, and [docs/PRODUCT_SCOPE_GUARDRAILS.md](docs/PRODUCT_SCOPE_GUARDRAILS.md) for the binding product-scope and FR/NFR guardrails.

## Deployment and stale-build protection

The stale website issue was traced to Cloudflare Pages `path_includes`: it previously watched only selected frontend and Pages Function folders. Backend, database and deployment-only commits were skipped, leaving an older successful deployment as the canonical site.

The Pages project watches all repository paths (`path_includes: ["*"]`) and deploys automatically from `main`. The canonical production site is `https://drive-ewu.pages.dev`; individual deployment URLs and status are available in Cloudflare Pages.

The API Worker is deployed separately from the static Pages frontend. The GitHub Actions workflow `.github/workflows/cloudflare-deploy.yml` rebuilds and deploys the Worker for backend/config changes on `main`. The latest verified production deployment is version `81534f40` (28 Nov 2026, 05:13 UTC); the deployment workflow completed successfully. The workflow uses the repository Actions secret `CLOUDFLARE_API_TOKEN` with Workers Scripts:Edit permission.

- Pages build output: `frontend/`
- Worker entrypoint: `backend/src/worker.ts`
- Worker config: `wrangler.jsonc`
- Local development: `npm install && npm run dev`
- Full build check: `npm run build`
- Production Worker deploy: `npm run deploy` (after validation and approval)

See [docs/CLOUDFLARE_DEPLOYMENT.md](docs/CLOUDFLARE_DEPLOYMENT.md).

## Supabase

Project: `CSE412_Project`, region `ap-southeast-1`.

The connected project contains 31 DRIVE application tables, all with RLS enabled. The database has 63 applied migrations and the repository tracks all 63 matching SQL files. The baseline and tourist UUID compatibility migrations were recovered from the database migration history; the full applied version list now matches the repository.

The current database was not reset. A clean-room run against a separate empty Supabase project has not yet been completed. Do not replay the historical tourist UUID migration against this live database; it deletes baseline seed rows before the later catalog migration restores the destination catalog. See [docs/DATABASE_BOOTSTRAP_AUDIT.md](docs/DATABASE_BOOTSTRAP_AUDIT.md).

## Functional scope

The project requirements define 12 functional requirement groups:

1. Authentication & Security
2. User Management
3. Vehicle Rental
4. Smart Ride Booking
5. Smart Ride Match & Cost Sharing
6. Real-Time Ride Tracking
7. Smart Fare Prediction
8. AI Route Optimization
9. Multi-Currency Payment
10. Women Safety Mode
11. Smart Emergency & Safe Trip System
12. Tourist Mode

They also define five non-functional requirements: Performance, Usability, Scalability, Security and Portability.

See [docs/REQUIREMENTS_TRACEABILITY.md](docs/REQUIREMENTS_TRACEABILITY.md) and [docs/TESTING.md](docs/TESTING.md). A page, button, table or successful build alone is not proof of end-to-end completion.

## Important service boundaries

- **Payments:** SSLCommerz hosted checkout and webhook validation are implemented, but live activation requires `SSLCOMMERZ_STORE_ID` and `SSLCOMMERZ_STORE_PASSWORD` Worker secrets. Confirmed payments have a printable receipt; bKash/Nagad transaction references are manually reviewed; cash remains pending until receipt is confirmed. The academic-build cancellation fee is BDT 0 and is disclosed before a passenger cancellation request.
- **Emergency assistance:** SOS is stored and administrators receive in-app alerts. No police dispatch or guaranteed SMS/WhatsApp delivery is configured.
- **Location:** browser foreground GPS is not native background tracking. Test on real phones.
- **Maps:** public OpenStreetMap/OSRM services provide standard road estimates, not guaranteed live traffic or commercial SLAs.
- **Fare:** current estimate is a deterministic formula, not a trained ML model.
- **Scale:** no concurrent-user capacity is claimed until staged load tests are run and measured.

## Security and release checklist

- Public registration creates Passenger accounts only.
- Driver and Vehicle Owner privileges require application and administrator approval.
- Authenticated APIs validate Supabase access tokens and use user-scoped clients.
- RLS is enabled on all DRIVE public application tables.
- Never expose Supabase service-role credentials in browser code, Git or public environment variables.
- Enable Supabase leaked-password protection before public launch.
- Verify cross-user isolation, all role workflows, mobile GPS and emergency handoff on dedicated test accounts.
- Run staged load and recovery tests before real-world use.

## Team

East West University · CSE412 · Fall 2026


## Ride workflow QA

See [DRIVE Ride Workflow — Manual QA Checklist](docs/RIDE_WORKFLOW_QA.md) for the multi-account booking, dispatch, cancellation, safety, chat, tourist-currency, review and admin test plan.
