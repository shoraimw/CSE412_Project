-- One-time DRIVE administrator bootstrap.
-- Replace the placeholder with the exact, email-confirmed account address.
-- Run only in the Supabase SQL Editor as the project owner.
do $$
declare
  v_email text := lower(trim('REPLACE_WITH_VERIFIED_ADMIN_EMAIL'));
  v_rows integer;
begin
  if v_email = '' or v_email = 'replace_with_verified_admin_email' then
    raise exception 'Replace the admin email placeholder before running this script.';
  end if;

  update public.profiles p
     set role = 'admin'::public.drive_role,
         is_verified = true,
         is_active = true
    from auth.users u
   where p.id = u.id
     and lower(u.email) = v_email
     and u.email_confirmed_at is not null;

  get diagnostics v_rows = row_count;
  if v_rows <> 1 then
    raise exception 'Expected exactly one confirmed account for %, updated % rows.', v_email, v_rows;
  end if;
end;
$$;

-- Verify the result. This should return exactly one admin row.
select u.email, p.id, p.role, p.is_verified, p.is_active
from public.profiles p
join auth.users u on u.id = p.id
where p.role = 'admin'::public.drive_role;
