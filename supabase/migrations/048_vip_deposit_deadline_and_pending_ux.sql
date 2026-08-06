-- Yukimi Gestión
-- Migración 048: fecha límite del adelanto VIP y exposición en el detalle de venta

begin;

alter table public.sales
  add column if not exists negotiated_minimum_deposit_due_at timestamptz;

create index if not exists ix_sales_negotiated_deposit_due_at
  on public.sales (negotiated_minimum_deposit_due_at)
  where negotiated_minimum_deposit_due_at is not null;

create or replace function public.create_sale_v3(
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_sale_type text := coalesce(nullif(p_input ->> 'saleTypeCode', ''), 'REGULAR');
  v_due_reason text := nullif(btrim(p_input ->> 'dueDateReason'), '');
  v_due_at timestamptz := nullif(p_input ->> 'dueAt', '')::timestamptz;
  v_client_id uuid := nullif(p_input ->> 'clientId', '')::uuid;
  v_is_vip boolean;
  v_can_reserve_without_deposit boolean;
  v_minimum numeric;
  v_deposit_due_at timestamptz := nullif(p_input ->> 'negotiatedMinimumDepositDueAt', '')::timestamptz;
begin
  if v_sale_type not in ('REGULAR', 'CUSTOM_ORDER') then
    raise exception 'Tipo de venta no permitido.';
  end if;
  if v_due_at is not null and length(coalesce(v_due_reason, '')) < 5 then
    raise exception 'Explica el motivo del plazo personalizado.';
  end if;

  select c.is_vip, coalesce(vp.can_reserve_without_deposit, false)
  into v_is_vip, v_can_reserve_without_deposit
  from public.clients c
  left join public.client_vip_profiles vp on vp.client_id = c.id
  where c.id = v_client_id;

  if coalesce(v_is_vip, false) then
    v_minimum := nullif(p_input ->> 'negotiatedMinimumDepositAmount', '')::numeric;
    if v_minimum is null then
      raise exception 'Registra el adelanto mínimo negociado para la venta VIP.';
    end if;
    if v_minimum = 0 and not v_can_reserve_without_deposit then
      raise exception 'Este cliente VIP no tiene habilitada la separación sin adelanto.' using errcode = 'P0001';
    end if;
    if v_minimum > 0 and v_deposit_due_at is null then
      raise exception 'Indica la fecha límite para pagar el adelanto mínimo.' using errcode = 'P0001';
    end if;
    if v_minimum > 0 and v_deposit_due_at < current_date::timestamptz then
      raise exception 'La fecha límite del adelanto no puede estar en el pasado.' using errcode = 'P0001';
    end if;
    if v_minimum = 0 then
      v_deposit_due_at := null;
    end if;
  else
    v_deposit_due_at := null;
  end if;

  v_result := public.create_sale_v2(p_input, p_idempotency_key);
  perform set_config('app.audit_reason', 'Confirmación de venta con condiciones comerciales', true);
  update public.sales
  set sale_type_code = v_sale_type,
      due_date_reason = v_due_reason,
      negotiated_minimum_deposit_due_at = v_deposit_due_at,
      negotiated_terms_snapshot = coalesce(negotiated_terms_snapshot, '{}'::jsonb)
        || jsonb_build_object(
          'minimumDepositAmount', negotiated_minimum_deposit_amount,
          'depositDueAt', v_deposit_due_at,
          'paymentDueAt', due_at
        ),
      updated_by = private.current_actor_id()
  where id = (v_result ->> 'id')::uuid;
  return v_result;
end;
$$;

create or replace function public.get_sale_detail_v3(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_reason text;
  v_payment_state text;
  v_deposit_due_at timestamptz;
begin
  v_result := public.get_sale_detail_v2(p_sale_id);
  select
    due_date_reason,
    negotiated_minimum_deposit_due_at,
    case
      when balance_amount > 0
        and due_at < now()
        and payment_state_code in ('UNPAID', 'PARTIAL', 'OVERDUE')
        and commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')
      then 'OVERDUE'
      else payment_state_code
    end
  into v_reason, v_deposit_due_at, v_payment_state
  from public.sales
  where id = p_sale_id;

  v_result := jsonb_set(
    v_result,
    '{dueDateReason}',
    coalesce(to_jsonb(v_reason), 'null'::jsonb),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{negotiatedMinimumDepositDueAt}',
    coalesce(to_jsonb(v_deposit_due_at), 'null'::jsonb),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{negotiatedTermsSnapshot}',
    coalesce(v_result -> 'negotiatedTermsSnapshot', '{}'::jsonb)
      || jsonb_build_object('depositDueAt', v_deposit_due_at),
    true
  );
  return jsonb_set(v_result, '{paymentStateCode}', to_jsonb(v_payment_state), true);
end;
$$;

revoke all on function public.create_sale_v3(jsonb, text) from public, anon;
grant execute on function public.create_sale_v3(jsonb, text) to authenticated, service_role;

revoke all on function public.get_sale_detail_v3(uuid) from public, anon;
grant execute on function public.get_sale_detail_v3(uuid) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
