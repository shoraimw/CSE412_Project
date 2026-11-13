# DRIVE — Smart Ride & Vehicle Rental Platform

DRIVE is an East West University CSE412 project for ride booking, shared journeys, vehicle rental, passenger safety and tourist planning.

## Technology
- Frontend: HTML, CSS and Vanilla JavaScript
- Backend: Node.js, NestJS and TypeScript
- Authentication: JWT and bcrypt password hashing
- Validation: class-validator / class-transformer
- Maps and routing: OpenStreetMap ecosystem and OSRM routing endpoint
- Current deployment configuration: Vercel static frontend + serverless NestJS API
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
- Authentication and profile endpoints
- Vehicle catalogue and rental request endpoints
- Ride request, demo matching, shared ride and ride-status endpoints
- Rule-based fare estimate
- Route recommendation using the configured routing provider
- Currency conversion quote (not a payment)
- Women Safety Mode settings, trip monitoring, trip sharing and SOS recording
- Tourist destination recommendations and itinerary planning
- API health endpoint

## Important limitations — not production-ready yet
The current codebase is an academic prototype. The following are not yet complete and must not be represented as live production services:
- **Persistence:** domain data currently uses in-memory arrays/maps. Users, rides, bookings, safety settings, alerts and tourist plans can be lost when a server instance restarts or a serverless instance changes. A dedicated persistent database and migrations are required.
- **Driver/owner onboarding:** sample driver records are demo data. Real identity, licence, vehicle and ownership verification is not integrated.
- **Driver operations:** demo ride matching is not a real dispatch network. Driver-side acceptance, availability and conflict prevention need a complete workflow.
- **Live tracking:** current tracking is request/poll based and requires real authenticated driver location updates. It is not a continuously connected production tracking service.
- **Emergency notifications:** SOS is recorded in the application only. It does not contact police, emergency services, SMS, WhatsApp or trusted contacts.
- **Payments:** currency conversion is a quote only. No payment gateway collects or settles money.
- **AI claims:** fare estimation is rule-based; route planning is provider-based. Neither should be described as a trained AI/ML system.
- **Scale and reliability:** no production load test, uptime target, monitoring, alerting, backup or disaster-recovery verification has been completed.

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
