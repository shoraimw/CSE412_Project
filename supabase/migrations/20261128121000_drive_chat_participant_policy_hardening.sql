-- Avoid policy recursion through rides/ride_passengers by using SECURITY DEFINER
-- participant predicates. These helpers expose only a boolean access decision.
create or replace function private.drive_can_access_ride(p_ride_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rides r
    where r.id=p_ride_id
      and (
        r.driver_id=(select auth.uid())
        or private.drive_can_access_request(r.request_id)
      )
  );
$$;

create or replace function private.drive_can_chat_on_ride(p_ride_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.rides r
    where r.id=p_ride_id
      and r.status in (
        'matched'::public.drive_ride_status,
        'driver_arriving'::public.drive_ride_status,
        'in_progress'::public.drive_ride_status
      )
      and (
        r.driver_id=(select auth.uid())
        or private.drive_can_access_request(r.request_id)
      )
  );
$$;

revoke all on function private.drive_can_access_ride(uuid) from public,anon;
revoke all on function private.drive_can_chat_on_ride(uuid) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.drive_can_access_ride(uuid) to authenticated;
grant execute on function private.drive_can_chat_on_ride(uuid) to authenticated;

drop policy if exists ride_messages_read_participants on public.ride_messages;
create policy ride_messages_read_participants on public.ride_messages
for select to authenticated
using (private.drive_can_access_ride(ride_id));

drop policy if exists ride_messages_insert_active_participants on public.ride_messages;
create policy ride_messages_insert_active_participants on public.ride_messages
for insert to authenticated
with check (
  sender_id=(select auth.uid())
  and private.drive_can_chat_on_ride(ride_id)
);

drop policy if exists ride_activity_events_read_participants_admin on public.ride_activity_events;
create policy ride_activity_events_read_participants_admin on public.ride_activity_events
for select to authenticated
using (
  (select private.drive_role())='admin'::public.drive_role
  or (request_id is not null and private.drive_can_access_request(request_id))
  or (ride_id is not null and private.drive_can_access_ride(ride_id))
);

drop policy if exists ride_cancellation_requests_read_participants_admin on public.ride_cancellation_requests;
create policy ride_cancellation_requests_read_participants_admin on public.ride_cancellation_requests
for select to authenticated
using (
  (select private.drive_role())='admin'::public.drive_role
  or requester_id=(select auth.uid())
  or private.drive_can_access_ride(ride_id)
);
