# First administrator bootstrap

The connected Supabase project currently has **zero Auth users and zero profiles**, so no administrator can sign in yet.

1. Register the first administrator account through the normal DRIVE registration page.
2. Verify its email if Supabase Auth requires email confirmation.
3. Open Supabase SQL Editor for the CSE412 project.
4. Copy `bootstrap-first-admin.sql`, replace `REPLACE_WITH_ADMIN_EMAIL` with that account's email, and run it once.
5. Sign in again. The account will have the Admin role and access to the admin console.

Do not expose this operation as a public API or run it for an untrusted account. The script only promotes an existing Auth user; it does not create a password or bypass email confirmation.
