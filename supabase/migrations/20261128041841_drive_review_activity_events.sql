create or replace function private.drive_log_review_activity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_request_id uuid;
begin
  select r.request_id into v_request_id
  from public.rides r where r.id=new.ride_id;

  insert into public.ride_activity_events(
    request_id,ride_id,actor_id,actor_role,action,metadata
  ) values (
    v_request_id,new.ride_id,new.reviewer_id,private.drive_role(),
    'customer_review_submitted',
    jsonb_build_object('reviewId',new.id,'rating',new.rating,'commentLength',char_length(coalesce(new.comment,'')))
  );
  return new;
end;
$$;

drop trigger if exists drive_log_review_activity on public.reviews;
create trigger drive_log_review_activity
after insert on public.reviews
for each row execute function private.drive_log_review_activity();
