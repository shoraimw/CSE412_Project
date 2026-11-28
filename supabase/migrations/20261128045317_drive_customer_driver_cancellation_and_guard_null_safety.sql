begin;

-- Driver accounts may act as customers only when they are actual passengers
-- on the ride. The ride_passengers ownership check remains mandatory.
do $migration$
declare
  v_definition text;
  v_old_role text := $oldrole$if v_role not in ('passenger'::public.drive_role,'vehicle_owner'::public.drive_role) then$oldrole$;
  v_new_role text := $newrole$if v_role not in ('passenger'::public.drive_role,'driver'::public.drive_role,'vehicle_owner'::public.drive_role) then$newrole$;
begin
  select pg_get_functiondef('public.drive_request_ride_cancellation(uuid,text,boolean,double precision,double precision)'::regprocedure)
    into v_definition;
  if position(v_old_role in v_definition)=0 then
    raise exception 'Expected customer cancellation role guard was not found';
  end if;
  execute replace(v_definition,v_old_role,v_new_role);
end;
$migration$;

-- Make the dedicated cancellation guard fail closed if the profile role is
-- absent, rather than allowing SQL NULL semantics to suppress its IF branch.
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
    and coalesce(private.drive_role()::text,'') <> 'admin' then
    raise exception 'Ride cancellation must use the authorized cancellation workflow';
  end if;
  return new;
end;
$function$;

commit;