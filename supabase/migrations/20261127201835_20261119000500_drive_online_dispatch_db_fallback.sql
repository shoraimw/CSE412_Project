-- Make nearby dispatch work even before the updated NestJS Worker is deployed.
-- RLS filters the legacy open-requests SELECT query, and a DB trigger creates
-- catch-up alerts when a driver first comes online or returns after stale GPS.

create or replace function private.drive_can_dispatch_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.driver_applications da
      on da.user_id=p.id and da.status='approved'
    join public.driver_locations dl
      on dl.driver_id=p.id and dl.is_available=true
     and dl.updated_at >= now() - interval '45 seconds'
    join public.ride_requests q
      on q.id=p_request_id
     and q.status='requested'::public.drive_ride_status
     and q.requested_vehicle=da.requested_vehicle_type
    where p.id=(select auth.uid())
      and p.role='driver'::public.drive_role
      and p.is_verified=true
      and p.is_active=true
      and 6371.0 * 2 * asin(sqrt(least(1.0, greatest(0.0,
        power(sin(radians(dl.latitude - q.pickup_lat) / 2), 2)
        + cos(radians(q.pickup_lat)) * cos(radians(dl.latitude))
        * power(sin(radians(dl.longitude - q.pickup_lng) / 2), 2)
      )))) <= 20
  );
$$;

revoke all on function private.drive_can_dispatch_request(uuid) from public,anon;
grant execute on function private.drive_can_dispatch_request(uuid) to authenticated;

drop policy if exists ride_requests_read on public.ride_requests;
create policy ride_requests_read
on public.ride_requests
for select
to authenticated
using (
  passenger_id=(select auth.uid())
  or (select private.drive_role())='admin'::public.drive_role
  or private.drive_can_dispatch_request(id)
  or private.drive_can_access_request(id)
);

create or replace function public.drive_notify_driver_online_requests()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_should_notify boolean := false;
  v_moved_km double precision := 0;
begin
  if new.is_available is not true
    or (select auth.uid()) is null
    or private.drive_role() <> 'driver'::public.drive_role then
    return new;
  end if;

  if tg_op='INSERT' then
    v_should_notify := true;
  else
    v_should_notify :=
      old.is_available is distinct from true
      or old.updated_at < now() - interval '45 seconds';

    if not v_should_notify then
      v_moved_km := 6371.0 * 2 * asin(sqrt(least(1.0, greatest(0.0,
        power(sin(radians(new.latitude - old.latitude) / 2), 2)
        + cos(radians(old.latitude)) * cos(radians(new.latitude))
        * power(sin(radians(new.longitude - old.longitude) / 2), 2)
      ))));
      v_should_notify := v_moved_km >= 1;
    end if;
  end if;

  if v_should_notify then
    perform private.drive_notify_open_requests_to_driver();
  end if;

  return new;
end;
$$;

drop trigger if exists drive_notify_driver_online_requests on public.driver_locations;
create trigger drive_notify_driver_online_requests
after insert or update of is_available,latitude,longitude,updated_at
on public.driver_locations
for each row execute function public.drive_notify_driver_online_requests();

revoke all on function public.drive_notify_driver_online_requests() from public,anon,authenticated;
