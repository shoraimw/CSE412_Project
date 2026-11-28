begin;

-- A driver may cancel an assigned ride before pickup or end it after pickup.
-- Preserve the existing function body and replace only its status allow-list.
do $migration$
declare
  v_definition text;
  v_old text := $old$if v_ride.status not in (
    'matched'::public.drive_ride_status,
    'driver_arriving'::public.drive_ride_status
  ) then
    raise exception 'Only an accepted ride that has not started can be cancelled by its assigned driver';$old$;
  v_new text := $new$if v_ride.status not in (
    'matched'::public.drive_ride_status,
    'driver_arriving'::public.drive_ride_status,
    'in_progress'::public.drive_ride_status
  ) then
    raise exception 'Only an active ride can be ended by its assigned driver';$new$;
  v_request_definition text;
  v_old_role text := $oldrole$if v_role not in ('passenger'::public.drive_role,'driver'::public.drive_role,'vehicle_owner'::public.drive_role) then$oldrole$;
  v_new_role text := $newrole$if v_role not in ('passenger'::public.drive_role,'vehicle_owner'::public.drive_role) then$newrole$;
begin
  select pg_get_functiondef('public.drive_driver_cancel_ride(uuid,text)'::regprocedure)
    into v_definition;
  if position(v_old in v_definition)=0 then
    raise exception 'Expected driver cancellation status guard was not found; refusing to patch an unexpected function definition';
  end if;
  execute replace(v_definition,v_old,v_new);

  select pg_get_functiondef('public.drive_request_ride_cancellation(uuid,text,boolean,double precision,double precision)'::regprocedure)
    into v_request_definition;
  if position(v_old_role in v_request_definition)=0 then
    raise exception 'Expected customer cancellation role guard was not found; refusing to patch an unexpected function definition';
  end if;
  execute replace(v_request_definition,v_old_role,v_new_role);
end;
$migration$;

-- Do not allow a driver to bypass the cancellation RPC by PATCHing a ride
-- directly to cancelled. The dedicated RPCs set drive.allow_cancel locally;
-- administrators and trusted service-role operations remain authorized.
create or replace function private.drive_require_cancel_rpc()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if new.status is distinct from old.status
    and new.status='cancelled'::public.drive_ride_status
    and coalesce(current_setting('drive.allow_cancel',true),'false') <> 'true'
    and coalesce(auth.role(),'') <> 'service_role'
    and private.drive_role() <> 'admin'::public.drive_role then
    raise exception 'Ride cancellation must use the authorized cancellation workflow';
  end if;
  return new;
end;
$function$;

drop trigger if exists drive_require_cancel_rpc on public.rides;
create trigger drive_require_cancel_rpc
before update of status on public.rides
for each row execute function private.drive_require_cancel_rpc();

commit;