-- Replace the legacy permissive rejection INSERT policy with a scoped
-- policy that verifies the driver is online, fresh, approved, and in range.
drop policy if exists ride_request_rejections_driver_select on public.ride_request_rejections;
drop policy if exists ride_request_rejections_driver_insert on public.ride_request_rejections;
drop policy if exists ride_request_rejections_insert_driver on public.ride_request_rejections;

create policy ride_request_rejections_insert_driver
on public.ride_request_rejections
for insert
to authenticated
with check (
  driver_id = (select auth.uid())
  and (select private.drive_role()) = 'driver'::public.drive_role
  and private.drive_can_dispatch_request(request_id)
);
