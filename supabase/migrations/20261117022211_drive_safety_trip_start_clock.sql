-- Start the Women Safety arrival timer when the driver actually starts the
-- trip, not when the passenger first submits a ride request.
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
        and new.status = 'in_progress'::public.drive_ride_status then
    update public.safety_trip_sessions s
       set ride_id = new.id,
           started_at = now(),
           expected_arrival_at = now() + make_interval(mins => greatest(coalesce(q.estimated_duration_minutes, 30), 1)),
           updated_at = now()
      from public.ride_requests q
     where q.id = new.request_id
       and s.ride_request_id = q.id
       and s.status <> 'COMPLETED';
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
