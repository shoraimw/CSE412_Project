begin;

create or replace function public.drive_request_ride_cancellation(
  p_ride_id uuid,
  p_reason text,
  p_emergency boolean default false,
  p_lat double precision default null,
  p_lng double precision default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.drive_role := private.drive_role();
  v_ride public.rides%rowtype;
  v_request public.ride_requests%rowtype;
  v_cancel_id uuid;
begin
  if v_actor is null then
    raise exception 'Authentication required';
  end if;
  if v_role not in ('passenger'::public.drive_role,'vehicle_owner'::public.drive_role) then
    raise exception 'Customer account required';
  end if;
  if length(trim(coalesce(p_reason,''))) < 8 or length(trim(p_reason)) > 500 then
    raise exception 'A cancellation reason between 8 and 500 characters is required';
  end if;
  if (p_lat is null) <> (p_lng is null)
    or (p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180)) then
    raise exception 'A valid pair of GPS coordinates is required';
  end if;

  select * into v_ride
  from public.rides
  where id=p_ride_id
  for update;
  if not found then
    raise exception 'Ride not found';
  end if;

  select * into v_request
  from public.ride_requests
  where id=v_ride.request_id
  for update;
  if not found then
    raise exception 'Ride request not found';
  end if;

  if not exists (
    select 1
    from public.ride_passengers rp
    where rp.ride_id=v_ride.id and rp.passenger_id=v_actor
  ) then
    raise exception 'Only a passenger on this ride can request cancellation';
  end if;

  if v_ride.status not in (
    'matched'::public.drive_ride_status,
    'driver_arriving'::public.drive_ride_status,
    'in_progress'::public.drive_ride_status
  ) then
    raise exception 'This ride is no longer active';
  end if;

  if p_emergency then
    insert into public.ride_cancellation_requests(
      ride_id,requester_id,requester_role,reason,status,reviewed_at
    ) values(v_ride.id,v_actor,v_role,trim(p_reason),'emergency',now())
    returning id into v_cancel_id;

    perform set_config('drive.allow_cancel','true',true);

    update public.rides
    set status='cancelled'::public.drive_ride_status,updated_at=now()
    where id=v_ride.id;

    update public.ride_requests
    set status='cancelled'::public.drive_ride_status,
        cancelled_at=now(),
        cancellation_fee=0,
        updated_at=now()
    where id=v_request.id;

    insert into public.safety_alerts(
      user_id,ride_id,alert_type,message,latitude,longitude,status
    ) values(
      v_actor,v_ride.id,'ride_emergency_cancel',trim(p_reason),p_lat,p_lng,'open'
    );

    insert into public.notifications(user_id,title,body,type,entity_id)
    values(
      v_ride.driver_id,
      'Emergency ride cancellation',
      'The passenger triggered an emergency cancellation. Reason: '||trim(p_reason),
      'ride_emergency_cancel',
      v_ride.id
    );

    insert into public.notifications(user_id,title,body,type,entity_id)
    select p.id,
      'DRIVE emergency ride cancellation',
      'An emergency cancellation was triggered. Review the ride activity and safety alert.',
      'ride_emergency_cancel',
      v_ride.id
    from public.profiles p
    where p.role='admin'::public.drive_role and p.is_active=true;

    return jsonb_build_object(
      'id',v_cancel_id,
      'rideId',v_ride.id,
      'status','cancelled',
      'emergency',true,
      'message','Emergency cancellation recorded. The driver and DRIVE administrators have been notified.'
    );
  end if;

  insert into public.ride_cancellation_requests(
    ride_id,requester_id,requester_role,reason,status
  ) values(v_ride.id,v_actor,v_role,trim(p_reason),'pending')
  returning id into v_cancel_id;

  insert into public.notifications(user_id,title,body,type,entity_id)
  values(
    v_ride.driver_id,
    'Passenger requested cancellation',
    'The passenger asked to cancel this ride. Review the reason and respond: '||trim(p_reason),
    'ride_cancellation_request',
    v_cancel_id
  );

  insert into public.notifications(user_id,title,body,type,entity_id)
  select p.id,
    'Ride cancellation requested',
    'A passenger requested cancellation. Review the ride activity.',
    'ride_cancellation_request',
    v_cancel_id
  from public.profiles p
  where p.role='admin'::public.drive_role and p.is_active=true;

  return jsonb_build_object(
    'id',v_cancel_id,
    'rideId',v_ride.id,
    'status','pending',
    'message','Cancellation request sent to the assigned driver for confirmation.'
  );
end;
$$;

create or replace function public.drive_driver_cancel_ride(
  p_ride_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.drive_role := private.drive_role();
  v_ride public.rides%rowtype;
  v_request public.ride_requests%rowtype;
  v_cancel_id uuid;
  v_previous_status public.drive_ride_status;
begin
  if v_actor is null or v_role <> 'driver'::public.drive_role then
    raise exception 'Driver access required';
  end if;
  if length(trim(coalesce(p_reason,''))) < 8 or length(trim(p_reason)) > 500 then
    raise exception 'A cancellation reason between 8 and 500 characters is required';
  end if;

  select * into v_ride
  from public.rides
  where id=p_ride_id
  for update;
  if not found or v_ride.driver_id<>v_actor then
    raise exception 'Assigned ride not found';
  end if;
  if v_ride.status not in (
    'matched'::public.drive_ride_status,
    'driver_arriving'::public.drive_ride_status
  ) then
    raise exception 'Only an accepted ride that has not started can be cancelled by its assigned driver';
  end if;

  select * into v_request
  from public.ride_requests
  where id=v_ride.request_id
  for update;
  if not found then
    raise exception 'Ride request not found';
  end if;

  v_previous_status:=v_ride.status;

  insert into public.ride_cancellation_requests(
    ride_id,requester_id,requester_role,reason,status,reviewed_at
  ) values(
    v_ride.id,v_actor,v_role,trim(p_reason),'driver_cancelled',now()
  )
  returning id into v_cancel_id;

  perform set_config('drive.allow_cancel','true',true);

  update public.rides
  set status='cancelled'::public.drive_ride_status,updated_at=now()
  where id=v_ride.id;

  update public.ride_requests
  set status='cancelled'::public.drive_ride_status,
      cancelled_at=now(),
      cancellation_fee=0,
      updated_at=now()
  where id=v_request.id;

  update public.driver_locations
  set is_available=true,updated_at=now()
  where driver_id=v_actor;

  insert into public.notifications(user_id,title,body,type,entity_id)
  select p.id,
    'Driver ended an active ride',
    'A driver ended an active ride. Previous status: '||v_previous_status::text||
      '. Reason: '||trim(p_reason),
    'ride_cancelled',
    v_ride.id
  from public.profiles p
  where p.role='admin'::public.drive_role and p.is_active=true;

  return jsonb_build_object(
    'id',v_cancel_id,
    'rideId',v_ride.id,
    'requestId',v_request.id,
    'status','cancelled',
    'previousStatus',v_previous_status::text,
    'message',case
      when v_previous_status='in_progress'::public.drive_ride_status
        then 'Trip ended. The customer and DRIVE administrators have been notified.'
      else 'Ride cancelled. The customer and DRIVE administrators have been notified.'
    end
  );
end;
$$;

revoke all on function public.drive_request_ride_cancellation(uuid,text,boolean,double precision,double precision) from public,anon;
revoke all on function public.drive_driver_cancel_ride(uuid,text) from public,anon;
grant execute on function public.drive_request_ride_cancellation(uuid,text,boolean,double precision,double precision) to authenticated;
grant execute on function public.drive_driver_cancel_ride(uuid,text) to authenticated;

commit;
