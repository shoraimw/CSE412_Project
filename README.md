# DRIVE — Smart Ride & Vehicle Rental Platform

DRIVE is an East West University CSE412 academic project that brings ride booking, shared rides, vehicle rental, passenger safety and tourist planning into one responsive web platform.

## Stack
- Frontend: HTML, CSS, Vanilla JavaScript
- Backend: Node.js, NestJS, TypeScript
- Authentication: JWT + bcrypt password hashing
- Validation: class-validator / class-transformer
- Maps/routing: OpenStreetMap ecosystem and OSRM routing endpoint
- Deployment target: Vercel (static frontend + serverless NestJS API)

## Local development
1. Install Node.js 20+.
2. Backend:
   \`\`\`bash
   cd backend
   npm install
   npm run start:dev
   \`\`\`
   API: http://localhost:3000/api
3. Open \`frontend/index.html\` using VS Code Live Server.
4. For local requests, \`frontend/js/api.js\` uses localhost:3000. For deployment, it uses the same-origin \`/api\` path.

## Vercel deployment
- Import this repository into Vercel.
- Keep the project root at repository root.
- The included \`vercel.json\` builds the NestJS backend and serves \`frontend/\` as static output.
- Configure \`JWT_SECRET\` as a long random secret in Vercel Project Settings → Environment Variables.
- Set \`CORS_ORIGIN\` only if a separate frontend origin is used.
- Do not commit secrets or real user data.

## Current academic-demo limitations
- The current domain repositories are in-memory. Users, rides, safety settings, trips, alerts and tourist plans reset when a server instance restarts and are not production-persistent.
- Configure a dedicated database before using real users or production traffic. Do not reuse another project’s database.
- Demo drivers and vehicles are sample records. Driver verification is not a real KYC integration.
- Live tracking is HTTP location updates with polling; no always-on Socket.IO server is used in the Vercel deployment.
- SOS creates an application alert only. It does not call emergency services or send SMS/WhatsApp messages.
- Fare calculation is rule-based, not trained ML. Routing uses a public OSRM demo endpoint, not an AI traffic prediction model.
- Multi-currency provides exchange-rate quotes only; no payment gateway collects money.
- This is an academic prototype, not a production ride-hailing service.

## Feature endpoints
- POST /api/auth/register, POST /api/auth/login
- GET/PATCH /api/users/me
- GET /api/rental/vehicles, POST /api/rental/bookings
- GET/POST /api/rides, POST /api/rides/:id/match, GET /api/rides/:id/track
- POST /api/fare/predict
- POST /api/routes/optimize
- GET /api/payments/currencies, GET /api/payments/rates, POST /api/payments/quote
- /api/safety/* and /api/tourist/*

## Security
Set \`JWT_SECRET\` in the deployment environment. Use HTTPS. Do not store payment-card details. Configure persistent storage, rate limiting, stricter CORS, audit logging and verified driver onboarding before any real-world use.
