-- Yukimi Gestión
-- Migración 018: edición auditada de entregas pendientes

begin;

alter table public.delivery_items
  add column if not exists is_active boolean not null default true;

create index if not exists ix_delivery_items_active
  on public.delivery_items(delivery_id, sale_item_id)
  where is_active = true;

-- Permite corregir el método antes del despacho, conservando el cambio en el flujo.
insert into public.workflow_transitions(
  workflow_code, from_state_code, to_state_code, requires_confirmation, requires_reason, is_active
) values
  ('DELIVERY','ACCUMULATED','PENDING_INSTRUCTIONS',false,true,true),
  ('DELIVERY','PENDING_AGENCY_DISPATCH','PENDING_INSTRUCTIONS',false,true,true),
  ('DELIVERY','PENDING_AGENCY_DISPATCH','ACCUMULATED',false,true,true)
on conflict (workflow_code, from_state_code, to_state_code) do update set
  requires_confirmation = excluded.requires_confirmation,
  requires_reason = excluded.requires_reason,
  is_active = true;

create or replace function private.validate_delivery_item_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sold integer;
  v_other_delivered integer;
  v_item_sale_id uuid;
  v_delivery_sale_id uuid;
begin
  if new.is_active = false then
    return new;
  end if;

  select quantity, sale_id into v_sold, v_item_sale_id
  from public.sale_items
  where id = new.sale_item_id;

  select sale_id into v_delivery_sale_id
  from public.deliveries
  where id = new.delivery_id;

  if v_item_sale_id is null or v_delivery_sale_id is null or v_item_sale_id <> v_delivery_sale_id then
    raise exception 'El producto entregado debe pertenecer a la misma venta de la entrega.';
  end if;

  select coalesce(sum(di.quantity), 0)
  into v_other_delivered
  from public.delivery_items di
  join public.deliveries d on d.id = di.delivery_id
  where di.sale_item_id = new.sale_item_id
    and di.is_active = true
    and d.state_code <> 'CANCELLED'
    and di.id <> new.id;

  if v_other_delivered + new.quantity > v_sold then
    raise exception 'La cantidad total de entregas supera la cantidad vendida.';
  end if;

  return new;
end;
$$;

create or replace function private.refresh_sale_delivery_state_v1(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_total integer;
  v_delivered integer;
  v_next text;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then return; end if;

  select coalesce(sum(quantity), 0)::integer into v_total
  from public.sale_items
  where sale_id = p_sale_id and item_status not in ('CANCELLED', 'RELEASED');

  select coalesce(sum(di.quantity), 0)::integer into v_delivered
  from public.delivery_items di
  join public.deliveries d on d.id = di.delivery_id
  where d.sale_id = p_sale_id
    and d.state_code = 'DELIVERED_TO_CLIENT'
    and di.is_active = true;

  if v_total > 0 and v_delivered >= v_total then
    v_next := 'DELIVERED';
  elsif v_delivered > 0 then
    v_next := 'PARTIAL';
  elsif v_sale.delivery_state_code = 'ACCUMULATED' then
    v_next := 'ACCUMULATED';
  else
    v_next := 'PENDING';
  end if;

  if v_sale.delivery_state_code is distinct from v_next
     and v_sale.delivery_state_code not in ('CANCELLED', 'DELIVERED') then
    perform pg_catalog.set_config('app.audit_reason', 'Actualización automática por avance de entrega', true);
    update public.sales
    set delivery_state_code = v_next, updated_by = private.current_actor_id()
    where id = p_sale_id;
  end if;
end;
$$;

create or replace function private.finalize_delivery_inventory_v1(p_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_movement_id uuid;
  v_item record;
  v_allocation record;
  v_needed integer;
  v_take integer;
  v_source_bucket text;
begin
  select id into v_movement_id
  from public.inventory_movements
  where movement_type_code = 'DELIVERY'
    and reference_type = 'DELIVERY'
    and reference_id = p_delivery_id
  order by created_at desc
  limit 1;

  if v_movement_id is not null then
    return v_movement_id;
  end if;

  select * into v_delivery from public.deliveries where id = p_delivery_id for update;
  if not found then raise exception 'Entrega no encontrada.' using errcode = 'P0002'; end if;

  insert into public.inventory_movements(
    code, movement_type_code, reference_type, reference_id, reason, created_by, metadata
  ) values (
    public.next_business_code('INVENTORY_MOVEMENT'),
    'DELIVERY',
    'DELIVERY',
    p_delivery_id,
    'Entrega confirmada al cliente',
    private.current_actor_id(),
    jsonb_build_object('sale_id', v_delivery.sale_id)
  ) returning id into v_movement_id;

  for v_item in
    select di.sale_item_id, di.quantity, si.variant_id
    from public.delivery_items di
    join public.sale_items si on si.id = di.sale_item_id
    where di.delivery_id = p_delivery_id
      and di.is_active = true
    order by di.id
  loop
    v_needed := v_item.quantity;

    for v_allocation in
      select sia.*
      from public.sale_item_allocations sia
      where sia.sale_item_id = v_item.sale_item_id
        and sia.allocation_status in ('RESERVED', 'ACCUMULATED')
      order by sia.created_at, sia.id
      for update
    loop
      exit when v_needed <= 0;
      v_take := least(v_needed, v_allocation.quantity);
      v_source_bucket := case when v_allocation.allocation_status = 'ACCUMULATED' then 'ACCUMULATED' else 'RESERVED' end;

      insert into public.inventory_movement_lines(
        movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta
      ) values
        (v_movement_id, v_item.variant_id, v_allocation.lot_id, v_allocation.warehouse_id, v_source_bucket, -v_take),
        (v_movement_id, v_item.variant_id, v_allocation.lot_id, v_allocation.warehouse_id, 'DELIVERED', v_take);

      if v_take = v_allocation.quantity then
        update public.sale_item_allocations
        set allocation_status = 'DELIVERED', delivered_at = coalesce(v_delivery.delivered_at, now()),
            updated_by = private.current_actor_id()
        where id = v_allocation.id;
      else
        update public.sale_item_allocations
        set quantity = quantity - v_take, updated_by = private.current_actor_id()
        where id = v_allocation.id;

        insert into public.sale_item_allocations(
          sale_item_id, lot_id, warehouse_id, quantity, allocation_status,
          reserved_at, delivered_at, created_by, updated_by
        ) values (
          v_allocation.sale_item_id, v_allocation.lot_id, v_allocation.warehouse_id,
          v_take, 'DELIVERED', v_allocation.reserved_at, coalesce(v_delivery.delivered_at, now()),
          private.current_actor_id(), private.current_actor_id()
        );
      end if;

      v_needed := v_needed - v_take;
    end loop;

    if v_needed > 0 then
      raise exception 'No hay suficiente stock reservado o acumulado para completar la entrega.' using errcode = 'P0001';
    end if;
  end loop;

  return v_movement_id;
end;
$$;

create or replace function public.get_delivery_support_v1(p_sale_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_selected jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if p_sale_id is not null then
    select jsonb_build_object(
      'id', s.id,
      'code', s.code,
      'clientId', s.client_id,
      'clientName', s.client_name_snapshot,
      'clientPhone', s.client_phone_snapshot,
      'deliveryStateCode', s.delivery_state_code,
      'addresses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ca.id,
          'label', ca.label,
          'addressLine', ca.address_line,
          'district', ca.district,
          'province', ca.province,
          'department', ca.department,
          'reference', ca.reference,
          'isPrimary', ca.is_default
        ) order by ca.is_default desc, ca.label)
        from public.client_addresses ca
        where ca.client_id = s.client_id and ca.is_active = true
      ), '[]'::jsonb),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'saleItemId', si.id,
          'productName', si.product_name_snapshot,
          'variantName', si.variant_name_snapshot,
          'sku', si.sku_snapshot,
          'quantity', si.quantity,
          'assignedQuantity', coalesce((
            select sum(di.quantity)::integer
            from public.delivery_items di
            join public.deliveries d2 on d2.id = di.delivery_id
            where di.sale_item_id = si.id and d2.state_code <> 'CANCELLED' and di.is_active = true
          ), 0),
          'remainingQuantity', greatest(si.quantity - coalesce((
            select sum(di.quantity)::integer
            from public.delivery_items di
            join public.deliveries d2 on d2.id = di.delivery_id
            where di.sale_item_id = si.id and d2.state_code <> 'CANCELLED' and di.is_active = true
          ), 0), 0),
          'allocations', coalesce((
            select jsonb_agg(jsonb_build_object(
              'warehouseName', w.name,
              'quantity', sia.quantity,
              'status', sia.allocation_status
            ) order by w.name, sia.created_at)
            from public.sale_item_allocations sia
            join public.warehouses w on w.id = sia.warehouse_id
            where sia.sale_item_id = si.id
              and sia.allocation_status in ('RESERVED', 'ACCUMULATED')
          ), '[]'::jsonb)
        ) order by si.created_at, si.id)
        from public.sale_items si
        where si.sale_id = s.id
          and si.item_status not in ('CANCELLED', 'RELEASED')
          and si.quantity > coalesce((
            select sum(di.quantity)::integer
            from public.delivery_items di
            join public.deliveries d2 on d2.id = di.delivery_id
            where di.sale_item_id = si.id and d2.state_code <> 'CANCELLED' and di.is_active = true
          ), 0)
      ), '[]'::jsonb)
    ) into v_selected
    from public.sales s
    where s.id = p_sale_id
      and s.commercial_state_code not in ('CANCELLED', 'ANNULLED');

    if v_selected is null then
      raise exception 'La venta no existe o no admite entregas.' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object(
    'operators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'code', bp.code,
        'name', coalesce(bp.trade_name, bp.legal_name),
        'types', coalesce((
          select jsonb_agg(bpt.partner_type_code order by bpt.partner_type_code)
          from public.business_partner_types bpt
          where bpt.partner_id = bp.id
            and bpt.partner_type_code in ('AGENCY', 'COURIER', 'LOCAL_OPERATOR')
        ), '[]'::jsonb)
      ) order by coalesce(bp.trade_name, bp.legal_name))
      from public.business_partners bp
      where bp.is_active = true
        and exists (
          select 1 from public.business_partner_types bpt
          where bpt.partner_id = bp.id
            and bpt.partner_type_code in ('AGENCY', 'COURIER')
        )
    ), '[]'::jsonb),
    'eligibleSales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id,
        'code', x.code,
        'clientName', x.client_name_snapshot,
        'clientPhone', x.client_phone_snapshot,
        'deliveryStateCode', x.delivery_state_code,
        'remainingUnits', x.remaining_units
      ) order by x.created_at desc)
      from (
        select s.id, s.code, s.client_name_snapshot, s.client_phone_snapshot,
               s.delivery_state_code, s.created_at,
               sum(greatest(si.quantity - coalesce(assigned.qty, 0), 0))::integer as remaining_units
        from public.sales s
        join public.sale_items si on si.sale_id = s.id and si.item_status not in ('CANCELLED', 'RELEASED')
        left join lateral (
          select sum(di.quantity)::integer as qty
          from public.delivery_items di
          join public.deliveries d on d.id = di.delivery_id
          where di.sale_item_id = si.id and d.state_code <> 'CANCELLED' and di.is_active = true
        ) assigned on true
        where s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
          and s.delivery_state_code <> 'DELIVERED'
        group by s.id
        having sum(greatest(si.quantity - coalesce(assigned.qty, 0), 0)) > 0
        order by s.created_at desc
        limit 100
      ) x
    ), '[]'::jsonb),
    'selectedSale', v_selected
  );
end;
$$;

create or replace function public.list_deliveries_v1(
  p_search text default null,
  p_filter text default 'ALL',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offset integer := greatest(p_page - 1, 0) * p_page_size;
  v_total integer;
  v_items jsonb;
  v_summary jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if p_filter not in ('ALL', 'PENDING_AGENCY', 'ACCUMULATED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED') then
    raise exception 'Filtro de entregas inválido.';
  end if;

  select count(*)::integer into v_total
  from public.deliveries d
  join public.sales s on s.id = d.sale_id
  left join public.business_partners bp on bp.id = d.operator_partner_id
  where (
    nullif(btrim(p_search), '') is null
    or d.code ilike '%' || btrim(p_search) || '%'
    or s.code ilike '%' || btrim(p_search) || '%'
    or s.client_name_snapshot ilike '%' || btrim(p_search) || '%'
    or coalesce(s.client_phone_snapshot, '') ilike '%' || btrim(p_search) || '%'
    or coalesce(d.tracking_number, '') ilike '%' || btrim(p_search) || '%'
    or coalesce(bp.trade_name, bp.legal_name, '') ilike '%' || btrim(p_search) || '%'
  )
  and case p_filter
    when 'PENDING_AGENCY' then d.state_code = 'PENDING_AGENCY_DISPATCH'
    when 'ACCUMULATED' then d.state_code = 'ACCUMULATED'
    when 'IN_TRANSIT' then d.state_code in ('DELIVERED_TO_AGENCY', 'OUT_FOR_DELIVERY', 'PARTIALLY_DELIVERED')
    when 'DELIVERED' then d.state_code = 'DELIVERED_TO_CLIENT'
    when 'CANCELLED' then d.state_code = 'CANCELLED'
    else true
  end;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb) into v_items
  from (
    select d.created_at,
      jsonb_build_object(
        'id', d.id,
        'code', d.code,
        'saleId', s.id,
        'saleCode', s.code,
        'clientId', s.client_id,
        'clientName', s.client_name_snapshot,
        'clientPhone', s.client_phone_snapshot,
        'deliveryMethod', d.delivery_method,
        'stateCode', d.state_code,
        'operatorName', coalesce(bp.trade_name, bp.legal_name),
        'trackingNumber', d.tracking_number,
        'plannedDispatchDate', d.planned_dispatch_date,
        'dispatchedAt', d.dispatched_at,
        'deliveredAt', d.delivered_at,
        'shippingCost', d.shipping_cost,
        'currencyCode', d.currency_code,
        'itemLines', (select count(*)::integer from public.delivery_items di where di.delivery_id = d.id and di.is_active = true),
        'totalUnits', (select coalesce(sum(di.quantity), 0)::integer from public.delivery_items di where di.delivery_id = d.id and di.is_active = true),
        'createdAt', d.created_at,
        'version', d.version
      ) as row_json
    from public.deliveries d
    join public.sales s on s.id = d.sale_id
    left join public.business_partners bp on bp.id = d.operator_partner_id
    where (
      nullif(btrim(p_search), '') is null
      or d.code ilike '%' || btrim(p_search) || '%'
      or s.code ilike '%' || btrim(p_search) || '%'
      or s.client_name_snapshot ilike '%' || btrim(p_search) || '%'
      or coalesce(s.client_phone_snapshot, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(d.tracking_number, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(bp.trade_name, bp.legal_name, '') ilike '%' || btrim(p_search) || '%'
    )
    and case p_filter
      when 'PENDING_AGENCY' then d.state_code = 'PENDING_AGENCY_DISPATCH'
      when 'ACCUMULATED' then d.state_code = 'ACCUMULATED'
      when 'IN_TRANSIT' then d.state_code in ('DELIVERED_TO_AGENCY', 'OUT_FOR_DELIVERY', 'PARTIALLY_DELIVERED')
      when 'DELIVERED' then d.state_code = 'DELIVERED_TO_CLIENT'
      when 'CANCELLED' then d.state_code = 'CANCELLED'
      else true
    end
    order by d.created_at desc
    limit p_page_size offset v_offset
  ) paged;

  select jsonb_build_object(
    'pending', count(*) filter (where state_code in ('PENDING_INSTRUCTIONS', 'PENDING_AGENCY_DISPATCH'))::integer,
    'accumulated', (select count(*)::integer from public.sales where delivery_state_code = 'ACCUMULATED' and commercial_state_code not in ('CANCELLED', 'ANNULLED')),
    'inTransit', count(*) filter (where state_code in ('DELIVERED_TO_AGENCY', 'OUT_FOR_DELIVERY', 'PARTIALLY_DELIVERED'))::integer,
    'deliveredThisMonth', count(*) filter (
      where state_code = 'DELIVERED_TO_CLIENT'
        and delivered_at >= date_trunc('month', now())
    )::integer
  ) into v_summary
  from public.deliveries;

  return jsonb_build_object(
    'items', v_items,
    'summary', v_summary,
    'page', greatest(p_page, 1),
    'pageSize', p_page_size,
    'total', v_total
  );
end;
$$;

create or replace function public.get_delivery_detail_v1(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', d.id,
    'code', d.code,
    'saleId', s.id,
    'saleCode', s.code,
    'clientId', s.client_id,
    'clientName', s.client_name_snapshot,
    'clientPhone', s.client_phone_snapshot,
    'deliveryMethod', d.delivery_method,
    'stateCode', d.state_code,
    'canEdit', d.state_code in ('PENDING_INSTRUCTIONS', 'ACCUMULATED', 'PENDING_AGENCY_DISPATCH'),
    'operatorPartnerId', d.operator_partner_id,
    'operatorName', coalesce(bp.trade_name, bp.legal_name),
    'destinationAddressId', d.destination_address_id,
    'destinationLabel', ca.label,
    'destinationAddress', case when ca.id is null then null else concat_ws(', ', ca.address_line, ca.district, ca.province, ca.department) end,
    'trackingNumber', d.tracking_number,
    'shippingCost', d.shipping_cost,
    'currencyCode', d.currency_code,
    'costPayer', d.cost_payer,
    'plannedDispatchDate', d.planned_dispatch_date,
    'dispatchedAt', d.dispatched_at,
    'agencyReceivedAt', d.agency_received_at,
    'deliveredAt', d.delivered_at,
    'notes', d.notes,
    'createdByName', creator.display_name,
    'createdAt', d.created_at,
    'version', d.version,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', di.id,
        'saleItemId', si.id,
        'productName', si.product_name_snapshot,
        'variantName', si.variant_name_snapshot,
        'sku', si.sku_snapshot,
        'quantity', di.quantity
      ) order by si.created_at, si.id)
      from public.delivery_items di
      join public.sale_items si on si.id = di.sale_item_id
      where di.delivery_id = d.id
        and di.is_active = true
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'previousStateCode', h.previous_state_code,
        'newStateCode', h.new_state_code,
        'reason', h.reason,
        'changedByName', hp.display_name,
        'changedAt', h.changed_at
      ) order by h.changed_at desc)
      from public.delivery_state_history h
      left join public.profiles hp on hp.id = h.changed_by
      where h.delivery_id = d.id
    ), '[]'::jsonb),
    'allowedTransitions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stateCode', wt.to_state_code,
        'name', ws.label,
        'requiresReason', wt.requires_reason
      ) order by ws.sort_order)
      from public.workflow_transitions wt
      join public.workflow_states ws
        on ws.workflow_code = wt.workflow_code and ws.state_code = wt.to_state_code
      where wt.workflow_code = 'DELIVERY'
        and wt.from_state_code = d.state_code
        and wt.is_active = true
        and wt.to_state_code <> 'PARTIALLY_DELIVERED'
    ), '[]'::jsonb)
  ) into v_result
  from public.deliveries d
  join public.sales s on s.id = d.sale_id
  left join public.business_partners bp on bp.id = d.operator_partner_id
  left join public.client_addresses ca on ca.id = d.destination_address_id
  left join public.profiles creator on creator.id = d.created_by
  where d.id = p_delivery_id;

  if v_result is null then
    raise exception 'Entrega no encontrada.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

create or replace function public.get_delivery_edit_support_v1(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_selected jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select * into v_delivery
  from public.deliveries
  where id = p_delivery_id;

  if not found then
    raise exception 'Entrega no encontrada.' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', s.id,
    'code', s.code,
    'clientId', s.client_id,
    'clientName', s.client_name_snapshot,
    'clientPhone', s.client_phone_snapshot,
    'deliveryStateCode', s.delivery_state_code,
    'addresses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ca.id,
        'label', ca.label,
        'addressLine', ca.address_line,
        'district', ca.district,
        'province', ca.province,
        'department', ca.department,
        'reference', ca.reference,
        'isPrimary', ca.is_default
      ) order by ca.is_default desc, ca.label)
      from public.client_addresses ca
      where ca.client_id = s.client_id and ca.is_active = true
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'saleItemId', si.id,
        'productName', si.product_name_snapshot,
        'variantName', si.variant_name_snapshot,
        'sku', si.sku_snapshot,
        'quantity', si.quantity,
        'assignedQuantity', coalesce((
          select sum(di.quantity)::integer
          from public.delivery_items di
          join public.deliveries d2 on d2.id = di.delivery_id
          where di.sale_item_id = si.id
            and di.delivery_id <> p_delivery_id
            and di.is_active = true
            and d2.state_code <> 'CANCELLED'
        ), 0),
        'remainingQuantity', greatest(si.quantity - coalesce((
          select sum(di.quantity)::integer
          from public.delivery_items di
          join public.deliveries d2 on d2.id = di.delivery_id
          where di.sale_item_id = si.id
            and di.delivery_id <> p_delivery_id
            and di.is_active = true
            and d2.state_code <> 'CANCELLED'
        ), 0), 0),
        'allocations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'warehouseName', w.name,
            'quantity', sia.quantity,
            'status', sia.allocation_status
          ) order by w.name, sia.created_at)
          from public.sale_item_allocations sia
          join public.warehouses w on w.id = sia.warehouse_id
          where sia.sale_item_id = si.id
            and sia.allocation_status in ('RESERVED', 'ACCUMULATED')
        ), '[]'::jsonb)
      ) order by si.created_at, si.id)
      from public.sale_items si
      where si.sale_id = s.id
        and si.item_status not in ('CANCELLED', 'RELEASED')
        and si.quantity > coalesce((
          select sum(di.quantity)::integer
          from public.delivery_items di
          join public.deliveries d2 on d2.id = di.delivery_id
          where di.sale_item_id = si.id
            and di.delivery_id <> p_delivery_id
            and di.is_active = true
            and d2.state_code <> 'CANCELLED'
        ), 0)
    ), '[]'::jsonb)
  ) into v_selected
  from public.sales s
  where s.id = v_delivery.sale_id;

  return jsonb_build_object(
    'operators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'code', bp.code,
        'name', coalesce(bp.trade_name, bp.legal_name),
        'types', coalesce((
          select jsonb_agg(bpt.partner_type_code order by bpt.partner_type_code)
          from public.business_partner_types bpt
          where bpt.partner_id = bp.id
            and bpt.partner_type_code in ('AGENCY', 'COURIER', 'LOCAL_OPERATOR')
        ), '[]'::jsonb)
      ) order by coalesce(bp.trade_name, bp.legal_name))
      from public.business_partners bp
      where bp.is_active = true
        and exists (
          select 1 from public.business_partner_types bpt
          where bpt.partner_id = bp.id
            and bpt.partner_type_code in ('AGENCY', 'COURIER')
        )
    ), '[]'::jsonb),
    'eligibleSales', '[]'::jsonb,
    'selectedSale', v_selected
  );
end;
$$;

create or replace function public.update_delivery_v1(
  p_delivery_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_delivery public.deliveries%rowtype;
  v_sale public.sales%rowtype;
  v_item jsonb;
  v_method text;
  v_next_state text;
  v_previous_state text;
  v_operator uuid;
  v_address uuid;
  v_sold integer;
  v_assigned_other integer;
  v_sale_item_id uuid;
  v_quantity integer;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_input) <> 'object' then
    raise exception 'La corrección debe enviarse como un objeto JSON.';
  end if;
  if length(btrim(coalesce(p_input ->> 'reason', ''))) < 3 then
    raise exception 'Indica el motivo de la corrección.';
  end if;
  if jsonb_typeof(p_input -> 'items') <> 'array' or jsonb_array_length(p_input -> 'items') = 0 then
    raise exception 'La entrega debe conservar al menos un producto.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_input -> 'items') x
    group by x.value ->> 'saleItemId'
    having count(*) > 1
  ) then
    raise exception 'Un producto no puede repetirse en la misma entrega.';
  end if;

  select * into v_delivery
  from public.deliveries
  where id = p_delivery_id
  for update;

  if not found then
    raise exception 'Entrega no encontrada.' using errcode = 'P0002';
  end if;
  if v_delivery.state_code not in ('PENDING_INSTRUCTIONS', 'ACCUMULATED', 'PENDING_AGENCY_DISPATCH') then
    raise exception 'La entrega ya fue despachada, entregada o cancelada y no puede editarse.' using errcode = 'P0001';
  end if;
  if v_delivery.version <> (p_input ->> 'version')::bigint then
    raise exception 'La entrega fue modificada por otra administradora. Recarga la página antes de guardar.' using errcode = '40001';
  end if;

  select * into v_sale
  from public.sales
  where id = v_delivery.sale_id
  for update;

  v_method := p_input ->> 'deliveryMethod';
  if v_method not in ('AGENCY', 'MOTORBIKE', 'IN_PERSON', 'WAREHOUSE_ACCUMULATION', 'OTHER') then
    raise exception 'Método de entrega inválido.';
  end if;
  v_operator := nullif(p_input ->> 'operatorPartnerId', '')::uuid;
  v_address := nullif(p_input ->> 'destinationAddressId', '')::uuid;

  if v_method = 'AGENCY' then
    if v_operator is null or not exists (
      select 1 from public.business_partner_types
      where partner_id = v_operator and partner_type_code = 'AGENCY'
    ) then raise exception 'Selecciona una agencia válida.'; end if;
  elsif v_method = 'MOTORBIKE' then
    if v_operator is null or not exists (
      select 1 from public.business_partner_types
      where partner_id = v_operator and partner_type_code = 'COURIER'
    ) then raise exception 'Selecciona un courier o motorizado válido.'; end if;
  else
    v_operator := null;
  end if;

  if v_address is not null and not exists (
    select 1 from public.client_addresses
    where id = v_address and client_id = v_sale.client_id and is_active = true
  ) then raise exception 'La dirección no pertenece al cliente de la venta.'; end if;

  perform 1
  from public.sale_items si
  where si.id in (
    select (x.value ->> 'saleItemId')::uuid from jsonb_array_elements(p_input -> 'items') x
    union
    select di.sale_item_id from public.delivery_items di
    where di.delivery_id = p_delivery_id and di.is_active = true
  )
  order by si.id
  for update;

  for v_item in select value from jsonb_array_elements(p_input -> 'items')
  loop
    v_sale_item_id := (v_item ->> 'saleItemId')::uuid;
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_quantity <= 0 then
      raise exception 'Cada producto debe tener una cantidad mayor que cero.';
    end if;

    select si.quantity into v_sold
    from public.sale_items si
    where si.id = v_sale_item_id
      and si.sale_id = v_sale.id
      and si.item_status not in ('CANCELLED', 'RELEASED');
    if not found then
      raise exception 'Un producto no pertenece a la venta o ya fue liberado.';
    end if;

    select coalesce(sum(di.quantity), 0)::integer into v_assigned_other
    from public.delivery_items di
    join public.deliveries d2 on d2.id = di.delivery_id
    where di.sale_item_id = v_sale_item_id
      and di.delivery_id <> p_delivery_id
      and di.is_active = true
      and d2.state_code <> 'CANCELLED';

    if v_assigned_other + v_quantity > v_sold then
      raise exception 'La cantidad total de entregas supera la cantidad vendida.' using errcode = 'P0001';
    end if;
  end loop;

  v_previous_state := v_delivery.state_code;
  v_next_state := case
    when v_method = 'AGENCY' then 'PENDING_AGENCY_DISPATCH'
    when v_method = 'WAREHOUSE_ACCUMULATION' then 'ACCUMULATED'
    else 'PENDING_INSTRUCTIONS'
  end;

  perform pg_catalog.set_config('app.audit_reason', btrim(p_input ->> 'reason'), true);
  update public.deliveries
  set state_code = v_next_state,
      delivery_method = v_method,
      operator_partner_id = v_operator,
      destination_address_id = v_address,
      tracking_number = nullif(btrim(p_input ->> 'trackingNumber'), ''),
      shipping_cost = coalesce((p_input ->> 'shippingCost')::numeric, 0),
      cost_payer = coalesce(nullif(p_input ->> 'costPayer', ''), 'CLIENT'),
      planned_dispatch_date = nullif(p_input ->> 'plannedDispatchDate', '')::date,
      notes = nullif(btrim(p_input ->> 'notes'), ''),
      updated_by = v_actor
  where id = p_delivery_id
  returning * into v_delivery;

  update public.delivery_items
  set is_active = false
  where delivery_id = p_delivery_id
    and is_active = true;

  for v_item in select value from jsonb_array_elements(p_input -> 'items')
  loop
    insert into public.delivery_items(delivery_id, sale_item_id, quantity, is_active)
    values (
      p_delivery_id,
      (v_item ->> 'saleItemId')::uuid,
      (v_item ->> 'quantity')::integer,
      true
    )
    on conflict (delivery_id, sale_item_id) do update
    set quantity = excluded.quantity,
        is_active = true;
  end loop;

  if v_previous_state is distinct from v_next_state then
    insert into public.delivery_state_history(
      delivery_id, previous_state_code, new_state_code, reason, changed_by,
      metadata
    ) values (
      p_delivery_id, v_previous_state, v_next_state,
      btrim(p_input ->> 'reason'), v_actor,
      jsonb_build_object('source', 'delivery_correction')
    );
  end if;

  if v_method = 'WAREHOUSE_ACCUMULATION' then
    perform private.ensure_sale_accumulated_inventory_v1(v_sale.id);
  end if;

  perform private.refresh_sale_delivery_state_v1(v_sale.id);
  perform public.refresh_sale_totals(v_sale.id);

  insert into public.outbox_events(event_type, aggregate_type, aggregate_id, payload, deduplication_key)
  values (
    'DELIVERY_CORRECTED', 'DELIVERY', p_delivery_id,
    jsonb_build_object(
      'delivery_id', p_delivery_id,
      'sale_id', v_sale.id,
      'reason', btrim(p_input ->> 'reason'),
      'state_code', v_delivery.state_code
    ),
    'delivery-corrected:' || p_delivery_id::text || ':' || v_delivery.version::text
  ) on conflict (deduplication_key) where deduplication_key is not null do nothing;

  return jsonb_build_object(
    'id', v_delivery.id,
    'code', v_delivery.code,
    'stateCode', v_delivery.state_code,
    'version', v_delivery.version
  );
end;
$$;

revoke all on function public.get_delivery_edit_support_v1(uuid) from public;
revoke all on function public.update_delivery_v1(uuid, jsonb) from public;
grant execute on function public.get_delivery_edit_support_v1(uuid) to authenticated;
grant execute on function public.update_delivery_v1(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;
