# DRIVE Supabase database bootstrap audit

Audit date: 2026-11-28  
Supabase project: `CSE412_Project`  
Region: `ap-southeast-1`

## Current verified state

- 31 DRIVE application tables exist in the `public` schema.
- RLS is enabled on all 31 public application tables.
- Supabase records 61 applied migrations.
- The repository currently tracks 58 SQL migration files.
- Three applied migrations are not represented by a matching repository file:
  - `20261128010000_drive_baseline_schema`
  - `20261128011000_drive_tourist_place_uuid_compat`
  - `drive_authorized_driver_midtrip_cancellation`
- The 58 tracked migration files match their remote version/name records; no local/remote version mismatch was found in the latest audit.
- Tourist destination seed records, driver/owner applications, driver locations, safety sessions, trip shares and admin audit tables exist.
- The Supabase project is healthy.

## Baseline scope

The baseline includes profiles and roles; driver documents; vehicles; ride requests, rides, ride passengers and trip locations; rental bookings; payments; reviews; notifications; trusted contacts and safety preferences; safety alerts; tourist places and plans; helper functions, profile trigger, indexes and initial RLS policies.

Incremental migrations add driver/owner application workflows, Women Safety sessions and expiring shares, shared rides, driver dispatch, notifications, admin review/audit, payment proof, transaction state guards and security policy hardening.

## Compatibility fix

The first baseline defined tourist-place IDs as text, while the tourist-plan feature migration inserts generated UUID IDs. The mismatch was corrected in the live database: seed-only destination records were cleared and the column was converted to UUID with a generated default. The compatibility migration is applied remotely but is not currently tracked as a matching SQL file. No user-created tourist plans existed at that time.

## Security review

- RLS is enabled on every DRIVE public table.
- The public schema's `rls_auto_enable()` event-trigger function has had API execute privileges revoked; it remains an event-trigger function.
- The `btree_gist` extension was moved into the `extensions` schema.
- Duplicate permissive policies were removed from ride requests and tourist places.
- Duplicate trip-location indexes were removed.
- Missing foreign-key indexes were added.
- Security Advisor warnings for callable `SECURITY DEFINER` functions were reviewed; these functions contain explicit role/ownership checks. Do not revoke their execute grants without replacing the backend RPC path.

The Security Advisor should be re-run after any further schema change. Supabase leaked-password protection still needs to be enabled in Dashboard → Authentication → Security.

## Reproducibility follow-up

The current database is usable, but a clean-room Supabase setup is not yet reproducible from this repository alone. Recover and check in the missing baseline, tourist UUID compatibility and authorized driver mid-trip cancellation migrations before running `supabase db push` or creating a fresh project.

Do not reset the database. Before a new Supabase project is used, verify that a fresh isolated database can run the complete migration sequence from an empty state.

## Safety

Do not reset the Supabase project, drop user tables, delete auth users, or replay incremental migrations against the current database without reviewing the expected state.

## User/account bootstrap state

At the 2026-11-28 audit, `auth.users` and `public.profiles` both contained zero rows. This is an empty academic project environment, not a seeded production tenant. The first team member must register and confirm email before the trusted Admin role can be assigned. The first-admin SQL bootstrap is documented under `supabase/ops/`; it must only be run for a trusted account.
