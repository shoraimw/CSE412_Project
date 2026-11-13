create extension if not exists pgcrypto;
create type public.app_role as enum ('passenger','driver','vehicle_owner','admin');
create type public.ride_status as enum ('requested','accepted','arrived','ongoing','completed','cancelled');
create type public.rental_status as enum ('pending','accepted','rejected','active','completed','cancelled');
create table public.profiles(id uuid primary key references auth.users(id) on delete cascade,full_name text not null check(char_length(full_name) between 2 and 80),phone text unique,role public.app_role not null default 'passenger',is_verified boolean not null default false,is_active boolean not null default true,avatar_url text,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create table public.vehicles(id uuid primary key default gen_random_uuid(),owner_id uuid not null references public.profiles(id),title text not null,vehicle_type text not null check(vehicle_type in ('car','bike','cng')),brand text not null,model text not null,registration_no text not null unique,city text not null,daily_rate numeric(12,2) not null check(daily_rate>0),seats integer not null default 4 check(seats between 1 and 20),description text,image_url text,is_available boolean not null default true,created_at timestamptz not null default now());
create table public.rides(id uuid primary key default gen_random_uuid(),passenger_id uuid not null references public.profiles(id),driver_id uuid references public.profiles(id),pickup_address text not null,destination_address text not null,pickup jsonb,destination jsonb,vehicle_type text not null check(vehicle_type in ('car','bike','cng')),is_shared boolean not null default false,estimated_fare numeric(12,2) not null check(estimated_fare>=0),final_fare numeric(12,2),status public.ride_status not null default 'requested',created_at timestamptz not null default now(),accepted_at timestamptz,completed_at timestamptz);
create index rides_passenger_created_idx on public.rides(passenger_id,created_at desc);create index rides_driver_status_idx on public.rides(driver_id,status);
create table public.ride_passengers(ride_id uuid references public.rides(id) on delete cascade,user_id uuid references public.profiles(id),seat_count int not null default 1 check(seat_count between 1 and 8),fare_share numeric(12,2) not null default 0,joined_at timestamptz not null default now(),primary key(ride_id,user_id));
create table public.ride_locations(id bigint generated always as identity primary key,ride_id uuid not null references public.rides(id) on delete cascade,driver_id uuid not null references public.profiles(id),lat double precision not null check(lat between -90 and 90),lng double precision not null check(lng between -180 and 180),recorded_at timestamptz not null default now());create index ride_locations_latest_idx on public.ride_locations(ride_id,recorded_at desc);
create table public.rental_bookings(id uuid primary key default gen_random_uuid(),vehicle_id uuid not null references public.vehicles(id),customer_id uuid not null references public.profiles(id),start_at timestamptz not null,end_at timestamptz not null,status public.rental_status not null default 'pending',total_amount numeric(12,2),created_at timestamptz not null default now(),check(end_at>start_at));
create index rental_vehicle_dates_idx on public.rental_bookings(vehicle_id,start_at,end_at);
create table public.safety_contacts(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,name text not null,phone text not null,relationship text,created_at timestamptz not null default now());
create table public.safety_alerts(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),ride_id uuid references public.rides(id),alert_type text not null,message text not null,lat double precision,lng double precision,created_at timestamptz not null default now(),resolved_at timestamptz);
create table public.tourist_places(id uuid primary key default gen_random_uuid(),name text not null,city text not null,description text,latitude double precision,longitude double precision,category text,is_active boolean not null default true);
create table public.payment_records(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id),ride_id uuid references public.rides(id),rental_id uuid references public.rental_bookings(id),amount numeric(12,2) not null check(amount>0),currency char(3) not null default 'BDT',status text not null default 'quote_only' check(status in ('quote_only','pending','paid','failed','refunded')),gateway_reference text,created_at timestamptz not null default now());
create table public.reviews(id uuid primary key default gen_random_uuid(),ride_id uuid not null references public.rides(id),reviewer_id uuid not null references public.profiles(id),reviewee_id uuid not null references public.profiles(id),rating int not null check(rating between 1 and 5),comment text,created_at timestamptz not null default now(),unique(ride_id,reviewer_id));
create or replace function public.handle_new_user() returns trigger language plpgsql security definer set search_path=public as $$ begin insert into public.profiles(id,full_name,phone) values(new.id,coalesce(new.raw_user_meta_data->>'full_name','New user'),new.raw_user_meta_data->>'phone');return new;end;$$;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure public.handle_new_user();
alter table public.profiles enable row level security;alter table public.vehicles enable row level security;alter table public.rides enable row level security;alter table public.ride_passengers enable row level security;alter table public.ride_locations enable row level security;alter table public.rental_bookings enable row level security;alter table public.safety_contacts enable row level security;alter table public.safety_alerts enable row level security;alter table public.tourist_places enable row level security;alter table public.payment_records enable row level security;alter table public.reviews enable row level security;
create policy profile_self_read on public.profiles for select to authenticated using(id=auth.uid());
create policy profile_self_update on public.profiles for update to authenticated using(id=auth.uid()) with check(id=auth.uid());
create policy vehicle_public_read on public.vehicles for select to anon,authenticated using(is_available or owner_id=auth.uid());
create policy vehicle_owner_insert on public.vehicles for insert to authenticated with check(owner_id=auth.uid() and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role in ('vehicle_owner','admin')));
create policy vehicle_owner_update on public.vehicles for update to authenticated using(owner_id=auth.uid()) with check(owner_id=auth.uid());
create policy ride_participant_read on public.rides for select to authenticated using(passenger_id=auth.uid() or driver_id=auth.uid());
create policy passenger_create_ride on public.rides for insert to authenticated with check(passenger_id=auth.uid());
create policy driver_update_assigned_ride on public.rides for update to authenticated using(driver_id=auth.uid()) with check(driver_id=auth.uid());
create policy ride_passenger_self_read on public.ride_passengers for select to authenticated using(user_id=auth.uid());
create policy ride_passenger_self_insert on public.ride_passengers for insert to authenticated with check(user_id=auth.uid());
create policy ride_location_participant_read on public.ride_locations for select to authenticated using(driver_id=auth.uid() or exists(select 1 from public.rides r where r.id=ride_id and r.passenger_id=auth.uid()));
create policy driver_location_insert on public.ride_locations for insert to authenticated with check(driver_id=auth.uid() and exists(select 1 from public.rides r where r.id=ride_id and r.driver_id=auth.uid()));
create policy rental_participant_read on public.rental_bookings for select to authenticated using(customer_id=auth.uid() or exists(select 1 from public.vehicles v where v.id=vehicle_id and v.owner_id=auth.uid()));
create policy customer_create_rental on public.rental_bookings for insert to authenticated with check(customer_id=auth.uid());
create policy contact_owner_all on public.safety_contacts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy alert_owner_all on public.safety_alerts for all to authenticated using(user_id=auth.uid()) with check(user_id=auth.uid());
create policy tourist_public_read on public.tourist_places for select to anon,authenticated using(is_active);
create policy payment_owner_read on public.payment_records for select to authenticated using(user_id=auth.uid());
create policy payment_owner_insert on public.payment_records for insert to authenticated with check(user_id=auth.uid());
create policy reviews_public_read on public.reviews for select to anon,authenticated using(true);
create policy review_owner_insert on public.reviews for insert to authenticated with check(reviewer_id=auth.uid());
insert into public.tourist_places(name,city,description,category,latitude,longitude) values('Lalbagh Fort','Dhaka','Mughal-era fort complex','Heritage',23.7188,90.3880),('Ahsan Manzil','Dhaka','Historic pink palace museum','Heritage',23.7089,90.4060),('National Parliament House','Dhaka','Landmark designed by Louis Kahn','Architecture',23.7625,90.3785),('Patenga Sea Beach','Chattogram','Coastal promenade','Nature',22.2362,91.7906),('Foy''s Lake','Chattogram','Lake and recreation area','Nature',22.3660,91.8000);


-- Security hardening: users cannot promote themselves or self-verify.
create or replace function public.protect_profile_privileges() returns trigger
language plpgsql security definer set search_path=public as $$
begin
  if auth.uid() = old.id and (new.role <> old.role or new.is_verified <> old.is_verified or new.is_active <> old.is_active) then
    raise exception 'Role, verification and account status are administrator-controlled.';
  end if;
  return new;
end; $$;
create trigger protect_profile_privileges before update on public.profiles
for each row execute procedure public.protect_profile_privileges();

-- Drivers can discover open requests; only verified drivers can accept them.
create policy verified_drivers_discover_requests on public.rides for select to authenticated
using(status='requested' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='driver' and p.is_verified=true));
drop policy if exists driver_update_assigned_ride on public.rides;
create policy driver_update_assigned_ride on public.rides for update to authenticated
using(driver_id=auth.uid() or (driver_id is null and status='requested' and exists(select 1 from public.profiles p where p.id=auth.uid() and p.role='driver' and p.is_verified=true)))
with check(driver_id=auth.uid());

-- Prevent two active/pending rentals from overlapping for the same vehicle.
create extension if not exists btree_gist;
alter table public.rental_bookings add constraint rental_no_overlapping_active
exclude using gist (vehicle_id with =, tstzrange(start_at,end_at,'[)') with &&)
where (status in ('pending','accepted','active'));
