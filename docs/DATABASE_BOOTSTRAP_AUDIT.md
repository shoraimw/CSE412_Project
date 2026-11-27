# DRIVE Supabase database bootstrap audit

Audit date: 2026-11-28  
Supabase project: `CSE412_Project`  
Region: `ap-southeast-1`

## Observed remote state

The connected project is active and healthy.

- The `public` schema currently has no DRIVE application tables.
- Supabase migration history is empty.
- Supabase system schemas (Auth, Storage and Realtime) are present; they are managed by Supabase and are not DRIVE application tables.

## Repository migration state

The repository contains later feature migrations under `supabase/migrations/`, beginning with sensitive-write guards and feature extensions.

Those migrations refer to pre-existing objects such as:

- `public.profiles`
- `public.vehicles`
- `public.driver_documents`
- `public.payments`
- `public.ride_requests`
- `public.rides`
- `public.ride_passengers`
- `public.rental_bookings`
- `public.notifications`
- `public.trusted_contacts`
- `public.user_safety_preferences`
- `public.tourist_places`
- `public.tourist_plans`
- The `public.drive_role` type and helper functions in the `private` schema.

The original bootstrap SQL that created these objects is not present in the current repository migration history.

## Safety decision

Do not apply the existing incremental migration files to this empty database yet. They are not a complete fresh-install sequence.

Do not reset the Supabase project. Do not modify Supabase system schemas. Do not insert a hard-coded administrator or sample production user.

## Required next database milestone

1. Reconstruct the base schema from the current NestJS modules, frontend contracts and all existing SQL migrations.
2. Create a versioned baseline migration that creates required enums, schemas, tables, constraints, indexes, triggers, RLS policies and helper functions in dependency order.
3. Validate the baseline in an isolated PostgreSQL/Supabase development environment.
4. Reconcile and order the existing incremental migrations, including duplicate or superseded migrations.
5. Apply the reviewed migration sequence to the connected project only after confirming it is the intended DRIVE database.
6. Verify the resulting tables, RLS policies, RPC grants and Supabase Security Advisor findings.

The migration must be idempotent where practical, but must not hide schema drift by silently ignoring unexpected errors.

## Minimum entities to reconcile

Profiles and roles; driver and vehicle-owner applications; driver documents and locations; vehicles and rental bookings; ride requests, rides, ride passengers and trip locations; fare configuration/quotes; payments; notifications; trusted contacts and safety preferences; safety alerts and trip sessions/locations/shares; tourist places and plans; admin audit logs.

The final schema may normalize or combine entities where justified by the actual application behavior. This list is a reconciliation checklist, not a mandate to create one table per bullet.
