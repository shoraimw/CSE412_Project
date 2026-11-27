# DRIVE Supabase database bootstrap audit

Audit date: 2026-11-28  
Supabase project: `CSE412_Project`  
Region: `ap-southeast-1`

## Initial and current state

The project was initially active but had no DRIVE application tables and an empty migration history.

A baseline schema was then applied, followed by the repository's incremental feature migrations and a security/performance cleanup migration.

Current verification:
- 23 DRIVE application tables exist in `public`.
- All 23 tables have Row Level Security enabled.
- 36 migration records are present in Supabase migration history.
- Tourist destination seed records are present.
- Driver applications, owner applications, driver locations, safety sessions, trip shares and admin audit tables exist.
- The Supabase project is healthy.

## Baseline scope

The baseline includes profiles and roles; driver documents; vehicles; ride requests, rides, ride passengers and trip locations; rental bookings; payments; reviews; notifications; trusted contacts and safety preferences; safety alerts; tourist places and plans; helper functions, profile trigger, indexes and initial RLS policies.

Incremental migrations add driver/owner application workflows, Women Safety sessions and expiring shares, shared rides, driver dispatch, notifications, admin review/audit, payment proof, transaction state guards and security policy hardening.

## Compatibility fix

The first baseline defined tourist-place IDs as text, while the existing feature migration inserts records using generated UUID IDs. This mismatch was corrected before the tourist-plan migration was applied: the seed-only destination records were cleared and the column was converted to UUID with a generated default. No user-created tourist plans existed at that time.

## Security review

- RLS is enabled on every DRIVE public table.
- The public schema's `rls_auto_enable()` event-trigger function has had API execute privileges revoked; it remains an event trigger function.
- The `btree_gist` extension was moved into the `extensions` schema.
- Duplicate permissive policies were removed from ride requests and tourist places.
- Duplicate trip-location indexes were removed.
- Missing foreign-key indexes were added.

The Security Advisor should be re-run after any further schema change. Supabase leaked-password protection still needs to be enabled in Dashboard → Authentication → Security.

## Important reproducibility follow-up

The baseline SQL and its version must be checked into `supabase/migrations/` in the correct chronological order alongside every incremental migration. The Supabase migration history currently records the baseline and later migrations as applied. Do not reset the database. Before setting up a new Supabase project, verify that the repository migration filenames exactly match the applied versions and that a fresh isolated database can run the complete sequence from empty state.

## Safety

Do not reset the Supabase project, drop user tables, delete auth users, or replay incremental migrations against production without reviewing the expected state.


## User/account bootstrap state

At the 2026-11-28 audit, `auth.users` and `public.profiles` both contained zero rows. This is an empty academic project environment, not a seeded production tenant. The first team member must register and confirm email before the trusted Admin role can be assigned. No credentials or user records have been created by this maintenance pass.
