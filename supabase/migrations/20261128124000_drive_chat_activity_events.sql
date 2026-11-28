create or replace function private.drive_log_chat_message_activity()
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
    v_request_id,new.ride_id,new.sender_id,private.drive_role(),
    'chat_message_sent',
    jsonb_build_object('messageId',new.id,'messageLength',char_length(new.body))
  );
  return new;
end;
$$;

drop trigger if exists drive_log_ride_chat_message on public.ride_messages;
create trigger drive_log_ride_chat_message
after insert on public.ride_messages
for each row execute function private.drive_log_chat_message_activity();
