-- Persist tourist plans and enrich the shared destination catalogue.
alter table public.tourist_places add column if not exists tags text[] not null default '{}';
alter table public.tourist_places add column if not exists nearby_facilities text[] not null default '{}';
alter table public.tourist_places add column if not exists estimated_visit_hours numeric(4,1) not null default 1.5;
alter table public.tourist_plans add column if not exists travel_date date;
alter table public.tourist_plans add column if not exists origin_lat double precision;
alter table public.tourist_plans add column if not exists origin_lng double precision;
alter table public.tourist_plans add column if not exists total_distance_km numeric(10,2);
alter table public.tourist_plans add column if not exists approximate_travel_minutes integer;
alter table public.tourist_plans add column if not exists estimate_type text;
update public.tourist_places set tags=case when lower(category) in ('heritage','history') then array['history','architecture','culture','museum'] when lower(category)='architecture' then array['architecture','culture','photography'] when lower(category)='nature' then array['nature','walking','family','photography'] else array['culture','family'] end where cardinality(tags)=0;
update public.tourist_places set nearby_facilities=array['Local transport','Restaurants','Public facilities'] where cardinality(nearby_facilities)=0;
insert into public.tourist_places(name,city,description,latitude,longitude,category,tags,nearby_facilities,estimated_visit_hours)
select v.name,v.city,v.description,v.lat,v.lng,v.category,v.tags,v.facilities,v.hours from (values
('Ramna Park','Dhaka','A large green public park suitable for a relaxed walk and outdoor break.',23.7384,90.3964,'Nature',array['nature','walking','family'],array['Walking paths','Open green spaces','Nearby cafés'],1.0),
('Hatirjheel','Dhaka','An urban lake and public waterfront area popular for evening views.',23.7554,90.4113,'Nature',array['nature','photography','walking'],array['Food stalls','Walking areas','Public viewpoints'],1.0),
('Ethnological Museum','Chattogram','A museum showcasing the cultures and heritage of communities in Bangladesh.',22.335,91.82,'Culture',array['museum','culture','history'],array['Museum facilities','Restaurants','Local transport'],1.5),
('Cox’s Bazar Sea Beach','Cox’s Bazar','A long sandy beach and major coastal destination; follow local beach-safety guidance.',21.4272,91.9717,'Beach',array['beach','nature','sunset','family'],array['Hotels','Restaurants','Local transport'],3.0),
('Himchari National Park','Cox’s Bazar','A coastal national park known for green hills and scenic viewpoints.',21.385,92.025,'Nature',array['nature','hiking','adventure'],array['Local transport','Entry point','Food stalls'],2.0),
('Jaflong','Sylhet','A scenic destination near the India–Bangladesh border with hills and river views.',25.161,92.018,'Nature',array['nature','photography','adventure'],array['Local eateries','Boat operators','Local transport'],3.0),
('Ratargul Swamp Forest','Sylhet','A freshwater swamp forest; boat access and water levels vary by season.',25.003,91.98,'Nature',array['nature','boat','adventure'],array['Boat access points','Local guides','Small eateries'],3.0)
) as v(name,city,description,lat,lng,category,tags,facilities,hours)
where not exists(select 1 from public.tourist_places p where lower(p.name)=lower(v.name) and lower(p.city)=lower(v.city));
