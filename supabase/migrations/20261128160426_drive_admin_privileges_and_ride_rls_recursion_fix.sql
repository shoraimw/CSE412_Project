begin;

-- Restore SQL privileges required by existing RLS-protected workflows.
-- RLS policies remain the authorization boundary for every row.
grant select, insert, update on table public.vehicle_owner_applications to authenticated;
grant select, insert, update on table public.owner_documents to authenticated;
grant select, insert, update on table public.support_cases to authenticated;
grant select, insert, update on table public.fare_rules to authenticated;
grant select on table public.fare_rules to anon;

-- Break the rides <-> ride_requests policy recursion by moving participant
-- membership checks into a tightly scoped SECURITY DEFINER helper.
create or replace function private.drive_can_access_ride(p_ride_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
set row_security = off
as $function$
  select exists (
    select 1
    from public.rides r
    where r.id = p_ride_id
      and (
        r.driver_id = (select auth.uid())
        or (select private.drive_role()) = 'admin'::public.drive_role
        or exists (
          select 1
          from public.ride_requests q
          where q.id = r.request_id
            and q.passenger_id = (select auth.uid())
        )
        or exists (
          select 1
          from public.ride_passengers rp
          where rp.ride_id = r.id
            and rp.passenger_id = (select auth.uid())
        )
      )
  );
$function$;

revoke all on function private.drive_can_access_ride(uuid) from public, anon;
grant execute on function private.drive_can_access_ride(uuid) to authenticated;

drop policy if exists rides_read_participants on public.rides;
create policy rides_read_participants
on public.rides
for select
to authenticated
using ((select private.drive_can_access_ride(id)));

commit;
