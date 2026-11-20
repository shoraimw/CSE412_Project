-- Notify applicants about admin decisions and enforce rental booking date exclusivity.

create or replace function public.drive_notify_admin_new_driver_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id,title,body,type,entity_id)
  select p.id,
         'New Driver Partner application',
         'A Passenger has submitted a Driver Partner application for administrator review.',
         'driver_application',
         new.id
  from public.profiles p
  where p.role='admin'::public.drive_role and p.is_active=true
  on conflict (user_id,type,entity_id) where entity_id is not null
  do nothing;
  return new;
end;
$$;

create or replace function public.drive_notify_driver_application_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications (user_id,title,body,type,entity_id)
    values (
      new.user_id,
      case when new.status='approved' then 'Driver application approved' else 'Driver application update' end,
      case
        when new.status='approved' then 'Your Driver Partner application has been approved. Sign in again to activate your Driver workspace.'
        when new.status='rejected' then 'Your Driver Partner application was not approved. Review the feedback and resubmit corrected details.'
        else 'Your Driver Partner application status changed to ' || new.status || '.'
      end,
      'driver_application',
      new.id
    )
    on conflict (user_id,type,entity_id) where entity_id is not null
    do update set title=excluded.title,body=excluded.body,read_at=null,created_at=now();
  end if;
  return new;
end;
$$;

create or replace function public.drive_notify_admin_new_owner_application()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.notifications (user_id,title,body,type,entity_id)
  select p.id,
         'New Vehicle Owner application',
         'A Passenger has submitted a Vehicle Owner application for administrator review.',
         'owner_application',
         new.id
  from public.profiles p
  where p.role='admin'::public.drive_role and p.is_active=true
  on conflict (user_id,type,entity_id) where entity_id is not null
  do nothing;
  return new;
end;
$$;

create or replace function public.drive_notify_owner_application_status()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.status is distinct from old.status then
    insert into public.notifications (user_id,title,body,type,entity_id)
    values (
      new.user_id,
      case when new.status='approved' then 'Vehicle Owner application approved' else 'Vehicle Owner application update' end,
      case
        when new.status='approved' then 'Your Vehicle Owner application has been approved. Sign in again to open your Vehicle Owner workspace.'
        when new.status='rejected' then 'Your Vehicle Owner application was not approved. Review the feedback and resubmit corrected details.'
        else 'Your Vehicle Owner application status changed to ' || new.status || '.'
      end,
      'owner_application',
      new.id
    )
    on conflict (user_id,type,entity_id) where entity_id is not null
    do update set title=excluded.title,body=excluded.body,read_at=null,created_at=now();
  end if;
  return new;
end;
$$;

drop trigger if exists drive_notify_admin_new_driver_application on public.driver_applications;
create trigger drive_notify_admin_new_driver_application
after insert on public.driver_applications
for each row execute function public.drive_notify_admin_new_driver_application();

drop trigger if exists drive_notify_driver_application_status on public.driver_applications;
create trigger drive_notify_driver_application_status
after update of status on public.driver_applications
for each row execute function public.drive_notify_driver_application_status();

drop trigger if exists drive_notify_admin_new_owner_application on public.vehicle_owner_applications;
create trigger drive_notify_admin_new_owner_application
after insert on public.vehicle_owner_applications
for each row execute function public.drive_notify_admin_new_owner_application();

drop trigger if exists drive_notify_owner_application_status on public.vehicle_owner_applications;
create trigger drive_notify_owner_application_status
after update of status on public.vehicle_owner_applications
for each row execute function public.drive_notify_owner_application_status();

-- The connected schema already has the rental_no_overlapping_active exclusion constraint.

revoke all on function public.drive_notify_admin_new_driver_application() from public,anon,authenticated;
revoke all on function public.drive_notify_driver_application_status() from public,anon,authenticated;
revoke all on function public.drive_notify_admin_new_owner_application() from public,anon,authenticated;
revoke all on function public.drive_notify_owner_application_status() from public,anon,authenticated;
