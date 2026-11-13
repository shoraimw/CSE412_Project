# DRIVE verification and load testing

## Automated checks
- Backend: GitHub Actions runs `npm install` and `npm run build`.
- Frontend: GitHub Actions runs `node --check` on every JavaScript file under `frontend/js`.
- Supabase: migrations are versioned under `supabase/migrations`; security advisor should be checked after schema changes.

## Local integration test
1. Configure `backend/.env` from `.env.example` with the DRIVE Supabase project URL and publishable key.
2. Run `cd backend && npm install && npm run start:dev`.
3. Serve the `frontend` folder on a local static server.
4. Register a passenger, confirm the email if required, sign in, and test profile retrieval.
5. Create a ride request using real Dhaka addresses; verify it appears in the passenger dashboard.
6. Submit a driver application. An admin approves it, then the driver submits all three required document references.
7. An admin verifies the documents. The driver can then claim a request and share GPS during a trip.
8. Test rental listing, owner approval, notifications, safety trip sharing, SOS record creation, tourist plan persistence and payment-intent creation.
9. Verify that a passenger cannot read another passenger's records, a non-driver cannot claim a ride, and clients cannot mark payments or vehicles verified.

## k6 load test
Install k6, then run:

```sh
k6 run tests/load/ride-api.js
```

Configure the target and optional test token with environment variables:
- `API_BASE_URL`: API origin, without the `/api` suffix.
- `DRIVE_ACCESS_TOKEN`: dedicated test user's Supabase access token.

The default scenario ramps from 10 to 250 virtual users. Increase stages gradually only after checking database pool usage, Supabase quotas, Cloudflare limits, error rates and p95/p99 latency. Do not run large load tests against production without approval. A 100,000-user registration target is not evidence of 100,000 concurrent-user capacity; concurrency must be measured separately.
