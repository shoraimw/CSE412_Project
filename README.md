DRIVE v2 — Clean Rebuild

Independent CSE412 smart ride-sharing and vehicle-rental implementation. Original main branch is preserved.

Stack: responsive HTML/CSS/vanilla JS, Node.js 22+, NestJS TypeScript, Supabase Auth/PostgreSQL/RLS.

Setup: run supabase/migrations/001_initial_schema.sql in Supabase; copy backend/.env.example to backend/.env; configure Supabase URL and publishable/anon key; run `cd backend && npm install && npm run start:dev`; serve frontend/ over HTTP; set API URL in frontend/js/config.js.

Currency conversion is quote-only. SOS is stored in-app; SMS delivery needs a provider. Live tracking needs driver GPS and client subscriptions. Public OSRM has no production SLA. Never expose service-role keys.

See docs/REQUIREMENTS_TRACEABILITY.md and docs/TEST_PLAN.md. No production-readiness claim until verification passes.