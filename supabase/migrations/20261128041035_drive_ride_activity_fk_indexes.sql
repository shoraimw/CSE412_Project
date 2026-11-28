create index if not exists ride_activity_events_actor_created_idx
  on public.ride_activity_events(actor_id,created_at desc)
  where actor_id is not null;
create index if not exists ride_cancellation_requests_requester_created_idx
  on public.ride_cancellation_requests(requester_id,created_at desc);
create index if not exists ride_cancellation_requests_reviewer_created_idx
  on public.ride_cancellation_requests(reviewer_id,created_at desc)
  where reviewer_id is not null;
create index if not exists ride_messages_sender_created_idx
  on public.ride_messages(sender_id,created_at desc);
