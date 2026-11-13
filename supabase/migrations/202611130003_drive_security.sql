-- Security hardening: protect privileged fields and prevent overlapping vehicle reservations.
create or replace function public.protect_profile_privileges()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 if auth.role() <> 'service_role' then
  if new.role is distinct from old.role or new.is_verified is distinct from old.is_verified or new.is_active is distinct from old.is_active then
   raise exception 'Role, verification and account status can only be changed by an administrator.';
  end if;
 end if;
 return new;
end; $$;
drop trigger if exists protect_profile_privileges on public.profiles;
create trigger protect_profile_privileges before update on public.profiles for each row execute procedure public.protect_profile_privileges();

create or replace function public.protect_vehicle_verification()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 if auth.role() <> 'service_role' then
  if tg_op='INSERT' and new.verification_status <> 'pending' then raise exception 'New vehicles must be reviewed before listing.'; end if;
  if tg_op='UPDATE' and new.verification_status is distinct from old.verification_status then raise exception 'Only an administrator can verify a vehicle.'; end if;
 end if;
 return new;
end; $$;
drop trigger if exists protect_vehicle_verification on public.vehicles;
create trigger protect_vehicle_verification before insert or update on public.vehicles for each row execute procedure public.protect_vehicle_verification();

create or replace function public.protect_ride_updates()
returns trigger language plpgsql security definer set search_path=public
as $$
begin
 if auth.role() <> 'service_role' then
  if old.passenger_id=auth.uid() then
   if new.passenger_id is distinct from old.passenger_id or new.driver_id is distinct from old.driver_id then raise exception 'Passengers cannot change ride ownership or assign a driver.'; end if;
   if new.status is distinct from old.status and not (old.status='requested' and new.status='cancelled') then raise exception 'Passengers may only cancel a requested ride.'; end if;
  elsif old.driver_id=auth.uid() then
   if new.passenger_id is distinct from old.passenger_id or new.driver_id is distinct from old.driver_id then raise exception 'Driver cannot change ride participants.'; end if;
   if new.status is distinct from old.status and not (
    (old.status='matched' and new.status in ('accepted','cancelled')) or
    (old.status='accepted' and new.status in ('ongoing','cancelled')) or
    (old.status='ongoing' and new.status='completed')
   ) then raise exception 'Invalid driver ride status transition.'; end if;
  else
   raise exception 'Not a ride participant.';
  end if;
 end if;
 return new;
end; $$;
drop trigger if exists protect_ride_updates on public.rides;
create trigger protect_ride_updates before update on public.rides for each row execute procedure public.protect_ride_updates();

drop policy if exists ride_passenger_read_self on public.ride_passengers;
create policy ride_passenger_read_self on public.ride_passengers for select to authenticated using(passenger_id=auth.uid() or exists(select 1 from public.rides r where r.id=ride_id and (r.passenger_id=auth.uid() or r.driver_id=auth.uid())));
drop policy if exists payment_read_self on public.payments;
create policy payment_read_self on public.payments for select to authenticated using(payer_id=auth.uid());
drop policy if exists payment_insert_self on public.payments;
create policy payment_insert_self on public.payments for insert to authenticated with check(payer_id=auth.uid() and status='pending');

create extension if not exists btree_gist;
do $$ begin
 alter table public.rental_bookings add constraint rental_no_overlapping_confirmed
 exclude using gist (vehicle_id with =, daterange(start_date,end_date,'[]') with &&)
 where (status in ('approved','active'));
exception when duplicate_object then null; end $$;
