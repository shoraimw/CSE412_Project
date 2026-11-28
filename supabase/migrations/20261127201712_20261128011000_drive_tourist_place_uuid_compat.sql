DELETE FROM public.tourist_places;
ALTER TABLE public.tourist_places ALTER COLUMN id DROP DEFAULT;
ALTER TABLE public.tourist_places ALTER COLUMN id TYPE uuid USING gen_random_uuid();
ALTER TABLE public.tourist_places ALTER COLUMN id SET DEFAULT gen_random_uuid();