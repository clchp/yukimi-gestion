-- Yukimi Gestión
-- Migración 026: liberación por línea, penalidad sugerida y devolución estimada

begin;

alter table public.release_requests
  add column if not exists suggested_penalty_amount numeric(14,2)
    check (suggested_penalty_amount is null or suggested_penalty_amount >= 0),
  add column if not exists penalty_overridden boolean not null default false,
  add column if not exists penalty_rule_snapshot jsonb not null default '{}'::jsonb,
  add column if not exists deposit_basis_amount numeric(14,2) not null default 0
    check (deposit_basis_amount >= 0);

create unique index if not exists ux_release_requests_pending_line
  on public.release_requests(sale_item_id)
  where sale_item_id is not null
    and state_code in ('REQUESTED', 'APPROVED');

create unique index if not exists ux_penalties_active_release_line
  on public.penalties(sale_item_id, penalty_type)
  where sale_item_id is not null
    and penalty_type = 'RELEASE'
    and status = 'ACTIVE';

create or replace function public.get_sale_release_quote_v2(p_sale_item_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_item public.sale_items%rowtype;
  v_sale public.sales%rowtype;
  v_category public.product_categories%rowtype;
  v_grace_hours numeric := 24;
  v_elapsed_hours numeric;
  v_within_grace boolean;
  v_release_suggested numeric(14,2);
  v_late_penalty numeric(14,2);
  v_effective_penalty numeric(14,2);
  v_active_lines_total numeric(14,2);
  v_available_deposit numeric(14,2);
  v_line_deposit numeric(14,2);
  v_retained numeric(14,2);
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select si.*
    into v_item
  from public.sale_items si
  where si.id = p_sale_item_id
  for share;

  if not found then
    raise exception 'Línea de venta no encontrada.' using errcode = 'P0002';
  end if;
  if v_item.item_status not in ('ACTIVE', 'PARTIALLY_RELEASED') then
    raise exception 'La línea ya no admite liberación.' using errcode = 'P0001';
  end if;

  select *
    into v_sale
  from public.sales
  where id = v_item.sale_id
  for share;

  if v_sale.commercial_state_code in ('CANCELLED', 'ANNULLED', 'COMPLETED') then
    raise exception 'La venta ya se encuentra cerrada.' using errcode = 'P0001';
  end if;

  select pc.*
    into v_category
  from public.product_variants pv
  join public.products p on p.id = pv.product_id
  join public.product_categories pc on pc.id = p.category_id
  where pv.id = v_item.variant_id;

  select coalesce((setting_value #>> '{}')::numeric, 24)
    into v_grace_hours
  from public.business_settings
  where setting_key = 'sales.release_grace_hours';

  v_grace_hours := coalesce(v_grace_hours, 24);
  v_elapsed_hours := greatest(
    extract(epoch from (now() - coalesce(v_sale.reserved_at, v_sale.created_at))) / 3600,
    0
  );
  v_within_grace := v_elapsed_hours <= v_grace_hours;
  v_release_suggested := case
    when v_within_grace then 0
    else coalesce(v_category.release_penalty_amount, 0)
  end;

  select coalesce(max(p.amount), 0)
    into v_late_penalty
  from public.penalties p
  where p.sale_id = v_sale.id
    and p.penalty_type = 'LATE_DAILY'
    and p.status = 'ACTIVE';

  v_effective_penalty := greatest(v_release_suggested, v_late_penalty);

  select coalesce(sum(si.line_total), 0)
    into v_active_lines_total
  from public.sale_items si
  where si.sale_id = v_sale.id
    and si.item_status not in ('CANCELLED', 'RELEASED');

  v_available_deposit := greatest(v_sale.paid_total - v_sale.refunded_total, 0);
  v_line_deposit := case
    when v_active_lines_total <= 0 then 0
    else least(
      v_item.line_total,
      round(v_available_deposit * v_item.line_total / v_active_lines_total, 2)
    )
  end;
  v_retained := least(v_line_deposit, v_effective_penalty);

  return jsonb_build_object(
    'saleId', v_sale.id,
    'saleItemId', v_item.id,
    'productName', v_item.product_name_snapshot,
    'variantName', v_item.variant_name_snapshot,
    'categoryCode', v_category.code,
    'categoryName', v_category.name,
    'currencyCode', v_sale.currency_code,
    'withinGracePeriod', v_within_grace,
    'graceHours', v_grace_hours,
    'elapsedHours', round(v_elapsed_hours, 2),
    'categoryPenaltyAmount', coalesce(v_category.release_penalty_amount, 0),
    'suggestedReleasePenaltyAmount', v_release_suggested,
    'activeLatePenaltyAmount', v_late_penalty,
    'effectivePenaltyAmount', v_effective_penalty,
    'depositBasisAmount', v_line_deposit,
    'retainedAmount', v_retained,
    'refundableAmount', greatest(v_line_deposit - v_retained, 0),
    'uncoveredPenaltyAmount', greatest(v_effective_penalty - v_retained, 0),
    'rule', jsonb_build_object(
      'scope', 'SALE_LINE',
      'selectionMode', 'MAX_SINGLE',
      'deductFromDeposit', true,
      'depositAllocationMode', 'PRO_RATA_LINE_TOTAL'
    )
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
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  v_result := public.get_sale_detail_v1(p_sale_id);

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

  return jsonb_set(v_result, '{releaseRequests}', v_requests, true);
end;
$$;

create or replace function public.request_sale_release_v2(
  p_sale_item_id uuid,
  p_reason text,
  p_penalty_amount numeric default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_item public.sale_items%rowtype;
  v_quote jsonb;
  v_suggested numeric(14,2);
  v_proposed numeric(14,2);
  v_request public.release_requests%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'El motivo debe tener al menos 5 caracteres.';
  end if;

  select *
    into v_item
  from public.sale_items
  where id = p_sale_item_id
  for update;

  if not found then
    raise exception 'Línea de venta no encontrada.' using errcode = 'P0002';
  end if;

  if exists(
    select 1
    from public.release_requests
    where sale_item_id = p_sale_item_id
      and state_code in ('REQUESTED', 'APPROVED')
  ) then
    raise exception 'Ya existe una solicitud pendiente para esta línea.';
  end if;

  v_quote := public.get_sale_release_quote_v2(p_sale_item_id);
  v_suggested := (v_quote ->> 'suggestedReleasePenaltyAmount')::numeric;
  v_proposed := round(coalesce(p_penalty_amount, v_suggested), 2);
  if v_proposed < 0 then
    raise exception 'La penalidad no puede ser negativa.';
  end if;

  perform set_config('app.audit_reason', btrim(p_reason), true);
  insert into public.release_requests(
    sale_id,
    sale_item_id,
    reason,
    requested_by,
    suggested_penalty_amount,
    penalty_amount,
    penalty_overridden,
    penalty_rule_snapshot,
    deposit_basis_amount,
    refundable_amount,
    retained_amount,
    currency_code
  )
  values (
    v_item.sale_id,
    v_item.id,
    btrim(p_reason),
    v_actor,
    v_suggested,
    v_proposed,
    v_proposed is distinct from v_suggested,
    v_quote,
    (v_quote ->> 'depositBasisAmount')::numeric,
    greatest(
      (v_quote ->> 'depositBasisAmount')::numeric
        - least((v_quote ->> 'depositBasisAmount')::numeric, v_proposed),
      0
    ),
    least((v_quote ->> 'depositBasisAmount')::numeric, v_proposed),
    v_item.currency_code
  )
  returning * into v_request;

  return jsonb_build_object(
    'id', v_request.id,
    'stateCode', v_request.state_code,
    'version', v_request.version,
    'suggestedPenaltyAmount', v_request.suggested_penalty_amount,
    'penaltyAmount', v_request.penalty_amount,
    'retainedAmount', v_request.retained_amount,
    'refundableAmount', v_request.refundable_amount
  );
end;
$$;

create or replace function public.review_sale_release_v2(
  p_request_id uuid,
  p_decision text,
  p_review_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_request public.release_requests%rowtype;
  v_sale public.sales%rowtype;
  v_item public.sale_items%rowtype;
  v_allocation record;
  v_movement_id uuid;
  v_late_penalty numeric(14,2);
  v_effective_penalty numeric(14,2);
  v_active_lines_total numeric(14,2);
  v_available_deposit numeric(14,2);
  v_line_deposit numeric(14,2);
  v_retained numeric(14,2);
  v_remaining_lines integer;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if p_decision not in ('APPROVE', 'REJECT') then
    raise exception 'Decisión inválida.';
  end if;
  if length(btrim(coalesce(p_review_notes, ''))) < 3 then
    raise exception 'Las notas de revisión son obligatorias.';
  end if;

  select *
    into v_request
  from public.release_requests
  where id = p_request_id
  for update;

  if not found then
    raise exception 'Solicitud no encontrada.' using errcode = 'P0002';
  end if;
  if v_request.state_code <> 'REQUESTED' then
    raise exception 'La solicitud ya fue revisada.';
  end if;
  if v_request.sale_item_id is null then
    raise exception 'Esta solicitud pertenece al flujo anterior y debe revisarse desde compatibilidad.';
  end if;
  if v_request.requested_by = v_actor then
    raise exception 'La solicitud debe ser revisada por otra administradora.' using errcode = 'P0001';
  end if;

  perform set_config('app.audit_reason', btrim(p_review_notes), true);
  if p_decision = 'REJECT' then
    update public.release_requests
    set state_code = 'REJECTED',
        reviewed_at = now(),
        reviewed_by = v_actor,
        review_notes = btrim(p_review_notes)
    where id = p_request_id
    returning * into v_request;

    return jsonb_build_object(
      'id', v_request.id,
      'stateCode', v_request.state_code,
      'version', v_request.version
    );
  end if;

  select *
    into v_sale
  from public.sales
  where id = v_request.sale_id
  for update;

  select *
    into v_item
  from public.sale_items
  where id = v_request.sale_item_id
  for update;

  if v_sale.commercial_state_code in ('CANCELLED', 'ANNULLED', 'COMPLETED')
     or v_item.item_status not in ('ACTIVE', 'PARTIALLY_RELEASED') then
    raise exception 'La venta o su línea ya no admiten liberación.';
  end if;

  perform 1
  from public.penalties
  where sale_id = v_sale.id
    and penalty_type = 'LATE_DAILY'
    and status = 'ACTIVE'
  for update;

  select coalesce(max(amount), 0)
    into v_late_penalty
  from public.penalties
  where sale_id = v_sale.id
    and penalty_type = 'LATE_DAILY'
    and status = 'ACTIVE';

  v_effective_penalty := greatest(v_request.penalty_amount, v_late_penalty);

  select coalesce(sum(line_total), 0)
    into v_active_lines_total
  from public.sale_items
  where sale_id = v_sale.id
    and item_status not in ('CANCELLED', 'RELEASED');

  v_available_deposit := greatest(v_sale.paid_total - v_sale.refunded_total, 0);
  v_line_deposit := case
    when v_active_lines_total <= 0 then 0
    else least(
      v_item.line_total,
      round(v_available_deposit * v_item.line_total / v_active_lines_total, 2)
    )
  end;
  v_retained := least(v_line_deposit, v_effective_penalty);

  update public.release_requests
  set state_code = 'APPROVED',
      reviewed_at = now(),
      reviewed_by = v_actor,
      review_notes = btrim(p_review_notes),
      penalty_amount = v_effective_penalty,
      deposit_basis_amount = v_line_deposit,
      retained_amount = v_retained,
      refundable_amount = greatest(v_line_deposit - v_retained, 0),
      penalty_rule_snapshot = penalty_rule_snapshot || jsonb_build_object(
        'approvedReleaseCandidate', v_request.penalty_amount,
        'approvedLateCandidate', v_late_penalty,
        'approvedEffectivePenalty', v_effective_penalty,
        'chargedFromDeposit', v_retained,
        'uncoveredPenaltyNotCollected', greatest(v_effective_penalty - v_retained, 0)
      )
  where id = p_request_id
  returning * into v_request;

  -- Al liberar no se cobran simultáneamente atraso y liberación.
  update public.penalties
  set status = 'REVERSED',
      reason = reason || E'\nRevertida al aplicar la penalidad única de liberación.',
      updated_at = now(),
      version = version + 1
  where sale_id = v_sale.id
    and penalty_type = 'LATE_DAILY'
    and status = 'ACTIVE';

  if v_retained > 0 then
    insert into public.penalties(
      sale_id,
      client_id,
      sale_item_id,
      penalty_type,
      quantity_basis,
      unit_amount,
      amount,
      currency_code,
      calculated_from,
      calculated_to,
      rule_snapshot,
      reason,
      status,
      approved_by,
      created_by
    )
    values (
      v_sale.id,
      v_sale.client_id,
      v_item.id,
      'RELEASE',
      1,
      v_request.penalty_amount,
      v_retained,
      v_sale.currency_code,
      coalesce(v_sale.reserved_at, v_sale.created_at),
      now(),
      v_request.penalty_rule_snapshot,
      format(
        'Liberación de %s. Se retienen S/%s del adelanto asignado a la línea.',
        v_item.product_name_snapshot,
        v_retained
      ),
      'ACTIVE',
      v_actor,
      v_actor
    );
  end if;

  if exists(
    select 1
    from public.sale_item_allocations
    where sale_item_id = v_item.id
      and allocation_status in ('RESERVED', 'ACCUMULATED')
  ) then
    insert into public.inventory_movements(
      code,
      movement_type_code,
      reference_type,
      reference_id,
      reason,
      created_by,
      metadata
    )
    values (
      public.next_business_code('INVENTORY_MOVEMENT'),
      'RELEASE',
      'RELEASE_REQUEST',
      v_request.id,
      v_request.reason,
      v_actor,
      jsonb_build_object('sale_id', v_sale.id, 'sale_item_id', v_item.id)
    )
    returning id into v_movement_id;

    for v_allocation in
      select sia.*, si.variant_id
      from public.sale_item_allocations sia
      join public.sale_items si on si.id = sia.sale_item_id
      where sia.sale_item_id = v_item.id
        and sia.allocation_status in ('RESERVED', 'ACCUMULATED')
      for update of sia
    loop
      insert into public.inventory_movement_lines(
        movement_id,
        variant_id,
        lot_id,
        warehouse_id,
        bucket_code,
        quantity_delta
      )
      values
        (
          v_movement_id,
          v_allocation.variant_id,
          v_allocation.lot_id,
          v_allocation.warehouse_id,
          case
            when v_allocation.allocation_status = 'ACCUMULATED' then 'ACCUMULATED'
            else 'RESERVED'
          end,
          -v_allocation.quantity
        ),
        (
          v_movement_id,
          v_allocation.variant_id,
          v_allocation.lot_id,
          v_allocation.warehouse_id,
          'AVAILABLE',
          v_allocation.quantity
        );

      update public.sale_item_allocations
      set allocation_status = 'RELEASED',
          released_at = now(),
          updated_by = v_actor
      where id = v_allocation.id;
    end loop;
  end if;

  update public.preorder_allocations
  set status = 'RELEASED',
      released_at = now(),
      updated_by = v_actor
  where sale_item_id = v_item.id
    and status = 'ALLOCATED';

  update public.sale_items
  set item_status = 'RELEASED',
      updated_by = v_actor
  where id = v_item.id;

  select count(*)::integer
    into v_remaining_lines
  from public.sale_items
  where sale_id = v_sale.id
    and item_status not in ('CANCELLED', 'RELEASED');

  if v_remaining_lines = 0 then
    update public.sales
    set commercial_state_code = 'CANCELLED',
        delivery_state_code = 'CANCELLED',
        cancelled_at = now(),
        cancellation_reason = v_request.reason,
        updated_by = v_actor
    where id = v_sale.id;
  end if;

  insert into public.client_incidents(
    client_id,
    incident_type,
    severity,
    sale_id,
    description,
    amount,
    currency_code,
    created_by
  )
  values (
    v_sale.client_id,
    'RELEASE',
    'MEDIUM',
    v_sale.id,
    format('Liberación de línea: %s. %s', v_item.product_name_snapshot, v_request.reason),
    v_retained,
    v_sale.currency_code,
    v_actor
  );

  perform public.refresh_sale_totals(v_sale.id);

  update public.release_requests
  set state_code = 'EXECUTED',
      inventory_movement_id = v_movement_id
  where id = p_request_id
  returning * into v_request;

  return jsonb_build_object(
    'id', v_request.id,
    'stateCode', v_request.state_code,
    'version', v_request.version,
    'penaltyAmount', v_request.penalty_amount,
    'retainedAmount', v_request.retained_amount,
    'refundableAmount', v_request.refundable_amount
  );
end;
$$;

revoke all on function public.get_sale_release_quote_v2(uuid) from public, anon;
revoke all on function public.get_sale_detail_v2(uuid) from public, anon;
revoke all on function public.request_sale_release_v2(uuid, text, numeric) from public, anon;
revoke all on function public.review_sale_release_v2(uuid, text, text) from public, anon;

grant execute on function public.get_sale_release_quote_v2(uuid) to authenticated, service_role;
grant execute on function public.get_sale_detail_v2(uuid) to authenticated, service_role;
grant execute on function public.request_sale_release_v2(uuid, text, numeric) to authenticated, service_role;
grant execute on function public.review_sale_release_v2(uuid, text, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
