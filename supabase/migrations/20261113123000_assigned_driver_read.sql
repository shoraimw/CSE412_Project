-- Let a driver read only the ride request assigned to that driver after claim.
drop policy if exists ride_requests_assigned_driver_read on public.ride_requests;
create policy ride_requests_assigned_driver_read on public.ride_requests for select to authenticated
using(exists(select 1 from public.rides r where r.request_id=ride_requests.id and r.driver_id=(select auth.uid())));
create index if not exists tourist_plans_user_idx on public.tourist_plans(user_id,created_at desc);
