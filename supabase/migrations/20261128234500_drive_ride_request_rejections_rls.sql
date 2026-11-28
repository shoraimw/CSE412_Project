-- Allow a driver to read only their own passed-request records and insert
-- a pass record only for a request they are currently eligible to receive.
-- The table had RLS enabled but no authenticated SELECT/INSERT grants or policies.

grant select, insert on table public.ride_request_rejections to authenticated;

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

-- Keep the dispatch eligibility check aligned with the two-minute GPS
-- freshness window used by the nearby-request RPC.
create or replace function private.drive_can_dispatch_request(p_request_id uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    join public.driver_applications da
      on da.user_id=p.id and da.status='approved'
    join public.driver_locations dl
      on dl.driver_id=p.id and dl.is_available=true
     and dl.updated_at >= now() - interval '2 minutes'
    join public.ride_requests q
      on q.id=p_request_id
     and q.status='requested'::public.drive_ride_status
     and q.requested_vehicle=da.requested_vehicle_type
    where p.id=(select auth.uid())
      and p.role='driver'::public.drive_role
      and p.is_verified=true
      and p.is_active=true
      and 6371.0 * 2 * asin(sqrt(least(1.0, greatest(0.0,
        power(sin(radians(dl.latitude - q.pickup_lat) / 2), 2)
        + cos(radians(q.pickup_lat)) * cos(radians(dl.latitude))
        * power(sin(radians(dl.longitude - q.pickup_lng) / 2), 2)
      )))) <= 20
  );
$$;

revoke all on function private.drive_can_dispatch_request(uuid) from public, anon;
grant execute on function private.drive_can_dispatch_request(uuid) to authenticated;
