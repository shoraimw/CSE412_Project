-- Extend the ride-request write guard to every account that can book.
-- A Driver or Vehicle Owner may cancel only their own unaccepted request;
-- neither role gains permission to alter server-calculated route or fare fields.
create or replace function public.drive_protect_sensitive_writes()
returns trigger
language plpgsql
set search_path = ''
as $$
declare
  v_role public.drive_role := private.drive_role();
  v_is_service boolean := current_user in ('service_role','postgres');
begin
  if tg_table_name='vehicles' then
    if tg_op='INSERT' then
      if not v_is_service and v_role <> 'admin'::public.drive_role then new.is_verified:=false; end if;
    elsif new.is_verified is distinct from old.is_verified and not v_is_service and v_role <> 'admin'::public.drive_role then
      raise exception 'Only administrators can verify vehicles';
    end if;
  elsif tg_table_name='driver_documents' then
    if tg_op='INSERT' and not v_is_service and v_role <> 'admin'::public.drive_role then
      new.verification_status:='pending';new.reviewer_id:=null;new.reviewed_at:=null;new.rejection_reason:=null;
    elsif tg_op='UPDATE' and not v_is_service and v_role <> 'admin'::public.drive_role then
      raise exception 'Only administrators can review driver documents';
    end if;
  elsif tg_table_name='payments' then
    if tg_op='INSERT' and not v_is_service and v_role <> 'admin'::public.drive_role then
      new.status:='pending';new.provider_reference:=null;
    elsif tg_op='UPDATE' and not v_is_service and v_role <> 'admin'::public.drive_role then
      raise exception 'Only administrators or trusted payment webhooks can update payment status';
    end if;
  elsif tg_table_name='ride_requests' and tg_op='UPDATE' then
    if old.passenger_id=(select auth.uid())
       and v_role in ('passenger'::public.drive_role,'driver'::public.drive_role,'vehicle_owner'::public.drive_role) then
      if new.passenger_id is distinct from old.passenger_id
        or new.pickup_label is distinct from old.pickup_label
        or new.pickup_lat is distinct from old.pickup_lat
        or new.pickup_lng is distinct from old.pickup_lng
        or new.destination_label is distinct from old.destination_label
        or new.destination_lat is distinct from old.destination_lat
        or new.destination_lng is distinct from old.destination_lng
        or new.requested_vehicle is distinct from old.requested_vehicle
        or new.is_shared is distinct from old.is_shared
        or new.women_safety_preference is distinct from old.women_safety_preference
        or new.estimated_fare is distinct from old.estimated_fare
        or new.estimated_distance_km is distinct from old.estimated_distance_km
        or new.estimated_duration_minutes is distinct from old.estimated_duration_minutes
        or new.currency is distinct from old.currency
        or new.seats_requested is distinct from old.seats_requested
        or new.cancellation_fee is distinct from old.cancellation_fee then
        raise exception 'Customers cannot change ride ownership, route, vehicle, fare or server-controlled fields';
      end if;
      if new.status is distinct from old.status then
        if not (old.status='requested'::public.drive_ride_status and new.status='cancelled'::public.drive_ride_status) then
          raise exception 'Customers may only cancel their own unaccepted ride request';
        end if;
        new.cancelled_at:=coalesce(old.cancelled_at,now());
      elsif new.cancelled_at is distinct from old.cancelled_at then
        raise exception 'Cancellation timestamps are managed by DRIVE';
      end if;
    end if;
  end if;
  return new;
end;
$$;
