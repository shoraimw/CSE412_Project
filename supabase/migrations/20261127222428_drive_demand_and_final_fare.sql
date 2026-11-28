begin;

-- Counts nearby unassigned requests and fresh online drivers without exposing
-- other users' request or location rows to the passenger.
create or replace function public.drive_demand_snapshot(
  p_lat double precision,
  p_lng double precision,
  p_vehicle_type text,
  p_radius_km double precision default 5
)
returns table(open_requests integer, available_drivers integer)
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null or private.drive_role() <> 'passenger'::public.drive_role then
    raise exception 'Passenger authentication required';
  end if;
  if p_vehicle_type not in ('car','bike','cng')
     or p_lat is null or p_lng is null
     or p_lat not between -90 and 90 or p_lng not between -180 and 180
     or p_radius_km is null or p_radius_km not between 1 and 20 then
    raise exception 'Invalid demand snapshot input';
  end if;

  return query
  select
    (
      select count(*)::integer
      from public.ride_requests q
      where q.status = 'requested'::public.drive_ride_status
        and q.requested_vehicle = p_vehicle_type
        and q.created_at >= now() - interval '15 minutes'
        and q.pickup_lat is not null and q.pickup_lng is not null
        and 6371 * acos(least(1.0,greatest(-1.0,
          sin(radians(p_lat))*sin(radians(q.pickup_lat))
          + cos(radians(p_lat))*cos(radians(q.pickup_lat))*cos(radians(q.pickup_lng-p_lng))
        ))) <= p_radius_km
    ),
    (
      select count(*)::integer
      from public.driver_locations dl
      join public.profiles p on p.id = dl.driver_id
      join public.driver_applications a on a.user_id = dl.driver_id
      where dl.is_available = true
        and dl.updated_at >= now() - interval '45 seconds'
        and p.is_active = true and p.is_verified = true
        and a.status = 'approved'
        and a.requested_vehicle_type = p_vehicle_type
        and 6371 * acos(least(1.0,greatest(-1.0,
          sin(radians(p_lat))*sin(radians(dl.latitude))
          + cos(radians(p_lat))*cos(radians(dl.latitude))*cos(radians(dl.longitude-p_lng))
        ))) <= p_radius_km
    );
end;
$function$;

revoke all on function public.drive_demand_snapshot(double precision,double precision,text,double precision) from public;
grant execute on function public.drive_demand_snapshot(double precision,double precision,text,double precision) to authenticated;

-- Permit a tightly scoped fare-finalization RPC while retaining the existing
-- rule that a driver cannot directly edit ride ownership or fare fields.
create or replace function public.drive_guard_transaction_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_role public.drive_role := private.drive_role();
  v_actor uuid := auth.uid();
  v_jwt_role text := coalesce(auth.role(), '');
  v_fare_write boolean := current_setting('drive.allow_fare_write', true) = 'true';
begin
  if v_jwt_role = 'service_role' or v_role = 'admin'::public.drive_role then
    return new;
  end if;

  if tg_table_name = 'rides' then
    if v_role <> 'driver'::public.drive_role or old.driver_id is distinct from v_actor then
      raise exception 'Only the assigned Driver can update this ride';
    end if;

    if new.request_id is distinct from old.request_id
      or new.driver_id is distinct from old.driver_id
      or new.vehicle_id is distinct from old.vehicle_id
      or (new.actual_fare is distinct from old.actual_fare and not v_fare_write)
      or (new.actual_fare_breakdown is distinct from old.actual_fare_breakdown and not v_fare_write)
      or new.seat_capacity is distinct from old.seat_capacity
      or new.created_at is distinct from old.created_at then
      raise exception 'Drivers cannot change ride ownership, capacity, fare or creation fields';
    end if;

    if new.status is distinct from old.status then
      if not (
        (old.status = 'matched'::public.drive_ride_status and new.status in ('driver_arriving'::public.drive_ride_status,'cancelled'::public.drive_ride_status))
        or (old.status = 'driver_arriving'::public.drive_ride_status and new.status in ('in_progress'::public.drive_ride_status,'cancelled'::public.drive_ride_status))
        or (old.status = 'in_progress'::public.drive_ride_status and new.status = 'completed'::public.drive_ride_status)
      ) then
        raise exception 'Invalid ride status transition from % to %',old.status,new.status;
      end if;

      if new.status = 'driver_arriving'::public.drive_ride_status then
        new.accepted_at := coalesce(old.accepted_at,now());
      else
        new.accepted_at := old.accepted_at;
      end if;
      if new.status = 'in_progress'::public.drive_ride_status then
        new.started_at := coalesce(old.started_at,now());
      else
        new.started_at := old.started_at;
      end if;
      if new.status = 'completed'::public.drive_ride_status then
        new.completed_at := coalesce(old.completed_at,now());
      else
        new.completed_at := old.completed_at;
      end if;
    else
      if new.accepted_at is distinct from old.accepted_at
        or new.started_at is distinct from old.started_at
        or new.completed_at is distinct from old.completed_at then
        raise exception 'Ride lifecycle timestamps are managed by DRIVE';
      end if;
    end if;
    return new;
  end if;

  if tg_table_name = 'rental_bookings' then
    if v_role <> 'vehicle_owner'::public.drive_role
      or not exists (
        select 1 from public.vehicles v
        where v.id=old.vehicle_id and v.owner_id=v_actor
      ) then
      raise exception 'Only the owning Vehicle Owner can update this rental booking';
    end if;

    if new.vehicle_id is distinct from old.vehicle_id
      or new.renter_id is distinct from old.renter_id
      or new.start_at is distinct from old.start_at
      or new.end_at is distinct from old.end_at
      or new.total_amount is distinct from old.total_amount
      or new.currency is distinct from old.currency
      or new.created_at is distinct from old.created_at then
      raise exception 'Vehicle Owners cannot change rental ownership, dates or pricing';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'pending'::public.drive_rental_status and new.status in ('approved'::public.drive_rental_status,'rejected'::public.drive_rental_status,'cancelled'::public.drive_rental_status))
      or (old.status = 'approved'::public.drive_rental_status and new.status in ('active'::public.drive_rental_status,'cancelled'::public.drive_rental_status))
      or (old.status = 'active'::public.drive_rental_status and new.status in ('completed'::public.drive_rental_status,'cancelled'::public.drive_rental_status))
    ) then
      raise exception 'Invalid rental status transition from % to %',old.status,new.status;
    end if;
    return new;
  end if;
  return new;
end;
$function$;

-- Driver-only, idempotent final fare update after completion. The fare split is
-- recalculated across all passenger seats and rounding remainder is assigned
-- to the final passenger so the shares sum exactly to the final fare.
create or replace function public.drive_finalize_ride_fare(
  p_ride_id uuid,
  p_actual_fare numeric,
  p_breakdown jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_ride public.rides%rowtype;
  v_total_seats integer;
  v_passenger_count integer;
  v_index integer := 0;
  v_assigned numeric := 0;
  v_share numeric;
  v_item record;
begin
  if auth.uid() is null or private.drive_role() <> 'driver'::public.drive_role then
    raise exception 'Driver authentication required';
  end if;
  select * into v_ride
  from public.rides
  where id=p_ride_id and driver_id=auth.uid()
  for update;
  if not found then raise exception 'Assigned ride not found'; end if;
  if v_ride.status <> 'completed'::public.drive_ride_status then
    raise exception 'A final fare can only be recorded after trip completion';
  end if;
  if v_ride.actual_fare is not null then
    return jsonb_build_object('rideId',p_ride_id,'actualFare',v_ride.actual_fare,'breakdown',v_ride.actual_fare_breakdown,'alreadyFinalized',true);
  end if;
  if p_actual_fare is null or p_actual_fare < 1 or p_actual_fare > 100000 then
    raise exception 'Final fare is outside the permitted range';
  end if;

  perform set_config('drive.allow_fare_write','true',true);
  update public.rides
  set actual_fare=round(p_actual_fare,2),
      actual_fare_breakdown=coalesce(p_breakdown,'{}'::jsonb),
      updated_at=now()
  where id=p_ride_id;

  select coalesce(sum(seats),0)::integer,count(*)::integer
    into v_total_seats,v_passenger_count
  from public.ride_passengers where ride_id=p_ride_id;
  if v_total_seats < 1 or v_passenger_count < 1 then
    raise exception 'Ride has no passenger fare shares';
  end if;

  for v_item in
    select passenger_id,seats
    from public.ride_passengers
    where ride_id=p_ride_id
    order by created_at,passenger_id
  loop
    v_index:=v_index+1;
    if v_index=v_passenger_count then
      v_share:=round(p_actual_fare,2)-v_assigned;
    else
      v_share:=round(p_actual_fare*v_item.seats::numeric/v_total_seats,2);
      v_assigned:=v_assigned+v_share;
    end if;
    update public.ride_passengers
      set fare_share=v_share
      where ride_id=p_ride_id and passenger_id=v_item.passenger_id;
  end loop;

  return jsonb_build_object('rideId',p_ride_id,'actualFare',round(p_actual_fare,2),'breakdown',coalesce(p_breakdown,'{}'::jsonb),'alreadyFinalized',false);
end;
$function$;

revoke all on function public.drive_finalize_ride_fare(uuid,numeric,jsonb) from public;
grant execute on function public.drive_finalize_ride_fare(uuid,numeric,jsonb) to authenticated;

commit;