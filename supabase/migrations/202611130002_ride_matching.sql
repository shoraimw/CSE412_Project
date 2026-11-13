-- Atomic verified-driver matching and safe location/share policies.
create or replace function public.match_ride(p_ride_id uuid)
returns jsonb language plpgsql security definer set search_path=public
as $$
declare v_ride public.rides; v_driver public.profiles;
begin
 select * into v_ride from public.rides where id=p_ride_id and passenger_id=auth.uid() and status='requested' for update;
 if not found then raise exception 'Ride is not available for matching'; end if;
 select p.* into v_driver from public.profiles p
 where p.role='driver' and p.is_verified=true and p.is_active=true
 and not exists(select 1 from public.rides r where r.driver_id=p.id and r.status in ('matched','accepted','ongoing'))
 order by p.created_at asc limit 1 for update skip locked;
 if not found then raise exception 'No verified driver is currently available'; end if;
 update public.rides set driver_id=v_driver.id,status='matched',updated_at=now() where id=p_ride_id returning * into v_ride;
 return to_jsonb(v_ride);
end; $$;
revoke all on function public.match_ride(uuid) from public;
grant execute on function public.match_ride(uuid) to authenticated;
drop policy if exists ride_passenger_insert_self on public.ride_passengers;
create policy ride_passenger_insert_self on public.ride_passengers for insert to authenticated with check(passenger_id=auth.uid() and exists(select 1 from public.rides r where r.id=ride_id and r.is_shared=true and r.status in ('requested','matched','accepted')));
drop policy if exists ride_location_insert_self on public.ride_locations;
create policy ride_location_insert_self on public.ride_locations for insert to authenticated with check(actor_id=auth.uid() and exists(select 1 from public.rides r where r.id=ride_id and (r.driver_id=auth.uid() or r.passenger_id=auth.uid())));
drop policy if exists ride_location_read_participants on public.ride_locations;
create policy ride_location_read_participants on public.ride_locations for select to authenticated using(exists(select 1 from public.rides r where r.id=ride_id and (r.passenger_id=auth.uid() or r.driver_id=auth.uid())));
