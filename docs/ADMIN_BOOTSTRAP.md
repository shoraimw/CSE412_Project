# DRIVE — first administrator setup

Public registration always creates a Passenger account. This is intentional: an untrusted user must never be able to self-assign Admin, Driver, or Vehicle Owner privileges.

1. Register a trusted team account through the normal DRIVE sign-up page.
2. Confirm its email and sign in once so Supabase creates the corresponding `public.profiles` row.
3. Open Supabase Dashboard → SQL Editor for the DRIVE project.
4. Replace the placeholder email below with the exact trusted account email and run the statement as the database owner.

```sql
update public.profiles as p
set role = 'admin'::public.drive_role,
    is_verified = true,
    is_active = true,
    updated_at = now()
from auth.users as u
where u.id = p.id
  and lower(u.email) = lower('YOUR_TRUSTED_ADMIN_EMAIL@example.com')
returning p.id, p.role, p.is_verified, p.is_active;
```

5. Confirm exactly one expected profile row was returned, then sign out and sign back in. The admin dashboard is at `/admin.html`.

Do not expose a public admin bootstrap endpoint. Never put the Supabase service-role key in browser code, Worker assets, GitHub, or client-side environment variables. Admin role changes should remain a trusted database-operator action.
