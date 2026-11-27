begin;
create or replace function public.drive_admin_cancel_ride(p_request_id uuid,p_reason text)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare
  v_request public.ride_requests%rowtype;
  v_ride public.rides%rowtype;
  v_driver_id uuid;
begin
  if auth.uid() is null or private.drive_role()<>'admin'::public.drive_role then
    raise exception 'Administrator access required';
  end if;
  if p_request_id is null or length(trim(coalesce(p_reason,'')))<8 or length(trim(p_reason))>500 then
    raise exception 'A cancellation reason between 8 and 500 characters is required';
  end if;
  select * into v_request from public.ride_requests where id=p_request_id for update;
  if not found then raise exception 'Ride request not found'; end if;
  if v_request.status in ('completed'::public.drive_ride_status,'cancelled'::public.drive_ride_status) then
    raise exception 'Completed or cancelled rides cannot be cancelled again';
  end if;
  select * into v_ride from public.rides where request_id=p_request_id for update;
  if found then
    if v_ride.status='completed'::public.drive_ride_status then
      raise exception 'Completed rides cannot be cancelled';
    end if;
    v_driver_id:=v_ride.driver_id;
    update public.rides set status='cancelled'::public.drive_ride_status,updated_at=now()
      where id=v_ride.id;
  end if;
  update public.ride_requests set
    status='cancelled'::public.drive_ride_status,
    cancelled_at=now(),
    cancellation_fee=0,
    updated_at=now()
  where id=p_request_id;
  insert into public.notifications(user_id,title,body,type,entity_id)
  values(v_request.passenger_id,'Ride cancelled by DRIVE support',
    'Your ride was cancelled by an administrator. Reason: '||trim(p_reason),
    'ride_cancelled',p_request_id);
  if v_driver_id is not null then
    insert into public.notifications(user_id,title,body,type,entity_id)
    values(v_driver_id,'Assigned ride cancelled',
      'An administrator cancelled your assigned ride. Reason: '||trim(p_reason),
      'ride_cancelled',p_request_id);
  end if;
  return jsonb_build_object('requestId',p_request_id,'rideId',case when v_ride.id is null then null else v_ride.id end,
    'status','cancelled','cancellationFee',0,'reason',trim(p_reason));
end;
$function$;
revoke all on function public.drive_admin_cancel_ride(uuid,text) from public;
grant execute on function public.drive_admin_cancel_ride(uuid,text) to authenticated;
commit;