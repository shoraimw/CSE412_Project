# DRIVE — Smart Ride & Vehicle Rental Platform

DRIVE is an East West University CSE412 project for ride booking, shared journeys, vehicle rental, passenger safety and tourist planning.

## Technology
- Frontend: HTML, CSS and Vanilla JavaScript
- Backend: Node.js, NestJS and TypeScript
- Authentication: Supabase Auth sessions and JWT verification; passwords are managed by Supabase Auth
- Validation: class-validator / class-transformer
- Maps and routing: OpenStreetMap ecosystem and OSRM routing endpoint
- Data persistence: Supabase PostgreSQL with Row Level Security (RLS) and versioned SQL migrations
- Current deployment configuration: Vercel static frontend + serverless NestJS API; Cloudflare Workers build is a separate target and must be verified independently
- Cloudflare Worker deployment is a separate deployment target and must be configured/tested independently.

## Local development
1. Install Node.js 20 or newer.
2. Start the backend:
   ```bash
   cd backend
   npm install
   cp .env.example .env
   # Set a unique JWT_SECRET in .env
   npm run start:dev
   ```
   API base: http://localhost:3000/api  
   Health check: http://localhost:3000/api/health
3. Serve the `frontend/` directory with VS Code Live Server (for example, http://localhost:5500).
4. The frontend uses localhost:3000 for local API calls and same-origin `/api` after deployment.

## Deployment configuration
For the current Vercel setup:
- Import this repository with the repository root as the project root.
- Configure `JWT_SECRET` with a unique random value of at least 32 bytes.
- If using a separate frontend origin, configure `CORS_ORIGIN` as a comma-separated list of exact trusted origins (scheme + hostname). Do not use `*`.
- Redeploy after changing environment variables.
- Never commit `.env`, API keys, service-role keys, JWT secrets or real user data.

## Implemented academic-demo modules
- Supabase-backed authentication and profile endpoints with role-aware API authorization
- Persistent ride, rental, safety, tourist-plan and notification data through Supabase PostgreSQL
- Vehicle catalogue and rental request endpoints
- Ride request, verified-driver claim RPC, shared ride and ride-status endpoints
- Passenger cancellation before driver acceptance; driver GPS writes restricted to assigned in-progress trips
- Rule-based fare estimate
- Road-route recommendation using the public OSRM demo provider, with labelled straight-line fallback
- Currency conversion quote (not a payment)
- Women Safety Mode settings, trip monitoring, trip sharing and SOS recording
- Tourist destination recommendations and itinerary planning
- API health endpoint

## Important limitations — not production-ready yet
The current codebase is an academic prototype. The following are not yet complete and must not be represented as live production services:
- **Persistence and migration parity:** domain data is designed around Supabase PostgreSQL and RLS. Keep the repository migration history synchronized with the connected Supabase project before fresh-environment setup; a database that already has manually-applied or untracked migrations may not be reproducible from this repository alone.
- **Driver/owner onboarding:** sample driver records are demo data. Real identity, licence, vehicle and ownership verification is not integrated.
- **Driver operations:** driver claim is database/RPC-backed, but production-grade dispatch, proximity ranking, availability scheduling and operational conflict handling still need end-to-end validation.
- **Live tracking:** the passenger dashboard polls authenticated trip location and the driver browser shares GPS only while a trip is in progress. This is not a continuously connected production tracking service and requires HTTPS, browser permission and a running driver session.
- **Emergency notifications:** SOS is recorded in the application only. It does not contact police, emergency services, SMS, WhatsApp or trusted contacts.
- **Payments:** currency conversion is a quote only. No payment gateway collects or settles money.
- **AI claims:** fare estimation is rule-based; route planning is provider-based. Neither should be described as a trained AI/ML system.
- **Scale and reliability:** the connected Supabase security advisor currently reports no security lint findings, but no production load test, uptime target, monitoring, alerting, backup or disaster-recovery verification has been completed.

Do not use this prototype to arrange real rides, handle real emergencies or collect real payments until the above controls have been implemented and independently tested.

## Security baseline
- Public registration creates Passenger accounts only.
- Users cannot assign themselves Driver or Vehicle Owner privileges through registration or profile editing.
- Request validation rejects unexpected fields.
- CORS is disabled for cross-origin traffic in production unless exact trusted origins are configured.
- Passwords are hashed with bcrypt. Production deployment requires a unique `JWT_SECRET`.
- Use HTTPS, persistent storage, rate limiting, audit logs, account verification and security testing before real-world use.

## API overview
- `POST /api/auth/register`, `POST /api/auth/login`
- `GET/PATCH /api/users/me`
- `GET /api/rental/vehicles`, `POST /api/rental/bookings`
- `GET/POST /api/rides`, `POST /api/rides/:id/match`, `GET /api/rides/:id/track`
- `POST /api/fare/predict`
- `POST /api/routes/optimize`
- `GET /api/payments/currencies`, `GET /api/payments/rates`, `POST /api/payments/quote`
- `/api/safety/*`, `/api/tourist/*`
- `GET /api/health`

## Team
East West University · CSE412 · Fall 2026 · Group 5
