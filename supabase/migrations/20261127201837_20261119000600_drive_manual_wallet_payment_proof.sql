-- Allow a passenger to submit proof of an external bKash/Nagad transfer
-- without granting the passenger direct UPDATE access to payment records.

create or replace function public.drive_submit_payment_reference(
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

revoke all on function public.drive_submit_payment_reference(uuid,text) from public,anon;
grant execute on function public.drive_submit_payment_reference(uuid,text) to authenticated;

create or replace function public.drive_notify_admin_payment_reference()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.provider_reference is distinct from old.provider_reference
    and new.provider_reference is not null then
    insert into public.notifications(user_id,title,body,type,entity_id)
    select p.id,
      'Payment proof submitted',
      'A passenger submitted a ' || upper(new.method) || ' transaction ID for manual verification. Verify the transfer in the merchant account before marking it paid.',
      'payment_reference',
      new.id
    from public.profiles p
    where p.role='admin'::public.drive_role and p.is_active=true
    on conflict (user_id,type,entity_id) where entity_id is not null
    do update set title=excluded.title,body=excluded.body,read_at=null,created_at=now();
  end if;
  return new;
end;
$$;

drop trigger if exists drive_notify_admin_payment_reference on public.payments;
create trigger drive_notify_admin_payment_reference
after update of provider_reference on public.payments
for each row execute function public.drive_notify_admin_payment_reference();

revoke all on function public.drive_notify_admin_payment_reference() from public,anon,authenticated;
