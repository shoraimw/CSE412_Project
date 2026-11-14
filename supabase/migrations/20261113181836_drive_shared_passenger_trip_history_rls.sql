drop policy if exists ride_requests_read on public.ride_requests;
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
  or exists (
    select 1 from public.rides r
    join public.ride_passengers rp on rp.ride_id = r.id
    where r.request_id = ride_requests.id and rp.passenger_id = (select auth.uid())
  )
);
