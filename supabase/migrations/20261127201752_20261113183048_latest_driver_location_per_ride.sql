create unique index if not exists trip_locations_one_latest_per_ride
  on public.trip_locations(ride_id);

drop policy if exists trip_locations_driver_update on public.trip_locations;
create policy trip_locations_driver_update on public.trip_locations
for update to authenticated
using (
  driver_id = (select auth.uid())
  and exists (
    select 1 from public.rides r
    where r.id = trip_locations.ride_id
      and r.driver_id = (select auth.uid())
  )
)
with check (
  driver_id = (select auth.uid())
  and exists (
    select 1 from public.rides r
    where r.id = trip_locations.ride_id
      and r.driver_id = (select auth.uid())
  )
);
