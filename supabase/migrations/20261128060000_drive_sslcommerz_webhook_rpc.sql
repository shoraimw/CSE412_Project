begin;
create table if not exists private.drive_integration_secrets (
  secret_name text primary key,secret_hash bytea not null,created_at timestamptz not null default now()
);
alter table private.drive_integration_secrets enable row level security;
revoke all on table private.drive_integration_secrets from public,anon,authenticated;
insert into private.drive_integration_secrets(secret_name,secret_hash)
values('sslcommerz',decode('00c803e96c81e5bb9a94aa1f69586c82a0110a4eaf8a1a01e5e3f76014ccef9a','hex'))
on conflict(secret_name) do update set secret_hash=excluded.secret_hash,created_at=now();

create or replace function private.drive_check_sslcommerz_secret(p_secret text)
returns boolean language sql security definer set search_path=''
as $function$
  select exists(select 1 from private.drive_integration_secrets s
    where s.secret_name='sslcommerz'
    and s.secret_hash=extensions.digest(convert_to(coalesce(p_secret,''),'UTF8'),'sha256'));
$function$;

create or replace function private.drive_get_sslcommerz_payment_intent(p_secret text,p_tran_id text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_result jsonb;
begin
  if not private.drive_check_sslcommerz_secret(p_secret) then raise exception 'Payment callback authentication failed'; end if;
  if coalesce(p_tran_id,'')='' then raise exception 'Transaction reference is required'; end if;
  select jsonb_build_object('id',p.id,'status',p.status,'gatewayStatus',p.gateway_status,
    'amount',p.amount,'currency',p.currency,'exchangeRate',p.exchange_rate,
    'baseAmountBdt',p.base_amount_bdt,'receiptNumber',p.receipt_number,
    'gatewayValidationId',p.gateway_validation_id)
  into v_result from public.payments p
  where p.gateway_name='sslcommerz' and p.gateway_transaction_id=p_tran_id;
  if v_result is null then raise exception 'DRIVE payment intent not found'; end if;
  return v_result;
end;
$function$;

create or replace function private.drive_finalize_sslcommerz_payment(
  p_secret text,p_tran_id text,p_val_id text,p_status text,
  p_currency_type text,p_currency_amount numeric,p_amount_bdt numeric,
  p_store_amount numeric,p_risk_level integer,p_card_type text,
  p_bank_tran_id text,p_currency_rate numeric
)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_payment public.payments%rowtype; v_receipt text;
begin
  if not private.drive_check_sslcommerz_secret(p_secret) then raise exception 'Payment callback authentication failed'; end if;
  if coalesce(p_tran_id,'')='' or coalesce(p_val_id,'')='' then raise exception 'Missing gateway transaction or validation reference'; end if;
  select * into v_payment from public.payments
  where gateway_name='sslcommerz' and gateway_transaction_id=p_tran_id for update;
  if not found then raise exception 'DRIVE payment intent not found'; end if;
  if v_payment.status='paid' then
    return jsonb_build_object('paymentId',v_payment.id,'status','paid','receiptNumber',v_payment.receipt_number,'alreadyFinalized',true);
  end if;
  if v_payment.status<>'pending' then
    return jsonb_build_object('paymentId',v_payment.id,'status',v_payment.status,'alreadyFinalized',true);
  end if;
  if upper(coalesce(p_status,'')) not in ('VALID','VALIDATED') then raise exception 'Gateway validation did not return a successful status'; end if;
  if upper(coalesce(p_currency_type,''))<>upper(v_payment.currency)
    or p_currency_amount is null or abs(p_currency_amount-v_payment.amount)>0.02 then
    raise exception 'Gateway currency or amount does not match the original DRIVE payment intent';
  end if;
  if p_amount_bdt is null or p_amount_bdt<10 or p_amount_bdt>500000 then raise exception 'Gateway settlement amount is outside the permitted range'; end if;
  if upper(v_payment.currency)='BDT' and abs(p_amount_bdt-v_payment.amount)>0.02 then raise exception 'Validated BDT amount does not match the DRIVE payment'; end if;
  if coalesce(p_risk_level,1)<>0 then
    update public.payments set gateway_status='risk_hold',gateway_validation_id=p_val_id,
      gateway_amount_bdt=round(p_amount_bdt,2),
      gateway_payload=jsonb_build_object('cardType',p_card_type,'riskLevel',p_risk_level,'riskHold',true)
    where id=v_payment.id;
    return jsonb_build_object('paymentId',v_payment.id,'status','risk_hold','message','Payment is held for administrator review.');
  end if;
  v_receipt:='DRIVE-'||to_char(now(),'YYYYMMDD')||'-'||upper(substr(replace(gen_random_uuid()::text,'-',''),1,8));
  update public.payments set status='paid',gateway_status='VALID',
    gateway_validation_id=p_val_id,gateway_currency=upper(p_currency_type),
    gateway_amount_bdt=round(p_amount_bdt,2),
    gateway_fee_bdt=greatest(0,round(p_amount_bdt-coalesce(p_store_amount,p_amount_bdt),2)),
    exchange_rate=coalesce(p_currency_rate,exchange_rate),
    provider_reference=coalesce(nullif(p_bank_tran_id,''),provider_reference),
    receipt_number=v_receipt,paid_at=now(),
    gateway_payload=jsonb_build_object('cardType',p_card_type,'riskLevel',p_risk_level,
      'currencyRate',p_currency_rate,'settlementCurrency','BDT')
  where id=v_payment.id;
  return jsonb_build_object('paymentId',v_payment.id,'status','paid','receiptNumber',v_receipt,'alreadyFinalized',false);
end;
$function$;

create or replace function private.drive_mark_sslcommerz_failed(p_secret text,p_tran_id text,p_status text)
returns jsonb language plpgsql security definer set search_path=''
as $function$
declare v_payment public.payments%rowtype; v_new_status text;
begin
  if not private.drive_check_sslcommerz_secret(p_secret) then raise exception 'Payment callback authentication failed'; end if;
  select * into v_payment from public.payments
  where gateway_name='sslcommerz' and gateway_transaction_id=p_tran_id for update;
  if not found then raise exception 'DRIVE payment intent not found'; end if;
  if v_payment.status='paid' then
    return jsonb_build_object('paymentId',v_payment.id,'status','paid','alreadyFinalized',true);
  end if;
  if v_payment.status='pending' and v_payment.gateway_validation_id is null
    and coalesce(v_payment.gateway_status,'')<>'risk_hold' then
    v_new_status:=upper(coalesce(p_status,'FAILED'));
    update public.payments set status='failed',gateway_status=v_new_status where id=v_payment.id;
    return jsonb_build_object('paymentId',v_payment.id,'status','failed','alreadyFinalized',false);
  end if;
  return jsonb_build_object('paymentId',v_payment.id,
    'status',case when v_payment.gateway_status='risk_hold' then 'risk_hold' else v_payment.status::text end,
    'alreadyFinalized',true);
end;
$function$;

create or replace function public.drive_get_sslcommerz_payment_intent(p_secret text,p_tran_id text)
returns jsonb language sql security invoker set search_path=''
as $function$ select private.drive_get_sslcommerz_payment_intent(p_secret,p_tran_id); $function$;
create or replace function public.drive_finalize_sslcommerz_payment(
  p_secret text,p_tran_id text,p_val_id text,p_status text,
  p_currency_type text,p_currency_amount numeric,p_amount_bdt numeric,
  p_store_amount numeric,p_risk_level integer,p_card_type text,
  p_bank_tran_id text,p_currency_rate numeric
)
returns jsonb language sql security invoker set search_path=''
as $function$
  select private.drive_finalize_sslcommerz_payment(p_secret,p_tran_id,p_val_id,p_status,p_currency_type,
    p_currency_amount,p_amount_bdt,p_store_amount,p_risk_level,p_card_type,p_bank_tran_id,p_currency_rate);
$function$;
create or replace function public.drive_mark_sslcommerz_failed(p_secret text,p_tran_id text,p_status text)
returns jsonb language sql security invoker set search_path=''
as $function$ select private.drive_mark_sslcommerz_failed(p_secret,p_tran_id,p_status); $function$;

grant usage on schema private to anon;
revoke all on function private.drive_check_sslcommerz_secret(text) from public,anon,authenticated;
revoke all on function private.drive_get_sslcommerz_payment_intent(text,text) from public,anon,authenticated;
revoke all on function private.drive_finalize_sslcommerz_payment(text,text,text,text,text,numeric,numeric,numeric,integer,text,text,numeric) from public,anon,authenticated;
revoke all on function private.drive_mark_sslcommerz_failed(text,text,text) from public,anon,authenticated;
grant execute on function private.drive_get_sslcommerz_payment_intent(text,text) to anon;
grant execute on function private.drive_finalize_sslcommerz_payment(text,text,text,text,text,numeric,numeric,numeric,integer,text,text,numeric) to anon;
grant execute on function private.drive_mark_sslcommerz_failed(text,text,text) to anon;
revoke all on function public.drive_get_sslcommerz_payment_intent(text,text) from public;
revoke all on function public.drive_finalize_sslcommerz_payment(text,text,text,text,text,numeric,numeric,numeric,integer,text,text,numeric) from public;
revoke all on function public.drive_mark_sslcommerz_failed(text,text,text) from public;
grant execute on function public.drive_get_sslcommerz_payment_intent(text,text) to anon;
grant execute on function public.drive_finalize_sslcommerz_payment(text,text,text,text,text,numeric,numeric,numeric,integer,text,text,numeric) to anon;
grant execute on function public.drive_mark_sslcommerz_failed(text,text,text) to anon;
commit;