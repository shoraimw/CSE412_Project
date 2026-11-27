# DRIVE — Smart Ride & Vehicle Rental Platform

DRIVE is an East West University CSE412 project for ride booking, shared journeys, vehicle rental, passenger safety and tourist planning.

## Current architecture

- **Frontend:** existing HTML, CSS and Vanilla JavaScript application in `frontend/`
- **Backend:** NestJS 11 + TypeScript in `backend/`
- **Database and authentication:** Supabase PostgreSQL, Supabase Auth and Row Level Security
- **Hosting:** Vercel (static frontend + serverless NestJS API)
- **Maps and routing:** OpenStreetMap, Leaflet, Nominatim and OSRM
- **API prefix:** `/api`

The current frontend/backend structure is intentionally retained for the first Vercel release. Replacing it with a new framework before validating the existing application would add migration risk and delay the first working release. Backend services are already TypeScript. A frontend TypeScript migration can be considered module by module after the release baseline is stable.

## Vercel deployment

The repository root is the Vercel project root.

- Root Directory: `./`
- Framework Preset: `Other`
- Build Command: defined in `vercel.json`
- Output Directory: `frontend`
- API Function: `api/[...path].js`
- Function bundle: `backend/dist/**`
- Primary production branch: `main`

See [docs/VERCEL_DEPLOYMENT.md](docs/VERCEL_DEPLOYMENT.md) for setup and smoke-test instructions.

Vercel deploys from GitHub. A push to `main` can trigger a production deployment, so changes must pass validation before they are pushed.

## Environment variables

Configure these in Vercel Project Settings → Environment Variables:

| Variable | Purpose |
|---|---|
| `SUPABASE_URL` | Supabase project URL |
| `SUPABASE_ANON_KEY` | Supabase publishable key (or legacy anon key) |

Use the same variable names for Preview and Production, but prefer a separate Supabase development project for Preview when available. Never put a service-role key in frontend code or public environment variables.

The checked-in `backend/.env.example` contains placeholders only.

## Database bootstrap status — important

The connected Supabase project was inspected on 2026-11-28. Its `public` schema contains no DRIVE application tables, and its Supabase migration history is empty.

The repository contains incremental feature migrations, but the original bootstrap schema is not committed. Those later migrations assume that core tables, enum types, helper functions and policies already exist.

**Do not replay the existing incremental migrations against the empty database yet.** A reviewed baseline migration must be created and validated first. See [docs/DATABASE_BOOTSTRAP_AUDIT.md](docs/DATABASE_BOOTSTRAP_AUDIT.md).

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

They also define five non-functional requirements: Performance, Usability, Scalability, Security and Portability, plus domain requirements for roles, verified drivers, non-overlapping rentals, non-conflicting driver assignments, fare correctness, payments and safety.

See [docs/REQUIREMENTS_TRACEABILITY.md](docs/REQUIREMENTS_TRACEABILITY.md). Existing code is not considered production-ready until the corresponding database, integration and acceptance tests pass.

## Known integration boundaries

- **Payments:** the current code supports payment intents and manual bKash/Nagad reference review. No automatic merchant gateway or verified payment webhook is configured.
- **Emergency assistance:** SOS records and in-app admin alerts are supported in the existing implementation. No police dispatch or guaranteed SMS/WhatsApp delivery is configured.
- **Location tracking:** browser-based foreground GPS is not equivalent to native background GPS. Test on real mobile browsers.
- **Maps:** public OpenStreetMap/OSRM endpoints are best-effort and do not provide guaranteed live traffic. Review provider usage policies before commercial traffic.
- **AI claims:** deterministic fare formulas and route-provider alternatives must not be described as trained ML/AI models.
- **Scale:** no user or concurrency capacity should be claimed until staged load tests have been executed and measured.

## Git and release workflow

- `main` is the active development and production branch, as requested by the project owner.
- Previous implementation is preserved in Git history and the `archive/pre-v2-main-20261128` snapshot branch.
- Do not force-push or reset `main`.
- Keep commits small and descriptive.
- Run validation before each push because Vercel may deploy `main` automatically.
- Do not apply destructive production database changes without explicit approval.

## Local development

Local development is optional. The owner does not need to install Node.js or Docker for the GitHub/Vercel cloud workflow. CI and Vercel perform builds in their cloud environments.

## Team

East West University · CSE412 · Fall 2026
