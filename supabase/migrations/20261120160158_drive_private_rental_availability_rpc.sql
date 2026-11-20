-- Keep the rental-availability SECURITY DEFINER implementation outside
-- PostgREST's exposed public schema. The public RPC is SECURITY INVOKER.
create or replace function private.drive_available_vehicle_ids(
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

revoke all on function private.drive_available_vehicle_ids(timestamptz, timestamptz) from public, anon, authenticated;
grant usage on schema private to anon, authenticated;
grant execute on function private.drive_available_vehicle_ids(timestamptz, timestamptz) to anon, authenticated;

create or replace function public.drive_available_vehicle_ids(
  p_start_at timestamptz,
  p_end_at timestamptz
)
returns setof uuid
language sql
stable
security invoker
set search_path = ''
as $function$
  select * from private.drive_available_vehicle_ids($1, $2);
$function$;

revoke all on function public.drive_available_vehicle_ids(timestamptz, timestamptz) from public;
grant execute on function public.drive_available_vehicle_ids(timestamptz, timestamptz) to anon, authenticated;