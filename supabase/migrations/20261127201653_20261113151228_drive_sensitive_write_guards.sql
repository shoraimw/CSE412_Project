-- Protect verification, payment and fare fields against direct client writes.
create or replace function public.drive_protect_sensitive_writes()
returns trigger language plpgsql set search_path=''
as $$
declare v_role public.drive_role := private.drive_role(); v_is_service boolean := current_user in ('service_role','postgres');
begin
 if tg_table_name='vehicles' then
  if tg_op='INSERT' then if not v_is_service and v_role <> 'admin' then new.is_verified:=false; end if;
  elsif new.is_verified is distinct from old.is_verified and not v_is_service and v_role <> 'admin' then raise exception 'Only administrators can verify vehicles'; end if;
 elsif tg_table_name='driver_documents' then
  if tg_op='INSERT' and not v_is_service and v_role <> 'admin' then new.verification_status:='pending';new.reviewer_id:=null;new.reviewed_at:=null;new.rejection_reason:=null;
  elsif tg_op='UPDATE' and not v_is_service and v_role <> 'admin' then raise exception 'Only administrators can review driver documents'; end if;
 elsif tg_table_name='payments' then
  if tg_op='INSERT' and not v_is_service and v_role <> 'admin' then new.status:='pending';new.provider_reference:=null;
  elsif tg_op='UPDATE' and not v_is_service and v_role <> 'admin' then raise exception 'Only administrators or trusted payment webhooks can update payment status'; end if;
 elsif tg_table_name='ride_requests' and tg_op='UPDATE' then
  if old.passenger_id=(select auth.uid()) and v_role='passenger' then
   if new.passenger_id is distinct from old.passenger_id or new.estimated_fare is distinct from old.estimated_fare or new.estimated_distance_km is distinct from old.estimated_distance_km or new.estimated_duration_minutes is distinct from old.estimated_duration_minutes or new.currency is distinct from old.currency then raise exception 'Passengers cannot change ownership or server-calculated fare fields'; end if;
   if new.status is distinct from old.status and not(old.status='requested' and new.status='cancelled') then raise exception 'Passengers may only cancel a requested ride'; end if;
  end if;
 end if;
 return new;
end; $$;
drop trigger if exists drive_vehicle_verification_guard on public.vehicles;
create trigger drive_vehicle_verification_guard before insert or update on public.vehicles for each row execute function public.drive_protect_sensitive_writes();
drop trigger if exists drive_driver_document_guard on public.driver_documents;
create trigger drive_driver_document_guard before insert or update on public.driver_documents for each row execute function public.drive_protect_sensitive_writes();
drop trigger if exists drive_payment_guard on public.payments;
create trigger drive_payment_guard before insert or update on public.payments for each row execute function public.drive_protect_sensitive_writes();
drop trigger if exists drive_ride_request_guard on public.ride_requests;
create trigger drive_ride_request_guard before update on public.ride_requests for each row execute function public.drive_protect_sensitive_writes();
