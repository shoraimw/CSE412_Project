
BEGIN;

CREATE SCHEMA IF NOT EXISTS private;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS btree_gist;

DO $$ BEGIN
  CREATE TYPE public.drive_role AS ENUM ('passenger','driver','vehicle_owner','admin');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.drive_ride_status AS ENUM ('requested','matched','driver_arriving','in_progress','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.drive_rental_status AS ENUM ('pending','approved','rejected','active','completed','cancelled');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
  full_name text NOT NULL DEFAULT '',
  phone text,
  avatar_path text,
  role public.drive_role NOT NULL DEFAULT 'passenger',
  is_verified boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.driver_documents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  document_type text NOT NULL CHECK (document_type IN ('license_front','license_back','national_id','vehicle_registration')),
  storage_path text NOT NULL,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','approved','rejected')),
  reviewer_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  reviewed_at timestamptz,
  rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.vehicles (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  owner_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  make text NOT NULL,
  model text NOT NULL,
  vehicle_type text NOT NULL CHECK (vehicle_type IN ('car','bike','scooter','van','other')),
  plate_number text NOT NULL UNIQUE,
  city text NOT NULL DEFAULT 'Dhaka',
  seats smallint NOT NULL DEFAULT 1 CHECK (seats BETWEEN 1 AND 60),
  price_per_day numeric(12,2) CHECK (price_per_day IS NULL OR price_per_day >= 0),
  price_per_km numeric(12,2) CHECK (price_per_km IS NULL OR price_per_km >= 0),
  color text,
  model_year smallint CHECK (model_year IS NULL OR model_year BETWEEN 1980 AND 2100),
  description text,
  photo_paths text[] NOT NULL DEFAULT '{}',
  is_available boolean NOT NULL DEFAULT true,
  is_verified boolean NOT NULL DEFAULT false,
  verification_status text NOT NULL DEFAULT 'pending' CHECK (verification_status IN ('pending','approved','rejected')),
  verification_rejection_reason text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ride_requests (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  passenger_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  pickup_label text NOT NULL,
  pickup_lat double precision NOT NULL CHECK (pickup_lat BETWEEN -90 AND 90),
  pickup_lng double precision NOT NULL CHECK (pickup_lng BETWEEN -180 AND 180),
  destination_label text NOT NULL,
  destination_lat double precision NOT NULL CHECK (destination_lat BETWEEN -90 AND 90),
  destination_lng double precision NOT NULL CHECK (destination_lng BETWEEN -180 AND 180),
  requested_vehicle text NOT NULL CHECK (requested_vehicle IN ('car','bike','cng')),
  is_shared boolean NOT NULL DEFAULT false,
  women_safety_preference boolean NOT NULL DEFAULT false,
  estimated_distance_km numeric(10,2) NOT NULL CHECK (estimated_distance_km > 0),
  estimated_duration_minutes integer NOT NULL CHECK (estimated_duration_minutes > 0),
  estimated_fare numeric(12,2) NOT NULL CHECK (estimated_fare >= 0),
  currency text NOT NULL DEFAULT 'BDT' CHECK (currency = 'BDT'),
  notes text,
  seats_requested smallint NOT NULL DEFAULT 1 CHECK (seats_requested BETWEEN 1 AND 8),
  status public.drive_ride_status NOT NULL DEFAULT 'requested',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rides (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_id uuid NOT NULL UNIQUE REFERENCES public.ride_requests(id) ON DELETE RESTRICT,
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  vehicle_id uuid REFERENCES public.vehicles(id) ON DELETE SET NULL,
  status public.drive_ride_status NOT NULL DEFAULT 'matched',
  seat_capacity smallint NOT NULL DEFAULT 4 CHECK (seat_capacity BETWEEN 1 AND 8),
  accepted_at timestamptz,
  started_at timestamptz,
  completed_at timestamptz,
  actual_fare numeric(12,2) CHECK (actual_fare IS NULL OR actual_fare >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.ride_passengers (
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  passenger_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  seats smallint NOT NULL DEFAULT 1 CHECK (seats BETWEEN 1 AND 8),
  fare_share numeric(12,2) NOT NULL DEFAULT 0 CHECK (fare_share >= 0),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (ride_id, passenger_id)
);

CREATE TABLE IF NOT EXISTS public.trip_locations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL UNIQUE REFERENCES public.rides(id) ON DELETE CASCADE,
  driver_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  latitude double precision NOT NULL CHECK (latitude BETWEEN -90 AND 90),
  longitude double precision NOT NULL CHECK (longitude BETWEEN -180 AND 180),
  heading real CHECK (heading IS NULL OR heading BETWEEN 0 AND 360),
  speed_kph real CHECK (speed_kph IS NULL OR speed_kph BETWEEN 0 AND 300),
  recorded_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.rental_bookings (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  vehicle_id uuid NOT NULL REFERENCES public.vehicles(id) ON DELETE RESTRICT,
  renter_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  start_at timestamptz NOT NULL,
  end_at timestamptz NOT NULL,
  total_amount numeric(12,2) NOT NULL CHECK (total_amount >= 0),
  currency text NOT NULL DEFAULT 'BDT' CHECK (currency = 'BDT'),
  status public.drive_rental_status NOT NULL DEFAULT 'pending',
  pickup_note text,
  owner_note text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT rental_bookings_valid_window CHECK (end_at > start_at),
  CONSTRAINT rental_bookings_no_overlap EXCLUDE USING gist (
    vehicle_id WITH =,
    tstzrange(start_at, end_at, '[)') WITH &&
  ) WHERE (status IN ('pending','approved','active'))
);

CREATE TABLE IF NOT EXISTS public.payments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  ride_id uuid REFERENCES public.rides(id) ON DELETE RESTRICT,
  rental_booking_id uuid REFERENCES public.rental_bookings(id) ON DELETE RESTRICT,
  amount numeric(12,2) NOT NULL CHECK (amount > 0),
  currency text NOT NULL DEFAULT 'BDT',
  method text NOT NULL CHECK (method IN ('bkash','nagad','cash','card')),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','failed','refunded')),
  provider_reference text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT payments_exactly_one_target CHECK ((ride_id IS NOT NULL) <> (rental_booking_id IS NOT NULL))
);

CREATE TABLE IF NOT EXISTS public.reviews (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  ride_id uuid NOT NULL REFERENCES public.rides(id) ON DELETE CASCADE,
  reviewer_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  reviewee_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE RESTRICT,
  rating smallint NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (ride_id, reviewer_id),
  CHECK (reviewer_id <> reviewee_id)
);

CREATE TABLE IF NOT EXISTS public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL,
  entity_id uuid,
  read_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.trusted_contacts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  contact_name text NOT NULL,
  phone text NOT NULL,
  relationship text,
  contact_type text NOT NULL DEFAULT 'trusted' CHECK (contact_type IN ('trusted','emergency')),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.user_safety_preferences (
  user_id uuid PRIMARY KEY REFERENCES public.profiles(id) ON DELETE CASCADE,
  women_safety_enabled boolean NOT NULL DEFAULT false,
  prefer_verified_drivers boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.safety_alerts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  ride_id uuid REFERENCES public.rides(id) ON DELETE SET NULL,
  alert_type text NOT NULL,
  message text,
  latitude double precision CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  longitude double precision CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180),
  status text NOT NULL DEFAULT 'open' CHECK (status IN ('open','acknowledged','resolved','false_alarm')),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz
);

CREATE TABLE IF NOT EXISTS public.tourist_places (
  id text PRIMARY KEY,
  name text NOT NULL,
  city text NOT NULL,
  category text NOT NULL DEFAULT 'Explore',
  description text NOT NULL DEFAULT '',
  latitude double precision,
  longitude double precision,
  is_active boolean NOT NULL DEFAULT true,
  tags text[] NOT NULL DEFAULT '{}',
  nearby_facilities text[] NOT NULL DEFAULT '{}',
  estimated_visit_hours numeric(4,1) NOT NULL DEFAULT 1.5,
  created_at timestamptz NOT NULL DEFAULT now(),
  CHECK (latitude IS NULL OR latitude BETWEEN -90 AND 90),
  CHECK (longitude IS NULL OR longitude BETWEEN -180 AND 180)
);

CREATE TABLE IF NOT EXISTS public.tourist_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  city text NOT NULL,
  place_ids text[] NOT NULL DEFAULT '{}',
  transport_preference text NOT NULL DEFAULT 'Car' CHECK (transport_preference IN ('Car','Bike','Public Transport','Walking')),
  travel_date date,
  origin_lat double precision,
  origin_lng double precision,
  total_distance_km numeric(10,2),
  approximate_travel_minutes integer,
  estimate_type text,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS profiles_role_active_idx ON public.profiles(role,is_active,is_verified);
CREATE INDEX IF NOT EXISTS vehicles_owner_created_idx ON public.vehicles(owner_id,created_at DESC);
CREATE INDEX IF NOT EXISTS vehicles_catalog_idx ON public.vehicles(is_verified,is_available,created_at DESC);
CREATE INDEX IF NOT EXISTS ride_requests_passenger_created_idx ON public.ride_requests(passenger_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ride_requests_status_vehicle_created_idx ON public.ride_requests(status,requested_vehicle,created_at DESC);
CREATE INDEX IF NOT EXISTS rides_driver_created_idx ON public.rides(driver_id,created_at DESC);
CREATE INDEX IF NOT EXISTS ride_passengers_passenger_idx ON public.ride_passengers(passenger_id,ride_id);
CREATE INDEX IF NOT EXISTS rental_bookings_renter_created_idx ON public.rental_bookings(renter_id,created_at DESC);
CREATE INDEX IF NOT EXISTS rental_bookings_vehicle_status_idx ON public.rental_bookings(vehicle_id,status);
CREATE INDEX IF NOT EXISTS payments_user_created_idx ON public.payments(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS reviews_reviewee_idx ON public.reviews(reviewee_id,created_at DESC);
CREATE INDEX IF NOT EXISTS notifications_user_created_idx ON public.notifications(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS trusted_contacts_user_type_idx ON public.trusted_contacts(user_id,contact_type);
CREATE INDEX IF NOT EXISTS safety_alerts_user_created_idx ON public.safety_alerts(user_id,created_at DESC);
CREATE INDEX IF NOT EXISTS tourist_places_city_active_idx ON public.tourist_places(city,is_active);
CREATE INDEX IF NOT EXISTS tourist_plans_user_created_idx ON public.tourist_plans(user_id,created_at DESC);

CREATE OR REPLACE FUNCTION private.drive_role()
RETURNS public.drive_role
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT p.role
  FROM public.profiles AS p
  WHERE p.id = (SELECT auth.uid())
  LIMIT 1;
$$;

CREATE OR REPLACE FUNCTION private.drive_can_access_request(p_request_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = ''
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.ride_requests AS q
    WHERE q.id = p_request_id
      AND (
        q.passenger_id = (SELECT auth.uid())
        OR EXISTS (
          SELECT 1
          FROM public.rides AS r
          WHERE r.request_id = q.id
            AND (
              r.driver_id = (SELECT auth.uid())
              OR EXISTS (
                SELECT 1
                FROM public.ride_passengers AS rp
                WHERE rp.ride_id = r.id
                  AND rp.passenger_id = (SELECT auth.uid())
              )
            )
        )
      )
  );
$$;

CREATE OR REPLACE FUNCTION private.drive_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = ''
AS $$
BEGIN
  INSERT INTO public.profiles(id,full_name,phone,role)
  VALUES (
    new.id,
    coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',''),
    coalesce(new.phone,nullif(new.raw_user_meta_data->>'phone','')),
    'passenger'
  )
  ON CONFLICT(id) DO NOTHING;
  RETURN new;
END;
$$;

DROP TRIGGER IF EXISTS drive_auth_user_profile ON auth.users;
CREATE TRIGGER drive_auth_user_profile
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION private.drive_new_user();

GRANT USAGE ON SCHEMA public TO anon, authenticated;
GRANT USAGE ON SCHEMA private TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.drive_role() TO anon, authenticated;
GRANT EXECUTE ON FUNCTION private.drive_can_access_request(uuid) TO authenticated;
REVOKE ALL ON FUNCTION private.drive_new_user() FROM PUBLIC, anon, authenticated;
REVOKE ALL ON FUNCTION private.drive_can_access_request(uuid) FROM PUBLIC, anon;

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.driver_documents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vehicles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_requests ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rides ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.ride_passengers ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trip_locations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.rental_bookings ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.payments ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.reviews ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trusted_contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_safety_preferences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.safety_alerts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tourist_places ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.tourist_plans ENABLE ROW LEVEL SECURITY;

GRANT SELECT, UPDATE ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.driver_documents TO authenticated;
GRANT SELECT ON public.vehicles TO anon, authenticated;
GRANT INSERT, UPDATE ON public.vehicles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.ride_requests TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rides TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.ride_passengers TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.trip_locations TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.rental_bookings TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.payments TO authenticated;
GRANT SELECT, INSERT ON public.reviews TO authenticated;
GRANT SELECT, UPDATE(read_at) ON public.notifications TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.trusted_contacts TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.user_safety_preferences TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.safety_alerts TO authenticated;
GRANT SELECT ON public.tourist_places TO anon, authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tourist_places TO authenticated;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.tourist_plans TO authenticated;

CREATE POLICY profiles_read_self_or_admin ON public.profiles
FOR SELECT TO authenticated
USING (id = (SELECT auth.uid()) OR (SELECT private.drive_role()) = 'admin'::public.drive_role);

CREATE POLICY profiles_update_self_or_admin ON public.profiles
FOR UPDATE TO authenticated
USING (id = (SELECT auth.uid()) OR (SELECT private.drive_role()) = 'admin'::public.drive_role)
WITH CHECK (id = (SELECT auth.uid()) OR (SELECT private.drive_role()) = 'admin'::public.drive_role);

CREATE POLICY driver_documents_read_owner_admin ON public.driver_documents
FOR SELECT TO authenticated
USING (driver_id = (SELECT auth.uid()) OR (SELECT private.drive_role()) = 'admin'::public.drive_role);

CREATE POLICY driver_documents_insert_driver ON public.driver_documents
FOR INSERT TO authenticated
WITH CHECK (driver_id = (SELECT auth.uid()) AND (SELECT private.drive_role()) = 'driver');

CREATE POLICY driver_documents_admin_update ON public.driver_documents
FOR UPDATE TO authenticated
USING ((SELECT private.drive_role()) = 'admin'::public.drive_role)
WITH CHECK ((SELECT private.drive_role()) = 'admin'::public.drive_role);

CREATE POLICY vehicles_public_catalog ON public.vehicles
FOR SELECT TO anon, authenticated
USING (
  (is_verified = true AND is_available = true)
  OR owner_id = (SELECT auth.uid())
  OR (SELECT private.drive_role()) = 'admin'::public.drive_role
);

CREATE POLICY vehicles_owner_insert ON public.vehicles
FOR INSERT TO authenticated
WITH CHECK (owner_id = (SELECT auth.uid()) AND (SELECT private.drive_role()) = 'vehicle_owner');

CREATE POLICY vehicles_owner_or_admin_update ON public.vehicles
FOR UPDATE TO authenticated
USING (owner_id = (SELECT auth.uid()) OR (SELECT private.drive_role()) = 'admin'::public.drive_role)
WITH CHECK (owner_id = (SELECT auth.uid()) OR (SELECT private.drive_role()) = 'admin'::public.drive_role);

CREATE POLICY ride_requests_insert_passenger ON public.ride_requests
FOR INSERT TO authenticated
WITH CHECK (
  passenger_id = (SELECT auth.uid())
  AND (SELECT private.drive_role()) = 'passenger'
  AND status = 'requested'::public.drive_ride_status
);

CREATE POLICY ride_requests_read_initial ON public.ride_requests
FOR SELECT TO authenticated
USING (
  passenger_id = (SELECT auth.uid())
  OR (SELECT private.drive_role()) = 'admin'::public.drive_role
  OR private.drive_can_access_request(id)
);

CREATE POLICY ride_requests_update_initial ON public.ride_requests
FOR UPDATE TO authenticated
USING (
  passenger_id = (SELECT auth.uid())
  OR (SELECT private.drive_role()) = 'admin'::public.drive_role
)
WITH CHECK (
  passenger_id = (SELECT auth.uid())
  OR (SELECT private.drive_role()) = 'admin'::public.drive_role
);

CREATE POLICY rides_read_participants ON public.rides
FOR SELECT TO authenticated
USING (
  driver_id = (SELECT auth.uid())
  OR (SELECT private.drive_role()) = 'admin'::public.drive_role
  OR EXISTS (
    SELECT 1 FROM public.ride_requests q
    WHERE q.id = rides.request_id AND q.passenger_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.ride_passengers rp
    WHERE rp.ride_id = rides.id AND rp.passenger_id = (SELECT auth.uid())
  )
);

CREATE POLICY rides_update_driver_or_admin ON public.rides
FOR UPDATE TO authenticated
USING (driver_id = (SELECT auth.uid()) OR (SELECT private.drive_role()) = 'admin'::public.drive_role)
WITH CHECK (driver_id = (SELECT auth.uid()) OR (SELECT private.drive_role()) = 'admin'::public.drive_role);

CREATE POLICY ride_passengers_read_participants ON public.ride_passengers
FOR SELECT TO authenticated
USING (
  passenger_id = (SELECT auth.uid())
  OR (SELECT private.drive_role()) = 'admin'::public.drive_role
  OR EXISTS (SELECT 1 FROM public.rides r WHERE r.id = ride_passengers.ride_id AND r.driver_id = (SELECT auth.uid()))
);

CREATE POLICY trip_locations_read_participants ON public.trip_locations
FOR SELECT TO authenticated
USING (
  (SELECT private.drive_role()) = 'admin'::public.drive_role
  OR driver_id = (SELECT auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.rides r
    JOIN public.ride_requests q ON q.id = r.request_id
    WHERE r.id = trip_locations.ride_id AND q.passenger_id = (SELECT auth.uid())
  )
  OR EXISTS (
    SELECT 1 FROM public.ride_passengers rp
    WHERE rp.ride_id = trip_locations.ride_id AND rp.passenger_id = (SELECT auth.uid())
  )
);

CREATE POLICY trip_locations_driver_insert ON public.trip_locations
FOR INSERT TO authenticated
WITH CHECK (
  driver_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.rides r WHERE r.id = trip_locations.ride_id AND r.driver_id = (SELECT auth.uid()))
);

CREATE POLICY trip_locations_driver_update ON public.trip_locations
FOR UPDATE TO authenticated
USING (
  driver_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.rides r WHERE r.id = trip_locations.ride_id AND r.driver_id = (SELECT auth.uid()))
)
WITH CHECK (
  driver_id = (SELECT auth.uid())
  AND EXISTS (SELECT 1 FROM public.rides r WHERE r.id = trip_locations.ride_id AND r.driver_id = (SELECT auth.uid()))
);

CREATE POLICY rental_bookings_read_parties ON public.rental_bookings
FOR SELECT TO authenticated
USING (
  renter_id = (SELECT auth.uid())
  OR EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = rental_bookings.vehicle_id AND v.owner_id = (SELECT auth.uid()))
  OR (SELECT private.drive_role()) = 'admin'::public.drive_role
);

CREATE POLICY rental_bookings_insert_renter ON public.rental_bookings
FOR INSERT TO authenticated
WITH CHECK (renter_id = (SELECT auth.uid()) AND (SELECT private.drive_role()) = 'passenger');

CREATE POLICY rental_bookings_update_owner_admin ON public.rental_bookings
FOR UPDATE TO authenticated
USING (
  EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = rental_bookings.vehicle_id AND v.owner_id = (SELECT auth.uid()))
  OR (SELECT private.drive_role()) = 'admin'::public.drive_role
)
WITH CHECK (
  EXISTS (SELECT 1 FROM public.vehicles v WHERE v.id = rental_bookings.vehicle_id AND v.owner_id = (SELECT auth.uid()))
  OR (SELECT private.drive_role()) = 'admin'::public.drive_role
);

CREATE POLICY payments_read_owner_admin ON public.payments
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR (SELECT private.drive_role()) = 'admin'::public.drive_role);

CREATE POLICY payments_insert_owner ON public.payments
FOR INSERT TO authenticated
WITH CHECK (
  user_id = (SELECT auth.uid())
  AND status = 'pending'
  AND provider_reference IS NULL
);

CREATE POLICY payments_admin_update ON public.payments
FOR UPDATE TO authenticated
USING ((SELECT private.drive_role()) = 'admin'::public.drive_role)
WITH CHECK ((SELECT private.drive_role()) = 'admin'::public.drive_role);

CREATE POLICY reviews_read_authenticated ON public.reviews
FOR SELECT TO authenticated
USING (true);

CREATE POLICY reviews_insert_ride_participant ON public.reviews
FOR INSERT TO authenticated
WITH CHECK (
  reviewer_id = (SELECT auth.uid())
  AND EXISTS (
    SELECT 1 FROM public.rides r
    WHERE r.id = reviews.ride_id
      AND r.status = 'completed'::public.drive_ride_status
      AND (
        r.driver_id = (SELECT auth.uid())
        OR EXISTS (SELECT 1 FROM public.ride_passengers rp WHERE rp.ride_id = r.id AND rp.passenger_id = (SELECT auth.uid()))
      )
  )
);

CREATE POLICY notifications_read_owner ON public.notifications
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()));

CREATE POLICY notifications_update_owner ON public.notifications
FOR UPDATE TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY trusted_contacts_owner_all ON public.trusted_contacts
FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY user_safety_preferences_owner_all ON public.user_safety_preferences
FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY safety_alerts_read_owner_admin ON public.safety_alerts
FOR SELECT TO authenticated
USING (user_id = (SELECT auth.uid()) OR (SELECT private.drive_role()) = 'admin'::public.drive_role);

CREATE POLICY safety_alerts_insert_owner ON public.safety_alerts
FOR INSERT TO authenticated
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE POLICY safety_alerts_admin_update ON public.safety_alerts
FOR UPDATE TO authenticated
USING ((SELECT private.drive_role()) = 'admin'::public.drive_role)
WITH CHECK ((SELECT private.drive_role()) = 'admin'::public.drive_role);

CREATE POLICY tourist_places_public_read ON public.tourist_places
FOR SELECT TO anon, authenticated
USING (is_active = true OR (SELECT private.drive_role()) = 'admin'::public.drive_role);

CREATE POLICY tourist_places_admin_manage ON public.tourist_places
FOR ALL TO authenticated
USING ((SELECT private.drive_role()) = 'admin'::public.drive_role)
WITH CHECK ((SELECT private.drive_role()) = 'admin'::public.drive_role);

CREATE POLICY tourist_plans_owner_all ON public.tourist_plans
FOR ALL TO authenticated
USING (user_id = (SELECT auth.uid()))
WITH CHECK (user_id = (SELECT auth.uid()));

CREATE UNIQUE INDEX IF NOT EXISTS payments_provider_reference_unique
ON public.payments(provider_reference)
WHERE provider_reference IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS notifications_user_type_entity_uidx
ON public.notifications(user_id,type,entity_id)
WHERE entity_id IS NOT NULL;

INSERT INTO public.tourist_places
(id,name,city,category,description,latitude,longitude,is_active,tags,nearby_facilities,estimated_visit_hours)
VALUES
('dhaka-lalbagh','Lalbagh Fort','Dhaka','History','A historic Mughal-era fort complex in Old Dhaka.',23.7189,90.3881,true,ARRAY['history','architecture','culture'],ARRAY['Museum','Food','Transport'],2.0),
('dhaka-ahsan','Ahsan Manzil','Dhaka','History','The historic pink palace beside the Buriganga River.',23.7089,90.4067,true,ARRAY['history','architecture','culture'],ARRAY['Museum','Riverfront','Food'],1.5),
('dhaka-museum','Bangladesh National Museum','Dhaka','Culture','A major museum covering the history and heritage of Bangladesh.',23.7380,90.3945,true,ARRAY['history','culture','museum'],ARRAY['Food','Transport'],2.0),
('dhaka-hatirjheel','Hatirjheel','Dhaka','Nature','An urban lakefront area for an evening walk and city views.',23.7527,90.4117,true,ARRAY['nature','walking','photography'],ARRAY['Food','Transport','Restrooms'],1.5),
('ctg-patenga','Patenga Sea Beach','Chattogram','Beach','A popular seaside destination near the mouth of the Karnaphuli River.',22.2332,91.7933,true,ARRAY['beach','nature','sunset'],ARRAY['Food','Transport','Parking'],2.0),
('ctg-foys','Foy''s Lake','Chattogram','Nature','A scenic lake and recreation area surrounded by hills.',22.3664,91.7886,true,ARRAY['nature','family','photography'],ARRAY['Food','Tickets','Parking'],3.0),
('cox-beach','Cox''s Bazar Beach','Cox''s Bazar','Beach','A long sandy beach along the Bay of Bengal.',21.4272,91.9702,true,ARRAY['beach','nature','sunset'],ARRAY['Hotels','Food','Transport'],3.0),
('cox-himchari','Himchari National Park','Cox''s Bazar','Nature','A coastal hill and waterfall area south of Cox''s Bazar.',21.3753,92.0316,true,ARRAY['nature','hiking','photography'],ARRAY['Food','Transport'],2.5),
('cox-inani','Inani Beach','Cox''s Bazar','Beach','A quieter coastal stretch known for rocky shoreline views.',21.1664,92.0485,true,ARRAY['beach','nature','photography'],ARRAY['Food','Transport'],2.5),
('sylhet-ratargul','Ratargul Swamp Forest','Sylhet','Nature','A freshwater swamp forest known for boat trips during suitable seasons.',25.0075,91.9927,true,ARRAY['nature','boat','photography'],ARRAY['Boat','Local Guide'],3.0),
('sylhet-jaflong','Jaflong','Sylhet','Nature','A scenic destination near the Bangladesh–India border with river and hill views.',25.1631,92.0167,true,ARRAY['nature','river','photography'],ARRAY['Food','Transport'],3.0),
('sylhet-lalakhal','Lalakhal','Sylhet','Nature','A river destination known for clear water and boat journeys.',25.1443,92.1608,true,ARRAY['nature','boat','photography'],ARRAY['Boat','Food'],2.5)
ON CONFLICT (id) DO UPDATE SET
  name=EXCLUDED.name,
  city=EXCLUDED.city,
  category=EXCLUDED.category,
  description=EXCLUDED.description,
  latitude=EXCLUDED.latitude,
  longitude=EXCLUDED.longitude,
  is_active=EXCLUDED.is_active,
  tags=EXCLUDED.tags,
  nearby_facilities=EXCLUDED.nearby_facilities,
  estimated_visit_hours=EXCLUDED.estimated_visit_hours;

DO $$
DECLARE
  v_table text;
BEGIN
  IF EXISTS (SELECT 1 FROM pg_publication WHERE pubname = 'supabase_realtime') THEN
    FOREACH v_table IN ARRAY ARRAY['ride_requests','rides','trip_locations','notifications'] LOOP
      IF NOT EXISTS (
        SELECT 1 FROM pg_publication_tables
        WHERE pubname='supabase_realtime' AND schemaname='public' AND tablename=v_table
      ) THEN
        EXECUTE format('ALTER PUBLICATION supabase_realtime ADD TABLE public.%I',v_table);
      END IF;
    END LOOP;
  END IF;
END $$;

COMMIT;
