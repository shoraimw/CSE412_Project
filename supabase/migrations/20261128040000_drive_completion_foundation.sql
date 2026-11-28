begin;

-- Account preferences used by Tourist Mode and the fare/payment screens.
alter table public.profiles
  add column if not exists preferred_language text not null default 'en',
  add column if not exists preferred_currency text not null default 'BDT';

alter table public.profiles
  drop constraint if exists profiles_preferred_language_check;
alter table public.profiles
  add constraint profiles_preferred_language_check
  check (preferred_language in ('en','bn'));

-- Additional provider/payment evidence. Amount is the amount charged in currency;
-- base_amount_bdt records the underlying DRIVE fare before conversion.
alter table public.payments
  add column if not exists base_amount_bdt numeric(12,2),
  add column if not exists exchange_rate numeric(18,8),
  add column if not exists rate_fetched_at timestamptz,
  add column if not exists gateway_name text,
  add column if not exists gateway_transaction_id text,
  add column if not exists gateway_validation_id text,
  add column if not exists gateway_status text,
  add column if not exists gateway_currency text,
  add column if not exists gateway_amount_bdt numeric(12,2),
  add column if not exists gateway_fee_bdt numeric(12,2),
  add column if not exists receipt_number text,
  add column if not exists paid_at timestamptz,
  add column if not exists gateway_payload jsonb not null default '{}'::jsonb;

create unique index if not exists payments_gateway_transaction_id_uidx
  on public.payments(gateway_transaction_id)
  where gateway_transaction_id is not null;
create unique index if not exists payments_receipt_number_uidx
  on public.payments(receipt_number)
  where receipt_number is not null;

alter table public.rides
  add column if not exists actual_fare_breakdown jsonb not null default '{}'::jsonb;

alter table public.ride_requests
  add column if not exists cancelled_at timestamptz,
  add column if not exists cancellation_fee numeric(12,2) not null default 0
    check (cancellation_fee >= 0);

-- Driver can pass on a request without changing the request for other drivers.
create table if not exists public.ride_request_rejections (
  id uuid primary key default gen_random_uuid(),
  request_id uuid not null references public.ride_requests(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(request_id, driver_id)
);
create index if not exists ride_request_rejections_driver_idx
  on public.ride_request_rejections(driver_id, created_at desc);
alter table public.ride_request_rejections enable row level security;
drop policy if exists ride_request_rejections_read_own_admin on public.ride_request_rejections;
create policy ride_request_rejections_read_own_admin
  on public.ride_request_rejections for select to authenticated
  using (driver_id = auth.uid() or private.drive_role() = 'admin'::public.drive_role);
drop policy if exists ride_request_rejections_insert_driver on public.ride_request_rejections;
create policy ride_request_rejections_insert_driver
  on public.ride_request_rejections for insert to authenticated
  with check (
    driver_id = auth.uid()
    and private.drive_role() = 'driver'::public.drive_role
    and exists (
      select 1 from public.profiles p
      join public.driver_applications a on a.user_id = p.id
      join public.ride_requests q on q.id = request_id
      where p.id = auth.uid()
        and p.is_active = true and p.is_verified = true
        and a.status = 'approved'
        and a.requested_vehicle_type = q.requested_vehicle
        and q.status = 'requested'::public.drive_ride_status
    )
  );

-- Private owner identity and vehicle documents. No document is publicly readable.
create table if not exists public.owner_documents (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  vehicle_id uuid references public.vehicles(id) on delete cascade,
  document_type text not null check (
    document_type in ('national_id','business_license','vehicle_registration','insurance')
  ),
  storage_path text not null unique,
  verification_status text not null default 'pending'
    check (verification_status in ('pending','approved','rejected')),
  reviewer_id uuid references public.profiles(id),
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz not null default now(),
  check (document_type <> 'vehicle_registration' or vehicle_id is not null)
);
create index if not exists owner_documents_owner_idx
  on public.owner_documents(owner_id, created_at desc);
create index if not exists owner_documents_review_idx
  on public.owner_documents(verification_status, created_at);
alter table public.owner_documents enable row level security;
drop policy if exists owner_documents_read_owner_admin on public.owner_documents;
create policy owner_documents_read_owner_admin
  on public.owner_documents for select to authenticated
  using (owner_id = auth.uid() or private.drive_role() = 'admin'::public.drive_role);
drop policy if exists owner_documents_insert_owner on public.owner_documents;
create policy owner_documents_insert_owner
  on public.owner_documents for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (
      (
        private.drive_role() = 'passenger'::public.drive_role
        and exists (
          select 1 from public.vehicle_owner_applications a
          where a.user_id = auth.uid() and a.status = 'pending'
        )
      )
      or (
        private.drive_role() = 'vehicle_owner'::public.drive_role
        and (
          vehicle_id is null
          or exists (
            select 1 from public.vehicles v
            where v.id = vehicle_id and v.owner_id = auth.uid()
          )
        )
      )
    )
  );
drop policy if exists owner_documents_admin_update on public.owner_documents;
create policy owner_documents_admin_update
  on public.owner_documents for update to authenticated
  using (private.drive_role() = 'admin'::public.drive_role)
  with check (private.drive_role() = 'admin'::public.drive_role);

-- Permit a pending Driver applicant to submit private documents before approval.
drop policy if exists driver_documents_insert_driver on public.driver_documents;
create policy driver_documents_insert_driver
  on public.driver_documents for insert to authenticated
  with check (
    driver_id = auth.uid()
    and (
      private.drive_role() = 'driver'::public.drive_role
      or (
        private.drive_role() = 'passenger'::public.drive_role
        and exists (
          select 1 from public.driver_applications a
          where a.user_id = auth.uid() and a.status = 'pending'
        )
      )
    )
  );

-- Complaint and support workflow for passengers, drivers and rental partners.
create table if not exists public.support_cases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  ride_id uuid references public.rides(id) on delete set null,
  rental_booking_id uuid references public.rental_bookings(id) on delete set null,
  category text not null default 'other'
    check (category in ('safety','payment','driver','rental','account','app','other')),
  subject text not null check (char_length(trim(subject)) between 3 and 120),
  description text not null check (char_length(trim(description)) between 10 and 3000),
  status text not null default 'open'
    check (status in ('open','in_review','resolved','rejected')),
  priority text not null default 'normal'
    check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references public.profiles(id),
  admin_note text,
  resolved_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (ride_id is null or rental_booking_id is null)
);
create index if not exists support_cases_user_idx
  on public.support_cases(user_id, created_at desc);
create index if not exists support_cases_admin_idx
  on public.support_cases(status, priority, created_at);
alter table public.support_cases enable row level security;
drop policy if exists support_cases_read_owner_admin on public.support_cases;
create policy support_cases_read_owner_admin
  on public.support_cases for select to authenticated
  using (user_id = auth.uid() or private.drive_role() = 'admin'::public.drive_role);
drop policy if exists support_cases_insert_participant on public.support_cases;
create policy support_cases_insert_participant
  on public.support_cases for insert to authenticated
  with check (
    user_id = auth.uid()
    and (
      (ride_id is null and rental_booking_id is null)
      or (
        ride_id is not null
        and exists (
          select 1 from public.rides r
          where r.id = ride_id
            and (
              r.driver_id = auth.uid()
              or exists (
                select 1 from public.ride_passengers rp
                where rp.ride_id = r.id and rp.passenger_id = auth.uid()
              )
            )
        )
      )
      or (
        rental_booking_id is not null
        and exists (
          select 1 from public.rental_bookings b
          join public.vehicles v on v.id = b.vehicle_id
          where b.id = rental_booking_id
            and (b.renter_id = auth.uid() or v.owner_id = auth.uid())
        )
      )
    )
  );
drop policy if exists support_cases_admin_update on public.support_cases;
create policy support_cases_admin_update
  on public.support_cases for update to authenticated
  using (private.drive_role() = 'admin'::public.drive_role)
  with check (private.drive_role() = 'admin'::public.drive_role);

-- Admin-configurable fare rules. Defaults preserve the existing academic BDT formula.
create table if not exists public.fare_rules (
  id uuid primary key default gen_random_uuid(),
  vehicle_type text not null unique check (vehicle_type in ('bike','cng','car')),
  base_fare numeric(12,2) not null check (base_fare >= 0),
  per_km numeric(12,2) not null check (per_km >= 0),
  per_minute numeric(12,2) not null default 0 check (per_minute >= 0),
  peak_hour_multiplier numeric(6,3) not null default 1.0
    check (peak_hour_multiplier between 1.0 and 3.0),
  demand_multiplier_cap numeric(6,3) not null default 1.0
    check (demand_multiplier_cap between 1.0 and 3.0),
  is_active boolean not null default true,
  updated_by uuid references public.profiles(id),
  updated_at timestamptz not null default now()
);
insert into public.fare_rules(vehicle_type,base_fare,per_km,per_minute)
values ('bike',30,12,0),('cng',40,18,0),('car',60,25,0)
on conflict (vehicle_type) do nothing;
alter table public.fare_rules enable row level security;
drop policy if exists fare_rules_public_read on public.fare_rules;
create policy fare_rules_public_read
  on public.fare_rules for select to anon, authenticated
  using (is_active = true or private.drive_role() = 'admin'::public.drive_role);
drop policy if exists fare_rules_admin_insert on public.fare_rules;
create policy fare_rules_admin_insert
  on public.fare_rules for insert to authenticated
  with check (private.drive_role() = 'admin'::public.drive_role);
drop policy if exists fare_rules_admin_update on public.fare_rules;
create policy fare_rules_admin_update
  on public.fare_rules for update to authenticated
  using (private.drive_role() = 'admin'::public.drive_role)
  with check (private.drive_role() = 'admin'::public.drive_role);

-- Append-only trip location history enables a final fare calculation from actual GPS samples.
create table if not exists public.trip_location_history (
  id bigint generated always as identity primary key,
  ride_id uuid not null references public.rides(id) on delete cascade,
  driver_id uuid not null references public.profiles(id) on delete cascade,
  latitude double precision not null check (latitude between -90 and 90),
  longitude double precision not null check (longitude between -180 and 180),
  recorded_at timestamptz not null default now()
);
create index if not exists trip_location_history_ride_time_idx
  on public.trip_location_history(ride_id, recorded_at);
alter table public.trip_location_history enable row level security;
drop policy if exists trip_location_history_insert_assigned_driver on public.trip_location_history;
create policy trip_location_history_insert_assigned_driver
  on public.trip_location_history for insert to authenticated
  with check (
    driver_id = auth.uid()
    and private.drive_role() = 'driver'::public.drive_role
    and exists (
      select 1 from public.rides r
      where r.id = ride_id and r.driver_id = auth.uid()
        and r.status in ('matched','driver_arriving','in_progress')
    )
  );
drop policy if exists trip_location_history_read_participants on public.trip_location_history;
create policy trip_location_history_read_participants
  on public.trip_location_history for select to authenticated
  using (
    driver_id = auth.uid()
    or private.drive_role() = 'admin'::public.drive_role
    or exists (
      select 1 from public.ride_passengers rp
      where rp.ride_id = trip_location_history.ride_id
        and rp.passenger_id = auth.uid()
    )
  );

-- A passenger may review the assigned driver once, and only after trip completion.
create unique index if not exists reviews_ride_reviewer_uidx
  on public.reviews(ride_id, reviewer_id);
drop policy if exists reviews_insert_ride_participant on public.reviews;
create policy reviews_insert_passenger_completed
  on public.reviews for insert to authenticated
  with check (
    reviewer_id = auth.uid()
    and exists (
      select 1 from public.rides r
      where r.id = ride_id
        and r.status = 'completed'::public.drive_ride_status
        and r.driver_id = reviewee_id
        and exists (
          select 1 from public.ride_passengers rp
          where rp.ride_id = r.id and rp.passenger_id = auth.uid()
        )
    )
  );

-- Private KYC bucket. Upload and read access are scoped by the first path segment (user UUID).
insert into storage.buckets(id,name,public,file_size_limit,allowed_mime_types)
values (
  'drive-kyc',
  'drive-kyc',
  false,
  10485760,
  array['image/jpeg','image/png','application/pdf']
)
on conflict (id) do update
set public=false,file_size_limit=10485760,
    allowed_mime_types=array['image/jpeg','image/png','application/pdf'];

drop policy if exists drive_kyc_upload_own on storage.objects;
create policy drive_kyc_upload_own
  on storage.objects for insert to authenticated
  with check (
    bucket_id = 'drive-kyc'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
drop policy if exists drive_kyc_read_owner_admin on storage.objects;
create policy drive_kyc_read_owner_admin
  on storage.objects for select to authenticated
  using (
    bucket_id = 'drive-kyc'
    and (
      (storage.foldername(name))[1] = auth.uid()::text
      or private.drive_role() = 'admin'::public.drive_role
    )
  );

commit;