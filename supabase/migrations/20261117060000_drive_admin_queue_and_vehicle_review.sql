-- Admin queue relationship fixes, transactional reviews, and vehicle verification lifecycle.

alter table public.vehicles
  add column if not exists verification_status text,
  add column if not exists verification_rejection_reason text;

update public.vehicles
set verification_status = case when is_verified then 'approved' else 'pending' end
where verification_status is null;

alter table public.vehicles
  alter column verification_status set default 'pending',
  alter column verification_status set not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'vehicles_verification_status_check'
      and conrelid = 'public.vehicles'::regclass
  ) then
    alter table public.vehicles
      add constraint vehicles_verification_status_check
      check (verification_status in ('pending', 'approved', 'rejected'));
  end if;
end;
$$;

create index if not exists vehicles_verification_status_created_idx
  on public.vehicles (verification_status, created_at desc);

-- Keep verification fields under administrator control. Owners may only
-- resubmit a rejected listing; they can never self-approve a vehicle.
create or replace function public.drive_protect_vehicle_verification()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if auth.uid() is null then
    return new;
  end if;

  if (select private.drive_role()) = 'admin'::public.drive_role then
    return new;
  end if;

  if tg_op = 'INSERT' then
    if new.owner_id is distinct from auth.uid()
       or new.is_verified is distinct from false
       or new.verification_status is distinct from 'pending'
       or new.verification_rejection_reason is not null then
      raise exception 'Only an administrator can set vehicle verification fields';
    end if;
    return new;
  end if;

  if new.is_verified is distinct from old.is_verified
     or new.verification_status is distinct from old.verification_status
     or new.verification_rejection_reason is distinct from old.verification_rejection_reason then
    if old.owner_id = auth.uid()
       and old.verification_status = 'rejected'
       and new.verification_status = 'pending'
       and new.is_verified is false
       and new.verification_rejection_reason is null then
      return new;
    end if;

    raise exception 'Only an administrator can approve or reject a vehicle';
  end if;

  return new;
end;
$$;

revoke all on function public.drive_protect_vehicle_verification() from public, anon, authenticated;
drop trigger if exists drive_protect_vehicle_verification on public.vehicles;
create trigger drive_protect_vehicle_verification
before insert or update on public.vehicles
for each row execute function public.drive_protect_vehicle_verification();

-- Each review is a single database transaction: application status and role
-- changes either both succeed or both roll back.
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
  v_application public.driver_applications%rowtype;
  v_profile_id uuid;
begin
  if auth.uid() is null
     or (select private.drive_role()) is distinct from 'admin'::public.drive_role then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('approved', 'rejected') then
    raise exception 'Invalid application review status' using errcode = '22023';
  end if;

  update public.driver_applications
  set status = p_status,
      reviewer_id = auth.uid(),
      reviewed_at = now(),
      rejection_reason = case
        when p_status = 'rejected' then coalesce(nullif(btrim(p_rejection_reason), ''), 'Application did not meet verification requirements.')
        else null
      end
  where id = p_application_id
    and status = 'pending'
  returning * into v_application;

  if not found then
    raise exception 'Driver application not found or already reviewed' using errcode = 'P0002';
  end if;

  if p_status = 'approved' then
    update public.profiles
    set role = 'driver'::public.drive_role,
        is_verified = true,
        updated_at = now()
    where id = v_application.user_id
    returning id into v_profile_id;

    if v_profile_id is null then
      raise exception 'Applicant profile could not be updated';
    end if;
  end if;

  return to_jsonb(v_application);
end;
$$;

revoke all on function public.drive_admin_review_driver_application(uuid, text, text) from public, anon;
grant execute on function public.drive_admin_review_driver_application(uuid, text, text) to authenticated;

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
  v_application public.vehicle_owner_applications%rowtype;
  v_profile_id uuid;
begin
  if auth.uid() is null
     or (select private.drive_role()) is distinct from 'admin'::public.drive_role then
    raise exception 'Administrator access required' using errcode = '42501';
  end if;

  if p_status is null or p_status not in ('approved', 'rejected') then
    raise exception 'Invalid application review status' using errcode = '22023';
  end if;

  update public.vehicle_owner_applications
  set status = p_status,
      reviewer_id = auth.uid(),
      reviewed_at = now(),
      rejection_reason = case
        when p_status = 'rejected' then coalesce(nullif(btrim(p_rejection_reason), ''), 'Application did not meet verification requirements.')
        else null
      end
  where id = p_application_id
    and status = 'pending'
  returning * into v_application;

  if not found then
    raise exception 'Vehicle owner application not found or already reviewed' using errcode = 'P0002';
  end if;

  if p_status = 'approved' then
    update public.profiles
    set role = 'vehicle_owner'::public.drive_role,
        is_verified = true,
        updated_at = now()
    where id = v_application.user_id
    returning id into v_profile_id;

    if v_profile_id is null then
      raise exception 'Applicant profile could not be updated';
    end if;
  end if;

  return to_jsonb(v_application);
end;
$$;

revoke all on function public.drive_admin_review_owner_application(uuid, text, text) from public, anon;
grant execute on function public.drive_admin_review_owner_application(uuid, text, text) to authenticated;
