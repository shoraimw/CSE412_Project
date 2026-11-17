-- Notify the passenger immediately when a driver wins the atomic claim.
create or replace function public.drive_notify_passenger_on_ride_claim()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_passenger uuid;
  v_driver_name text;
begin
  select q.passenger_id
    into v_passenger
    from public.ride_requests q
   where q.id = new.request_id;

  select p.full_name
    into v_driver_name
    from public.profiles p
   where p.id = new.driver_id;

  if v_passenger is not null then
    insert into public.notifications(user_id,title,body,type)
    values(
      v_passenger,
      'Your driver accepted the ride',
      coalesce(nullif(v_driver_name,''),'A verified driver')
        || ' accepted your request and is heading to your pickup location.',
      'ride_status'
    );
  end if;

  return new;
end;
$$;

revoke all on function public.drive_notify_passenger_on_ride_claim() from public, anon, authenticated;
drop trigger if exists drive_notify_passenger_on_ride_claim on public.rides;
create trigger drive_notify_passenger_on_ride_claim
after insert on public.rides
for each row execute function public.drive_notify_passenger_on_ride_claim();
