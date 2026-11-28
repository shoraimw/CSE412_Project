drop policy if exists reviews_insert_passenger_completed on public.reviews;
create policy reviews_insert_passenger_completed on public.reviews
for insert to authenticated
with check (
  reviewer_id=(select auth.uid())
  and exists (
    select 1 from public.rides r
    where r.id=reviews.ride_id
      and r.status='completed'::public.drive_ride_status
      and r.driver_id=reviews.reviewee_id
      and exists (
        select 1 from public.ride_passengers rp
        where rp.ride_id=r.id and rp.passenger_id=(select auth.uid())
      )
  )
);
