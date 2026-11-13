# DRIVE verification plan

## Automated gates
- backend: npm run typecheck, npm run build, npm test
- Apply migration on a disposable Supabase project and verify RLS for every table.
- Test health, auth registration/login/refresh, expired JWT, unauthenticated denial and invalid payloads.

## End-to-end
1. Register passenger, confirm email, login, update profile.
2. Create ride; verify persistence after restart; test invalid values.
3. Admin approves driver; verified driver accepts; GPS updates persist; ride lifecycle works.
4. Owner adds vehicle; passenger filters and requests rental; test overlapping booking prevention.
5. Add trusted contact; trigger SOS; verify alert and explicit external-delivery disclaimer.
6. Fare estimates and currency quotes never report a real payment as paid.
7. Browse tourist places and save itinerary.
8. Test role escalation, cross-user access, RLS and invalid JWT.
9. Test keyboard navigation, labels, focus, mobile viewports and supported browsers.
10. Load test 25/50/100 concurrent sessions; report p50/p95/p99, error rate, DB connections and CPU. Never claim capacity without measurements.

A feature is complete only after positive, negative, authorization and persistence tests pass.
