-- Yukimi Gestión
-- Migración 022: corregir reversión de movimientos financieros
-- Corrige el nombre de la columna reversal_of -> reversal_of_id.

begin;

create or replace function public.reverse_financial_transaction_v1(
  p_transaction_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_original public.financial_transactions%rowtype;
  v_reversal public.financial_transactions%rowtype;
  v_entry record;
  v_account public.financial_accounts%rowtype;
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'El motivo de reversión debe tener al menos 5 caracteres.';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'La clave de idempotencia es obligatoria.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('FIN_REVERSAL:' || p_idempotency_key, 0)
  );

  select response_payload
    into v_result
    from public.idempotency_keys
   where scope = 'FIN_REVERSAL'
     and idempotency_key = p_idempotency_key
     and status = 'COMPLETED';

  if v_result is not null then
    return v_result;
  end if;

  select *
    into v_original
    from public.financial_transactions
   where id = p_transaction_id
   for update;

  if not found then
    raise exception 'Movimiento financiero no encontrado.' using errcode = 'P0002';
  end if;

  if v_original.state_code <> 'POSTED' then
    raise exception 'Solo se puede revertir un movimiento publicado.';
  end if;

  if v_original.is_system_generated or v_original.source_type is not null then
    raise exception 'Este movimiento fue generado por otro módulo y debe revertirse desde su operación de origen.';
  end if;

  if v_original.transaction_type_code = 'REVERSAL' then
    raise exception 'Una reversión no puede revertirse directamente.';
  end if;

  for v_entry in
    select *
      from public.financial_transaction_entries
     where financial_transaction_id = v_original.id
     order by financial_account_id
  loop
    select *
      into v_account
      from public.financial_accounts
     where id = v_entry.financial_account_id
     for update;

    if (-v_entry.amount_signed) < 0
       and v_account.current_balance < abs(v_entry.amount_signed) then
      raise exception 'La cuenta % no tiene saldo suficiente para revertir el movimiento.', v_account.name;
    end if;
  end loop;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('FIN_REVERSAL', p_idempotency_key, v_actor)
  on conflict (scope, idempotency_key) do nothing;

  insert into public.financial_transactions(
    code,
    transaction_type_code,
    state_code,
    category_id,
    occurred_at,
    description,
    currency_code,
    total_amount,
    idempotency_key,
    is_system_generated,
    reversal_of_id,
    reason,
    metadata,
    created_by
  ) values (
    null,
    'REVERSAL',
    'POSTED',
    v_original.category_id,
    now(),
    'Reversión de ' || v_original.code || ': ' || v_original.description,
    v_original.currency_code,
    v_original.total_amount,
    p_idempotency_key,
    false,
    v_original.id,
    btrim(p_reason),
    jsonb_build_object('originalTransactionId', v_original.id),
    v_actor
  )
  returning * into v_reversal;

  insert into public.financial_transaction_entries(
    financial_transaction_id,
    financial_account_id,
    amount_signed,
    description
  )
  select
    v_reversal.id,
    e.financial_account_id,
    -e.amount_signed,
    'Reversión de ' || v_original.code
  from public.financial_transaction_entries e
  where e.financial_transaction_id = v_original.id;

  perform set_config('app.audit_reason', btrim(p_reason), true);

  update public.financial_transactions
     set state_code = 'REVERSED',
         reason = btrim(p_reason),
         updated_at = now(),
         version = version + 1
   where id = v_original.id;

  v_result := jsonb_build_object(
    'id', v_reversal.id,
    'code', v_reversal.code,
    'stateCode', v_reversal.state_code,
    'version', v_reversal.version
  );

  update public.idempotency_keys
     set status = 'COMPLETED',
         resource_type = 'FINANCIAL_TRANSACTION',
         resource_id = v_reversal.id,
         response_payload = v_result,
         completed_at = now(),
         expires_at = now() + interval '7 days'
   where scope = 'FIN_REVERSAL'
     and idempotency_key = p_idempotency_key;

  return v_result;
end;
$$;

notify pgrst, 'reload schema';

commit;
