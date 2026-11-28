-- Allow authenticated drivers to read and append trip GPS history.
-- Existing RLS policies continue to limit inserts to the assigned driver and
-- reads to the ride participants/admins.
grant select, insert on table public.trip_location_history to authenticated;

-- Ride status changes reuse one (user_id, type, entity_id) notification key.
-- Upsert the latest status instead of aborting a status transition when the
-- same ride already has a ride_status notification.
create or replace function public.drive_notify_ride_passenger()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
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
    where rp.ride_id=new.id
    on conflict (user_id,type,entity_id) where entity_id is not null
    do update set
      title=excluded.title,
      body=excluded.body,
      read_at=null,
      created_at=now();

    if new.status='completed'::public.drive_ride_status then
      insert into public.notifications(user_id,title,body,type,entity_id)
      values(
        new.driver_id,
        'Destination reached',
        'You completed the DRIVE journey. Thank you for driving with DRIVE.',
        'ride_completed',
        new.id
      )
      on conflict (user_id,type,entity_id) where entity_id is not null
      do update set
        title=excluded.title,
        body=excluded.body,
        read_at=null,
        created_at=now();
    end if;
  end if;
  return new;
end;
$function$;

revoke all on function public.drive_notify_ride_passenger() from public, anon, authenticated;