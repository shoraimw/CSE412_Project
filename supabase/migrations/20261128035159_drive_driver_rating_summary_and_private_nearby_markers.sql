-- Driver rating summary uses all reviews for the average while returning only
-- the latest 20 comments. Do not expose reviewer identities in public summaries.
create or replace function public.drive_driver_rating_summary(p_driver_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_profile record;
  v_average numeric;
  v_count bigint;
  v_reviews jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;
  select p.id,p.full_name,p.role into v_profile
  from public.profiles p where p.id=p_driver_id;
  if not found or v_profile.role <> 'driver'::public.drive_role then
    raise exception 'Driver profile not found';
  end if;

  select round(avg(r.rating)::numeric,1),count(*)
  into v_average,v_count
  from public.reviews r where r.reviewee_id=p_driver_id;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id',recent.id,
        'rating',recent.rating,
        'comment',recent.comment,
        'createdAt',recent.created_at,
        'reviewerName','DRIVE passenger'
      ) order by recent.created_at desc
    ),
    '[]'::jsonb
  )
  into v_reviews
  from (
    select r.id,r.rating,r.comment,r.created_at
    from public.reviews r
    where r.reviewee_id=p_driver_id
    order by r.created_at desc
    limit 20
  ) recent;

  return jsonb_build_object(
    'driverId',p_driver_id,
    'driverName',v_profile.full_name,
    'averageRating',v_average,
    'totalReviews',v_count,
    'stars',case when v_average is null then 0 else round(v_average)::integer end,
    'label',case when v_average is null then 'New Driver — No reviews yet' else to_char(v_average,'FM990.0')||'/5' end,
    'reviews',v_reviews
  );
end;
$$;
revoke all on function public.drive_driver_rating_summary(uuid) from public,anon;
grant execute on function public.drive_driver_rating_summary(uuid) to authenticated;

-- Keep nearby driver discovery anonymous before assignment. A map marker
-- identifies an online vehicle, not a driver's full name.
create or replace function private.drive_nearby_drivers(
 p_lat double precision,p_lng double precision,p_vehicle_type text default null,p_radius_km double precision default 15
)
returns table(driver_id uuid,display_name text,vehicle_type text,latitude double precision,longitude double precision,heading real,speed_kph real,distance_km numeric,updated_at timestamptz)
language plpgsql stable security definer set search_path=''
as $$
begin
 if auth.uid() is null then raise exception 'Authentication required'; end if;
 if private.drive_role() not in ('passenger'::public.drive_role,'driver'::public.drive_role,'vehicle_owner'::public.drive_role) then raise exception 'Customer account required'; end if;
 if not exists(select 1 from public.profiles p where p.id=(select auth.uid()) and p.is_active=true) then raise exception 'Active account required'; end if;
 if p_lat is null or p_lng is null or p_lat not between -90 and 90 or p_lng not between -180 and 180 then raise exception 'A valid pickup location is required'; end if;
 return query
 select dl.driver_id,'Nearby driver'::text,da.requested_vehicle_type,
  round(dl.latitude::numeric,3)::double precision,round(dl.longitude::numeric,3)::double precision,
  dl.heading,null::real,
  round((6371.0*2*asin(sqrt(power(sin(radians(dl.latitude-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(dl.latitude))*power(sin(radians(dl.longitude-p_lng)/2),2))))::numeric,2),
  dl.updated_at
 from public.driver_locations dl
 join public.profiles p on p.id=dl.driver_id
 join public.driver_applications da on da.user_id=dl.driver_id and da.status='approved'
 where p.role='driver'::public.drive_role and p.id<>(select auth.uid())
  and p.is_verified=true and p.is_active=true and dl.is_available=true
  and dl.updated_at>=now()-interval '45 seconds'
  and (p_vehicle_type is null or da.requested_vehicle_type=p_vehicle_type)
  and 6371.0*2*asin(sqrt(power(sin(radians(dl.latitude-p_lat)/2),2)+cos(radians(p_lat))*cos(radians(dl.latitude))*power(sin(radians(dl.longitude-p_lng)/2),2))) <= greatest(1,least(coalesce(p_radius_km,15),25))
 order by distance_km asc limit 30;
end;
$$;
