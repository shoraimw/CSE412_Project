-- Tighten the public trip-share RPC wrapper and consolidate application UPDATE policies.

-- The share link is intentionally public, but only the high-entropy token hash
-- and expiry may unlock a limited, non-identifying trip view. Keep the
-- SECURITY DEFINER implementation in the non-exposed private schema and make
-- the public PostgREST wrapper SECURITY INVOKER.
create or replace function public.drive_get_shared_trip(p_token_hash text)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select private.drive_shared_trip($1);
$$;

grant usage on schema private to anon, authenticated;
revoke all on function private.drive_shared_trip(text) from public, anon, authenticated;
grant execute on function private.drive_shared_trip(text) to anon, authenticated;
revoke all on function public.drive_get_shared_trip(text) from public;
grant execute on function public.drive_get_shared_trip(text) to anon, authenticated;

-- Combine admin review and applicant resubmission into one UPDATE policy per table.
drop policy if exists driver_applications_admin_update on public.driver_applications;
drop policy if exists driver_applications_resubmit_rejected on public.driver_applications;
create policy driver_applications_update_admin_or_resubmit
on public.driver_applications
for update
to authenticated
using (
  (select private.drive_role()) = 'admin'::public.drive_role
  or (
    user_id = (select auth.uid())
    and status = 'rejected'
    and (select private.drive_role()) = 'passenger'::public.drive_role
  )
)
with check (
  (select private.drive_role()) = 'admin'::public.drive_role
  or (
    user_id = (select auth.uid())
    and status = 'pending'
    and (select private.drive_role()) = 'passenger'::public.drive_role
  )
);

drop policy if exists vehicle_owner_applications_admin_update on public.vehicle_owner_applications;
drop policy if exists vehicle_owner_applications_resubmit_rejected on public.vehicle_owner_applications;
create policy vehicle_owner_applications_update_admin_or_resubmit
on public.vehicle_owner_applications
for update
to authenticated
using (
  (select private.drive_role()) = 'admin'::public.drive_role
  or (
    user_id = (select auth.uid())
    and status = 'rejected'
    and (select private.drive_role()) = 'passenger'::public.drive_role
  )
)
with check (
  (select private.drive_role()) = 'admin'::public.drive_role
  or (
    user_id = (select auth.uid())
    and status = 'pending'
    and (select private.drive_role()) = 'passenger'::public.drive_role
  )
);
