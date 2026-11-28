-- Improve DRIVE driver dispatch and notification delivery.
-- Only active, verified, approved drivers with a fresh online GPS heartbeat
-- and within the pickup radius receive ride alerts. Drivers who go online
-- after a request was created receive a deduplicated catch-up alert.

alter table public.notifications
  add column if not exists entity_id uuid;

create unique index if not exists notifications_user_type_entity_uidx
  on public.notifications (user_id, type, entity_id)
  where entity_id is not null;

create index if not exists ride_requests_open_vehicle_created_idx
  on public.ride_requests (status, requested_vehicle, created_at);

create or replace function private.drive_nearby_ride_requests(
  p_radius_km double precision default 20
)
returns setof public.ride_requests
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_driver uuid := auth.uid();
  v_location public.driver_locations%rowtype;
  v_vehicle text;
  v_radius double precision := greatest(1, least(coalesce(p_radius_km, 20), 20));
begin
  if v_driver is null then
    raise exception 'Authentication required';
  end if;

  if private.drive_role() <> 'driver'::public.drive_role then
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
    into v_vehicle
    from public.driver_applications da
   where da.user_id = v_driver
     and da.status = 'approved';

  if v_vehicle is null then
    raise exception 'Approved driver application required';
  end if;

  select dl.*
    into v_location
    from public.driver_locations dl
   where dl.driver_id = v_driver
     and dl.is_available = true
     and dl.updated_at >= now() - interval '2 minutes';

  if not found then
    return;
  end if;

  return query
  select q.*
    from public.ride_requests q
    cross join lateral (
      select 6371.0 * 2 * asin(sqrt(least(1.0, greatest(0.0,
        power(sin(radians(v_location.latitude - q.pickup_lat) / 2), 2)
        + cos(radians(q.pickup_lat)) * cos(radians(v_location.latitude))
        * power(sin(radians(v_location.longitude - q.pickup_lng) / 2), 2)
      )))) as distance_km
    ) distance
   where q.status = 'requested'::public.drive_ride_status
     and q.requested_vehicle = v_vehicle
     and distance.distance_km <= v_radius
   order by distance.distance_km asc, q.created_at asc
   limit 50;
end;
$$;

revoke all on function private.drive_nearby_ride_requests(double precision) from public, anon;
grant usage on schema private to authenticated;
grant execute on function private.drive_nearby_ride_requests(double precision) to authenticated;

create or replace function public.drive_nearby_ride_requests(
  p_radius_km double precision default 20
)
returns setof public.ride_requests
language sql
security invoker
set search_path = ''
as $$
  select * from private.drive_nearby_ride_requests($1);
$$;

revoke all on function public.drive_nearby_ride_requests(double precision) from public, anon;
grant execute on function public.drive_nearby_ride_requests(double precision) to authenticated;

create or replace function private.drive_notify_open_requests_to_driver()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_driver uuid := auth.uid();
  v_location public.driver_locations%rowtype;
  v_vehicle text;
  v_inserted integer := 0;
begin
  if v_driver is null then
    raise exception 'Authentication required';
  end if;

  if private.drive_role() <> 'driver'::public.drive_role then
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
    into v_vehicle
    from public.driver_applications da
   where da.user_id = v_driver
     and da.status = 'approved';

  if v_vehicle is null then
    raise exception 'Approved driver application required';
  end if;

  select dl.*
    into v_location
    from public.driver_locations dl
   where dl.driver_id = v_driver
     and dl.is_available = true
     and dl.updated_at >= now() - interval '2 minutes';

  if not found then
    return 0;
  end if;

  insert into public.notifications (user_id, title, body, type, entity_id)
  select
    v_driver,
    'Nearby ride request',
    'New ' || upper(q.requested_vehicle) || ' request: '
      || q.pickup_label || ' → ' || q.destination_label
      || '. Estimated fare ৳' || coalesce(q.estimated_fare, 0)::text
      || '. Open your Driver workspace to review and accept.',
    'ride_request',
    q.id
  from public.ride_requests q
  where q.status = 'requested'::public.drive_ride_status
    and q.requested_vehicle = v_vehicle
    and 6371.0 * 2 * asin(sqrt(least(1.0, greatest(0.0,
      power(sin(radians(v_location.latitude - q.pickup_lat) / 2), 2)
      + cos(radians(q.pickup_lat)) * cos(radians(v_location.latitude))
      * power(sin(radians(v_location.longitude - q.pickup_lng) / 2), 2)
    )))) <= 20
  on conflict (user_id, type, entity_id) where entity_id is not null
  do nothing;

  get diagnostics v_inserted = row_count;
  return v_inserted;
end;
$$;

revoke all on function private.drive_notify_open_requests_to_driver() from public, anon;
grant execute on function private.drive_notify_open_requests_to_driver() to authenticated;

create or replace function public.drive_notify_open_requests_to_driver()
returns integer
language sql
security invoker
set search_path = ''
as $$
  select private.drive_notify_open_requests_to_driver();
$$;

revoke all on function public.drive_notify_open_requests_to_driver() from public, anon;
grant execute on function public.drive_notify_open_requests_to_driver() to authenticated;

-- Persist a driver alert only for an online, fresh, eligible driver within 20 km.
create or replace function public.drive_notify_admins()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id, title, body, type, entity_id)
  select
    p.id,
    'DRIVE activity',
    'A new ride request was submitted.',
    'ride_request',
    new.id
  from public.profiles p
  where p.role = 'admin'::public.drive_role
    and p.is_active = true
  on conflict (user_id, type, entity_id) where entity_id is not null
  do nothing;

  insert into public.notifications (user_id, title, body, type, entity_id)
  select
    p.id,
    'New nearby ride request',
    'New ' || upper(new.requested_vehicle) || ' request: '
      || new.pickup_label || ' → ' || new.destination_label
      || '. Estimated fare ৳' || coalesce(new.estimated_fare, 0)::text
      || '. Open your Driver workspace to review and accept.',
    'ride_request',
    new.id
  from public.profiles p
  join public.driver_applications da
    on da.user_id = p.id
   and da.status = 'approved'
   and da.requested_vehicle_type = new.requested_vehicle
  join public.driver_locations dl
    on dl.driver_id = p.id
   and dl.is_available = true
   and dl.updated_at >= now() - interval '2 minutes'
  where p.role = 'driver'::public.drive_role
    and p.is_verified = true
    and p.is_active = true
    and 6371.0 * 2 * asin(sqrt(least(1.0, greatest(0.0,
      power(sin(radians(dl.latitude - new.pickup_lat) / 2), 2)
      + cos(radians(new.pickup_lat)) * cos(radians(dl.latitude))
      * power(sin(radians(dl.longitude - new.pickup_lng) / 2), 2)
    )))) <= 20
  on conflict (user_id, type, entity_id) where entity_id is not null
  do nothing;

  return new;
end;
$$;

revoke all on function public.drive_notify_admins() from public, anon, authenticated;
