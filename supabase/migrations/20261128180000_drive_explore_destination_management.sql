BEGIN;

ALTER TABLE public.tourist_places
  ADD COLUMN IF NOT EXISTS address text,
  ADD COLUMN IF NOT EXISTS image_url text,
  ADD COLUMN IF NOT EXISTS image_alt text,
  ADD COLUMN IF NOT EXISTS image_credit text,
  ADD COLUMN IF NOT EXISTS image_source_url text,
  ADD COLUMN IF NOT EXISTS image_storage_path text;

CREATE INDEX IF NOT EXISTS tourist_places_category_active_idx
  ON public.tourist_places(category, is_active, city);

INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'tourist-places',
  'tourist-places',
  true,
  5242880,
  ARRAY['image/jpeg', 'image/png', 'image/webp']
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  public = true,
  file_size_limit = EXCLUDED.file_size_limit,
  allowed_mime_types = EXCLUDED.allowed_mime_types;

DROP POLICY IF EXISTS tourist_place_images_public_read ON storage.objects;
CREATE POLICY tourist_place_images_public_read
  ON storage.objects FOR SELECT TO anon, authenticated
  USING (bucket_id = 'tourist-places');

DROP POLICY IF EXISTS tourist_place_images_admin_upload ON storage.objects;
CREATE POLICY tourist_place_images_admin_upload
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'tourist-places'
    AND (SELECT private.drive_role()) = 'admin'::public.drive_role
  );

DROP POLICY IF EXISTS tourist_place_images_admin_delete ON storage.objects;
CREATE POLICY tourist_place_images_admin_delete
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'tourist-places'
    AND (SELECT private.drive_role()) = 'admin'::public.drive_role
  );

UPDATE public.tourist_places SET
  address = 'Lalbagh, Old Dhaka, Dhaka',
  image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Lalbagh_Fort%2C_Dhaka%2C_Bangladesh.jpg?width=1200',
  image_alt = 'Lalbagh Fort in Old Dhaka',
  image_credit = 'Nabil Zawad · CC BY-SA 4.0',
  image_source_url = 'https://commons.wikimedia.org/wiki/File:Lalbagh_Fort,_Dhaka,_Bangladesh.jpg'
WHERE lower(name) = lower('Lalbagh Fort') AND lower(city) = 'dhaka';

UPDATE public.tourist_places SET
  address = 'Kumartoli, Islampur Road, Dhaka',
  image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Ahsan_Manzil%2C_Dhaka%2C_Bangladesh.jpg?width=1200',
  image_alt = 'Ahsan Manzil pink palace in Dhaka',
  image_credit = 'Bhfaisal427 · CC BY-SA 4.0',
  image_source_url = 'https://commons.wikimedia.org/wiki/File:Ahsan_Manzil,_Dhaka,_Bangladesh.jpg'
WHERE lower(name) = lower('Ahsan Manzil') AND lower(city) = 'dhaka';

UPDATE public.tourist_places SET
  address = 'Shahbag, Dhaka',
  image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Bangladesh_National_Museum_Dhaka.jpg?width=1200',
  image_alt = 'Bangladesh National Museum in Shahbag',
  image_credit = 'Wikimedia Commons contributor',
  image_source_url = 'https://commons.wikimedia.org/wiki/File:Bangladesh_National_Museum_Dhaka.jpg'
WHERE lower(name) = lower('Bangladesh National Museum') AND lower(city) = 'dhaka';

UPDATE public.tourist_places SET
  address = 'Hatirjheel, Dhaka',
  image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Hatirjheel%2C_Dhaka.jpg?width=1200',
  image_alt = 'Hatirjheel lakefront and walkway in Dhaka',
  image_credit = 'Salim Khandoker · Wikimedia Commons',
  image_source_url = 'https://commons.wikimedia.org/wiki/File:Hatirjheel,_Dhaka.jpg'
WHERE lower(name) = lower('Hatirjheel') AND lower(city) = 'dhaka';

UPDATE public.tourist_places SET
  address = 'Ramna, Dhaka',
  image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Ramna_park_Dhaka.jpg?width=1200',
  image_alt = 'Green landscape at Ramna Park',
  image_credit = 'MFUS · CC BY-SA 4.0',
  image_source_url = 'https://commons.wikimedia.org/wiki/File:Ramna_park_Dhaka.jpg'
WHERE lower(name) = lower('Ramna Park') AND lower(city) = 'dhaka';

UPDATE public.tourist_places SET
  address = 'Gowainghat, Sylhet',
  image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Ratargul-Swamp-Forest.jpg?width=1200',
  image_alt = 'Boats among trees at Ratargul Swamp Forest',
  image_credit = 'Hemel · CC BY-SA 4.0',
  image_source_url = 'https://commons.wikimedia.org/wiki/File:Ratargul-Swamp-Forest.jpg'
WHERE lower(name) = lower('Ratargul Swamp Forest') AND lower(city) = 'sylhet';

UPDATE public.tourist_places SET
  address = 'Jaflong, Gowainghat, Sylhet',
  image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Lalakhal_Sylhet.jpg?width=1200',
  image_alt = 'River and hills at Jaflong in Sylhet',
  image_credit = 'Salam Khokon · Wikimedia Commons',
  image_source_url = 'https://commons.wikimedia.org/wiki/File:Lalakhal_Sylhet.jpg'
WHERE lower(name) = lower('Jaflong') AND lower(city) = 'sylhet';

UPDATE public.tourist_places SET
  address = 'Pahartali, Chattogram',
  image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Foy%27s_Lake_Chittagong.JPG?width=1200',
  image_alt = 'Foy’s Lake surrounded by green hills',
  image_credit = 'Ariful Islam · GFDL 1.2+',
  image_source_url = 'https://commons.wikimedia.org/wiki/File:Foy%27s_Lake_Chittagong.JPG'
WHERE lower(name) = lower('Foy''s Lake') AND lower(city) = 'chattogram';

UPDATE public.tourist_places SET
  address = 'Patenga, Chattogram',
  image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Patenga_Sea_Beach_1.jpg?width=1200',
  image_alt = 'Patenga Sea Beach in Chattogram',
  image_credit = 'Tanim · CC BY-SA',
  image_source_url = 'https://commons.wikimedia.org/wiki/File:Patenga_Sea_Beach_1.jpg'
WHERE lower(name) = lower('Patenga Sea Beach') AND lower(city) = 'chattogram';

UPDATE public.tourist_places SET
  address = 'Cox’s Bazar Sea Beach, Cox’s Bazar',
  image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Cox%27s_Bazar_sea_beach%2C_Bangladesh.jpg?width=1200',
  image_alt = 'Sandy shoreline at Cox’s Bazar Sea Beach',
  image_credit = 'Tanvir Rahat · CC BY-SA',
  image_source_url = 'https://commons.wikimedia.org/wiki/File:Cox%27s_Bazar_sea_beach,_Bangladesh.jpg'
WHERE lower(name) = lower('Cox’s Bazar Sea Beach') AND lower(city) = lower('Cox’s Bazar');

UPDATE public.tourist_places SET
  address = 'Himchari, Cox’s Bazar',
  image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Himchari_National_Park_%282%29.jpg?width=1200',
  image_alt = 'Green forest landscape inside Himchari National Park',
  image_credit = 'Rocky Masum · CC BY-SA',
  image_source_url = 'https://commons.wikimedia.org/wiki/File:Himchari_National_Park_(2).jpg'
WHERE lower(name) = lower('Himchari National Park') AND lower(city) = lower('Cox’s Bazar');

UPDATE public.tourist_places SET
  address = 'Ethnological Museum Road, Agrabad, Chattogram',
  image_url = 'https://commons.wikimedia.org/wiki/Special:FilePath/Ethnological_Museum_of_Chittagong.JPG?width=1200',
  image_alt = 'Ethnological Museum in Chattogram',
  image_credit = 'Moheen Reeyad · CC BY-SA 4.0',
  image_source_url = 'https://commons.wikimedia.org/wiki/File:Ethnological_Museum_of_Chittagong.JPG'
WHERE lower(name) = lower('Ethnological Museum') AND lower(city) = 'chattogram';

INSERT INTO public.tourist_places
  (name, city, category, description, latitude, longitude, is_active, tags, nearby_facilities,
   estimated_visit_hours, address, image_url, image_alt, image_credit, image_source_url)
SELECT v.name, v.city, v.category, v.description, v.latitude, v.longitude, true, v.tags,
       v.nearby_facilities, v.estimated_visit_hours, v.address, v.image_url, v.image_alt,
       v.image_credit, v.image_source_url
FROM (VALUES
  ('Lalbagh Fort', 'Dhaka', 'History', 'A Mughal-era fort complex in Old Dhaka with historic gateways, gardens and the tomb of Pari Bibi.', 23.7189, 90.3881, ARRAY['history','architecture','photography'], ARRAY['Museum','Food','Transport'], 2.0, 'Lalbagh, Old Dhaka, Dhaka', 'https://commons.wikimedia.org/wiki/Special:FilePath/Lalbagh_Fort%2C_Dhaka%2C_Bangladesh.jpg?width=1200', 'Lalbagh Fort in Old Dhaka', 'Nabil Zawad · CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Lalbagh_Fort,_Dhaka,_Bangladesh.jpg'),
  ('Ahsan Manzil', 'Dhaka', 'History', 'The pink palace beside the Buriganga River, now a museum displaying the history of the Nawab family.', 23.7089, 90.4067, ARRAY['history','architecture','museum'], ARRAY['Museum','Riverfront','Food'], 1.5, 'Kumartoli, Islampur Road, Dhaka', 'https://commons.wikimedia.org/wiki/Special:FilePath/Ahsan_Manzil%2C_Dhaka%2C_Bangladesh.jpg?width=1200', 'Ahsan Manzil pink palace in Dhaka', 'Bhfaisal427 · CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Ahsan_Manzil,_Dhaka,_Bangladesh.jpg'),
  ('Bangladesh National Museum', 'Dhaka', 'Culture', 'Explore galleries covering the archaeology, art, history, natural heritage and cultural traditions of Bangladesh.', 23.7380, 90.3945, ARRAY['museum','culture','history'], ARRAY['Museum','Food','Transport'], 2.0, 'Shahbag, Dhaka', 'https://commons.wikimedia.org/wiki/Special:FilePath/Bangladesh_National_Museum_Dhaka.jpg?width=1200', 'Bangladesh National Museum in Shahbag', 'Wikimedia Commons contributor', 'https://commons.wikimedia.org/wiki/File:Bangladesh_National_Museum_Dhaka.jpg'),
  ('Foy''s Lake', 'Chattogram', 'Nature', 'A scenic man-made lake surrounded by hills, with boating and family recreation options.', 22.3664, 91.7886, ARRAY['nature','family','photography'], ARRAY['Food','Tickets','Parking'], 3.0, 'Pahartali, Chattogram', 'https://commons.wikimedia.org/wiki/Special:FilePath/Foy%27s_Lake_Chittagong.JPG?width=1200', 'Foy’s Lake surrounded by green hills', 'Ariful Islam · GFDL 1.2+', 'https://commons.wikimedia.org/wiki/File:Foy%27s_Lake_Chittagong.JPG'),
  ('Patenga Sea Beach', 'Chattogram', 'Beach', 'A lively coastal spot near the Karnaphuli River mouth, popular for sea views and evening walks.', 22.2332, 91.7933, ARRAY['beach','sunset','photography'], ARRAY['Food','Transport','Parking'], 2.0, 'Patenga, Chattogram', 'https://commons.wikimedia.org/wiki/Special:FilePath/Patenga_Sea_Beach_1.jpg?width=1200', 'Patenga Sea Beach in Chattogram', 'Tanim · CC BY-SA', 'https://commons.wikimedia.org/wiki/File:Patenga_Sea_Beach_1.jpg'),
  ('Saint Martin Island', 'Teknaf', 'Beach', 'A coral island in the Bay of Bengal known for clear water, rocky shorelines and boat trips. Check current travel restrictions before visiting.', 20.6270, 92.3220, ARRAY['beach','island','snorkelling','nature'], ARRAY['Boat access','Local guides','Food'], 5.0, 'Saint Martin Island, Teknaf, Cox’s Bazar', 'https://commons.wikimedia.org/wiki/Special:FilePath/Saint_Martin_Island_Bangladesh.jpg?width=1200', 'Saint Martin Island in Bangladesh', 'Ahsan Al Hisham · CC BY-SA', 'https://commons.wikimedia.org/wiki/File:Saint_Martin_Island_Bangladesh.jpg'),
  ('Kuakata Sea Beach', 'Patuakhali', 'Beach', 'A long sandy beach in southern Bangladesh, known for wide coastal views and sunrise and sunset scenery.', 21.8144, 90.1222, ARRAY['beach','sunrise','sunset','photography'], ARRAY['Hotels','Food','Transport'], 3.0, 'Kuakata, Patuakhali', 'https://commons.wikimedia.org/wiki/Special:FilePath/Kuakata_beach.jpg?width=1200', 'Kuakata Sea Beach in Patuakhali', 'Mahbub Hasan · CC BY-SA', 'https://commons.wikimedia.org/wiki/File:Kuakata_beach.jpg'),
  ('Sajek Valley', 'Rangamati', 'Adventure', 'A hill destination known for rolling green ridges, cloud-filled valleys and views from the Ruilui area.', 23.3810, 92.2930, ARRAY['nature','hiking','mountains','photography'], ARRAY['Local guides','Resorts','Food'], 5.0, 'Sajek, Baghaichhari, Rangamati', 'https://commons.wikimedia.org/wiki/Special:FilePath/Mountain_of_Sajek_Valley.jpg?width=1200', 'Green hills and clouds at Sajek Valley', 'Mahjuja Islam · CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Mountain_of_Sajek_Valley.jpg'),
  ('Sundarbans - Karamjal', 'Khulna', 'Wildlife', 'A visitor area at the edge of the Sundarbans mangrove forest, with forest trails and wildlife interpretation. Access requires checking local permits and boat arrangements.', 22.4310, 89.5920, ARRAY['wildlife','nature','boat','forest'], ARRAY['Boat access','Forest office','Local guides'], 4.0, 'Karamjal, Mongla, Bagerhat', 'https://commons.wikimedia.org/wiki/Special:FilePath/SUNDARBAN.jpg?width=1200', 'Mangrove waterways in the Sundarbans', 'Wikimedia Commons contributor', 'https://commons.wikimedia.org/wiki/File:SUNDARBAN.jpg'),
  ('Lalakhal', 'Sylhet', 'Nature', 'A river destination near Jaintiapur known for boat journeys and changing shades of clear water.', 25.1443, 92.1608, ARRAY['nature','river','boat','photography'], ARRAY['Boat','Food','Transport'], 2.5, 'Jaintiapur, Sylhet', 'https://commons.wikimedia.org/wiki/Special:FilePath/Lalakhal_Sylhet.jpg?width=1200', 'The Sari River at Lalakhal in Sylhet', 'Sadiakorobi · CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Lalakhal_Sylhet.jpg'),
  ('Inani Beach', 'Cox’s Bazar', 'Beach', 'A quieter coastal stretch south of Cox’s Bazar, known for rocky shoreline views and open sea.', 21.1664, 92.0485, ARRAY['beach','nature','photography'], ARRAY['Food','Transport'], 2.5, 'Inani, Ukhiya, Cox’s Bazar', 'https://commons.wikimedia.org/wiki/Special:FilePath/Inani_sea_beach%2C_Cox%27s_Bazar%2C_Bangladesh.jpg?width=1200', 'Inani sea beach in Cox’s Bazar', 'Tanvir Rahat · CC BY-SA 4.0', 'https://commons.wikimedia.org/wiki/File:Inani_sea_beach,_Cox%27s_Bazar,_Bangladesh.jpg')
) AS v(name, city, category, description, latitude, longitude, tags, nearby_facilities,
       estimated_visit_hours, address, image_url, image_alt, image_credit, image_source_url)
WHERE NOT EXISTS (
  SELECT 1 FROM public.tourist_places p
  WHERE lower(p.name) = lower(v.name) AND lower(p.city) = lower(v.city)
);

COMMIT;
