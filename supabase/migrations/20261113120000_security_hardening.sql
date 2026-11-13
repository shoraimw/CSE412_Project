-- Move btree_gist out of the exposed public schema.
create schema if not exists extensions;
alter extension btree_gist set schema extensions;

-- Make the ride claim RPC SECURITY INVOKER. RLS policies and a trigger now
-- constrain the only driver-side update to a requested -> matched transition.
create or replace function public.prevent_driver_request_tampering()
returns trigger language plpgsql set search_path=public,private as $$
begin
  if (select private.drive_role())='driver'::public.drive_role then
    if (to_jsonb(new)-'status'-'updated_at') is distinct from (to_jsonb(old)-'status'-'updated_at') then
      raise exception 'Drivers may only change the ride request status';
    end if;
    if old.status<>'requested' or new.status<>'matched' then
      raise exception 'Invalid driver ride-request transition';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists prevent_driver_request_tampering on public.ride_requests;
create trigger prevent_driver_request_tampering before update on public.ride_requests
for each row execute procedure public.prevent_driver_request_tampering();

create policy ride_requests_verified_driver_update on public.ride_requests for update to authenticated
using(status='requested' and (select private.drive_role())='driver'::public.drive_role
and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_verified=true))
with check(status='matched' and (select private.drive_role())='driver'::public.drive_role
and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_verified=true));

create policy rides_verified_driver_insert on public.rides for insert to authenticated
with check(driver_id=(select auth.uid()) and status='matched'
and (select private.drive_role())='driver'::public.drive_role
and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_verified=true)
and exists(select 1 from public.ride_requests q where q.id=request_id and q.status='matched'));

alter function public.drive_claim_request(uuid) security invoker;
