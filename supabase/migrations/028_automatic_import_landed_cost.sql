-- Yukimi Gestión
-- Migración 028: distribución automática de costos de importación y ajustes posteriores

begin;

create table if not exists public.import_cost_allocations (
  id uuid primary key default extensions.gen_random_uuid(),
  import_cost_id uuid not null references public.import_costs(id) on delete restrict,
  import_box_item_id uuid not null references public.import_box_items(id) on delete restrict,
  allocation_method text not null
    check (allocation_method in ('BY_QUANTITY', 'BY_PURCHASE_VALUE', 'BY_WEIGHT')),
  allocation_basis numeric(18,6) not null check (allocation_basis >= 0),
  allocated_amount_pen numeric(14,4) not null check (allocated_amount_pen >= 0),
  is_residual_receiver boolean not null default false,
  is_active boolean not null default true,
  rule_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  unique(import_cost_id, import_box_item_id)
);

create index if not exists ix_import_cost_allocations_item
  on public.import_cost_allocations(import_box_item_id)
  where is_active = true;

create table if not exists public.import_landed_cost_adjustments (
  id uuid primary key default extensions.gen_random_uuid(),
  import_cost_allocation_id uuid not null unique
    references public.import_cost_allocations(id) on delete restrict,
  inventory_lot_id uuid not null references public.inventory_lots(id) on delete restrict,
  allocated_amount_pen numeric(14,4) not null check (allocated_amount_pen >= 0),
  quantity_basis integer not null check (quantity_basis > 0),
  unit_cost_delta_pen numeric(14,4) not null check (unit_cost_delta_pen >= 0),
  status text not null default 'POSTED' check (status in ('POSTED', 'REVERSED')),
  reason text not null,
  rule_snapshot jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now()
);

alter table public.import_costs
  add column if not exists allocation_rule_snapshot jsonb not null default '{}'::jsonb;

alter table public.import_cost_allocations enable row level security;
alter table public.import_cost_allocations force row level security;
alter table public.import_landed_cost_adjustments enable row level security;
alter table public.import_landed_cost_adjustments force row level security;

grant select on public.import_cost_allocations to authenticated;
grant select on public.import_landed_cost_adjustments to authenticated;

drop policy if exists admin_select on public.import_cost_allocations;
create policy admin_select on public.import_cost_allocations
for select to authenticated using (private.is_active_admin());

drop policy if exists admin_select on public.import_landed_cost_adjustments;
create policy admin_select on public.import_landed_cost_adjustments
for select to authenticated using (private.is_active_admin());

drop trigger if exists trg_touch_version on public.import_cost_allocations;
create trigger trg_touch_version
before update on public.import_cost_allocations
for each row execute function private.touch_updated_at_and_version();

drop trigger if exists trg_audit_row_change on public.import_cost_allocations;
create trigger trg_audit_row_change
after insert or update or delete on public.import_cost_allocations
for each row execute function private.audit_row_change();

drop trigger if exists trg_audit_row_change on public.import_landed_cost_adjustments;
create trigger trg_audit_row_change
after insert or update or delete on public.import_landed_cost_adjustments
for each row execute function private.audit_row_change();

insert into public.business_settings(
  setting_key,
  setting_value,
  description,
  value_type,
  is_sensitive
)
values (
  'imports.landed_cost_policy',
  jsonb_build_object(
    'cardCommissionCustoms', 'BY_PURCHASE_VALUE',
    'freightInsurance', 'BY_WEIGHT',
    'missingWeightFallback', 'BY_QUANTITY',
    'roundingResidual', 'LARGEST_PURCHASE_LINE',
    'costsAfterReceipt', 'SEPARATE_LANDED_COST_ADJUSTMENT',
    'customsIncluded', true
  ),
  'Criterio configurable para distribuir costos de importación.',
  'JSON',
  false
)
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    description = excluded.description,
    value_type = excluded.value_type,
    updated_at = now();

create or replace function public.calculate_import_landed_cost_v1(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_cost public.import_costs%rowtype;
  v_adjustment record;
  v_items jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if not exists(
    select 1 from public.import_shipments where id = p_import_id
  ) then
    raise exception 'Importación no encontrada.' using errcode = 'P0002';
  end if;

  perform 1
  from public.import_box_items ibi
  join public.import_boxes ib on ib.id = ibi.import_box_id
  where ib.import_shipment_id = p_import_id
  order by ibi.id
  for update of ibi;

  for v_cost in
    select *
    from public.import_costs
    where import_shipment_id = p_import_id
      and is_included_in_unit_cost = true
      and allocation_method in ('BY_QUANTITY', 'BY_PURCHASE_VALUE', 'BY_WEIGHT')
    order by occurred_at, id
    for update
  loop
    update public.import_cost_allocations
    set is_active = false
    where import_cost_id = v_cost.id
      and is_active = true;

    with candidate_source as (
      select
        ibi.id as import_box_item_id,
        ibi.expected_quantity,
        round(
          ibi.expected_quantity
            * ibi.original_unit_cost
            * ibi.exchange_rate_to_pen,
          6
        ) as purchase_value_pen,
        ib.weight_grams,
        sum(ibi.expected_quantity) over(partition by ib.id) as box_quantity
      from public.import_box_items ibi
      join public.import_boxes ib on ib.id = ibi.import_box_id
      where ib.import_shipment_id = p_import_id
        and (v_cost.import_box_id is null or ib.id = v_cost.import_box_id)
        and ib.state_code <> 'CANCELLED'
    ),
    weighted as (
      select
        import_box_item_id,
        purchase_value_pen,
        case v_cost.allocation_method
          when 'BY_PURCHASE_VALUE' then purchase_value_pen
          when 'BY_WEIGHT' then coalesce(weight_grams, 0)
            * expected_quantity / nullif(box_quantity, 0)
          else expected_quantity::numeric
        end as allocation_basis
      from candidate_source
    ),
    normalized as (
      select
        import_box_item_id,
        purchase_value_pen,
        case
          when sum(allocation_basis) over() > 0 then allocation_basis
          else 1::numeric
        end as allocation_basis
      from weighted
    ),
    provisional as (
      select
        import_box_item_id,
        purchase_value_pen,
        allocation_basis,
        row_number() over(
          order by purchase_value_pen desc, import_box_item_id
        ) as residual_rank,
        round(
          v_cost.amount_pen * allocation_basis
            / nullif(sum(allocation_basis) over(), 0),
          4
        ) as provisional_amount
      from normalized
    ),
    allocated as (
      select
        import_box_item_id,
        allocation_basis,
        residual_rank,
        case
          when residual_rank = 1 then provisional_amount
            + (v_cost.amount_pen - sum(provisional_amount) over())
          else provisional_amount
        end as allocated_amount
      from provisional
    )
    insert into public.import_cost_allocations(
      import_cost_id,
      import_box_item_id,
      allocation_method,
      allocation_basis,
      allocated_amount_pen,
      is_residual_receiver,
      is_active,
      rule_snapshot,
      created_by
    )
    select
      v_cost.id,
      a.import_box_item_id,
      v_cost.allocation_method,
      a.allocation_basis,
      greatest(a.allocated_amount, 0),
      a.residual_rank = 1,
      true,
      jsonb_build_object(
        'costType', v_cost.cost_type,
        'costAmountPen', v_cost.amount_pen,
        'scope', case when v_cost.import_box_id is null then 'IMPORT' else 'BOX' end,
        'roundingResidual', 'LARGEST_PURCHASE_LINE'
      ),
      v_actor
    from allocated a
    on conflict (import_cost_id, import_box_item_id) do update
    set allocation_method = excluded.allocation_method,
        allocation_basis = excluded.allocation_basis,
        allocated_amount_pen = excluded.allocated_amount_pen,
        is_residual_receiver = excluded.is_residual_receiver,
        is_active = true,
        rule_snapshot = excluded.rule_snapshot;
  end loop;

  update public.import_box_items ibi
  set final_unit_cost_pen = round(
        ibi.original_unit_cost * ibi.exchange_rate_to_pen
          + coalesce(alloc.total_allocated, 0) / ibi.expected_quantity,
        4
      ),
      updated_by = v_actor
  from (
    select
      ica.import_box_item_id,
      sum(ica.allocated_amount_pen) as total_allocated
    from public.import_cost_allocations ica
    join public.import_costs ic on ic.id = ica.import_cost_id
    where ic.import_shipment_id = p_import_id
      and ica.is_active = true
    group by ica.import_box_item_id
  ) alloc
  where ibi.id = alloc.import_box_item_id
    and ibi.inventory_lot_id is null;

  update public.import_box_items ibi
  set final_unit_cost_pen = round(
        ibi.original_unit_cost * ibi.exchange_rate_to_pen,
        4
      ),
      updated_by = v_actor
  where ibi.import_box_id in (
      select id from public.import_boxes where import_shipment_id = p_import_id
    )
    and ibi.inventory_lot_id is null
    and not exists(
      select 1
      from public.import_cost_allocations ica
      where ica.import_box_item_id = ibi.id
        and ica.is_active = true
    );

  for v_adjustment in
    select
      ica.id as allocation_id,
      ica.allocated_amount_pen,
      ica.rule_snapshot,
      ibi.inventory_lot_id,
      greatest(ibi.received_quantity, 1) as quantity_basis
    from public.import_cost_allocations ica
    join public.import_costs ic on ic.id = ica.import_cost_id
    join public.import_box_items ibi on ibi.id = ica.import_box_item_id
    where ic.import_shipment_id = p_import_id
      and ica.is_active = true
      and ibi.inventory_lot_id is not null
      and not exists(
        select 1
        from public.import_landed_cost_adjustments ilca
        where ilca.import_cost_allocation_id = ica.id
      )
    order by ica.id
  loop
    insert into public.import_landed_cost_adjustments(
      import_cost_allocation_id,
      inventory_lot_id,
      allocated_amount_pen,
      quantity_basis,
      unit_cost_delta_pen,
      reason,
      rule_snapshot,
      created_by
    )
    values (
      v_adjustment.allocation_id,
      v_adjustment.inventory_lot_id,
      v_adjustment.allocated_amount_pen,
      v_adjustment.quantity_basis,
      round(
        v_adjustment.allocated_amount_pen / v_adjustment.quantity_basis,
        4
      ),
      'Ajuste de costo de importación registrado después de la recepción.',
      v_adjustment.rule_snapshot || jsonb_build_object(
        'postingMode',
        'SEPARATE_LANDED_COST_ADJUSTMENT'
      ),
      v_actor
    );
  end loop;

  update public.inventory_lots il
  set final_unit_cost_pen = round(
        il.original_unit_cost * il.exchange_rate_to_pen
          + coalesce(adjustment.total_delta, 0),
        4
      ),
      updated_by = v_actor
  from (
    select
      inventory_lot_id,
      sum(unit_cost_delta_pen) filter (where status = 'POSTED') as total_delta
    from public.import_landed_cost_adjustments
    group by inventory_lot_id
  ) adjustment
  where il.id = adjustment.inventory_lot_id
    and il.source_type = 'IMPORT';

  update public.import_box_items ibi
  set final_unit_cost_pen = il.final_unit_cost_pen,
      updated_by = v_actor
  from public.inventory_lots il
  where ibi.inventory_lot_id = il.id
    and ibi.import_box_id in (
      select id from public.import_boxes where import_shipment_id = p_import_id
    );

  select coalesce(jsonb_agg(jsonb_build_object(
    'importBoxItemId', ibi.id,
    'productName', p.name,
    'variantName', pv.variant_name,
    'expectedQuantity', ibi.expected_quantity,
    'baseUnitCostPen', round(
      ibi.original_unit_cost * ibi.exchange_rate_to_pen,
      4
    ),
    'allocatedCostPen', coalesce(alloc.total_allocated, 0),
    'finalUnitCostPen', ibi.final_unit_cost_pen,
    'received', ibi.inventory_lot_id is not null
  ) order by p.name, pv.variant_name), '[]'::jsonb)
    into v_items
  from public.import_box_items ibi
  join public.import_boxes ib on ib.id = ibi.import_box_id
  join public.product_variants pv on pv.id = ibi.variant_id
  join public.products p on p.id = pv.product_id
  left join lateral (
    select sum(ica.allocated_amount_pen) as total_allocated
    from public.import_cost_allocations ica
    where ica.import_box_item_id = ibi.id
      and ica.is_active = true
  ) alloc on true
  where ib.import_shipment_id = p_import_id;

  return jsonb_build_object(
    'importId', p_import_id,
    'items', v_items,
    'policy', jsonb_build_object(
      'roundingResidual', 'LARGEST_PURCHASE_LINE',
      'postReceiptMode', 'SEPARATE_LANDED_COST_ADJUSTMENT'
    )
  );
end;
$$;

create or replace function public.add_import_cost_v2(
  p_import_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_input jsonb := p_input;
  v_cost_type text := p_input ->> 'costType';
  v_box_id uuid := nullif(p_input ->> 'importBoxId', '')::uuid;
  v_method text;
  v_include boolean;
  v_result jsonb;
  v_preview jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if v_cost_type in ('CARD', 'COMMISSION', 'CUSTOMS') then
    v_method := 'BY_PURCHASE_VALUE';
    v_include := true;
  elsif v_cost_type in ('FREIGHT', 'INSURANCE') then
    if exists(
      select 1
      from public.import_boxes ib
      where ib.import_shipment_id = p_import_id
        and (v_box_id is null or ib.id = v_box_id)
        and ib.state_code <> 'CANCELLED'
        and coalesce(ib.weight_grams, 0) <= 0
    ) then
      v_method := 'BY_QUANTITY';
    else
      v_method := 'BY_WEIGHT';
    end if;
    v_include := true;
  else
    v_method := case
      when p_input ->> 'allocationMethod' in (
        'BY_QUANTITY',
        'BY_PURCHASE_VALUE',
        'BY_WEIGHT',
        'NOT_ALLOCATED'
      ) then p_input ->> 'allocationMethod'
      else 'BY_PURCHASE_VALUE'
    end;
    v_include := coalesce(
      (p_input ->> 'isIncludedInUnitCost')::boolean,
      false
    );
  end if;

  if v_method = 'BY_WEIGHT' and exists(
    select 1
    from public.import_boxes ib
    where ib.import_shipment_id = p_import_id
      and (v_box_id is null or ib.id = v_box_id)
      and ib.state_code <> 'CANCELLED'
      and coalesce(ib.weight_grams, 0) <= 0
  ) then
    v_method := 'BY_QUANTITY';
  end if;

  v_input := jsonb_set(v_input, '{allocationMethod}', to_jsonb(v_method), true);
  v_input := jsonb_set(v_input, '{isIncludedInUnitCost}', to_jsonb(v_include), true);
  v_result := public.add_import_cost_v1(p_import_id, v_input);

  update public.import_costs
  set allocation_rule_snapshot = jsonb_build_object(
        'requestedMethod', p_input ->> 'allocationMethod',
        'resolvedMethod', v_method,
        'includedInUnitCost', v_include,
        'missingWeightFallback', 'BY_QUANTITY',
        'roundingResidual', 'LARGEST_PURCHASE_LINE'
      )
  where id = (v_result ->> 'id')::uuid;

  v_preview := public.calculate_import_landed_cost_v1(p_import_id);
  return v_result || jsonb_build_object(
    'allocationMethod', v_method,
    'isIncludedInUnitCost', v_include,
    'costPreview', v_preview
  );
end;
$$;

create or replace function public.receive_import_box_v2(
  p_box_id uuid,
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import_id uuid;
  v_enriched_input jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select import_shipment_id
    into v_import_id
  from public.import_boxes
  where id = p_box_id;
  if not found then
    raise exception 'Caja no encontrada.' using errcode = 'P0002';
  end if;

  perform public.calculate_import_landed_cost_v1(v_import_id);

  select jsonb_set(
    p_input,
    '{items}',
    coalesce(jsonb_agg(
      item.value || jsonb_build_object(
        'finalUnitCostPen',
        ibi.final_unit_cost_pen
      )
    ), '[]'::jsonb),
    true
  )
    into v_enriched_input
  from jsonb_array_elements(p_input -> 'items') item(value)
  join public.import_box_items ibi
    on ibi.id = (item.value ->> 'importBoxItemId')::uuid
   and ibi.import_box_id = p_box_id;

  return public.receive_import_box_v1(
    p_box_id,
    v_enriched_input,
    p_idempotency_key
  );
end;
$$;

revoke all on function public.calculate_import_landed_cost_v1(uuid) from public, anon;
revoke all on function public.add_import_cost_v2(uuid, jsonb) from public, anon;
revoke all on function public.receive_import_box_v2(uuid, jsonb, text) from public, anon;

grant execute on function public.calculate_import_landed_cost_v1(uuid) to authenticated, service_role;
grant execute on function public.add_import_cost_v2(uuid, jsonb) to authenticated, service_role;
grant execute on function public.receive_import_box_v2(uuid, jsonb, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
