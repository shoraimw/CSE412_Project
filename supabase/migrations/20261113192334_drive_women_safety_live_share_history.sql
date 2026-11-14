-- Refresh ETA when the driver starts and expose a short breadcrumb trail on the private share page.
create or replace function private.drive_close_safety_session_on_ride_status()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_duration integer;
begin
  if new.status='in_progress' and new.status is distinct from old.status then
    select estimated_duration_minutes into v_duration from public.ride_requests where id=new.request_id;
    update public.safety_trip_sessions
       set expected_arrival_at=coalesce(new.started_at,now()) + make_interval(mins=>greatest(coalesce(v_duration,1),1)),
           updated_at=now()
     where ride_id=new.id and status in ('ACTIVE','DELAYED');
  end if;
  if new.status in ('completed','cancelled') and new.status is distinct from old.status then
    update public.safety_trip_sessions set status='COMPLETED',updated_at=now()
     where ride_id=new.id and status <> 'COMPLETED';
  end if;
  return new;
end;
$$;

create or replace function private.drive_shared_trip(p_token_hash text)
returns jsonb language sql stable security definer set search_path=''
as $$
 select jsonb_build_object(
  'destination',s.destination,'status',s.status,'startedAt',s.started_at,
  'expectedArrivalAt',s.expected_arrival_at,
  'currentLocation',case when s.current_lat is null or s.current_lng is null then null else jsonb_build_object('lat',s.current_lat,'lng',s.current_lng) end,
  'recentLocations',(select coalesce(jsonb_agg(jsonb_build_object('lat',p.latitude,'lng',p.longitude,'recordedAt',p.recorded_at) order by p.recorded_at asc),'[]'::jsonb) from (select latitude,longitude,recorded_at from public.safety_trip_locations where safety_trip_id=s.id order by recorded_at desc limit 50) p),
  'warnings',s.warnings,'lastUpdatedAt',s.updated_at,'shareExpiresAt',sh.expires_at,
  'privacyNote','Private live location is visible to anyone holding this link until it expires. Do not forward it.'
 )
 from public.trip_shares sh join public.safety_trip_sessions s on s.id=sh.safety_trip_id
 where sh.token_hash=p_token_hash and sh.expires_at>now() limit 1;
$$;
revoke all on function private.drive_shared_trip(text) from public;
grant execute on function private.drive_shared_trip(text) to anon,authenticated;
