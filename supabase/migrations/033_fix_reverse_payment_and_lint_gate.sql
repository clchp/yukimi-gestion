begin;

-- Reemplaza incrementalmente la función original sin alterar su contrato.
-- financial_transactions no posee updated_by; la auditoría registra al actor y
-- trg_touch_version mantiene updated_at/version al cambiar el estado.
create or replace function public.reverse_payment(
  p_payment_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_original_transaction public.financial_transactions%rowtype;
  v_reversal_id uuid;
  v_entry record;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'La reversión requiere un motivo.';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Pago no encontrado.';
  end if;

  if v_payment.state_code = 'REVERSED' then
    return p_payment_id;
  end if;

  if v_payment.state_code <> 'CONFIRMED' or v_payment.financial_transaction_id is null then
    raise exception 'Solo se puede revertir un pago confirmado con movimiento financiero.';
  end if;

  select * into v_original_transaction
  from public.financial_transactions
  where id = v_payment.financial_transaction_id
  for update;

  perform set_config('app.audit_reason', p_reason, true);

  insert into public.financial_transactions (
    code,
    transaction_type_code,
    state_code,
    category_id,
    occurred_at,
    description,
    currency_code,
    total_amount,
    source_type,
    source_id,
    idempotency_key,
    is_system_generated,
    reversal_of_id,
    reason,
    created_by,
    approved_by
  ) values (
    public.next_business_code('FINANCIAL_TRANSACTION'),
    'REVERSAL',
    'POSTED',
    v_original_transaction.category_id,
    now(),
    'Reversión del pago ' || v_payment.code,
    v_original_transaction.currency_code,
    v_original_transaction.total_amount,
    'PAYMENT_REVERSAL',
    p_payment_id,
    'payment-reversal:' || p_idempotency_key,
    true,
    v_original_transaction.id,
    p_reason,
    private.current_actor_id(),
    private.current_actor_id()
  ) returning id into v_reversal_id;

  for v_entry in
    select *
    from public.financial_transaction_entries
    where financial_transaction_id = v_original_transaction.id
  loop
    insert into public.financial_transaction_entries (
      financial_transaction_id,
      financial_account_id,
      amount_signed,
      description
    ) values (
      v_reversal_id,
      v_entry.financial_account_id,
      -v_entry.amount_signed,
      'Reversión: ' || coalesce(v_entry.description, '')
    );
  end loop;

  update public.financial_transactions
  set state_code = 'REVERSED'
  where id = v_original_transaction.id;

  update public.payments
  set state_code = 'REVERSED',
      reversed_at = now(),
      reversed_by = private.current_actor_id(),
      reversal_reason = p_reason,
      updated_by = private.current_actor_id()
  where id = p_payment_id;

  perform public.refresh_sale_totals(v_payment.sale_id);

  insert into public.outbox_events (
    event_type, aggregate_type, aggregate_id, payload, deduplication_key
  ) values (
    'PAYMENT_REVERSED',
    'PAYMENT',
    p_payment_id,
    jsonb_build_object('payment_id', p_payment_id, 'sale_id', v_payment.sale_id, 'reason', p_reason),
    'payment-reversed:' || p_idempotency_key
  ) on conflict (deduplication_key) where deduplication_key is not null do nothing;

  return p_payment_id;
end;
$$;

revoke all on function public.reverse_payment(uuid, text, text) from public, anon;
grant execute on function public.reverse_payment(uuid, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
