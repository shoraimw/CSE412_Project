-- One-time DRIVE Primary Admin bootstrap.
-- This targets the single account already registered in the connected DRIVE Supabase project.
-- Run only after the account owner explicitly confirms the promotion.
-- Execute from Supabase SQL Editor as the project owner; do not expose service-role keys.

do $$
declare
  v_user_id uuid := '54b012e1-9266-4df5-8842-38f9843115a0';
begin
  if not exists (
    select 1 from auth.users
    where id = v_user_id and email_confirmed_at is not null
  ) then
    raise exception 'The selected account does not exist or its email is not confirmed.';
  end if;

  if exists (
    select 1 from public.profiles
    where role = 'admin'::public.drive_role and id <> v_user_id
  ) then
    raise exception 'Another administrator already exists. Review the admin ownership before proceeding.';
  end if;

  update public.profiles
     set role = 'admin'::public.drive_role,
         is_verified = true,
         is_active = true
   where id = v_user_id;

  if not found then
    raise exception 'The selected profile was not found.';
  end if;
end;
$$;

-- Verify: this should return exactly one administrator.
select p.id, p.full_name, p.role, p.is_verified, p.is_active
from public.profiles p
where p.role = 'admin'::public.drive_role;
