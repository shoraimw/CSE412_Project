-- Live driver availability and nearby-driver discovery for DRIVE.
create table if not exists public.driver_locations (
  driver_id uuid primary key references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  heading real,
  speed_kph real,
  is_available boolean not null default false,
  updated_at timestamptz not null default now()
);

alter table public.driver_locations enable row level security;
grant select, insert, update on public.driver_locations to authenticated;

drop policy if exists driver_locations_driver_select on public.driver_locations;
create policy driver_locations_driver_select on public.driver_locations
for select to authenticated
using (
  driver_id = (select auth.uid())
  and (select private.drive_role()) = 'driver'::public.drive_role
);

drop policy if exists driver_locations_driver_insert on public.driver_locations;
create policy driver_locations_driver_insert on public.driver_locations
for insert to authenticated
with check (
  driver_id = (select auth.uid())
  and (select private.drive_role()) = 'driver'::public.drive_role
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_verified = true and p.is_active = true
  )
);

drop policy if exists driver_locations_driver_update on public.driver_locations;
create policy driver_locations_driver_update on public.driver_locations
for update to authenticated
using (
  driver_id = (select auth.uid())
  and (select private.drive_role()) = 'driver'::public.drive_role
)
with check (
  driver_id = (select auth.uid())
  and (select private.drive_role()) = 'driver'::public.drive_role
  and exists (
    select 1 from public.profiles p
    where p.id = (select auth.uid()) and p.is_verified = true and p.is_active = true
  )
);

create index if not exists driver_locations_available_updated_idx
  on public.driver_locations (is_available, updated_at desc);

-- Private SECURITY DEFINER helper. It returns only limited, ride-discovery
-- fields and only to authenticated passenger accounts.
create or replace function private.drive_nearby_drivers(
  p_lat double precision,
  p_lng double precision,
  p_vehicle_type text default null,
  p_radius_km double precision default 15
)
returns table (
  driver_id uuid,
  display_name text,
  vehicle_type text,
  latitude double precision,
  longitude double precision,
  heading real,
  speed_kph real,
  distance_km numeric,
  updated_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required';
  end if;
  if private.drive_role() <> 'passenger'::public.drive_role then
    raise exception 'Passenger role required';
  end if;
  if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then
    raise exception 'A valid pickup location is required';
  end if;

  return query
  select
    dl.driver_id,
    p.full_name,
    da.requested_vehicle_type,
    dl.latitude,
    dl.longitude,
    dl.heading,
    dl.speed_kph,
    round((
      6371.0 * 2 * asin(sqrt(
        power(sin(radians(dl.latitude - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(dl.latitude))
        * power(sin(radians(dl.longitude - p_lng) / 2), 2)
      ))
    )::numeric, 2) as distance_km,
    dl.updated_at
  from public.driver_locations dl
  join public.profiles p on p.id = dl.driver_id
  join public.driver_applications da on da.user_id = dl.driver_id and da.status = 'approved'
  where p.role = 'driver'::public.drive_role
    and p.is_verified = true
    and p.is_active = true
    and dl.is_available = true
    and dl.updated_at >= now() - interval '45 seconds'
    and (p_vehicle_type is null or da.requested_vehicle_type = p_vehicle_type)
    and (
      6371.0 * 2 * asin(sqrt(
        power(sin(radians(dl.latitude - p_lat) / 2), 2)
        + cos(radians(p_lat)) * cos(radians(dl.latitude))
        * power(sin(radians(dl.longitude - p_lng) / 2), 2)
      ))
    ) <= greatest(1, least(coalesce(p_radius_km, 15), 25))
  order by distance_km asc
  limit 30;
end;
$$;

revoke all on function private.drive_nearby_drivers(double precision,double precision,text,double precision) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.drive_nearby_drivers(double precision,double precision,text,double precision) to authenticated;

create or replace function public.drive_nearby_drivers(
  p_lat double precision,
  p_lng double precision,
  p_vehicle_type text default null,
  p_radius_km double precision default 15
)
returns table (
  driver_id uuid,
  display_name text,
  vehicle_type text,
  latitude double precision,
  longitude double precision,
  heading real,
  speed_kph real,
  distance_km numeric,
  updated_at timestamptz
)
language sql
security invoker
set search_path = ''
as $$
  select * from private.drive_nearby_drivers($1,$2,$3,$4);
$$;

revoke all on function public.drive_nearby_drivers(double precision,double precision,text,double precision) from public, anon;
grant execute on function public.drive_nearby_drivers(double precision,double precision,text,double precision) to authenticated;

-- Persist an in-app ride request notification for every active, verified,
-- approved driver qualified for the requested vehicle type.
create or replace function public.drive_notify_admins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications(user_id,title,body,type)
  select p.id, 'DRIVE activity', 'A new ride request was submitted.', 'ride_request'
  from public.profiles p
  where p.role = 'admin'::public.drive_role and p.is_active = true;

  insert into public.notifications(user_id,title,body,type)
  select
    p.id,
    'New ride request',
    'New ' || upper(new.requested_vehicle) || ' request: ' ||
      new.pickup_label || ' → ' || new.destination_label ||
      '. Estimated fare ৳' || coalesce(new.estimated_fare, 0)::text ||
      '. Open your Driver workspace to check distance and accept.',
    'ride_request'
  from public.profiles p
  join public.driver_applications da
    on da.user_id = p.id
   and da.status = 'approved'
   and da.requested_vehicle_type = new.requested_vehicle
  where p.role = 'driver'::public.drive_role
    and p.is_verified = true
    and p.is_active = true;

  return new;
end;
$$;

-- A driver must be online, have a fresh GPS heartbeat, and be within 20 km
-- of pickup before claiming. The existing row lock still makes first valid
-- acceptance win atomically.
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
