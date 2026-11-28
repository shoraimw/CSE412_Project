-- Atomic administrator review operations. Each function runs in one transaction,
-- checks the authenticated administrator, and relies on existing RLS policies.
create or replace function public.drive_admin_review_driver_application(
  p_application_id uuid,
  p_status text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_app public.driver_applications%rowtype;
begin
  if auth.uid() is null or private.drive_role() <> 'admin'::public.drive_role then
    raise exception 'Administrator access required';
  end if;
  if p_status not in ('approved','rejected') then
    raise exception 'Invalid driver application status';
  end if;

  update public.driver_applications
  set status = p_status,
      reviewer_id = auth.uid(),
      reviewed_at = now(),
      rejection_reason = case when p_status = 'rejected' then nullif(trim(p_rejection_reason),'') else null end
  where id = p_application_id and status = 'pending'
  returning * into v_app;

  if not found then
    raise exception 'Pending driver application not found';
  end if;

  if p_status = 'approved' then
    update public.profiles
    set role = 'driver'::public.drive_role,
        is_verified = true,
        updated_at = now()
    where id = v_app.user_id;
    if not found then raise exception 'Driver profile not found'; end if;
  end if;

  return jsonb_build_object('application', to_jsonb(v_app), 'message',
    case when p_status = 'approved' then 'Driver approved.' else 'Driver application rejected.' end);
end;
$$;

create or replace function public.drive_admin_review_owner_application(
  p_application_id uuid,
  p_status text,
  p_rejection_reason text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_app public.vehicle_owner_applications%rowtype;
begin
  if auth.uid() is null or private.drive_role() <> 'admin'::public.drive_role then
    raise exception 'Administrator access required';
  end if;
  if p_status not in ('approved','rejected') then
    raise exception 'Invalid vehicle owner application status';
  end if;

  update public.vehicle_owner_applications
  set status = p_status,
      reviewer_id = auth.uid(),
      reviewed_at = now(),
      rejection_reason = case when p_status = 'rejected' then nullif(trim(p_rejection_reason),'') else null end
  where id = p_application_id and status = 'pending'
  returning * into v_app;

  if not found then
    raise exception 'Pending vehicle owner application not found';
  end if;

  if p_status = 'approved' then
    update public.profiles
    set role = 'vehicle_owner'::public.drive_role,
        updated_at = now()
    where id = v_app.user_id;
    if not found then raise exception 'Vehicle owner profile not found'; end if;
  end if;

  return jsonb_build_object('application', to_jsonb(v_app), 'message',
    case when p_status = 'approved' then 'Vehicle owner approved.' else 'Vehicle owner application rejected.' end);
end;
$$;

revoke all on function public.drive_admin_review_driver_application(uuid,text,text) from public, anon;
revoke all on function public.drive_admin_review_owner_application(uuid,text,text) from public, anon;
grant execute on function public.drive_admin_review_driver_application(uuid,text,text) to authenticated;
grant execute on function public.drive_admin_review_owner_application(uuid,text,text) to authenticated;
