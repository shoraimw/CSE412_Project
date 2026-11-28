begin;
create or replace function public.drive_admin_notify_payment_status(p_payment_id uuid,p_status text,p_note text default null)
returns jsonb
language plpgsql
security definer
set search_path=''
as $function$
declare v_payment public.payments%rowtype; v_title text; v_body text;
begin
  if auth.uid() is null or private.drive_role()<>'admin'::public.drive_role then
    raise exception 'Administrator access required';
  end if;
  if p_status not in ('paid','failed') then raise exception 'Unsupported payment review status'; end if;
  select * into v_payment from public.payments where id=p_payment_id;
  if not found then raise exception 'Payment not found'; end if;
  v_title:=case when p_status='paid' then 'Payment confirmed by DRIVE' else 'Payment marked as failed' end;
  v_body:=case when p_status='paid'
    then 'Your payment has been confirmed by the DRIVE administrator. Receipt: '||coalesce(v_payment.receipt_number,'available in payment history')
    else 'Your payment was marked as failed by the DRIVE administrator. Contact support if you believe this is incorrect.' end;
  if nullif(trim(coalesce(p_note,'')),'') is not null then
    v_body:=v_body||' Review note: '||left(trim(p_note),500);
  end if;
  insert into public.notifications(user_id,title,body,type,entity_id)
  values(v_payment.user_id,v_title,v_body,'payment_'||p_status,v_payment.id);
  return jsonb_build_object('paymentId',v_payment.id,'status',p_status,'notified',true);
end;
$function$;
revoke all on function public.drive_admin_notify_payment_status(uuid,text,text) from public;
grant execute on function public.drive_admin_notify_payment_status(uuid,text,text) to authenticated;
commit;