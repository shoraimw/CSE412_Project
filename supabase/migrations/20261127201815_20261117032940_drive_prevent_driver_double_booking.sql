-- Prevent a driver from accepting a second trip while an earlier one is active.
create or replace function public.drive_claim_request(p_request_id uuid)
returns uuid
language plpgsql
set search_path = 'public', 'private'
as $$
declare
  v_driver uuid := auth.uid();
  v_request public.ride_requests%rowtype;
  v_ride_id uuid;
  v_capacity smallint;
  v_driver_vehicle text;
  v_location public.driver_locations%rowtype;
  v_distance double precision;
begin
  if v_driver is null then raise exception 'Authentication required'; end if;
  if private.drive_role() <> 'driver'::public.drive_role then raise exception 'Driver role required'; end if;
  if not exists(
    select 1 from public.profiles p
    where p.id=v_driver and p.is_verified=true and p.is_active=true
  ) then raise exception 'Verified active driver required'; end if;

  if exists(
    select 1 from public.rides r
    where r.driver_id=v_driver and r.status in ('matched','driver_arriving','in_progress')
  ) then
    raise exception 'Finish your current trip before accepting another ride';
  end if;

  select * into v_request
  from public.ride_requests
  where id=p_request_id
  for update;

  if not found or v_request.status <> 'requested' then
    raise exception 'Ride request is no longer available';
  end if;

  select da.requested_vehicle_type into v_driver_vehicle
  from public.driver_applications da
  where da.user_id = v_driver and da.status = 'approved';

  if v_driver_vehicle is distinct from v_request.requested_vehicle then
    raise exception 'This request requires an approved driver for the selected vehicle type';
  end if;

  select * into v_location
  from public.driver_locations dl
  where dl.driver_id = v_driver
    and dl.is_available = true
    and dl.updated_at >= now() - interval '45 seconds';

  if not found then
    raise exception 'Go online and allow location access before accepting a ride';
  end if;

  v_distance := 6371.0 * 2 * asin(sqrt(
    power(sin(radians(v_location.latitude - v_request.pickup_lat) / 2), 2)
    + cos(radians(v_request.pickup_lat)) * cos(radians(v_location.latitude))
    * power(sin(radians(v_location.longitude - v_request.pickup_lng) / 2), 2)
  ));

  if v_distance > 20 then
    raise exception 'This ride is outside the 20 km driver pickup radius';
  end if;

  if v_request.women_safety_preference and not exists(
    select 1 from public.profiles p
    where p.id=v_driver and p.is_verified=true and p.is_active=true
  ) then
    raise exception 'This ride requires a verified driver';
  end if;

  v_capacity := case v_request.requested_vehicle
    when 'bike' then 1
    when 'cng' then 3
    else 4
  end;

  if coalesce(v_request.seats_requested,1) > v_capacity then
    raise exception 'Requested passenger seats exceed the selected vehicle capacity';
  end if;

  update public.ride_requests
  set status='matched', updated_at=now()
  where id=p_request_id;

  insert into public.rides(request_id,driver_id,status,seat_capacity)
  values(p_request_id,v_driver,'matched',v_capacity)
  returning id into v_ride_id;

  insert into public.ride_passengers(ride_id,passenger_id,seats,fare_share)
  values(v_ride_id,v_request.passenger_id,coalesce(v_request.seats_requested,1),v_request.estimated_fare);

  update public.driver_locations
  set is_available=false, updated_at=now()
  where driver_id=v_driver;

  return v_ride_id;
end;
$$;
