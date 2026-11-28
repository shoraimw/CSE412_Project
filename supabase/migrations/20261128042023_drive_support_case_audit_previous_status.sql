-- Preserve the actual pre-update status in the admin audit trail.
create or replace function public.drive_admin_update_support_case(
  p_case_id uuid,
  p_status text,
  p_priority text default null,
  p_admin_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path to ''
as $function$
declare
  v_case public.support_cases%rowtype;
  v_previous_status text;
begin
  if auth.uid() is null or private.drive_role()<>'admin'::public.drive_role then
    raise exception 'Administrator access required';
  end if;
  if p_status not in ('open','in_review','resolved','rejected') then
    raise exception 'Invalid support case status';
  end if;
  if p_priority is not null and p_priority not in ('low','normal','high','urgent') then
    raise exception 'Invalid support priority';
  end if;

  select * into v_case
  from public.support_cases
  where id=p_case_id
  for update;
  if not found then raise exception 'Support case not found'; end if;
  v_previous_status:=v_case.status;

  if v_previous_status in ('resolved','rejected') and p_status not in ('in_review') then
    raise exception 'A closed support case can only be reopened for review';
  end if;

  update public.support_cases
  set status=p_status,
      priority=coalesce(p_priority,priority),
      admin_note=coalesce(nullif(trim(coalesce(p_admin_note,'')),''),admin_note),
      assigned_to=auth.uid(),
      updated_at=now(),
      resolved_at=case when p_status in ('resolved','rejected') then now() else null end
  where id=p_case_id
  returning * into v_case;

  insert into public.admin_audit_logs(admin_id,action,entity_type,entity_id,details)
  values(
    auth.uid(),
    'support_case.'||p_status,
    'support_case',
    p_case_id,
    jsonb_build_object(
      'previousStatus',v_previous_status,
      'status',p_status,
      'priority',v_case.priority
    )
  );

  insert into public.notifications(user_id,title,body,type,entity_id)
  values(
    v_case.user_id,
    'Support case update',
    'Your support case "'||v_case.subject||'" is now '||replace(p_status,'_',' ')||'. Open DRIVE support to view the latest status.',
    'support_update',
    p_case_id
  );

  return to_jsonb(v_case);
end;
$function$;
