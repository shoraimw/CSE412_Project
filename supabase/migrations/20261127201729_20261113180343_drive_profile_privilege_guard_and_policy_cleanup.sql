-- Protect trusted profile attributes from direct client-side edits.
create or replace function public.drive_protect_profile_privileges()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is not null
     and private.drive_role() is distinct from 'admin'::public.drive_role
     and (
       new.role is distinct from old.role
       or new.is_verified is distinct from old.is_verified
       or new.is_active is distinct from old.is_active
     ) then
    raise exception 'Only an administrator can change account role, verification, or active status';
  end if;
  return new;
end;
$$;

revoke all on function public.drive_protect_profile_privileges() from public, anon, authenticated;
drop trigger if exists drive_protect_profile_privileges on public.profiles;
create trigger drive_protect_profile_privileges
before update on public.profiles
for each row execute function public.drive_protect_profile_privileges();

-- Consolidate overlapping ride request policies without widening access.
drop policy if exists ride_requests_assigned_driver_read on public.ride_requests;
drop policy if exists ride_requests_read on public.ride_requests;
drop policy if exists ride_requests_verified_driver_read on public.ride_requests;
create policy ride_requests_read on public.ride_requests
for select to authenticated
using (
  passenger_id = (select auth.uid())
  or (select private.drive_role()) = 'admin'::public.drive_role
  or (
    status = 'requested'::public.drive_ride_status
    and (select private.drive_role()) = 'driver'::public.drive_role
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_verified = true and p.is_active = true
    )
  )
  or exists (
    select 1 from public.rides r
    where r.request_id = ride_requests.id and r.driver_id = (select auth.uid())
  )
);

drop policy if exists ride_requests_update on public.ride_requests;
drop policy if exists ride_requests_verified_driver_update on public.ride_requests;
create policy ride_requests_update on public.ride_requests
for update to authenticated
using (
  passenger_id = (select auth.uid())
  or (select private.drive_role()) = 'admin'::public.drive_role
  or (
    status = 'requested'::public.drive_ride_status
    and (select private.drive_role()) = 'driver'::public.drive_role
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_verified = true and p.is_active = true
    )
  )
)
with check (
  passenger_id = (select auth.uid())
  or (select private.drive_role()) = 'admin'::public.drive_role
  or (
    status = 'matched'::public.drive_ride_status
    and (select private.drive_role()) = 'driver'::public.drive_role
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_verified = true and p.is_active = true
    )
  )
);

drop policy if exists rides_admin_insert on public.rides;
drop policy if exists rides_verified_driver_insert on public.rides;
create policy rides_authorized_insert on public.rides
for insert to authenticated
with check (
  (select private.drive_role()) = 'admin'::public.drive_role
  or (
    driver_id = (select auth.uid())
    and status = 'matched'::public.drive_ride_status
    and (select private.drive_role()) = 'driver'::public.drive_role
    and exists (
      select 1 from public.profiles p
      where p.id = (select auth.uid()) and p.is_verified = true and p.is_active = true
    )
    and exists (
      select 1 from public.ride_requests q
      where q.id = rides.request_id and q.status = 'matched'::public.drive_ride_status
    )
  )
);
