-- Keep the privileged payment update implementation in the non-exposed
-- private schema. PostgREST exposes only a SECURITY INVOKER wrapper.
create or replace function private.drive_submit_payment_reference(
  p_payment_id uuid,
  p_reference text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user uuid := auth.uid();
  v_reference text := btrim(coalesce(p_reference,''));
  v_payment public.payments%rowtype;
begin
  if v_user is null then
    raise exception 'Authentication required';
  end if;
  if v_reference !~ '^[A-Za-z0-9_-]{6,64}$' then
    raise exception 'Transaction ID must contain 6 to 64 letters, numbers, underscores or hyphens';
  end if;

  update public.payments
  set provider_reference=v_reference
  where id=p_payment_id
    and user_id=v_user
    and status='pending'
    and lower(method) in ('bkash','nagad')
    and provider_reference is null
  returning * into v_payment;

  if not found then
    raise exception 'Payment not found, not eligible for transaction proof, or a reference was already submitted';
  end if;

  return jsonb_build_object(
    'id',v_payment.id,
    'method',v_payment.method,
    'provider_reference',v_payment.provider_reference,
    'status',v_payment.status,
    'created_at',v_payment.created_at
  );
end;
$$;

revoke all on function private.drive_submit_payment_reference(uuid,text) from public,anon,authenticated;
grant usage on schema private to authenticated;
grant execute on function private.drive_submit_payment_reference(uuid,text) to authenticated;

create or replace function public.drive_submit_payment_reference(
  p_payment_id uuid,
  p_reference text
)
returns jsonb
language sql
security invoker
set search_path = ''
as $$
  select private.drive_submit_payment_reference($1,$2);
$$;

revoke all on function public.drive_submit_payment_reference(uuid,text) from public,anon;
grant execute on function public.drive_submit_payment_reference(uuid,text) to authenticated;
