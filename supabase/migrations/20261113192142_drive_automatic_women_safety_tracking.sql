-- Link Women Safety sessions to ride requests and close sharing automatically.
alter table public.safety_trip_sessions
  add column if not exists ride_request_id uuid references public.ride_requests(id) on delete set null;

create unique index if not exists safety_trip_sessions_ride_request_uidx
  on public.safety_trip_sessions(ride_request_id)
  where ride_request_id is not null;

create index if not exists safety_trip_sessions_ride_id_idx
  on public.safety_trip_sessions(ride_id)
  where ride_id is not null;

create or replace function private.drive_attach_safety_session_to_ride()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  update public.safety_trip_sessions set ride_id=new.id, updated_at=now()
  where ride_request_id=new.request_id and status in ('ACTIVE','DELAYED');
  return new;
end;
$$;

create or replace function private.drive_close_safety_session_on_ride_status()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status in ('completed','cancelled') and new.status is distinct from old.status then
    update public.safety_trip_sessions set status='COMPLETED', updated_at=now()
    where ride_id=new.id and status <> 'COMPLETED';
  end if;
  return new;
end;
$$;

create or replace function private.drive_close_safety_session_on_request_cancel()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
  if new.status='cancelled' and old.status is distinct from new.status then
    update public.safety_trip_sessions set status='COMPLETED', updated_at=now()
    where ride_request_id=new.id and status <> 'COMPLETED';
  end if;
  return new;
end;
$$;

drop trigger if exists drive_attach_safety_session_to_ride on public.rides;
create trigger drive_attach_safety_session_to_ride after insert on public.rides
for each row execute function private.drive_attach_safety_session_to_ride();

drop trigger if exists drive_close_safety_session_on_ride_status on public.rides;
create trigger drive_close_safety_session_on_ride_status after update of status on public.rides
for each row execute function private.drive_close_safety_session_on_ride_status();

drop trigger if exists drive_close_safety_session_on_request_cancel on public.ride_requests;
create trigger drive_close_safety_session_on_request_cancel after update of status on public.ride_requests
for each row execute function private.drive_close_safety_session_on_request_cancel();

revoke all on function private.drive_attach_safety_session_to_ride() from public;
revoke all on function private.drive_close_safety_session_on_ride_status() from public;
revoke all on function private.drive_close_safety_session_on_request_cancel() from public;
