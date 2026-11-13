-- Additive DRIVE v2 extension for the existing DRIVE Supabase schema.
-- Does not drop or recreate existing production tables.
create table if not exists public.tourist_places(
 id uuid primary key default gen_random_uuid(),name text not null,city text not null,
 description text,latitude double precision,longitude double precision,category text,
 is_active boolean not null default true,created_at timestamptz not null default now()
);
alter table public.tourist_places enable row level security;
drop policy if exists tourist_places_public_read on public.tourist_places;
create policy tourist_places_public_read on public.tourist_places for select to anon,authenticated using(is_active=true);
grant select on public.tourist_places to anon,authenticated;
insert into public.tourist_places(name,city,description,category,latitude,longitude) values
('Lalbagh Fort','Dhaka','Mughal-era fort complex','Heritage',23.7188,90.3880),
('Ahsan Manzil','Dhaka','Historic pink palace museum','Heritage',23.7089,90.4060),
('National Parliament House','Dhaka','Landmark designed by Louis Kahn','Architecture',23.7625,90.3785),
('Patenga Sea Beach','Chattogram','Coastal promenade','Nature',22.2362,91.7906),
('Foy''s Lake','Chattogram','Lake and recreation area','Nature',22.3660,91.8000)
on conflict do nothing;

create table if not exists public.tourist_plans(
 id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,
 city text,place_ids uuid[] not null,transport_preference text not null default 'car',
 created_at timestamptz not null default now()
);
alter table public.tourist_plans enable row level security;
create policy tourist_plans_owner_all on public.tourist_plans for all to authenticated
using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select,insert,update,delete on public.tourist_plans to authenticated;

-- Verified drivers can discover requests; passenger and admin policies remain in place.
drop policy if exists ride_requests_verified_driver_read on public.ride_requests;
create policy ride_requests_verified_driver_read on public.ride_requests for select to authenticated
using(status='requested' and (select private.drive_role())='driver'::public.drive_role
and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_verified=true));
-- A verified driver may claim a request; status and assignment are restricted to valid states.
drop policy if exists ride_requests_verified_driver_update on public.ride_requests;
create policy ride_requests_verified_driver_update on public.ride_requests for update to authenticated
using(status='requested' and (select private.drive_role())='driver'::public.drive_role
and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_verified=true))
with check(status in ('matched','driver_arriving','in_progress','completed','cancelled')
and (select private.drive_role())='driver'::public.drive_role);
drop policy if exists rides_verified_driver_insert on public.rides;
create policy rides_verified_driver_insert on public.rides for insert to authenticated
with check(driver_id=(select auth.uid()) and (select private.drive_role())='driver'::public.drive_role
and exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_verified=true));
grant select,insert,update on public.rides to authenticated;
grant select,update on public.ride_requests to authenticated;

-- Avoid double-booking one vehicle for overlapping active rental windows.
create extension if not exists btree_gist;
alter table public.rental_bookings drop constraint if exists rental_no_overlapping_active;
alter table public.rental_bookings add constraint rental_no_overlapping_active
exclude using gist(vehicle_id with =,tstzrange(start_at,end_at,'[)') with &&)
where(status in ('pending','approved','active'));
create index if not exists driver_documents_driver_idx on public.driver_documents(driver_id);
create index if not exists driver_documents_reviewer_idx on public.driver_documents(reviewer_id);
create index if not exists payments_user_idx on public.payments(user_id);
create index if not exists payments_ride_idx on public.payments(ride_id);
create index if not exists payments_rental_idx on public.payments(rental_booking_id);
create index if not exists rental_bookings_vehicle_idx on public.rental_bookings(vehicle_id);
create index if not exists reviews_reviewer_idx on public.reviews(reviewer_id);
create index if not exists reviews_reviewee_idx on public.reviews(reviewee_id);
create index if not exists ride_passengers_passenger_idx on public.ride_passengers(passenger_id);
create index if not exists rides_vehicle_idx on public.rides(vehicle_id);
create index if not exists safety_alerts_ride_idx on public.safety_alerts(ride_id);
create index if not exists trip_locations_driver_idx on public.trip_locations(driver_id);
create index if not exists trusted_contacts_user_idx on public.trusted_contacts(user_id);

-- Additional city field used by the rental catalogue filters.
alter table public.vehicles add column if not exists city text not null default 'Dhaka';

-- Claiming a ride request is atomic: row lock prevents two drivers claiming one request.
create or replace function public.drive_claim_request(p_request_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public, private
as $$
declare
  v_driver uuid := auth.uid();
  v_request public.ride_requests%rowtype;
  v_ride_id uuid;
begin
  if v_driver is null then raise exception 'Authentication required'; end if;
  if private.drive_role() <> 'driver'::public.drive_role then raise exception 'Driver role required'; end if;
  if not exists(select 1 from public.profiles p where p.id=v_driver and p.is_verified=true and p.is_active=true) then
    raise exception 'Verified active driver required';
  end if;
  select * into v_request from public.ride_requests where id=p_request_id for update;
  if not found or v_request.status <> 'requested' then raise exception 'Ride request is no longer available'; end if;
  if v_request.women_safety_preference and not exists(
    select 1 from public.profiles p where p.id=v_driver and p.is_verified=true
  ) then raise exception 'This ride requires a verified driver'; end if;
  update public.ride_requests set status='matched',updated_at=now() where id=p_request_id;
  insert into public.rides(request_id,driver_id,status) values(p_request_id,v_driver,'matched') returning id into v_ride_id;
  return v_ride_id;
end;
$$;
revoke all on function public.drive_claim_request(uuid) from public, anon;
grant execute on function public.drive_claim_request(uuid) to authenticated;
