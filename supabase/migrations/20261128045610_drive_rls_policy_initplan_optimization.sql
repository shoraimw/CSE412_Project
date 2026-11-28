begin;

-- Avoid per-row re-evaluation of auth.uid() and the role helper in the
-- remaining high-traffic RLS policies. Preserve each existing predicate.
do $migration$
declare
  v_policy record;
  v_using text;
  v_check text;
  v_sql text;
  v_count integer := 0;
begin
  for v_policy in
    select schemaname,tablename,policyname,qual,with_check
    from pg_policies
    where schemaname='public'
      and (tablename,policyname) in (
        ('ride_request_rejections','ride_request_rejections_read_own_admin'),
        ('ride_request_rejections','ride_request_rejections_insert_driver'),
        ('owner_documents','owner_documents_read_owner_admin'),
        ('owner_documents','owner_documents_insert_owner'),
        ('driver_documents','driver_documents_insert_driver'),
        ('support_cases','support_cases_read_owner_admin'),
        ('support_cases','support_cases_insert_participant'),
        ('trip_location_history','trip_location_history_insert_assigned_driver'),
        ('trip_location_history','trip_location_history_read_participants')
      )
  loop
    v_count := v_count + 1;
    v_using := case when v_policy.qual is null then null else
      replace(replace(v_policy.qual,'auth.uid()','(select auth.uid())'),
        'private.drive_role()','(select private.drive_role())') end;
    v_check := case when v_policy.with_check is null then null else
      replace(replace(v_policy.with_check,'auth.uid()','(select auth.uid())'),
        'private.drive_role()','(select private.drive_role())') end;

    v_sql := format('alter policy %I on %I.%I',
      v_policy.policyname,v_policy.schemaname,v_policy.tablename);
    if v_using is not null then
      v_sql := v_sql || ' using (' || v_using || ')';
    end if;
    if v_check is not null then
      v_sql := v_sql || ' with check (' || v_check || ')';
    end if;
    execute v_sql;
  end loop;

  if v_count <> 9 then
    raise exception 'Expected to optimize 9 RLS policies, found %',v_count;
  end if;
end;
$migration$;

commit;
