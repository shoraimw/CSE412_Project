-- Persist standalone safety trips and private trip-sharing links.
alter table public.trusted_contacts add column if not exists contact_type text not null default 'trusted';
do $$ begin alter table public.trusted_contacts add constraint trusted_contacts_contact_type_check check(contact_type in ('trusted','emergency')); exception when duplicate_object then null; end $$;
create table if not exists public.safety_trip_sessions(id uuid primary key default gen_random_uuid(),user_id uuid not null references public.profiles(id) on delete cascade,ride_id uuid references public.rides(id) on delete set null,destination text not null,started_at timestamptz not null default now(),expected_arrival_at timestamptz not null,status text not null default 'ACTIVE' check(status in ('ACTIVE','DELAYED','EMERGENCY','COMPLETED')),current_lat double precision,current_lng double precision,planned_route jsonb not null default '[]'::jsonb,warnings jsonb not null default '[]'::jsonb,created_at timestamptz not null default now(),updated_at timestamptz not null default now());
create index if not exists safety_trip_sessions_owner_status_idx on public.safety_trip_sessions(user_id,status,started_at desc);
create table if not exists public.safety_trip_locations(id bigint generated always as identity primary key,safety_trip_id uuid not null references public.safety_trip_sessions(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,latitude double precision not null check(latitude between -90 and 90),longitude double precision not null check(longitude between -180 and 180),recorded_at timestamptz not null default now());
create index if not exists safety_trip_locations_latest_idx on public.safety_trip_locations(safety_trip_id,recorded_at desc);
create table if not exists public.trip_shares(id uuid primary key default gen_random_uuid(),safety_trip_id uuid not null references public.safety_trip_sessions(id) on delete cascade,user_id uuid not null references public.profiles(id) on delete cascade,token_hash text not null unique,contact_ids uuid[] not null default '{}',created_at timestamptz not null default now(),expires_at timestamptz not null);
create index if not exists trip_shares_expiry_idx on public.trip_shares(expires_at);
alter table public.safety_trip_sessions enable row level security;
alter table public.safety_trip_locations enable row level security;
alter table public.trip_shares enable row level security;
drop policy if exists safety_trip_sessions_owner_all on public.safety_trip_sessions;
create policy safety_trip_sessions_owner_all on public.safety_trip_sessions for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
drop policy if exists safety_trip_locations_owner_read on public.safety_trip_locations;
create policy safety_trip_locations_owner_read on public.safety_trip_locations for select to authenticated using(user_id=(select auth.uid()));
drop policy if exists safety_trip_locations_owner_insert on public.safety_trip_locations;
create policy safety_trip_locations_owner_insert on public.safety_trip_locations for insert to authenticated with check(user_id=(select auth.uid()) and exists(select 1 from public.safety_trip_sessions s where s.id=safety_trip_id and s.user_id=(select auth.uid())));
drop policy if exists trip_shares_owner_all on public.trip_shares;
create policy trip_shares_owner_all on public.trip_shares for all to authenticated using(user_id=(select auth.uid())) with check(user_id=(select auth.uid()));
grant select,insert,update,delete on public.safety_trip_sessions to authenticated;
grant select,insert on public.safety_trip_locations to authenticated;
grant select,insert,delete on public.trip_shares to authenticated;
grant usage,select on sequence public.safety_trip_locations_id_seq to authenticated;
create or replace function private.drive_shared_trip(p_token_hash text) returns jsonb language sql stable security definer set search_path='' as $$
 select jsonb_build_object('destination',s.destination,'status',s.status,'startedAt',s.started_at,'expectedArrivalAt',s.expected_arrival_at,'currentLocation',case when s.current_lat is null or s.current_lng is null then null else jsonb_build_object('lat',s.current_lat,'lng',s.current_lng) end,'warnings',s.warnings,'lastUpdatedAt',s.updated_at,'shareExpiresAt',sh.expires_at,'privacyNote','Limited trip details only. Contact delivery depends on a configured notification provider.')
 from public.trip_shares sh join public.safety_trip_sessions s on s.id=sh.safety_trip_id where sh.token_hash=p_token_hash and sh.expires_at>now() limit 1;
$$;
revoke all on function private.drive_shared_trip(text) from public;
grant execute on function private.drive_shared_trip(text) to anon,authenticated;
create or replace function public.drive_get_shared_trip(p_token_hash text) returns jsonb language sql stable security invoker set search_path='' as $$ select private.drive_shared_trip(p_token_hash); $$;
revoke all on function public.drive_get_shared_trip(text) from public;
grant execute on function public.drive_get_shared_trip(text) to anon,authenticated;
create or replace function private.drive_verified_drivers() returns table(id uuid,full_name text,average_rating numeric) language sql stable security definer set search_path='' as $$ select p.id,p.full_name,round(avg(rv.rating)::numeric,1) from public.profiles p left join public.reviews rv on rv.reviewee_id=p.id where p.role='driver'::public.drive_role and p.is_verified=true and p.is_active=true group by p.id,p.full_name order by p.full_name; $$;
revoke all on function private.drive_verified_drivers() from public;
grant execute on function private.drive_verified_drivers() to authenticated;
create or replace function public.drive_verified_drivers() returns table(id uuid,full_name text,average_rating numeric) language sql stable security invoker set search_path='' as $$ select * from private.drive_verified_drivers(); $$;
revoke all on function public.drive_verified_drivers() from public;
grant execute on function public.drive_verified_drivers() to authenticated;
