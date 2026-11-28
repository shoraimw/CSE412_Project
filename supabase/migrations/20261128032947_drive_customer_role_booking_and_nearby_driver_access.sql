-- Allow every ordinary customer-capable DRIVE account to book rides.
drop policy if exists ride_requests_insert_passenger on public.ride_requests;
drop policy if exists ride_requests_insert_customer on public.ride_requests;
create policy ride_requests_insert_customer on public.ride_requests
for insert to authenticated
with check (
 passenger_id=(select auth.uid())
 and (select private.drive_role()) in ('passenger'::public.drive_role,'driver'::public.drive_role,'vehicle_owner'::public.drive_role)
 and status='requested'::public.drive_ride_status
 and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active=true)
);

-- Permit authenticated customer-capable accounts to discover only nearby,
-- verified, approved, online drivers. Pre-match coordinates are rounded to
-- roughly 100 m; exact GPS is reserved for assigned ride participants.
create or replace function private.drive_nearby_drivers(
 p_lat double precision,p_lng double precision,p_vehicle_type text default null,p_radius_km double precision default 15
)
returns table(driver_id uuid,display_name text,vehicle_type text,latitude double precision,longitude double precision,heading real,speed_kph real,distance_km numeric,updated_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if private.drive_role() not in ('passenger'::public.drive_role,'driver'::public.drive_role,'vehicle_owner'::public.drive_role) then raise exception 'Customer account required'; end if;
 if not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active=true) then raise exception 'Active account required'; end if;
 if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'A valid pickup location is required'; end if;
 return query
 select dl.driver_id,p.full_name,da.requested_vehicle_type,
  round(dl.latitude::numeric,3)::double precision,round(dl.longitude::numeric,3)::double precision,
  dl.heading,null::real,
  round((6371.0*2*asin(sqrt(power(sin(radians(dl.latitude-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(dl.latitude))*power(sin(radians(dl.longitude-p_lng)/2),2))))::numeric,2),
  dl.updated_at
 from public.driver_locations dl
 join public.profiles p on p.id=dl.driver_id
 join public.driver_applications da on da.user_id=dl.driver_id and da.status='approved'
 where p.role='driver'::public.drive_role and p.id<>(select auth.uid())
  and p.is_verified=true and p.is_active=true and dl.is_available=true
  and dl.updated_at>=now()-interval '45 seconds'
  and (p_vehicle_type is null or da.requested_vehicle_type=p_vehicle_type)
  and 6371.0*2*asin(sqrt(power(sin(radians(dl.latitude-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(dl.latitude))*power(sin(radians(dl.longitude-p_lng)/2),2))) <= greatest(1,least(coalesce(p_radius_km,15),25))
 order by distance_km asc limit 30;
end;
$$;
revoke all on function private.drive_nearby_drivers(double precision,double precision,text,double precision) from public,anon;
grant usage on schema private to authenticated;
grant execute on function private.drive_nearby_drivers(double precision,double precision,text,double precision) to authenticated;
