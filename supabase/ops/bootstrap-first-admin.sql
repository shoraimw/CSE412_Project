-- Run once in Supabase SQL Editor AFTER registering the first administrator
-- account through the normal DRIVE registration flow.
-- Replace the email below. Never expose this operation through a public API.
do $bootstrap$
declare
  v_email text := lower(trim('REPLACE_WITH_ADMIN_EMAIL'));
  v_user_id uuid;
begin
  if v_email = '' or v_email = 'replace_with_admin_email' then
    raise exception 'Replace REPLACE_WITH_ADMIN_EMAIL before running this script.';
  end if;

  select id into v_user_id
  from auth.users
  where lower(email) = v_email;

  if v_user_id is null then
    raise exception 'No Supabase Auth user exists for %. Register this account first.', v_email;
  end if;

  update public.profiles
  set role = 'admin'::public.drive_role,
      is_verified = true,
      is_active = true,
      updated_at = now()
  where id = v_user_id;

  if not found then
    raise exception 'The profile for % does not exist. Check the auth.users profile trigger before retrying.', v_email;
  end if;

  raise notice 'Initial DRIVE administrator enabled for % (user id %).', v_email, v_user_id;
end
$bootstrap$;
