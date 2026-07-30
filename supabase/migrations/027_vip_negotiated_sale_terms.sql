-- Yukimi Gestión
-- Migración 027: política VIP negociada por venta, sin límite monetario global

begin;

alter table public.client_vip_profiles
  add column if not exists legacy_separation_limit_amount numeric(14,2)
    check (legacy_separation_limit_amount is null or legacy_separation_limit_amount >= 0),
  add column if not exists separation_policy text not null default 'NEGOTIATED_PER_SALE'
    check (separation_policy in ('NEGOTIATED_PER_SALE'));

-- Se conserva cualquier configuración anterior como referencia histórica.
update public.client_vip_profiles
set legacy_separation_limit_amount = coalesce(
      legacy_separation_limit_amount,
      separation_limit_amount
    ),
    separation_limit_amount = null
where separation_limit_amount is not null;

create or replace function private.enforce_vip_negotiated_policy()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.separation_limit_amount is not null then
    new.legacy_separation_limit_amount := coalesce(
      new.legacy_separation_limit_amount,
      new.separation_limit_amount
    );
  end if;
  new.separation_limit_amount := null;
  new.separation_limit_currency := null;
  new.separation_policy := 'NEGOTIATED_PER_SALE';
  return new;
end;
$$;

drop trigger if exists trg_enforce_vip_negotiated_policy
  on public.client_vip_profiles;
create trigger trg_enforce_vip_negotiated_policy
before insert or update of separation_limit_amount, separation_limit_currency, separation_policy
on public.client_vip_profiles
for each row execute function private.enforce_vip_negotiated_policy();

alter table public.sales
  add column if not exists negotiated_minimum_deposit_amount numeric(14,2)
    check (
      negotiated_minimum_deposit_amount is null
      or negotiated_minimum_deposit_amount >= 0
    ),
  add column if not exists negotiated_minimum_deposit_reason text,
  add column if not exists negotiated_terms_snapshot jsonb not null default '{}'::jsonb;

insert into public.business_settings(
  setting_key,
  setting_value,
  description,
  value_type,
  is_sensitive
)
values (
  'vip.separation_policy',
  jsonb_build_object(
    'mode', 'NEGOTIATED_PER_SALE',
    'globalLimitEnabled', false,
    'minimumDepositRequiredForVipSale', true,
    'zeroRequiresReason', true
  ),
  'La separación VIP se negocia según los productos de cada venta; no existe un límite monetario global.',
  'JSON',
  false
)
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    description = excluded.description,
    value_type = excluded.value_type,
    updated_at = now();

create or replace function public.create_sale_v2(
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
  v_sale public.sales%rowtype;
  v_client public.clients%rowtype;
  v_minimum numeric(14,2);
  v_reason text;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_input) <> 'object' then
    raise exception 'La venta debe enviarse como un objeto JSON.';
  end if;

  select *
    into v_client
  from public.clients
  where id = (p_input ->> 'clientId')::uuid
    and is_active = true
  for share;
  if not found then
    raise exception 'El cliente no existe o está inactivo.' using errcode = 'P0001';
  end if;

  v_minimum := nullif(p_input ->> 'negotiatedMinimumDepositAmount', '')::numeric;
  v_reason := nullif(btrim(p_input ->> 'negotiatedMinimumDepositReason'), '');

  if v_minimum is not null and v_minimum < 0 then
    raise exception 'El adelanto mínimo negociado no puede ser negativo.';
  end if;
  if v_client.is_vip and v_minimum is null then
    raise exception 'Registra el adelanto mínimo negociado para esta venta VIP.';
  end if;
  if v_client.is_vip and length(coalesce(v_reason, '')) < 3 then
    raise exception 'Explica el acuerdo de separación de esta venta VIP.';
  end if;

  v_result := public.create_sale_v1(p_input, p_idempotency_key);

  select *
    into v_sale
  from public.sales
  where id = (v_result ->> 'id')::uuid
  for update;

  if v_minimum is not null and v_minimum > v_sale.total_amount then
    raise exception 'El adelanto mínimo no puede superar el total de la venta.';
  end if;

  update public.sales
  set negotiated_minimum_deposit_amount = v_minimum,
      negotiated_minimum_deposit_reason = v_reason,
      negotiated_terms_snapshot = jsonb_build_object(
        'policy', 'NEGOTIATED_PER_SALE',
        'clientWasVip', v_client.is_vip,
        'minimumDepositAmount', v_minimum,
        'reason', v_reason,
        'paymentDueAt', v_sale.due_at
      )
  where id = v_sale.id
    and (
      negotiated_minimum_deposit_amount is distinct from v_minimum
      or negotiated_minimum_deposit_reason is distinct from v_reason
      or negotiated_terms_snapshot = '{}'::jsonb
    )
  returning * into v_sale;

  if not found then
    select * into v_sale from public.sales where id = (v_result ->> 'id')::uuid;
  end if;

  return jsonb_build_object(
    'id', v_sale.id,
    'code', v_sale.code,
    'version', v_sale.version
  );
end;
$$;

create or replace function public.get_sale_detail_v2(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_requests jsonb;
  v_sale public.sales%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  v_result := public.get_sale_detail_v1(p_sale_id);
  select * into v_sale from public.sales where id = p_sale_id;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', rr.id,
    'saleItemId', rr.sale_item_id,
    'stateCode', rr.state_code,
    'reason', rr.reason,
    'suggestedPenaltyAmount', rr.suggested_penalty_amount,
    'penaltyAmount', rr.penalty_amount,
    'penaltyOverridden', rr.penalty_overridden,
    'depositBasisAmount', rr.deposit_basis_amount,
    'retainedAmount', rr.retained_amount,
    'refundableAmount', rr.refundable_amount,
    'penaltyRuleSnapshot', rr.penalty_rule_snapshot,
    'requestedAt', rr.requested_at,
    'requestedById', rr.requested_by,
    'requestedByName', requester.display_name,
    'reviewedAt', rr.reviewed_at,
    'reviewedByName', reviewer.display_name,
    'reviewNotes', rr.review_notes
  ) order by rr.requested_at desc), '[]'::jsonb)
    into v_requests
  from public.release_requests rr
  left join public.profiles requester on requester.id = rr.requested_by
  left join public.profiles reviewer on reviewer.id = rr.reviewed_by
  where rr.sale_id = p_sale_id;

  v_result := jsonb_set(v_result, '{releaseRequests}', v_requests, true);
  v_result := jsonb_set(
    v_result,
    '{negotiatedMinimumDepositAmount}',
    coalesce(to_jsonb(v_sale.negotiated_minimum_deposit_amount), 'null'::jsonb),
    true
  );
  v_result := jsonb_set(
    v_result,
    '{negotiatedMinimumDepositReason}',
    coalesce(to_jsonb(v_sale.negotiated_minimum_deposit_reason), 'null'::jsonb),
    true
  );
  return jsonb_set(
    v_result,
    '{negotiatedTermsSnapshot}',
    coalesce(v_sale.negotiated_terms_snapshot, '{}'::jsonb),
    true
  );
end;
$$;

revoke all on function public.create_sale_v2(jsonb, text) from public, anon;
grant execute on function public.create_sale_v2(jsonb, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
