-- Mirror the assigned driver's ride GPS into the linked Women Safety session.
-- The session is updated only after the ride starts (or when SOS is active).
create or replace function private.drive_sync_safety_trip_location()
returns trigger
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_session record;
  v_route jsonb;
  v_warnings jsonb;
  v_status text;
  v_min_distance double precision;
  v_start jsonb;
  v_end jsonb;
  v_start_lat double precision;
  v_start_lng double precision;
  v_end_lat double precision;
  v_end_lng double precision;
  v_mean_lat double precision;
  v_scale_x double precision;
  v_px double precision;
  v_py double precision;
  v_bx double precision;
  v_by double precision;
  v_len2 double precision;
  v_t double precision;
  v_distance double precision;
  v_i integer;
begin
  for v_session in
    select s.id, s.user_id, s.planned_route, s.warnings, s.status, s.expected_arrival_at
    from public.safety_trip_sessions s
    join public.rides r on r.id = s.ride_id
    where r.id = new.ride_id
      and s.status <> 'COMPLETED'
      and (r.status = 'in_progress' or s.status = 'EMERGENCY')
  loop
    v_route := case
      when jsonb_typeof(v_session.planned_route) = 'array' then v_session.planned_route
      else '[]'::jsonb
    end;
    v_warnings := case
      when jsonb_typeof(v_session.warnings) = 'array' then v_session.warnings
      else '[]'::jsonb
    end;
    v_min_distance := null;

    if jsonb_array_length(v_route) >= 2 then
      for v_i in 0..jsonb_array_length(v_route) - 2 loop
        v_start := v_route -> v_i;
        v_end := v_route -> (v_i + 1);
        begin
          v_start_lat := (v_start ->> 'lat')::double precision;
          v_start_lng := (v_start ->> 'lng')::double precision;
          v_end_lat := (v_end ->> 'lat')::double precision;
          v_end_lng := (v_end ->> 'lng')::double precision;

          if v_start_lat not between -90 and 90
             or v_end_lat not between -90 and 90
             or v_start_lng not between -180 and 180
             or v_end_lng not between -180 and 180 then
            continue;
          end if;

          v_mean_lat := ((new.latitude + v_start_lat + v_end_lat) / 3.0) * pi() / 180.0;
          v_scale_x := 111320.0 * cos(v_mean_lat);
          v_px := (new.longitude - v_start_lng) * v_scale_x;
          v_py := (new.latitude - v_start_lat) * 110540.0;
          v_bx := (v_end_lng - v_start_lng) * v_scale_x;
          v_by := (v_end_lat - v_start_lat) * 110540.0;
          v_len2 := v_bx * v_bx + v_by * v_by;
          v_t := case
            when v_len2 = 0 then 0
            else greatest(0.0, least(1.0, (v_px * v_bx + v_py * v_by) / v_len2))
          end;
          v_distance := sqrt(power(v_px - v_t * v_bx, 2) + power(v_py - v_t * v_by, 2));
          v_min_distance := case
            when v_min_distance is null then v_distance
            else least(v_min_distance, v_distance)
          end;
        exception when others then
          -- Ignore a malformed route segment rather than losing a valid GPS point.
          continue;
        end;
      end loop;

      if v_min_distance is not null
         and v_min_distance > 500
         and not exists (
           select 1
           from jsonb_array_elements(v_warnings) w
           where w ->> 'type' = 'ROUTE_DEVIATION'
             and (w ->> 'createdAt')::timestamptz > now() - interval '5 minutes'
         ) then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'id', extensions.gen_random_uuid()::text,
          'type', 'ROUTE_DEVIATION',
          'message', 'Current location is more than 500 metres from the planned route.',
          'createdAt', now()
        ));
      end if;
    end if;

    v_status := v_session.status;
    if v_status = 'ACTIVE' and v_session.expected_arrival_at < now() - interval '10 minutes' then
      v_status := 'DELAYED';
      if not exists (
        select 1
        from jsonb_array_elements(v_warnings) w
        where w ->> 'type' = 'UNEXPECTED_DELAY'
      ) then
        v_warnings := v_warnings || jsonb_build_array(jsonb_build_object(
          'id', extensions.gen_random_uuid()::text,
          'type', 'UNEXPECTED_DELAY',
          'message', 'The trip is more than 10 minutes past its estimated arrival time.',
          'createdAt', now()
        ));
      end if;
    end if;

    update public.safety_trip_sessions
       set current_lat = new.latitude,
           current_lng = new.longitude,
           warnings = v_warnings,
           status = v_status,
           updated_at = coalesce(new.recorded_at, now())
     where id = v_session.id;

    insert into public.safety_trip_locations (
      safety_trip_id, user_id, latitude, longitude, recorded_at
    ) values (
      v_session.id, v_session.user_id, new.latitude, new.longitude, coalesce(new.recorded_at, now())
    );
  end loop;

  return new;
end;
$function$;

drop trigger if exists drive_sync_safety_trip_location on public.trip_locations;
create trigger drive_sync_safety_trip_location
after insert or update of latitude, longitude, recorded_at
on public.trip_locations
for each row execute function private.drive_sync_safety_trip_location();