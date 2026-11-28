begin;

-- Ride chat: participants can read the conversation, and send only while the
-- driver is approaching or the trip is in progress.
create table if not exists public.ride_messages (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  sender_id uuid not null references public.profiles(id) on delete restrict,
  body text not null check (char_length(trim(body)) between 1 and 2000),
  created_at timestamptz not null default now()
);
create index if not exists ride_messages_ride_created_idx
  on public.ride_messages(ride_id, created_at desc);
alter table public.ride_messages enable row level security;
grant select, insert on public.ride_messages to authenticated;
drop policy if exists ride_messages_read_participants on public.ride_messages;
create policy ride_messages_read_participants on public.ride_messages
for select to authenticated
using (
  exists (
    select 1 from public.rides r
    where r.id = ride_messages.ride_id
      and (
        r.driver_id = (select auth.uid())
        or exists (
          select 1 from public.ride_passengers rp
          where rp.ride_id = r.id and rp.passenger_id = (select auth.uid())
        )
      )
  )
);
drop policy if exists ride_messages_insert_active_participants on public.ride_messages;
create policy ride_messages_insert_active_participants on public.ride_messages
for insert to authenticated
with check (
  sender_id = (select auth.uid())
  and exists (
    select 1 from public.rides r
    where r.id = ride_messages.ride_id
      and r.status in (
        'matched'::public.drive_ride_status,
        'driver_arriving'::public.drive_ride_status,
        'in_progress'::public.drive_ride_status
      )
      and (
        r.driver_id = (select auth.uid())
        or exists (
          select 1 from public.ride_passengers rp
          where rp.ride_id = r.id and rp.passenger_id = (select auth.uid())
        )
      )
  )
);

-- Structured cancellation workflow and append-only activity history.
create table if not exists public.ride_cancellation_requests (
  id uuid primary key default gen_random_uuid(),
  ride_id uuid not null references public.rides(id) on delete cascade,
  requester_id uuid not null references public.profiles(id) on delete restrict,
  requester_role public.drive_role not null,
  reason text not null check (char_length(trim(reason)) between 8 and 500),
  status text not null default 'pending'
    check (status in ('pending','approved','rejected','emergency','driver_cancelled')),
  reviewer_id uuid references public.profiles(id) on delete set null,
  reviewer_role public.drive_role,
  response_note text,
  created_at timestamptz not null default now(),
  reviewed_at timestamptz
);
create unique index if not exists ride_cancellation_one_pending_per_ride
  on public.ride_cancellation_requests(ride_id) where status='pending';
create index if not exists ride_cancellation_ride_created_idx
  on public.ride_cancellation_requests(ride_id,created_at desc);
alter table public.ride_cancellation_requests enable row level security;
grant select on public.ride_cancellation_requests to authenticated;

create table if not exists public.ride_activity_events (
  id uuid primary key default gen_random_uuid(),
  request_id uuid references public.ride_requests(id) on delete cascade,
  ride_id uuid references public.rides(id) on delete cascade,
  actor_id uuid references public.profiles(id) on delete set null,
  actor_role public.drive_role,
  action text not null,
  from_status text,
  to_status text,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  check (request_id is not null or ride_id is not null)
);
create index if not exists ride_activity_request_created_idx
  on public.ride_activity_events(request_id,created_at desc);
create index if not exists ride_activity_ride_created_idx
  on public.ride_activity_events(ride_id,created_at desc);
alter table public.ride_activity_events enable row level security;
grant select on public.ride_activity_events to authenticated;

drop policy if exists ride_activity_events_read_participants_admin on public.ride_activity_events;
create policy ride_activity_events_read_participants_admin on public.ride_activity_events
for select to authenticated
using (
  (select private.drive_role()) = 'admin'::public.drive_role
  or exists (
    select 1 from public.ride_requests q
    where q.id = ride_activity_events.request_id
      and q.passenger_id = (select auth.uid())
  )
  or exists (
    select 1 from public.rides r
    where r.id = ride_activity_events.ride_id
      and (
        r.driver_id = (select auth.uid())
        or exists (
          select 1 from public.ride_passengers rp
          where rp.ride_id = r.id and rp.passenger_id = (select auth.uid())
        )
      )
  )
);

drop policy if exists ride_cancellation_requests_read_participants_admin on public.ride_cancellation_requests;
create policy ride_cancellation_requests_read_participants_admin on public.ride_cancellation_requests
for select to authenticated
using (
  (select private.drive_role()) = 'admin'::public.drive_role
  or requester_id = (select auth.uid())
  or exists (
    select 1 from public.rides r
    where r.id = ride_cancellation_requests.ride_id
      and (
        r.driver_id = (select auth.uid())
        or exists (
          select 1 from public.ride_passengers rp
          where rp.ride_id = r.id and rp.passenger_id = (select auth.uid())
        )
      )
  )
);

-- Activity rows are written only by trusted database triggers and the
-- transaction-safe cancellation RPCs; users cannot edit or delete history.
create or replace function private.drive_log_ride_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_action text;
  v_ride_id uuid;
  v_from text;
  v_to text;
begin
  if tg_table_name='ride_requests' then
    if tg_op='INSERT' then
      insert into public.ride_activity_events(
        request_id,actor_id,actor_role,action,to_status,metadata
      ) values (
        new.id,auth.uid(),private.drive_role(),'ride_requested',new.status::text,
        jsonb_build_object('vehicle_type',new.requested_vehicle,'pickup',new.pickup_label,'destination',new.destination_label)
      );
    elsif new.status is distinct from old.status then
      select r.id into v_ride_id from public.rides r where r.request_id=new.id limit 1;
      insert into public.ride_activity_events(
        request_id,ride_id,actor_id,actor_role,action,from_status,to_status
      ) values (
        new.id,v_ride_id,auth.uid(),private.drive_role(),
        case when new.status='cancelled'::public.drive_ride_status then 'request_cancelled' else 'request_status_changed' end,
        old.status::text,new.status::text
      );
    end if;
    return new;
  end if;

  if tg_table_name='rides' then
    if tg_op='INSERT' then
      insert into public.ride_activity_events(
        request_id,ride_id,actor_id,actor_role,action,to_status,metadata
      ) values (
        new.request_id,new.id,auth.uid(),private.drive_role(),'driver_accepted',new.status::text,
        jsonb_build_object('driver_id',new.driver_id,'vehicle_id',new.vehicle_id)
      );
    elsif new.status is distinct from old.status then
      v_action := case
        when new.status='completed'::public.drive_ride_status then 'ride_completed'
        when new.status='cancelled'::public.drive_ride_status then 'ride_cancelled'
        else 'ride_status_changed'
      end;
      insert into public.ride_activity_events(
        request_id,ride_id,actor_id,actor_role,action,from_status,to_status
      ) values (
        new.request_id,new.id,auth.uid(),private.drive_role(),v_action,old.status::text,new.status::text
      );
    end if;
    return new;
  end if;
  return new;
end;
$$;

drop trigger if exists drive_log_ride_request_activity on public.ride_requests;
create trigger drive_log_ride_request_activity
after insert or update of status on public.ride_requests
for each row execute function private.drive_log_ride_activity();

drop trigger if exists drive_log_ride_activity on public.rides;
create trigger drive_log_ride_activity
after insert or update of status on public.rides
for each row execute function private.drive_log_ride_activity();

create or replace function private.drive_log_cancellation_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_ride public.rides%rowtype;
  v_actor uuid;
  v_role public.drive_role;
  v_action text;
begin
  select * into v_ride from public.rides where id=new.ride_id;
  if tg_op='INSERT' then
    v_actor:=new.requester_id;
    v_role:=new.requester_role;
    v_action:=case new.status
      when 'emergency' then 'customer_emergency_cancelled'
      when 'driver_cancelled' then 'driver_cancelled_pretrip'
      else 'customer_cancellation_requested'
    end;
  else
    v_actor:=new.reviewer_id;
    v_role:=new.reviewer_role;
    v_action:=case new.status
      when 'approved' then 'driver_approved_cancellation'
      when 'rejected' then 'driver_rejected_cancellation'
      else 'cancellation_status_changed'
    end;
  end if;
  insert into public.ride_activity_events(
    request_id,ride_id,actor_id,actor_role,action,from_status,to_status,reason,metadata
  ) values (
    v_ride.request_id,new.ride_id,v_actor,v_role,v_action,
    case when tg_op='UPDATE' then old.status else null end,
    new.status,new.reason,
    jsonb_build_object('cancellationRequestId',new.id,'responseNote',new.response_note)
  );
  return new;
end;
$$;

drop trigger if exists drive_log_cancellation_insert on public.ride_cancellation_requests;
create trigger drive_log_cancellation_insert
after insert on public.ride_cancellation_requests
for each row execute function private.drive_log_cancellation_activity();
drop trigger if exists drive_log_cancellation_update on public.ride_cancellation_requests;
create trigger drive_log_cancellation_update
after update of status on public.ride_cancellation_requests
for each row execute function private.drive_log_cancellation_activity();

-- Permit an authenticated participant to cancel an active ride only through
-- the explicit emergency/cancellation RPC. The transaction-local flag cannot
-- be set by a browser request.
create or replace function public.drive_guard_transaction_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.drive_role := private.drive_role();
  v_actor uuid := auth.uid();
  v_jwt_role text := coalesce(auth.role(), '');
  v_fare_write boolean := current_setting('drive.allow_fare_write', true) = 'true';
  v_cancel_write boolean := coalesce(current_setting('drive.allow_cancel', true),'false') = 'true';
begin
  if v_jwt_role = 'service_role' or v_role = 'admin'::public.drive_role then
    return new;
  end if;

  if tg_table_name = 'rides' then
    if v_cancel_write
      and v_role in ('passenger'::public.drive_role,'driver'::public.drive_role,'vehicle_owner'::public.drive_role)
      and exists (
        select 1 from public.ride_passengers rp
        where rp.ride_id=old.id and rp.passenger_id=v_actor
      ) then
      if new.request_id is distinct from old.request_id
        or new.driver_id is distinct from old.driver_id
        or new.vehicle_id is distinct from old.vehicle_id
        or new.seat_capacity is distinct from old.seat_capacity
        or new.actual_fare is distinct from old.actual_fare
        or new.actual_fare_breakdown is distinct from old.actual_fare_breakdown
        or new.created_at is distinct from old.created_at
        or new.status is distinct from old.status and new.status <> 'cancelled'::public.drive_ride_status
        or new.status='cancelled'::public.drive_ride_status and old.status not in (
          'matched'::public.drive_ride_status,'driver_arriving'::public.drive_ride_status,'in_progress'::public.drive_ride_status
        ) then
        raise exception 'Participants may only cancel an active ride through the cancellation workflow';
      end if;
      return new;
    end if;

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
        or (v_cancel_write and old.status = 'in_progress'::public.drive_ride_status and new.status = 'cancelled'::public.drive_ride_status)
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
$$;

-- Extend the request write guard for explicit emergency cancellation while
-- retaining strict protection of all client-calculated fields.
create or replace function public.drive_protect_sensitive_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role public.drive_role := private.drive_role();
  v_is_service boolean := current_user in ('service_role','postgres');
  v_cancel_write boolean := coalesce(current_setting('drive.allow_cancel',true),'false')='true';
begin
  if tg_table_name='vehicles' then
    if tg_op='INSERT' then if not v_is_service and v_role <> 'admin' then new.is_verified:=false; end if;
    elsif new.is_verified is distinct from old.is_verified and not v_is_service and v_role <> 'admin' then raise exception 'Only administrators can verify vehicles'; end if;
  elsif tg_table_name='driver_documents' then
    if tg_op='INSERT' and not v_is_service and v_role <> 'admin' then new.verification_status:='pending';new.reviewer_id:=null;new.reviewed_at:=null;new.rejection_reason:=null;
    elsif tg_op='UPDATE' and not v_is_service and v_role <> 'admin' then raise exception 'Only administrators can review driver documents'; end if;
  elsif tg_table_name='payments' then
    if tg_op='INSERT' and not v_is_service and v_role <> 'admin' then new.status:='pending';new.provider_reference:=null;
    elsif tg_op='UPDATE' and not v_is_service and v_role <> 'admin' then raise exception 'Only administrators or trusted payment webhooks can update payment status'; end if;
  elsif tg_table_name='ride_requests' and tg_op='UPDATE' then
    if old.passenger_id=(select auth.uid())
      and v_role in ('passenger'::public.drive_role,'driver'::public.drive_role,'vehicle_owner'::public.drive_role) then
      if new.passenger_id is distinct from old.passenger_id
        or new.pickup_label is distinct from old.pickup_label
        or new.pickup_lat is distinct from old.pickup_lat
        or new.pickup_lng is distinct from old.pickup_lng
        or new.destination_label is distinct from old.destination_label
        or new.destination_lat is distinct from old.destination_lat
        or new.destination_lng is distinct from old.destination_lng
        or new.requested_vehicle is distinct from old.requested_vehicle
        or new.is_shared is distinct from old.is_shared
        or new.women_safety_preference is distinct from old.women_safety_preference
        or new.estimated_fare is distinct from old.estimated_fare
        or new.estimated_distance_km is distinct from old.estimated_distance_km
        or new.estimated_duration_minutes is distinct from old.estimated_duration_minutes
        or new.currency is distinct from old.currency
        or new.seats_requested is distinct from old.seats_requested
        or new.cancellation_fee is distinct from old.cancellation_fee then
        raise exception 'Customers cannot change ride ownership, route, vehicle, fare or server-controlled fields';
      end if;
      if new.status is distinct from old.status then
        if not (
          old.status='requested'::public.drive_ride_status and new.status='cancelled'::public.drive_ride_status
          or v_cancel_write and old.status in ('matched'::public.drive_ride_status,'driver_arriving'::public.drive_ride_status,'in_progress'::public.drive_ride_status)
            and new.status='cancelled'::public.drive_ride_status
        ) then
          raise exception 'Customers may only cancel through the authorised ride cancellation workflow';
        end if;
        new.cancelled_at:=coalesce(old.cancelled_at,now());
      elsif new.cancelled_at is distinct from old.cancelled_at then
        raise exception 'Cancellation timestamps are managed by DRIVE';
      end if;
    end if;
  end if;
  return new;
end;
$$;

-- A passenger may request a normal cancellation for driver approval. An
-- emergency request cancels immediately and records an SOS safety alert.
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
  if v_actor is null then raise exception 'Authentication required'; end if;
  if v_role not in ('passenger'::public.drive_role,'driver'::public.drive_role,'vehicle_owner'::public.drive_role) then
    raise exception 'Customer account required';
  end if;
  if length(trim(coalesce(p_reason,''))) < 8 or length(trim(p_reason)) > 500 then
    raise exception 'A cancellation reason between 8 and 500 characters is required';
  end if;
  if (p_lat is null) <> (p_lng is null)
    or p_lat is not null and (p_lat not between -90 and 90 or p_lng not between -180 and 180) then
    raise exception 'A valid pair of GPS coordinates is required';
  end if;

  select * into v_ride from public.rides where id=p_ride_id for update;
  if not found then raise exception 'Ride not found'; end if;
  select * into v_request from public.ride_requests where id=v_ride.request_id for update;
  if not found then raise exception 'Ride request not found'; end if;
  if not exists (
    select 1 from public.ride_passengers rp
    where rp.ride_id=v_ride.id and rp.passenger_id=v_actor
  ) then raise exception 'Only a passenger on this ride can request cancellation'; end if;
  if v_ride.status not in (
    'matched'::public.drive_ride_status,'driver_arriving'::public.drive_ride_status,'in_progress'::public.drive_ride_status
  ) then raise exception 'This ride is no longer active'; end if;

  if p_emergency then
    insert into public.ride_cancellation_requests(
      ride_id,requester_id,requester_role,reason,status,reviewed_at
    ) values(v_ride.id,v_actor,v_role,trim(p_reason),'emergency',now())
    returning id into v_cancel_id;

    perform set_config('drive.allow_cancel','true',true);
    update public.rides set status='cancelled'::public.drive_ride_status,updated_at=now()
      where id=v_ride.id;
    update public.ride_requests set status='cancelled'::public.drive_ride_status,
      cancelled_at=now(),cancellation_fee=0,updated_at=now()
      where id=v_request.id;

    insert into public.safety_alerts(user_id,ride_id,alert_type,message,latitude,longitude,status)
    values(v_actor,v_ride.id,'ride_emergency_cancel',trim(p_reason),p_lat,p_lng,'open');

    insert into public.notifications(user_id,title,body,type,entity_id)
    values(v_ride.driver_id,'Emergency ride cancellation',
      'The passenger triggered an emergency cancellation. Reason: '||trim(p_reason),
      'ride_emergency_cancel',v_ride.id);

    insert into public.notifications(user_id,title,body,type,entity_id)
    select distinct rp.passenger_id,'Emergency ride cancellation',
      'This ride was immediately cancelled through the emergency safety workflow.',
      'ride_emergency_cancel',v_ride.id
    from public.ride_passengers rp
    where rp.ride_id=v_ride.id and rp.passenger_id<>v_actor;

    insert into public.notifications(user_id,title,body,type,entity_id)
    select p.id,'DRIVE emergency ride cancellation',
      'An emergency cancellation was triggered. Review the ride activity and safety alert.',
      'ride_emergency_cancel',v_ride.id
    from public.profiles p where p.role='admin'::public.drive_role and p.is_active=true;

    return jsonb_build_object('id',v_cancel_id,'rideId',v_ride.id,'status','cancelled',
      'emergency',true,'message','Emergency cancellation recorded. The driver and DRIVE administrators have been notified.');
  end if;

  insert into public.ride_cancellation_requests(ride_id,requester_id,requester_role,reason,status)
  values(v_ride.id,v_actor,v_role,trim(p_reason),'pending')
  returning id into v_cancel_id;

  insert into public.notifications(user_id,title,body,type,entity_id)
  values(v_ride.driver_id,'Passenger requested cancellation',
    'The passenger asked to cancel this ride. Review the reason and respond: '||trim(p_reason),
    'ride_cancellation_request',v_cancel_id);

  insert into public.notifications(user_id,title,body,type,entity_id)
  select p.id,'Ride cancellation requested',
    'A passenger requested cancellation. Review the ride activity.',
    'ride_cancellation_request',v_cancel_id
  from public.profiles p where p.role='admin'::public.drive_role and p.is_active=true;

  return jsonb_build_object('id',v_cancel_id,'rideId',v_ride.id,'status','pending',
    'message','Cancellation request sent to the assigned driver for confirmation.');
end;
$$;

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
  if v_actor is null or v_role <> 'driver'::public.drive_role then raise exception 'Assigned driver access required'; end if;
  if length(trim(coalesce(p_note,''))) > 500 then raise exception 'Response note is too long'; end if;
  select * into v_cancel from public.ride_cancellation_requests where id=p_cancellation_id for update;
  if not found or v_cancel.status <> 'pending' then raise exception 'Pending cancellation request not found'; end if;
  select * into v_ride from public.rides where id=v_cancel.ride_id for update;
  if not found or v_ride.driver_id<>v_actor then raise exception 'Only the assigned driver can respond'; end if;
  if v_ride.status not in ('matched'::public.drive_ride_status,'driver_arriving'::public.drive_ride_status,'in_progress'::public.drive_ride_status) then
    raise exception 'This ride is no longer active';
  end if;
  select * into v_request from public.ride_requests where id=v_ride.request_id for update;

  update public.ride_cancellation_requests
  set status=case when p_approve then 'approved' else 'rejected' end,
      reviewer_id=v_actor,reviewer_role=v_role,reviewed_at=now(),
      response_note=nullif(trim(p_note),'')
  where id=v_cancel.id;

  if p_approve then
    perform set_config('drive.allow_cancel','true',true);
    update public.rides set status='cancelled'::public.drive_ride_status,updated_at=now() where id=v_ride.id;
    update public.ride_requests set status='cancelled'::public.drive_ride_status,
      cancelled_at=now(),cancellation_fee=0,updated_at=now() where id=v_request.id;
    insert into public.notifications(user_id,title,body,type,entity_id)
    values(v_cancel.requester_id,'Cancellation approved',
      'The driver approved your cancellation request. The ride is now cancelled.',
      'ride_cancelled',v_ride.id);
    insert into public.notifications(user_id,title,body,type,entity_id)
    select p.id,'Ride cancellation approved',
      'The assigned driver approved a passenger cancellation request.',
      'ride_cancelled',v_ride.id
    from public.profiles p where p.role='admin'::public.drive_role and p.is_active=true;
  else
    insert into public.notifications(user_id,title,body,type,entity_id)
    values(v_cancel.requester_id,'Cancellation request declined',
      'The driver declined your cancellation request.'||
      case when nullif(trim(p_note),'') is null then '' else ' Reason: '||trim(p_note) end,
      'ride_cancellation_declined',v_ride.id);
  end if;

  return jsonb_build_object('id',v_cancel.id,'rideId',v_ride.id,
    'status',case when p_approve then 'cancelled' else 'active' end,
    'cancellationDecision',case when p_approve then 'approved' else 'rejected' end);
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
begin
  if v_actor is null or v_role <> 'driver'::public.drive_role then raise exception 'Driver access required'; end if;
  if length(trim(coalesce(p_reason,''))) < 8 or length(trim(p_reason)) > 500 then
    raise exception 'A cancellation reason between 8 and 500 characters is required';
  end if;
  select * into v_ride from public.rides where id=p_ride_id for update;
  if not found or v_ride.driver_id<>v_actor then raise exception 'Assigned ride not found'; end if;
  if v_ride.status not in ('matched'::public.drive_ride_status,'driver_arriving'::public.drive_ride_status) then
    raise exception 'Drivers can cancel an accidentally accepted ride only before the trip starts';
  end if;
  select * into v_request from public.ride_requests where id=v_ride.request_id for update;

  update public.rides set status='cancelled'::public.drive_ride_status,updated_at=now() where id=v_ride.id;
  update public.ride_requests set status='cancelled'::public.drive_ride_status,
    cancelled_at=now(),cancellation_fee=0,updated_at=now() where id=v_request.id;
  update public.driver_locations set is_available=true,updated_at=now() where driver_id=v_actor;

  insert into public.ride_cancellation_requests(
    ride_id,requester_id,requester_role,reason,status,reviewed_at
  ) values(v_ride.id,v_actor,v_role,trim(p_reason),'driver_cancelled',now())
  returning id into v_cancel_id;

  insert into public.notifications(user_id,title,body,type,entity_id)
  values(v_request.passenger_id,'Driver cancelled the accepted ride',
    'Your driver cancelled before the trip started. Please request another ride. Reason: '||trim(p_reason),
    'ride_cancelled',v_ride.id);

  insert into public.notifications(user_id,title,body,type,entity_id)
  select p.id,'Driver cancelled an accepted ride',
    'A driver cancelled an accepted ride before departure. Review the reason and activity.',
    'ride_cancelled',v_ride.id
  from public.profiles p where p.role='admin'::public.drive_role and p.is_active=true;

  return jsonb_build_object('id',v_cancel_id,'rideId',v_ride.id,'requestId',v_request.id,
    'status','cancelled','message','Ride cancelled. The customer and administrators have been notified.');
end;
$$;

revoke all on function public.drive_request_ride_cancellation(uuid,text,boolean,double precision,double precision) from public,anon;
revoke all on function public.drive_respond_ride_cancellation(uuid,boolean,text) from public,anon;
revoke all on function public.drive_driver_cancel_ride(uuid,text) from public,anon;
grant execute on function public.drive_request_ride_cancellation(uuid,text,boolean,double precision,double precision) to authenticated;
grant execute on function public.drive_respond_ride_cancellation(uuid,boolean,text) to authenticated;
grant execute on function public.drive_driver_cancel_ride(uuid,text) to authenticated;

-- Persist a friendly destination-reached notification for both sides, including
-- shared passengers. The frontend plays a short original sound when displayed.
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
begin
  if new.status is distinct from old.status then
    if new.status='completed'::public.drive_ride_status then
      v_title:='Destination reached';
      v_body:='Your DRIVE journey has been completed. You can now leave feedback for your driver.';
      v_type:='ride_completed';
    elsif new.status='cancelled'::public.drive_ride_status then
      v_title:='Ride cancelled';
      v_body:='Your ride has been cancelled. Open DRIVE to review the latest activity.';
      v_type:='ride_cancelled';
    else
      v_title:='Ride status update';
      v_body:='Your ride status is now '||new.status::text||'.';
      v_type:='ride_status';
    end if;

    insert into public.notifications(user_id,title,body,type,entity_id)
    select distinct rp.passenger_id,v_title,v_body,v_type,new.id
    from public.ride_passengers rp where rp.ride_id=new.id;

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

-- Only authenticated ride participants may read activity, cancellation records
-- and chat; administrators can inspect the full activity timeline.
do $$
begin
  if exists(select 1 from pg_publication where pubname='supabase_realtime')
     and not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='ride_messages') then
    alter publication supabase_realtime add table public.ride_messages;
  end if;
end;
$$;

commit;
