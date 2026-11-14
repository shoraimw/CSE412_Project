-- Atomic shared-ride discovery and seat/fare allocation.
-- Only the verified driver claim workflow may seed the first passenger row.
drop policy if exists ride_passengers_insert_allowed on public.ride_passengers;
create policy ride_passengers_insert_driver_claim
on public.ride_passengers for insert to authenticated
with check (
  exists (
    select 1
    from public.rides r
    join public.ride_requests q on q.id = r.request_id
    where r.id = ride_passengers.ride_id
      and r.driver_id = (select auth.uid())
      and q.passenger_id = ride_passengers.passenger_id
  )
);

create or replace function public.drive_list_shared_rides()
returns table (
  ride_id uuid,
  request_id uuid,
  pickup_label text,
  destination_label text,
  requested_vehicle text,
  estimated_distance_km numeric,
  estimated_duration_minutes integer,
  estimated_fare numeric,
  currency text,
  seat_capacity smallint,
  occupied_seats integer,
  available_seats integer,
  ride_status text
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null
     or private.drive_role() <> 'passenger'::public.drive_role
     or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active) then
    raise exception 'Active passenger account required' using errcode = '42501';
  end if;

  return query
  select r.id, q.id, q.pickup_label, q.destination_label, q.requested_vehicle,
         q.estimated_distance_km, q.estimated_duration_minutes, q.estimated_fare,
         q.currency::text, r.seat_capacity,
         coalesce(used.seats, 0)::integer,
         greatest(r.seat_capacity - coalesce(used.seats, 0), 0)::integer,
         r.status::text
  from public.rides r
  join public.ride_requests q on q.id = r.request_id
  left join lateral (
    select sum(rp.seats)::integer as seats
    from public.ride_passengers rp
    where rp.ride_id = r.id
  ) used on true
  where q.is_shared = true
    and q.status = 'matched'::public.drive_ride_status
    and r.status in ('matched'::public.drive_ride_status, 'driver_arriving'::public.drive_ride_status)
    and r.driver_id is not null
    and coalesce(used.seats, 0) < r.seat_capacity
    and not exists (
      select 1 from public.ride_passengers mine
      where mine.ride_id = r.id and mine.passenger_id = auth.uid()
    )
  order by r.created_at desc;
end;
$$;

create or replace function public.drive_my_shared_rides()
returns table (
  ride_id uuid,
  request_id uuid,
  pickup_label text,
  destination_label text,
  requested_vehicle text,
  estimated_distance_km numeric,
  estimated_duration_minutes integer,
  estimated_fare numeric,
  currency text,
  seat_capacity smallint,
  my_seats smallint,
  my_fare_share numeric,
  ride_status text,
  driver_id uuid
)
language plpgsql
security definer
set search_path = public, private
as $$
begin
  if auth.uid() is null
     or private.drive_role() <> 'passenger'::public.drive_role
     or not exists (select 1 from public.profiles p where p.id = auth.uid() and p.is_active) then
    raise exception 'Active passenger account required' using errcode = '42501';
  end if;

  return query
  select r.id, q.id, q.pickup_label, q.destination_label, q.requested_vehicle,
         q.estimated_distance_km, q.estimated_duration_minutes, q.estimated_fare,
         q.currency::text, r.seat_capacity, mine.seats, mine.fare_share,
         r.status::text, r.driver_id
  from public.ride_passengers mine
  join public.rides r on r.id = mine.ride_id
  join public.ride_requests q on q.id = r.request_id
  where mine.passenger_id = auth.uid()
    and q.passenger_id <> auth.uid()
  order by r.created_at desc;
end;
$$;

create or replace function public.drive_join_shared_ride(
  p_ride_id uuid,
  p_seats smallint default 1
)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_ride record;
  v_used integer;
  v_total integer;
  v_fare numeric;
  v_share numeric;
begin
  if v_user is null
     or private.drive_role() <> 'passenger'::public.drive_role
     or not exists (select 1 from public.profiles p where p.id = v_user and p.is_active) then
    raise exception 'Active passenger account required' using errcode = '42501';
  end if;
  if p_seats is null or p_seats < 1 or p_seats > 8 then
    raise exception 'Seats must be between 1 and 8';
  end if;

  select r.id, r.status as ride_status, r.driver_id, r.seat_capacity,
         q.id as request_id, q.passenger_id as owner_passenger_id,
         q.is_shared, q.status as request_status, q.estimated_fare
    into v_ride
  from public.rides r
  join public.ride_requests q on q.id = r.request_id
  where r.id = p_ride_id
  for update of r;

  if not found then raise exception 'Shared ride not found'; end if;
  if not v_ride.is_shared
     or v_ride.request_status <> 'matched'::public.drive_ride_status
     or v_ride.ride_status not in ('matched'::public.drive_ride_status, 'driver_arriving'::public.drive_ride_status) then
    raise exception 'This shared ride is no longer accepting passengers';
  end if;
  if v_ride.driver_id = v_user or v_ride.owner_passenger_id = v_user then
    raise exception 'You are already part of this ride';
  end if;

  select coalesce(sum(seats), 0)::integer into v_used
  from public.ride_passengers
  where ride_id = p_ride_id;

  if v_used + p_seats > v_ride.seat_capacity then
    raise exception 'Not enough seats remain for this ride';
  end if;

  if exists (
    select 1 from public.ride_passengers
    where ride_id = p_ride_id and passenger_id = v_user
  ) then
    raise exception 'You have already joined this ride';
  end if;

  v_total := v_used + p_seats;
  v_fare := coalesce(v_ride.estimated_fare, 0);

  insert into public.ride_passengers(ride_id, passenger_id, seats, fare_share)
  values (p_ride_id, v_user, p_seats, round(v_fare * p_seats / v_total, 2));

  update public.ride_passengers
     set fare_share = round(v_fare * seats / v_total, 2)
   where ride_id = p_ride_id;

  select fare_share into v_share
  from public.ride_passengers
  where ride_id = p_ride_id and passenger_id = v_user;

  return jsonb_build_object(
    'ride_id', p_ride_id,
    'seats', p_seats,
    'occupied_seats', v_total,
    'available_seats', v_ride.seat_capacity - v_total,
    'fare_share', v_share,
    'currency', 'BDT'
  );
end;
$$;

create or replace function public.drive_leave_shared_ride(p_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_ride record;
  v_fare numeric;
  v_total integer;
begin
  if v_user is null or private.drive_role() <> 'passenger'::public.drive_role then
    raise exception 'Passenger account required' using errcode = '42501';
  end if;

  select r.status as ride_status, q.passenger_id as owner_passenger_id,
         q.estimated_fare
    into v_ride
  from public.rides r
  join public.ride_requests q on q.id = r.request_id
  where r.id = p_ride_id
  for update of r;

  if not found then raise exception 'Ride not found'; end if;
  if v_ride.ride_status not in ('matched'::public.drive_ride_status, 'driver_arriving'::public.drive_ride_status) then
    raise exception 'You cannot leave after the trip has started';
  end if;
  if v_ride.owner_passenger_id = v_user then
    raise exception 'The passenger who created the ride request cannot leave the shared ride';
  end if;

  delete from public.ride_passengers
  where ride_id = p_ride_id and passenger_id = v_user;
  if not found then raise exception 'You are not a passenger on this ride'; end if;

  select coalesce(sum(seats), 0)::integer into v_total
  from public.ride_passengers where ride_id = p_ride_id;
  v_fare := coalesce(v_ride.estimated_fare, 0);

  if v_total > 0 then
    update public.ride_passengers
       set fare_share = round(v_fare * seats / v_total, 2)
     where ride_id = p_ride_id;
  end if;

  return jsonb_build_object('ride_id', p_ride_id, 'left', true, 'occupied_seats', v_total);
end;
$$;

revoke all on function public.drive_list_shared_rides() from public, anon;
revoke all on function public.drive_my_shared_rides() from public, anon;
revoke all on function public.drive_join_shared_ride(uuid, smallint) from public, anon;
revoke all on function public.drive_leave_shared_ride(uuid) from public, anon;
grant execute on function public.drive_list_shared_rides() to authenticated;
grant execute on function public.drive_my_shared_rides() to authenticated;
grant execute on function public.drive_join_shared_ride(uuid, smallint) to authenticated;
grant execute on function public.drive_leave_shared_ride(uuid) to authenticated;
