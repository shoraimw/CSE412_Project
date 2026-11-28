begin;

-- Keep cancellation notifications single-source. The trigger delivers one
-- notification to every passenger; the workflow functions notify the driver
-- and administrators separately.
create or replace function public.drive_notify_ride_passenger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_title text;
  v_body text;
  v_type text;
  v_reason text;
begin
  if new.status is distinct from old.status then
    if new.status='completed'::public.drive_ride_status then
      v_title:='Destination reached';
      v_body:='Your DRIVE journey has been completed. You can now leave feedback for your driver.';
      v_type:='ride_completed';
    elsif new.status='cancelled'::public.drive_ride_status then
      v_title:='Ride cancelled';
      v_type:='ride_cancelled';

      select nullif(trim(c.reason),'') into v_reason
      from public.ride_cancellation_requests c
      where c.ride_id=new.id
        and c.status in ('approved','emergency','driver_cancelled')
      order by c.created_at desc
      limit 1;

      if v_reason is null then
        select nullif(trim(a.details->>'reason'),'') into v_reason
        from public.admin_audit_logs a
        where a.entity_type='ride_request'
          and a.entity_id=new.request_id
          and a.action='ride.cancelled'
        order by a.created_at desc
        limit 1;
      end if;

      v_body:='Your ride has been cancelled. Open DRIVE to review the latest activity.';
      if v_reason is not null then
        v_body:=v_body||' Reason: '||v_reason;
      end if;
    else
      v_title:='Ride status update';
      v_body:='Your ride status is now '||new.status::text||'.';
      v_type:='ride_status';
    end if;

    insert into public.notifications(user_id,title,body,type,entity_id)
    select distinct rp.passenger_id,v_title,v_body,v_type,new.id
    from public.ride_passengers rp
    where rp.ride_id=new.id;

    if new.status='completed'::public.drive_ride_status then
      insert into public.notifications(user_id,title,body,type,entity_id)
      values(new.driver_id,'Destination reached',
        'You completed the DRIVE journey. Thank you for driving with DRIVE.',
        'ride_completed',new.id);
    end if;
  end if;
  return new;
end;
$$;

-- A passenger/vehicle owner may request a cancellation for driver approval.
-- An emergency cancels immediately, records an SOS alert, and lets the
-- ride-status trigger notify all passengers exactly once.
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
    raise exception 'Passenger account required';
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

-- The assigned driver can approve or decline. Approval changes the ride state;
-- the ride-status trigger notifies all passengers once, including shared riders.
create or replace function public.drive_respond_ride_cancellation(
  p_cancellation_id uuid,
  p_approve boolean,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := auth.uid();
  v_role public.drive_role := private.drive_role();
  v_cancel public.ride_cancellation_requests%rowtype;
  v_ride public.rides%rowtype;
  v_request public.ride_requests%rowtype;
begin
  if v_actor is null or v_role <> 'driver'::public.drive_role then
    raise exception 'Assigned driver access required';
  end if;
  if length(trim(coalesce(p_note,''))) > 500 then
    raise exception 'Response note is too long';
  end if;

  select * into v_cancel
  from public.ride_cancellation_requests
  where id=p_cancellation_id
  for update;
  if not found or v_cancel.status <> 'pending' then
    raise exception 'Pending cancellation request not found';
  end if;

  select * into v_ride
  from public.rides
  where id=v_cancel.ride_id
  for update;
  if not found or v_ride.driver_id<>v_actor then
    raise exception 'Only the assigned driver can respond';
  end if;
  if v_ride.status not in (
    'matched'::public.drive_ride_status,
    'driver_arriving'::public.drive_ride_status,
    'in_progress'::public.drive_ride_status
  ) then
    raise exception 'This ride is no longer active';
  end if;

  select * into v_request
  from public.ride_requests
  where id=v_ride.request_id
  for update;

  update public.ride_cancellation_requests
  set status=case when p_approve then 'approved' else 'rejected' end,
      reviewer_id=v_actor,
      reviewer_role=v_role,
      reviewed_at=now(),
      response_note=nullif(trim(p_note),'')
  where id=v_cancel.id;

  if p_approve then
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

    insert into public.notifications(user_id,title,body,type,entity_id)
    select p.id,
      'Ride cancellation approved',
      'The assigned driver approved a passenger cancellation request.',
      'ride_cancelled',
      v_ride.id
    from public.profiles p
    where p.role='admin'::public.drive_role and p.is_active=true;
  else
    insert into public.notifications(user_id,title,body,type,entity_id)
    values(
      v_cancel.requester_id,
      'Cancellation request declined',
      'The driver declined your cancellation request.'||
        case when nullif(trim(p_note),'') is null then '' else ' Reason: '||trim(p_note) end,
      'ride_cancellation_declined',
      v_ride.id
    );
  end if;

  return jsonb_build_object(
    'id',v_cancel.id,
    'rideId',v_ride.id,
    'status',case when p_approve then 'cancelled' else 'active' end,
    'cancellationDecision',case when p_approve then 'approved' else 'rejected' end
  );
end;
$$;

-- Drivers may cancel before pickup or end an active trip. The reason is stored
-- before the status transition so the passenger notification includes it.
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
    'driver_arriving'::public.drive_ride_status,
    'in_progress'::public.drive_ride_status
  ) then
    raise exception 'Only an active ride can be ended by its assigned driver';
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

-- Administrator cancellations are audited before the status trigger runs.
-- This lets the same participant notification include the administrator's reason.
create or replace function public.drive_admin_cancel_ride(
  p_request_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request public.ride_requests%rowtype;
  v_ride public.rides%rowtype;
  v_driver_id uuid;
  v_previous_request_status public.drive_ride_status;
  v_previous_ride_status public.drive_ride_status;
begin
  if auth.uid() is null or private.drive_role()<>'admin'::public.drive_role then
    raise exception 'Administrator access required';
  end if;
  if p_request_id is null or length(trim(coalesce(p_reason,'')))<8 or length(trim(p_reason))>500 then
    raise exception 'A cancellation reason between 8 and 500 characters is required';
  end if;

  select * into v_request
  from public.ride_requests
  where id=p_request_id
  for update;
  if not found then
    raise exception 'Ride request not found';
  end if;
  if v_request.status in (
    'completed'::public.drive_ride_status,
    'cancelled'::public.drive_ride_status
  ) then
    raise exception 'Completed or cancelled rides cannot be cancelled again';
  end if;

  v_previous_request_status:=v_request.status;

  select * into v_ride
  from public.rides
  where request_id=p_request_id
  for update;

  if found then
    if v_ride.status='completed'::public.drive_ride_status then
      raise exception 'Completed rides cannot be cancelled';
    end if;
    v_driver_id:=v_ride.driver_id;
    v_previous_ride_status:=v_ride.status;
  end if;

  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),
    'ride.cancelled',
    'ride_request',
    p_request_id,
    jsonb_build_object(
      'reason',trim(p_reason),
      'previousRequestStatus',v_previous_request_status::text,
      'previousRideStatus',case when v_ride.id is null then null else v_previous_ride_status::text end,
      'rideId',v_ride.id
    )
  );

  if v_ride.id is not null then
    update public.rides
    set status='cancelled'::public.drive_ride_status,updated_at=now()
    where id=v_ride.id;
  end if;

  update public.ride_requests
  set status='cancelled'::public.drive_ride_status,
      cancelled_at=now(),
      cancellation_fee=0,
      updated_at=now()
  where id=p_request_id;

  -- Unassigned requests have no rides row, so no ride-status trigger can
  -- notify the passenger.
  if v_ride.id is null then
    insert into public.notifications(user_id,title,body,type,entity_id)
    values(
      v_request.passenger_id,
      'Ride cancelled by DRIVE support',
      'Your ride was cancelled by an administrator. Reason: '||trim(p_reason),
      'ride_cancelled',
      p_request_id
    );
  end if;

  if v_driver_id is not null then
    insert into public.notifications(user_id,title,body,type,entity_id)
    values(
      v_driver_id,
      'Assigned ride cancelled',
      'An administrator cancelled your assigned ride. Reason: '||trim(p_reason),
      'ride_cancelled',
      p_request_id
    );
  end if;

  return jsonb_build_object(
    'requestId',p_request_id,
    'rideId',v_ride.id,
    'status','cancelled',
    'cancellationFee',0,
    'reason',trim(p_reason)
  );
end;
$$;

-- Preserve the true before/after values in the administrator support audit log.
create or replace function public.drive_admin_update_support_case(
  p_case_id uuid,
  p_status text,
  p_priority text default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_case public.support_cases%rowtype;
  v_previous_status text;
  v_previous_priority text;
begin
  if auth.uid() is null or private.drive_role()<>'admin'::public.drive_role then
    raise exception 'Administrator access required';
  end if;
  if p_status is null or p_status not in ('open','in_review','resolved','rejected') then
    raise exception 'Invalid support case status';
  end if;
  if p_priority is not null and p_priority not in ('low','normal','high','urgent') then
    raise exception 'Invalid support priority';
  end if;
  if length(trim(coalesce(p_admin_note,'')))>2000 then
    raise exception 'Administrator note is too long';
  end if;

  select * into v_case
  from public.support_cases
  where id=p_case_id
  for update;
  if not found then
    raise exception 'Support case not found';
  end if;

  v_previous_status:=v_case.status;
  v_previous_priority:=v_case.priority;

  if v_previous_status in ('resolved','rejected') and p_status not in ('in_review') then
    raise exception 'A closed support case can only be reopened for review';
  end if;

  update public.support_cases
  set status=p_status,
      priority=coalesce(p_priority,priority),
      admin_note=coalesce(nullif(trim(coalesce(p_admin_note,'')),''),admin_note),
      assigned_to=auth.uid(),
      updated_at=now(),
      resolved_at=case when p_status in ('resolved','rejected') then now() else null end
  where id=p_case_id
  returning * into v_case;

  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),
    'support_case.'||p_status,
    'support_case',
    p_case_id,
    jsonb_build_object(
      'previousStatus',v_previous_status,
      'status',v_case.status,
      'previousPriority',v_previous_priority,
      'priority',v_case.priority
    )
  );

  insert into public.notifications(user_id,title,body,type,entity_id)
  values(
    v_case.user_id,
    'Support case update',
    'Your support case "'||v_case.subject||'" is now '||replace(p_status,'_',' ')||'. Open DRIVE support to view the latest status.',
    'support_update',
    p_case_id
  );

  return to_jsonb(v_case);
end;
$function$;

revoke all on function public.drive_request_ride_cancellation(uuid,text,boolean,double precision,double precision) from public,anon;
revoke all on function public.drive_respond_ride_cancellation(uuid,boolean,text) from public,anon;
revoke all on function public.drive_driver_cancel_ride(uuid,text) from public,anon;
revoke all on function public.drive_admin_cancel_ride(uuid,text) from public,anon;
revoke all on function public.drive_admin_update_support_case(uuid,text,text,text) from public,anon;

grant execute on function public.drive_request_ride_cancellation(uuid,text,boolean,double precision,double precision) to authenticated;
grant execute on function public.drive_respond_ride_cancellation(uuid,boolean,text) to authenticated;
grant execute on function public.drive_driver_cancel_ride(uuid,text) to authenticated;
grant execute on function public.drive_admin_cancel_ride(uuid,text) to authenticated;
grant execute on function public.drive_admin_update_support_case(uuid,text,text,text) to authenticated;

commit;
