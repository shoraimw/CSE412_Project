-- Make token-based trip sharing work for anonymous trusted contacts without
-- exposing the private schema, and keep automatic Women Safety sessions in sync
-- with the ride lifecycle.

-- This public endpoint is intentionally callable without login: possession of
-- the high-entropy, expiring share token is the authorization mechanism.
-- SECURITY DEFINER lets it call the private helper while private remains hidden.
alter function public.drive_get_shared_trip(text) security definer;
alter function public.drive_get_shared_trip(text) set search_path = '';

revoke all on function public.drive_get_shared_trip(text) from public, authenticated;
grant execute on function public.drive_get_shared_trip(text) to anon, service_role;
revoke all on function private.drive_shared_trip(text) from public, anon, authenticated;

-- Keep privileged shared-ride logic in the non-exposed private schema. The
-- public RPCs remain SECURITY INVOKER wrappers and are executable by signed-in
-- users only.
alter function public.drive_leave_shared_ride_v2(uuid) set schema private;
alter function public.drive_my_shared_rides_v2() set schema private;

grant usage on schema private to authenticated;
revoke all on function private.drive_leave_shared_ride_v2(uuid) from public, anon;
revoke all on function private.drive_my_shared_rides_v2() from public, anon;
grant execute on function private.drive_leave_shared_ride_v2(uuid) to authenticated;
grant execute on function private.drive_my_shared_rides_v2() to authenticated;

create or replace function public.drive_leave_shared_ride_v2(p_ride_id uuid)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.drive_leave_shared_ride_v2(p_ride_id);
$$;

create or replace function public.drive_my_shared_rides_v2()
returns table (
  ride_id uuid,
  request_id uuid,
  pickup_label text,
  destination_label text,
  requested_vehicle text,
  estimated_fare numeric,
  estimated_distance_km numeric,
  estimated_duration_minutes integer,
  currency text,
  ride_status text,
  my_seats smallint,
  my_fare_share numeric,
  driver_id uuid
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.drive_my_shared_rides_v2();
$$;

revoke all on function public.drive_leave_shared_ride_v2(uuid) from public, anon;
revoke all on function public.drive_my_shared_rides_v2() from public, anon;
grant execute on function public.drive_leave_shared_ride_v2(uuid) to authenticated;
grant execute on function public.drive_my_shared_rides_v2() to authenticated;

-- Attach a Women Safety session to its claimed ride and automatically close
-- the session when that ride is cancelled or completed.
create or replace function private.drive_sync_safety_trip_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if tg_op = 'INSERT' then
    update public.safety_trip_sessions
       set ride_id = new.id,
           updated_at = now()
     where ride_request_id = new.request_id
       and ride_id is null;
  elsif new.status is distinct from old.status
        and new.status in ('completed'::public.drive_ride_status, 'cancelled'::public.drive_ride_status) then
    update public.safety_trip_sessions
       set status = 'COMPLETED',
           updated_at = now()
     where ride_request_id = new.request_id
       and status <> 'COMPLETED';
  end if;
  return new;
end;
$$;

revoke all on function private.drive_sync_safety_trip_status() from public, anon, authenticated;
drop trigger if exists drive_sync_safety_trip_status on public.rides;
create trigger drive_sync_safety_trip_status
after insert or update of status on public.rides
for each row execute function private.drive_sync_safety_trip_status();
