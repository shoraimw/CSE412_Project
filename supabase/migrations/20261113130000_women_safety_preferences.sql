create table if not exists public.user_safety_preferences(
 user_id uuid primary key references public.profiles(id) on delete cascade,
 women_safety_enabled boolean not null default false,
 prefer_verified_drivers boolean not null default true,
 share_trip_by_default boolean not null default false,
 updated_at timestamptz not null default now()
);
alter table public.user_safety_preferences enable row level security;
drop policy if exists safety_preferences_owner_all on public.user_safety_preferences;
create policy safety_preferences_owner_all on public.user_safety_preferences for all to authenticated
using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select,insert,update,delete on public.user_safety_preferences to authenticated;
