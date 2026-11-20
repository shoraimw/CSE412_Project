-- Enforce ride and rental state machines at the database boundary so direct
-- PostgREST writes cannot bypass the API controller checks.

create or replace function public.drive_guard_transaction_state()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_role public.drive_role := private.drive_role();
  v_actor uuid := auth.uid();
  v_jwt_role text := coalesce(auth.role(), '');
begin
  if v_jwt_role = 'service_role' or v_role = 'admin'::public.drive_role then
    return new;
  end if;

  if tg_table_name = 'rides' then
    if v_role <> 'driver'::public.drive_role or old.driver_id is distinct from v_actor then
      raise exception 'Only the assigned Driver can update this ride';
    end if;

    if new.request_id is distinct from old.request_id
      or new.driver_id is distinct from old.driver_id
      or new.vehicle_id is distinct from old.vehicle_id
      or new.actual_fare is distinct from old.actual_fare
      or new.seat_capacity is distinct from old.seat_capacity
      or new.created_at is distinct from old.created_at then
      raise exception 'Drivers cannot change ride ownership, capacity, fare or creation fields';
    end if;

    if new.status is distinct from old.status then
      if not (
        (old.status = 'matched'::public.drive_ride_status and new.status in ('driver_arriving'::public.drive_ride_status,'cancelled'::public.drive_ride_status))
        or (old.status = 'driver_arriving'::public.drive_ride_status and new.status in ('in_progress'::public.drive_ride_status,'cancelled'::public.drive_ride_status))
        or (old.status = 'in_progress'::public.drive_ride_status and new.status = 'completed'::public.drive_ride_status)
      ) then
        raise exception 'Invalid ride status transition from % to %',old.status,new.status;
      end if;

      if new.status = 'driver_arriving'::public.drive_ride_status then
        new.accepted_at := coalesce(old.accepted_at,now());
      else
        new.accepted_at := old.accepted_at;
      end if;
      if new.status = 'in_progress'::public.drive_ride_status then
        new.started_at := coalesce(old.started_at,now());
      else
        new.started_at := old.started_at;
      end if;
      if new.status = 'completed'::public.drive_ride_status then
        new.completed_at := coalesce(old.completed_at,now());
      else
        new.completed_at := old.completed_at;
      end if;
    else
      if new.accepted_at is distinct from old.accepted_at
        or new.started_at is distinct from old.started_at
        or new.completed_at is distinct from old.completed_at then
        raise exception 'Ride lifecycle timestamps are managed by DRIVE';
      end if;
    end if;

    return new;
  end if;

  if tg_table_name = 'rental_bookings' then
    if v_role <> 'vehicle_owner'::public.drive_role
      or not exists (
        select 1 from public.vehicles v
        where v.id=old.vehicle_id and v.owner_id=v_actor
      ) then
      raise exception 'Only the owning Vehicle Owner can update this rental booking';
    end if;

    if new.vehicle_id is distinct from old.vehicle_id
      or new.renter_id is distinct from old.renter_id
      or new.start_at is distinct from old.start_at
      or new.end_at is distinct from old.end_at
      or new.total_amount is distinct from old.total_amount
      or new.currency is distinct from old.currency
      or new.created_at is distinct from old.created_at then
      raise exception 'Vehicle Owners cannot change rental ownership, dates or pricing';
    end if;

    if new.status is distinct from old.status and not (
      (old.status = 'pending'::public.drive_rental_status and new.status in ('approved'::public.drive_rental_status,'rejected'::public.drive_rental_status,'cancelled'::public.drive_rental_status))
      or (old.status = 'approved'::public.drive_rental_status and new.status in ('active'::public.drive_rental_status,'cancelled'::public.drive_rental_status))
      or (old.status = 'active'::public.drive_rental_status and new.status in ('completed'::public.drive_rental_status,'cancelled'::public.drive_rental_status))
    ) then
      raise exception 'Invalid rental status transition from % to %',old.status,new.status;
    end if;

    return new;
  end if;

  return new;
end;
$$;

drop trigger if exists drive_guard_ride_transaction_state on public.rides;
create trigger drive_guard_ride_transaction_state
before update on public.rides
for each row execute function public.drive_guard_transaction_state();

drop trigger if exists drive_guard_rental_transaction_state on public.rental_bookings;
create trigger drive_guard_rental_transaction_state
before update on public.rental_bookings
for each row execute function public.drive_guard_transaction_state();

revoke all on function public.drive_guard_transaction_state() from public,anon,authenticated;
