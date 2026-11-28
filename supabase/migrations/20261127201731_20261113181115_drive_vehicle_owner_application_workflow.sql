create table if not exists public.vehicle_owner_applications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references public.profiles(id) on delete cascade,
  business_name text not null check (char_length(trim(business_name)) between 2 and 120),
  contact_phone text not null check (char_length(trim(contact_phone)) between 7 and 30),
  business_address text not null check (char_length(trim(business_address)) between 5 and 300),
  note text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  reviewer_id uuid references public.profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now()
);
create index if not exists vehicle_owner_applications_status_created_idx
  on public.vehicle_owner_applications(status, created_at desc);
alter table public.vehicle_owner_applications enable row level security;
drop policy if exists vehicle_owner_applications_read_owner_admin on public.vehicle_owner_applications;
create policy vehicle_owner_applications_read_owner_admin on public.vehicle_owner_applications
for select to authenticated
using (user_id = (select auth.uid()) or (select private.drive_role()) = 'admin'::public.drive_role);
drop policy if exists vehicle_owner_applications_insert_passenger on public.vehicle_owner_applications;
create policy vehicle_owner_applications_insert_passenger on public.vehicle_owner_applications
for insert to authenticated
with check (user_id = (select auth.uid()) and (select private.drive_role()) = 'passenger');
drop policy if exists vehicle_owner_applications_admin_update on public.vehicle_owner_applications;
create policy vehicle_owner_applications_admin_update on public.vehicle_owner_applications
for update to authenticated
using ((select private.drive_role()) = 'admin'::public.drive_role)
with check ((select private.drive_role()) = 'admin'::public.drive_role);
