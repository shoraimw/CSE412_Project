-- Final fare is calculated by the API and committed through a server-only secret.
-- The public wrapper is invoker-security and is executable only by anon; the
-- private SECURITY DEFINER function validates the server secret before writes.

create or replace function private.drive_check_fare_secret(p_secret text)
returns boolean
language sql
security definer
set search_path to ''
as $function$
  select exists(
    select 1
    from private.drive_integration_secrets s
    where s.secret_name='ride_fare_finalization'
      and s.secret_hash=extensions.digest(convert_to(coalesce(p_secret,''),'UTF8'),'sha256')
  );
$function$;

create or replace function private.drive_finalize_ride_fare(
  p_secret text,
  p_driver_id uuid,
  p_ride_id uuid,
  p_actual_fare numeric,
  p_breakdown jsonb
)
returns jsonb
language plpgsql
security definer
set search_path to ''
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
  if not private.drive_check_fare_secret(p_secret) then
    raise exception 'Fare finalization authentication failed';
  end if;
  if p_driver_id is null or p_ride_id is null then
    raise exception 'Driver and ride references are required';
  end if;

  select * into v_ride
  from public.rides
  where id=p_ride_id and driver_id=p_driver_id
  for update;
  if not found then raise exception 'Assigned ride not found'; end if;
  if v_ride.status <> 'completed'::public.drive_ride_status then
    raise exception 'A final fare can only be recorded after trip completion';
  end if;
  if v_ride.actual_fare is not null then
    return jsonb_build_object(
      'rideId',p_ride_id,
      'actualFare',v_ride.actual_fare,
      'breakdown',v_ride.actual_fare_breakdown,
      'alreadyFinalized',true
    );
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
  from public.ride_passengers
  where ride_id=p_ride_id;
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

  return jsonb_build_object(
    'rideId',p_ride_id,
    'actualFare',round(p_actual_fare,2),
    'breakdown',coalesce(p_breakdown,'{}'::jsonb),
    'alreadyFinalized',false
  );
end;
$function$;

create or replace function public.drive_finalize_ride_fare(
  p_secret text,
  p_driver_id uuid,
  p_ride_id uuid,
  p_actual_fare numeric,
  p_breakdown jsonb
)
returns jsonb
language sql
security invoker
set search_path to ''
as $function$
  select private.drive_finalize_ride_fare(
    p_secret,p_driver_id,p_ride_id,p_actual_fare,p_breakdown
  );
$function$;

-- Reuse the existing server-only integration secret hash without exposing its value.
insert into private.drive_integration_secrets(secret_name,secret_hash)
select 'ride_fare_finalization',secret_hash
from private.drive_integration_secrets
where secret_name='sslcommerz'
on conflict (secret_name) do update
set secret_hash=excluded.secret_hash,created_at=now();

-- The old three-argument RPC accepted a caller-supplied fare and is no longer callable.
revoke all on function public.drive_finalize_ride_fare(uuid,numeric,jsonb)
  from public,anon,authenticated;
revoke all on function public.drive_finalize_ride_fare(text,uuid,uuid,numeric,jsonb)
  from public,anon,authenticated;
grant execute on function public.drive_finalize_ride_fare(text,uuid,uuid,numeric,jsonb)
  to anon;

revoke all on function private.drive_check_fare_secret(text)
  from public,anon,authenticated;
revoke all on function private.drive_finalize_ride_fare(text,uuid,uuid,numeric,jsonb)
  from public,anon,authenticated;
grant execute on function private.drive_finalize_ride_fare(text,uuid,uuid,numeric,jsonb)
  to anon;

do $function$
begin
  if not exists(
    select 1 from private.drive_integration_secrets
    where secret_name='ride_fare_finalization'
  ) then
    raise exception 'Server integration secret hash is missing; verify the existing SSLCommerz integration secret';
  end if;
end;
$function$;
