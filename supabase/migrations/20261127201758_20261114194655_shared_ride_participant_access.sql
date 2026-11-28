-- Restrict direct passenger-row insertion and expose participant-safe shared-ride history.
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
         q.estimated_fare, q.estimated_distance_km, q.estimated_duration_minutes,
         q.currency::text, r.status::text, mine.seats, mine.fare_share, r.driver_id
  from public.ride_passengers mine
  join public.rides r on r.id = mine.ride_id
  join public.ride_requests q on q.id = r.request_id
  where mine.passenger_id = auth.uid()
    and q.passenger_id <> auth.uid()
  order by r.created_at desc;
end;
$$;

create or replace function public.drive_leave_shared_ride_v2(p_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_user uuid := auth.uid();
  v_ride record;
  v_total integer;
  v_fare numeric;
begin
  if v_user is null or private.drive_role() <> 'passenger'::public.drive_role then
    raise exception 'Passenger account required' using errcode = '42501';
  end if;

  select r.status as ride_status, q.passenger_id as owner_passenger_id, q.estimated_fare
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
    raise exception 'The passenger who created the ride cannot leave the shared ride';
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

revoke all on function public.drive_my_shared_rides_v2() from public, anon;
revoke all on function public.drive_leave_shared_ride_v2(uuid) from public, anon;
grant execute on function public.drive_my_shared_rides_v2() to authenticated;
grant execute on function public.drive_leave_shared_ride_v2(uuid) to authenticated;
