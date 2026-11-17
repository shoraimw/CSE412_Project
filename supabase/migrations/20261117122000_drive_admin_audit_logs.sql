-- Admin audit trail for privileged DRIVE operations.
create table if not exists public.admin_audit_logs (
  id uuid primary key default extensions.gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete restrict,
  action text not null check (char_length(trim(action)) between 2 and 80),
  entity_type text not null check (char_length(trim(entity_type)) between 2 and 80),
  entity_id uuid,
  details jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists admin_audit_logs_created_at_idx
  on public.admin_audit_logs (created_at desc);
create index if not exists admin_audit_logs_admin_id_idx
  on public.admin_audit_logs (admin_id, created_at desc);

alter table public.admin_audit_logs enable row level security;

drop policy if exists admin_audit_logs_admin_read on public.admin_audit_logs;
create policy admin_audit_logs_admin_read on public.admin_audit_logs
  for select to authenticated
  using ((select private.drive_role()) = 'admin'::public.drive_role);

drop policy if exists admin_audit_logs_admin_insert on public.admin_audit_logs;
create policy admin_audit_logs_admin_insert on public.admin_audit_logs
  for insert to authenticated
  with check (
    admin_id = (select auth.uid())
    and (select private.drive_role()) = 'admin'::public.drive_role
  );

revoke all on public.admin_audit_logs from anon;
grant select, insert on public.admin_audit_logs to authenticated;
