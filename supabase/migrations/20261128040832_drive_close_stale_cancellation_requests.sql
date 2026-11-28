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
    v_action:=case
      when new.status='approved' and new.response_note='Closed by emergency cancellation.' then 'cancellation_closed_by_emergency'
      when new.status='approved' and new.response_note='Closed by driver cancellation before departure.' then 'driver_closed_pending_cancellation'
      when new.status='approved' then 'driver_approved_cancellation'
      when new.status='rejected' then 'driver_rejected_cancellation'
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

create or replace function private.drive_close_pending_cancellations()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_note text;
begin
  if new.status='emergency' then
    v_note:='Closed by emergency cancellation.';
  elsif new.status='driver_cancelled' then
    v_note:='Closed by driver cancellation before departure.';
  else
    return new;
  end if;

  update public.ride_cancellation_requests
  set status='approved',
      reviewer_id=new.requester_id,
      reviewer_role=new.requester_role,
      reviewed_at=now(),
      response_note=v_note
  where ride_id=new.ride_id
    and id<>new.id
    and status='pending';
  return new;
end;
$$;

drop trigger if exists drive_close_pending_cancellations on public.ride_cancellation_requests;
create trigger drive_close_pending_cancellations
after insert on public.ride_cancellation_requests
for each row execute function private.drive_close_pending_cancellations();
