-- Publicly expose only the IDs of vehicles available for a requested date range.
-- Rental booking details remain private; the function returns no booking/user data.
create or replace function public.drive_available_vehicle_ids(
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns setof uuid
language plpgsql
stable
security definer
set search_path = ''
as $function$
begin
  if p_start_at is null or p_end_at is null or p_end_at <= p_start_at then
    raise exception 'A valid rental date range is required.';
  end if;

  return query
  select v.id
  from public.vehicles v
  where v.is_verified = true
    and v.is_available = true
    and v.price_per_day is not null
    and v.price_per_day > 0
    and not exists (
      select 1
      from public.rental_bookings b
      where b.vehicle_id = v.id
        and b.status in ('pending', 'approved', 'active')
        and tstzrange(b.start_at, b.end_at, '[)')
            && tstzrange(p_start_at, p_end_at, '[)')
    )
  order by v.created_at desc;
end;
$function$;

revoke all on function public.drive_available_vehicle_ids(timestamptz, timestamptz) from public;
grant execute on function public.drive_available_vehicle_ids(timestamptz, timestamptz) to anon, authenticated;

-- Save safety preferences and both contact groups in one transaction.
-- If any contact is invalid, PostgreSQL rolls back the entire RPC.
create or replace function public.drive_save_safety_settings(
  p_women_safety_enabled boolean default null,
  p_prefer_verified_drivers boolean default null,
  p_trusted_contacts jsonb default null,
  p_emergency_contacts jsonb default null
)
returns void
language plpgsql
set search_path = ''
as $function$
declare
  v_user uuid := auth.uid();
begin
  if v_user is null then
    raise exception 'Authentication required.';
  end if;

  if p_women_safety_enabled is not null or p_prefer_verified_drivers is not null then
    insert into public.user_safety_preferences (
      user_id, women_safety_enabled, prefer_verified_drivers
    )
    values (
      v_user,
      coalesce(p_women_safety_enabled, false),
      coalesce(p_prefer_verified_drivers, true)
    )
    on conflict (user_id) do update
      set women_safety_enabled = coalesce(
            p_women_safety_enabled,
            public.user_safety_preferences.women_safety_enabled
          ),
          prefer_verified_drivers = coalesce(
            p_prefer_verified_drivers,
            public.user_safety_preferences.prefer_verified_drivers
          ),
          updated_at = now();
  end if;

  if p_trusted_contacts is not null then
    if jsonb_typeof(p_trusted_contacts) <> 'array'
       or jsonb_array_length(p_trusted_contacts) > 10 then
      raise exception 'Trusted contacts must be an array of at most 10 entries.';
    end if;
    if exists (
      select 1
      from jsonb_to_recordset(p_trusted_contacts) as c(name text, phone text, relation text)
      where nullif(trim(coalesce(c.name, '')), '') is null
         or char_length(trim(c.name)) > 80
         or c.phone is null
         or c.phone !~ '^\+?[0-9][0-9\s-]{6,18}$'
         or char_length(trim(coalesce(c.relation, ''))) > 40
    ) then
      raise exception 'A trusted contact has an invalid name, phone or relationship.';
    end if;

    delete from public.trusted_contacts
    where user_id = v_user and contact_type = 'trusted';

    insert into public.trusted_contacts (
      user_id, contact_name, phone, relationship, contact_type
    )
    select v_user, trim(c.name), trim(c.phone), nullif(trim(c.relation), ''), 'trusted'
    from jsonb_to_recordset(p_trusted_contacts) as c(name text, phone text, relation text);
  end if;

  if p_emergency_contacts is not null then
    if jsonb_typeof(p_emergency_contacts) <> 'array'
       or jsonb_array_length(p_emergency_contacts) > 10 then
      raise exception 'Emergency contacts must be an array of at most 10 entries.';
    end if;
    if exists (
      select 1
      from jsonb_to_recordset(p_emergency_contacts) as c(name text, phone text, relation text)
      where nullif(trim(coalesce(c.name, '')), '') is null
         or char_length(trim(c.name)) > 80
         or c.phone is null
         or c.phone !~ '^\+?[0-9][0-9\s-]{6,18}$'
         or char_length(trim(coalesce(c.relation, ''))) > 40
    ) then
      raise exception 'An emergency contact has an invalid name, phone or relationship.';
    end if;

    delete from public.trusted_contacts
    where user_id = v_user and contact_type = 'emergency';

    insert into public.trusted_contacts (
      user_id, contact_name, phone, relationship, contact_type
    )
    select v_user, trim(c.name), trim(c.phone), nullif(trim(c.relation, ''), ''), 'emergency'
    from jsonb_to_recordset(p_emergency_contacts) as c(name text, phone text, relation text);
  end if;
end;
$function$;

revoke all on function public.drive_save_safety_settings(boolean, boolean, jsonb, jsonb) from public, anon;
grant execute on function public.drive_save_safety_settings(boolean, boolean, jsonb, jsonb) to authenticated;