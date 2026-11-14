-- DRIVE v2 admin review workflows.
-- SECURITY INVOKER keeps the caller's RLS policies in force.
create or replace function public.admin_review_driver_application(
  p_application_id uuid,
  p_decision text,
  p_rejection_reason text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_admin uuid := auth.uid();
  v_application public.driver_applications%rowtype;
begin
  if v_admin is null or private.drive_role() <> 'admin'::public.drive_role then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into v_application
  from public.driver_applications
  where id = p_application_id
  for update;

  if not found then raise exception 'Driver application not found'; end if;
  if v_application.status <> 'pending' then
    raise exception 'Only pending applications can be reviewed';
  end if;

  if p_decision = 'approved' then
    update public.profiles
       set role = 'driver'::public.drive_role,
           is_verified = true,
           is_active = true
     where id = v_application.user_id;
    if not found then raise exception 'Applicant profile not found'; end if;
  end if;

  update public.driver_applications
     set status = p_decision,
         reviewer_id = v_admin,
         reviewed_at = now(),
         rejection_reason = case when p_decision = 'rejected'
           then nullif(left(trim(coalesce(p_rejection_reason,'')),500),'')
           else null end
   where id = p_application_id;

  return jsonb_build_object(
    'application_id', p_application_id,
    'user_id', v_application.user_id,
    'status', p_decision
  );
end;
$$;

create or replace function public.admin_review_vehicle_owner_application(
  p_application_id uuid,
  p_decision text,
  p_rejection_reason text default null
) returns jsonb
language plpgsql
security invoker
set search_path = public, private
as $$
declare
  v_admin uuid := auth.uid();
  v_application public.vehicle_owner_applications%rowtype;
begin
  if v_admin is null or private.drive_role() <> 'admin'::public.drive_role then
    raise exception 'Administrator permission required' using errcode = '42501';
  end if;
  if p_decision not in ('approved','rejected') then
    raise exception 'Decision must be approved or rejected';
  end if;

  select * into v_application
  from public.vehicle_owner_applications
  where id = p_application_id
  for update;

  if not found then raise exception 'Vehicle-owner application not found'; end if;
  if v_application.status <> 'pending' then
    raise exception 'Only pending applications can be reviewed';
  end if;

  if p_decision = 'approved' then
    update public.profiles
       set role = 'vehicle_owner'::public.drive_role,
           is_verified = true,
           is_active = true
     where id = v_application.user_id;
    if not found then raise exception 'Applicant profile not found'; end if;
  end if;

  update public.vehicle_owner_applications
     set status = p_decision,
         reviewer_id = v_admin,
         reviewed_at = now(),
         rejection_reason = case when p_decision = 'rejected'
           then nullif(left(trim(coalesce(p_rejection_reason,'')),500),'')
           else null end
   where id = p_application_id;

  return jsonb_build_object(
    'application_id', p_application_id,
    'user_id', v_application.user_id,
    'status', p_decision
  );
end;
$$;

revoke all on function public.admin_review_driver_application(uuid,text,text) from public, anon;
revoke all on function public.admin_review_vehicle_owner_application(uuid,text,text) from public, anon;
grant execute on function public.admin_review_driver_application(uuid,text,text) to authenticated;
grant execute on function public.admin_review_vehicle_owner_application(uuid,text,text) to authenticated;
