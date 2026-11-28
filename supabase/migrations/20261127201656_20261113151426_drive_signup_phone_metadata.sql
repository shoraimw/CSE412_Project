-- Keep email-signup phone metadata in the persistent profile.
create or replace function private.drive_new_user()
returns trigger language plpgsql security definer set search_path=''
as $$
begin
 insert into public.profiles(id,full_name,phone,role)
 values(new.id,coalesce(new.raw_user_meta_data->>'full_name',new.raw_user_meta_data->>'name',''),coalesce(new.phone,nullif(new.raw_user_meta_data->>'phone','')),'passenger')
 on conflict(id) do nothing;
 return new;
end
$$;