begin;
create index if not exists fare_rules_updated_by_idx on public.fare_rules(updated_by);
create index if not exists owner_documents_reviewer_idx on public.owner_documents(reviewer_id);
create index if not exists owner_documents_vehicle_idx on public.owner_documents(vehicle_id);
create index if not exists support_cases_assigned_to_idx on public.support_cases(assigned_to);
create index if not exists support_cases_rental_booking_idx on public.support_cases(rental_booking_id);
create index if not exists support_cases_ride_idx on public.support_cases(ride_id);
create index if not exists trip_location_history_driver_idx on public.trip_location_history(driver_id);
-- The table-level UNIQUE constraint already provides the same index.
drop index if exists public.reviews_ride_reviewer_uidx;
commit;