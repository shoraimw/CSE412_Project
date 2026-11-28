alter table public.rides
  add column if not exists seat_capacity smallint not null default 4
  check (seat_capacity between 1 and 8);

drop policy if exists ride_passengers_driver_add_primary on public.ride_passengers;
create policy ride_passengers_driver_add_primary on public.ride_passengers
for insert to authenticated
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

create or replace function public.drive_claim_request(p_request_id uuid)
returns uuid
language plpgsql
set search_path to 'public', 'private'
as $function$
declare
  v_driver uuid := auth.uid();
  v_request public.ride_requests%rowtype;
  v_ride_id uuid;
  v_capacity smallint;
begin
  if v_driver is null then raise exception 'Authentication required'; end if;
  if private.drive_role() <> 'driver'::public.drive_role then raise exception 'Driver role required'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_driver and p.is_verified=true and p.is_active=true) then
    raise exception 'Verified active driver required';
  end if;
  select * into v_request from public.ride_requests where id=p_request_id for update;
  if not found or v_request.status <> 'requested' then raise exception 'Ride request is no longer available'; end if;
  if v_request.women_safety_preference and not exists(
    select 1 from public.profiles p where p.id=v_driver and p.is_verified=true and p.is_active=true
  ) then raise exception 'This ride requires a verified driver'; end if;
  v_capacity := case v_request.requested_vehicle when 'bike' then 1 when 'cng' then 3 else 4 end;
  if coalesce(v_request.seats_requested,1) > v_capacity then
    raise exception 'Requested passenger seats exceed the selected vehicle capacity';
  end if;
  update public.ride_requests set status='matched',updated_at=now() where id=p_request_id;
  insert into public.rides(request_id,driver_id,status,seat_capacity)
  values(p_request_id,v_driver,'matched',v_capacity) returning id into v_ride_id;
  insert into public.ride_passengers(ride_id,passenger_id,seats,fare_share)
  values(v_ride_id,v_request.passenger_id,coalesce(v_request.seats_requested,1),v_request.estimated_fare);
  return v_ride_id;
end;
$function$;

create or replace function public.drive_list_shared_rides()
returns table(
  ride_id uuid,
  pickup_label text,
  destination_label text,
  vehicle_type text,
  estimated_fare numeric,
  distance_km numeric,
  eta_minutes integer,
  seats_available integer,
  created_at timestamptz
)
language plpgsql
security definer
set search_path to ''
as $function$
begin
  if auth.uid() is null or private.drive_role() <> 'passenger'::public.drive_role then
    raise exception 'Passenger authentication required';
  end if;
  return query
  select r.id,q.pickup_label,q.destination_label,q.requested_vehicle,q.estimated_fare,
         q.estimated_distance_km,q.estimated_duration_minutes,
         greatest(0,r.seat_capacity-coalesce((select sum(rp.seats)::integer from public.ride_passengers rp where rp.ride_id=r.id),0)),
         q.created_at
  from public.rides r
  join public.ride_requests q on q.id=r.request_id
  where q.is_shared=true and q.status='matched'::public.drive_ride_status
    and r.status='matched'::public.drive_ride_status
    and q.passenger_id <> auth.uid()
    and r.seat_capacity > coalesce((select sum(rp.seats)::integer from public.ride_passengers rp where rp.ride_id=r.id),0)
  order by q.created_at desc
  limit 50;
end;
$function$;

create or replace function public.drive_join_shared_ride(p_ride_id uuid)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_user uuid := auth.uid();
  v_ride public.rides%rowtype;
  v_request public.ride_requests%rowtype;
  v_used integer;
  v_remaining integer;
  v_share numeric;
begin
  if v_user is null or private.drive_role() <> 'passenger'::public.drive_role then
    raise exception 'Passenger authentication required';
  end if;
  select * into v_ride from public.rides where id=p_ride_id for update;
  if not found then raise exception 'Shared ride not found'; end if;
  select * into v_request from public.ride_requests where id=v_ride.request_id;
  if not found or v_request.is_shared is distinct from true
     or v_request.status <> 'matched'::public.drive_ride_status
     or v_ride.status <> 'matched'::public.drive_ride_status then
    raise exception 'This shared ride is no longer accepting passengers';
  end if;
  if v_request.passenger_id=v_user then raise exception 'You are already the ride owner'; end if;
  if exists(select 1 from public.ride_passengers where ride_id=p_ride_id and passenger_id=v_user) then
    raise exception 'You have already joined this ride';
  end if;
  select coalesce(sum(seats),0)::integer into v_used from public.ride_passengers where ride_id=p_ride_id;
  v_remaining := v_ride.seat_capacity-v_used;
  if v_remaining <= 0 then raise exception 'This shared ride is full'; end if;
  insert into public.ride_passengers(ride_id,passenger_id,seats,fare_share)
  values(p_ride_id,v_user,1,0);
  v_share := round(v_request.estimated_fare::numeric/(v_used+1),2);
  update public.ride_passengers
    set fare_share=round(v_request.estimated_fare::numeric*seats::numeric/(v_used+1),2)
    where ride_id=p_ride_id;
  return jsonb_build_object(
    'rideId',p_ride_id,
    'passengerFare',v_share,
    'totalFare',v_request.estimated_fare,
    'seatsRemaining',greatest(0,v_remaining-1),
    'currency','BDT',
    'message','You joined the shared ride. Fare shares were recalculated.'
  );
end;
$function$;

revoke all on function public.drive_list_shared_rides() from public, anon;
revoke all on function public.drive_join_shared_ride(uuid) from public, anon;
grant execute on function public.drive_list_shared_rides() to authenticated;
grant execute on function public.drive_join_shared_ride(uuid) to authenticated;
