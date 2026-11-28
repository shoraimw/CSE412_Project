begin;

-- The driver claim is an atomic, privileged database operation. The public
-- PostgREST entry point remains SECURITY INVOKER; only this private function
-- can perform the coordinated status/ride/passenger/location writes.
create or replace function private.drive_claim_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_driver uuid := auth.uid();
  v_request public.ride_requests%rowtype;
  v_ride_id uuid;
  v_capacity smallint;
  v_driver_vehicle text;
  v_location public.driver_locations%rowtype;
  v_distance double precision;
begin
  if v_driver is null then
    raise exception 'Authentication required';
  end if;

  if private.drive_role() is distinct from 'driver'::public.drive_role then
    raise exception 'Driver role required';
  end if;

  if not exists (
    select 1
    from public.profiles p
    where p.id = v_driver
      and p.role = 'driver'::public.drive_role
      and p.is_verified = true
      and p.is_active = true
  ) then
    raise exception 'Verified active driver required';
  end if;

  select da.requested_vehicle_type
    into v_driver_vehicle
    from public.driver_applications da
   where da.user_id = v_driver
     and da.status = 'approved';

  if v_driver_vehicle is null
     or v_driver_vehicle not in ('car','bike','cng') then
    raise exception 'An approved Car, Bike or CNG driver application is required';
  end if;

  -- Lock the driver's availability row to prevent two simultaneous claims
  -- from assigning two active rides to the same driver.
  select dl.*
    into v_location
    from public.driver_locations dl
   where dl.driver_id = v_driver
     and dl.is_available = true
     and dl.updated_at >= pg_catalog.now() - interval '45 seconds'
   for update;

  if not found then
    raise exception 'Go online and allow location access before accepting a ride';
  end if;

  if exists (
    select 1
    from public.rides r
    where r.driver_id = v_driver
      and r.status in (
        'matched'::public.drive_ride_status,
        'driver_arriving'::public.drive_ride_status,
        'in_progress'::public.drive_ride_status
      )
  ) then
    raise exception 'Finish your current trip before accepting another ride';
  end if;

  select q.*
    into v_request
    from public.ride_requests q
   where q.id = p_request_id
   for update;

  if not found or v_request.status <> 'requested'::public.drive_ride_status then
    raise exception 'Ride request is no longer available';
  end if;

  -- Enforce exact vehicle matching in the database, not only in the UI.
  if v_driver_vehicle is distinct from v_request.requested_vehicle then
    raise exception 'This request requires an approved driver for the selected vehicle type';
  end if;

  if exists (
    select 1
    from public.ride_request_rejections rr
    where rr.request_id = p_request_id
      and rr.driver_id = v_driver
  ) then
    raise exception 'You already passed on this request';
  end if;

  v_distance := 6371.0 * 2 * pg_catalog.asin(pg_catalog.sqrt(
    pg_catalog.least(1.0, pg_catalog.greatest(0.0,
      pg_catalog.power(pg_catalog.sin(pg_catalog.radians(v_location.latitude - v_request.pickup_lat) / 2), 2)
      + pg_catalog.cos(pg_catalog.radians(v_request.pickup_lat))
        * pg_catalog.cos(pg_catalog.radians(v_location.latitude))
        * pg_catalog.power(pg_catalog.sin(pg_catalog.radians(v_location.longitude - v_request.pickup_lng) / 2), 2)
    ))
  ));

  if v_distance > 20 then
    raise exception 'This ride is outside the 20 km driver pickup radius';
  end if;

  v_capacity := case v_request.requested_vehicle
    when 'bike' then 1
    when 'cng' then 3
    else 4
  end;

  if coalesce(v_request.seats_requested, 1) > v_capacity then
    raise exception 'Requested passenger seats exceed the selected vehicle capacity';
  end if;

  update public.ride_requests
     set status = 'matched'::public.drive_ride_status,
         updated_at = pg_catalog.now()
   where id = p_request_id;

  insert into public.rides(request_id, driver_id, status, seat_capacity)
  values (p_request_id, v_driver, 'matched'::public.drive_ride_status, v_capacity)
  returning id into v_ride_id;

  insert into public.ride_passengers(ride_id, passenger_id, seats, fare_share)
  values (
    v_ride_id,
    v_request.passenger_id,
    coalesce(v_request.seats_requested, 1),
    v_request.estimated_fare
  );

  update public.driver_locations
     set is_available = false,
         updated_at = pg_catalog.now()
   where driver_id = v_driver;

  return v_ride_id;
end;
$function$;

-- Keep the public RPC invoker-scoped. All privileged writes happen only in
-- the private function above, which validates auth.uid() and every claim rule.
create or replace function public.drive_claim_request(p_request_id uuid)
returns uuid
language sql
security invoker
set search_path = ''
as $function$
  select private.drive_claim_request(p_request_id);
$function$;

grant usage on schema private to authenticated;
revoke all on function private.drive_claim_request(uuid) from public, anon;
grant execute on function private.drive_claim_request(uuid) to authenticated;
revoke all on function public.drive_claim_request(uuid) from public, anon;
grant execute on function public.drive_claim_request(uuid) to authenticated;

-- Direct table inserts must not be an alternate way around the atomic claim
-- function. Administrators retain their trusted maintenance capability.
drop policy if exists rides_authorized_insert on public.rides;
create policy rides_authorized_insert
on public.rides
for insert
to authenticated
with check (
  (select private.drive_role()) = 'admin'::public.drive_role
);

-- Drivers may read and claim matching open requests through the protected
-- RPC, but cannot mark a request as matched with a direct table UPDATE.
-- Customers may still cancel their own unaccepted requests; admins retain
-- their trusted controls.
drop policy if exists ride_requests_update on public.ride_requests;
create policy ride_requests_update
on public.ride_requests
for update
to authenticated
using (
  passenger_id = (select auth.uid())
  or (select private.drive_role()) = 'admin'::public.drive_role
)
with check (
  passenger_id = (select auth.uid())
  or (select private.drive_role()) = 'admin'::public.drive_role
);

commit;