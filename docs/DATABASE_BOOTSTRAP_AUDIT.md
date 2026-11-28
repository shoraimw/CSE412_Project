# DRIVE Supabase database bootstrap audit

Audit date: 2026-11-28  
Supabase project: `CSE412_Project`  
Region: `ap-southeast-1`

## Verified database state

- 31 DRIVE application tables exist in the `public` schema.
- RLS is enabled on all 31 public application tables.
- 63 migrations are applied in Supabase.
- 63 SQL migration files are tracked in `supabase/migrations/`.
- Every applied migration version has exactly one matching repository file; no missing or extra migration versions were found in the latest comparison.
- The database was not reset and no user, ride, rental, payment or tourist data was deleted during this audit.
- The Supabase project is healthy.

The baseline and tourist UUID compatibility migrations were recovered from the authoritative `supabase_migrations.schema_migrations` history and restored to GitHub. The authorized driver mid-trip cancellation and Driver-as-customer cancellation migrations are also tracked.

## Baseline and historical compatibility

The tracked baseline includes profiles and roles; driver documents; vehicles; ride requests, rides, ride passengers and trip locations; rental bookings; payments; reviews; notifications; trusted contacts and safety preferences; safety alerts; tourist places and plans; helper functions, profile trigger, indexes and initial RLS policies. The tourist-place UUID compatibility and authorized driver mid-trip cancellation migrations are also tracked.

The historical tourist compatibility migration changes `tourist_places.id` from text to UUID and deletes the baseline seed rows before the later feature migrations repopulate the catalog. It is already applied in this project. Do not manually replay it against this database.

Incremental migrations add driver/owner application workflows, Women Safety sessions and expiring shares, shared rides, driver dispatch, notifications, admin review/audit, payment proof, transaction state guards, ride chat, cancellation workflows, activity history, final-fare authorization and reviews.

A version-parity check confirms that the repository now contains the full 63-file migration history. A clean-room migration run against a separate empty Supabase project has not yet been performed.

## Ride cancellation safeguards

- Passenger, Driver and Vehicle Owner accounts may request cancellation only when they are a passenger on the specific ride; the database checks `ride_passengers` membership.
- An assigned Driver uses the dedicated driver cancellation RPC and must provide a reason.
- The assigned Driver may cancel before pickup or end an in-progress trip.
- A trigger rejects direct status updates to `cancelled` unless the write is made through an authorized cancellation RPC, by an administrator or by the trusted service role.
- Cancellation reasons are persisted and passenger/admin notifications are generated through the ride lifecycle.

## Security review

- RLS is enabled on every DRIVE public application table.
- The private `drive_integration_secrets` table intentionally has RLS enabled with no user-facing policy; secret material is not exposed through the public API.
- Eight public `SECURITY DEFINER` functions remain executable by authenticated users because the backend calls them through Supabase RPC. Each function performs role, ownership or participant checks. Do not revoke these grants without replacing the corresponding backend RPC path.
- Security Advisor also reports the private-table RLS information notice; this is expected for a private integration-secret table.
- The `btree_gist` extension was moved into the `extensions` schema.
- Duplicate permissive policies and duplicate indexes were removed; missing foreign-key indexes were added.
- Supabase leaked-password protection still needs to be enabled in Dashboard → Authentication → Security.

The remaining nine RLS initialization-plan warnings were addressed by wrapping `auth.uid()` and the role helper in statement-level SELECTs. The Performance Advisor now reports no RLS initialization-plan warnings. It still reports 60 unused indexes; with zero application rows and no real query workload, these are informational and must not be dropped until usage is measured after testing.

Re-run Security and Performance Advisors after future schema changes.

## Payment and external-service readiness

- SSLCommerz hosted checkout and webhook validation code are present.
- The Cloudflare Worker currently has no `SSLCOMMERZ_STORE_ID` or `SSLCOMMERZ_STORE_PASSWORD` secret, so live card checkout is not activated.
- bKash/Nagad transaction references use manual administrator verification; cash remains pending until receipt is confirmed.
- SOS alerts are stored in DRIVE and visible to administrators. External police dispatch and guaranteed SMS/WhatsApp delivery are not configured.

## Account bootstrap state

At the latest audit, `auth.users`, `public.profiles`, `public.ride_requests` and `public.rides` each contained zero rows. This is an empty academic project environment, not a seeded production tenant.

The first team member must register and confirm email before the trusted Admin role can be assigned. The first-admin SQL bootstrap is documented under `supabase/ops/`; it must only be run for a trusted account.

## Release and test limitations

- Real multi-account browser tests are still outstanding because the connected project has no registered test users.
- Preview Pages and production currently use the same Worker service binding and the same Supabase project. Do not use preview to create disposable test data.
- Before public launch, verify Passenger, Driver, Vehicle Owner and Admin isolation with dedicated test accounts, test GPS on real phones, enable leaked-password protection, provision payment credentials, and run accessibility, recovery and staged load tests.
- Do not reset the Supabase project, drop user tables or replay historical migrations against the current database.
