-- Trigger-only SECURITY DEFINER functions must not be callable through PostgREST RPC.
revoke all on function public.drive_notify_admins() from public,anon,authenticated;
revoke all on function public.drive_notify_vehicle_owner() from public,anon,authenticated;
revoke all on function public.drive_notify_renter() from public,anon,authenticated;
revoke all on function public.drive_notify_ride_passenger() from public,anon,authenticated;
revoke all on function public.drive_notify_sos_admins() from public,anon,authenticated;
revoke all on function public.drive_notify_payment_user() from public,anon,authenticated;
-- Cover the newly-added foreign keys with indexes.
create index if not exists driver_applications_reviewer_idx on public.driver_applications(reviewer_id);
create index if not exists safety_trip_locations_user_idx on public.safety_trip_locations(user_id);
create index if not exists safety_trip_sessions_ride_idx on public.safety_trip_sessions(ride_id);
create index if not exists trip_shares_safety_trip_idx on public.trip_shares(safety_trip_id);
create index if not exists trip_shares_user_idx on public.trip_shares(user_id);
