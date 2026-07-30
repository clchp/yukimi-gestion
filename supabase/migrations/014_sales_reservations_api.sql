-- Yukimi Gestión
-- Migración 014: ventas, reservas y asignación atómica de stock

begin;

create index if not exists ix_sale_items_sale_active
  on public.sale_items(sale_id, item_status);

create index if not exists ix_sale_allocations_sale_lookup
  on public.sale_item_allocations(sale_item_id, allocation_status, warehouse_id);

create index if not exists ix_release_requests_pending
  on public.release_requests(sale_id, state_code)
  where state_code in ('REQUESTED', 'APPROVED');

create or replace function public.get_sale_support_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_default_days integer;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select coalesce((setting_value #>> '{}')::integer, 14)
  into v_default_days
  from public.business_settings
  where setting_key = 'sales.default_payment_term_days';

  return jsonb_build_object(
    'salesChannels', coalesce((
      select jsonb_agg(jsonb_build_object('code', sc.code, 'name', sc.name) order by sc.sort_order, sc.name)
      from public.sales_channels sc
      where sc.is_active = true
    ), '[]'::jsonb),
    'discountTypes', coalesce((
      select jsonb_agg(jsonb_build_object('code', dt.code, 'name', dt.name) order by dt.name)
      from public.discount_types dt
      where dt.is_active = true
    ), '[]'::jsonb),
    'defaultPaymentTermDays', coalesce(v_default_days, 14)
  );
end;
$$;

create or replace function public.list_sales_v1(
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

  if p_filter not in ('ALL', 'RESERVED', 'UNPAID', 'OVERDUE', 'CANCELLED') then
    raise exception 'Filtro de ventas inválido.';
  end if;

  select count(*)::integer into v_total
  from public.v_sales_overview s
  where (
    nullif(btrim(p_search), '') is null
    or s.code ilike '%' || btrim(p_search) || '%'
    or s.client_name_snapshot ilike '%' || btrim(p_search) || '%'
    or coalesce(s.client_phone_snapshot, '') ilike '%' || btrim(p_search) || '%'
    or exists (
      select 1 from public.sale_items si
      where si.sale_id = s.id
        and (si.product_name_snapshot ilike '%' || btrim(p_search) || '%'
          or si.sku_snapshot ilike '%' || btrim(p_search) || '%')
    )
  )
  and case p_filter
    when 'RESERVED' then s.commercial_state_code = 'RESERVED'
    when 'UNPAID' then s.payment_state_code = 'UNPAID' and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
    when 'OVERDUE' then s.payment_state_code = 'OVERDUE' and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
    when 'CANCELLED' then s.commercial_state_code in ('CANCELLED', 'ANNULLED')
    else true
  end;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
  into v_items
  from (
    select
      s.created_at,
      jsonb_build_object(
        'id', s.id,
        'code', s.code,
        'clientId', s.client_id,
        'clientName', s.client_name_snapshot,
        'clientPhone', s.client_phone_snapshot,
        'saleTypeCode', s.sale_type_code,
        'salesChannelCode', s.sales_channel_code,
        'commercialStateCode', s.commercial_state_code,
        'paymentStateCode', s.payment_state_code,
        'deliveryStateCode', s.delivery_state_code,
        'currencyCode', s.currency_code,
        'totalAmount', s.total_amount,
        'paidTotal', s.paid_total,
        'balanceAmount', s.balance_amount,
        'itemLines', s.item_lines,
        'totalUnits', s.total_units,
        'dueAt', s.due_at,
        'createdAt', s.created_at,
        'createdByName', s.created_by_name,
        'version', s.version
      ) as row_json
    from public.v_sales_overview s
    where (
      nullif(btrim(p_search), '') is null
      or s.code ilike '%' || btrim(p_search) || '%'
      or s.client_name_snapshot ilike '%' || btrim(p_search) || '%'
      or coalesce(s.client_phone_snapshot, '') ilike '%' || btrim(p_search) || '%'
      or exists (
        select 1 from public.sale_items si
        where si.sale_id = s.id
          and (si.product_name_snapshot ilike '%' || btrim(p_search) || '%'
            or si.sku_snapshot ilike '%' || btrim(p_search) || '%')
      )
    )
    and case p_filter
      when 'RESERVED' then s.commercial_state_code = 'RESERVED'
      when 'UNPAID' then s.payment_state_code = 'UNPAID' and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
      when 'OVERDUE' then s.payment_state_code = 'OVERDUE' and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
      when 'CANCELLED' then s.commercial_state_code in ('CANCELLED', 'ANNULLED')
      else true
    end
    order by s.created_at desc
    limit p_page_size offset v_offset
  ) paged;

  select jsonb_build_object(
    'activeSales', count(*) filter (where commercial_state_code not in ('CANCELLED', 'ANNULLED'))::integer,
    'soldAmount', coalesce(sum(total_amount) filter (where commercial_state_code not in ('CANCELLED', 'ANNULLED')), 0),
    'pendingBalance', coalesce(sum(greatest(balance_amount, 0)) filter (where commercial_state_code not in ('CANCELLED', 'ANNULLED')), 0),
    'overdueSales', count(*) filter (where payment_state_code = 'OVERDUE' and commercial_state_code not in ('CANCELLED', 'ANNULLED'))::integer
  ) into v_summary
  from public.sales;

  return jsonb_build_object(
    'items', v_items,
    'summary', v_summary,
    'page', greatest(p_page, 1),
    'pageSize', p_page_size,
    'total', v_total
  );
end;
$$;

create or replace function public.get_sale_detail_v1(p_sale_id uuid)
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
    'id', s.id,
    'code', s.code,
    'clientId', s.client_id,
    'clientCode', c.code,
    'clientName', s.client_name_snapshot,
    'clientPhone', s.client_phone_snapshot,
    'clientIsVip', c.is_vip,
    'saleTypeCode', s.sale_type_code,
    'salesChannelCode', s.sales_channel_code,
    'commercialStateCode', s.commercial_state_code,
    'paymentStateCode', s.payment_state_code,
    'deliveryStateCode', s.delivery_state_code,
    'currencyCode', s.currency_code,
    'soldAt', s.sold_at,
    'reservedAt', s.reserved_at,
    'dueAt', s.due_at,
    'subtotal', s.subtotal,
    'discountTotal', s.discount_total,
    'penaltyTotal', s.penalty_total,
    'shippingChargeTotal', s.shipping_charge_total,
    'totalAmount', s.total_amount,
    'paidTotal', s.paid_total,
    'balanceAmount', s.balance_amount,
    'notes', s.notes,
    'cancellationReason', s.cancellation_reason,
    'createdByName', creator.display_name,
    'createdAt', s.created_at,
    'version', s.version,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', si.id,
        'variantId', si.variant_id,
        'productName', si.product_name_snapshot,
        'variantName', si.variant_name_snapshot,
        'sku', si.sku_snapshot,
        'categoryName', si.category_name_snapshot,
        'quantity', si.quantity,
        'originalUnitPrice', si.original_unit_price,
        'finalUnitPrice', si.final_unit_price,
        'lineSubtotal', si.line_subtotal,
        'lineDiscountTotal', si.line_discount_total,
        'lineTotal', si.line_total,
        'fulfillmentType', si.fulfillment_type,
        'itemStatus', si.item_status,
        'notes', si.notes,
        'allocations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', sia.id,
            'warehouseId', sia.warehouse_id,
            'warehouseName', w.name,
            'lotId', sia.lot_id,
            'lotCode', il.lot_code,
            'quantity', sia.quantity,
            'status', sia.allocation_status
          ) order by w.name, il.lot_code)
          from public.sale_item_allocations sia
          join public.warehouses w on w.id = sia.warehouse_id
          join public.inventory_lots il on il.id = sia.lot_id
          where sia.sale_item_id = si.id
        ), '[]'::jsonb)
      ) order by si.created_at, si.id)
      from public.sale_items si where si.sale_id = s.id
    ), '[]'::jsonb),
    'releaseRequests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rr.id,
        'stateCode', rr.state_code,
        'reason', rr.reason,
        'penaltyAmount', rr.penalty_amount,
        'requestedAt', rr.requested_at,
        'requestedById', rr.requested_by,
        'requestedByName', requester.display_name,
        'reviewedAt', rr.reviewed_at,
        'reviewedByName', reviewer.display_name,
        'reviewNotes', rr.review_notes
      ) order by rr.requested_at desc)
      from public.release_requests rr
      left join public.profiles requester on requester.id = rr.requested_by
      left join public.profiles reviewer on reviewer.id = rr.reviewed_by
      where rr.sale_id = s.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'dimension', h.state_dimension,
        'previousStateCode', h.previous_state_code,
        'newStateCode', h.new_state_code,
        'reason', h.reason,
        'changedByName', hp.display_name,
        'changedAt', h.changed_at
      ) order by h.changed_at desc)
      from public.sale_state_history h
      left join public.profiles hp on hp.id = h.changed_by
      where h.sale_id = s.id
    ), '[]'::jsonb)
  ) into v_result
  from public.sales s
  join public.clients c on c.id = s.client_id
  left join public.profiles creator on creator.id = s.created_by
  where s.id = p_sale_id;

  if v_result is null then
    raise exception 'Venta no encontrada.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

create or replace function public.create_sale_v1(
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_existing jsonb;
  v_existing_hash text;
  v_sale public.sales%rowtype;
  v_client public.clients%rowtype;
  v_item jsonb;
  v_item_row public.sale_items%rowtype;
  v_variant public.product_variants%rowtype;
  v_balance record;
  v_needed integer;
  v_take integer;
  v_movement_id uuid;
  v_due_at timestamptz;
  v_default_days integer;
  v_vip_days integer;
  v_vip_limit numeric(14,2);
  v_current_balance numeric(14,2);
  v_delivery_state text;
  v_discount numeric(14,2);
  v_response jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_input) <> 'object' then
    raise exception 'La venta debe enviarse como un objeto JSON.';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'La clave de idempotencia es obligatoria.';
  end if;
  if jsonb_typeof(p_input -> 'items') <> 'array' or jsonb_array_length(p_input -> 'items') = 0 then
    raise exception 'La venta debe contener al menos un producto.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('CREATE_SALE:' || p_idempotency_key, 0));
  select response_payload, request_hash into v_existing, v_existing_hash
  from public.idempotency_keys
  where scope = 'CREATE_SALE' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_existing is not null then
    if v_existing_hash is distinct from pg_catalog.md5(p_input::text) then
      raise exception 'La clave de idempotencia ya fue utilizada con otros datos.';
    end if;
    return v_existing;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id, request_hash, status, expires_at)
  values ('CREATE_SALE', p_idempotency_key, v_actor, pg_catalog.md5(p_input::text), 'IN_PROGRESS', now() + interval '24 hours')
  on conflict (scope, idempotency_key) do update set
    actor_user_id = excluded.actor_user_id,
    request_hash = excluded.request_hash,
    status = 'IN_PROGRESS',
    locked_at = now(),
    expires_at = excluded.expires_at;

  select * into v_client
  from public.clients
  where id = (p_input ->> 'clientId')::uuid and is_active = true
  for update;
  if not found then
    raise exception 'El cliente no existe o está inactivo.' using errcode = 'P0001';
  end if;

  perform 1 from public.sales_channels
  where code = p_input ->> 'salesChannelCode' and is_active = true;
  if not found then raise exception 'El canal de venta no existe o está inactivo.'; end if;

  select coalesce((setting_value #>> '{}')::integer, 14) into v_default_days
  from public.business_settings where setting_key = 'sales.default_payment_term_days';

  if v_client.is_vip then
    select payment_term_days, separation_limit_amount
    into v_vip_days, v_vip_limit
    from public.client_vip_profiles
    where client_id = v_client.id and (valid_until is null or valid_until > now());
  end if;

  v_due_at := nullif(p_input ->> 'dueAt', '')::timestamptz;
  if v_due_at is null then
    v_due_at := now() + make_interval(days => coalesce(v_vip_days, v_default_days, 14));
  elsif v_due_at < now() then
    raise exception 'La fecha de vencimiento no puede estar en el pasado.';
  end if;

  v_delivery_state := case when p_input ->> 'deliveryMode' = 'ACCUMULATED' then 'ACCUMULATED' else 'PENDING' end;
  perform set_config('app.audit_reason', 'Creación y reserva de venta', true);

  insert into public.sales(
    code, client_id, sale_type_code, sales_channel_code, currency_code,
    commercial_state_code, payment_state_code, delivery_state_code,
    sold_at, reserved_at, due_at, notes, created_by, updated_by
  ) values (
    null, v_client.id, 'REGULAR', p_input ->> 'salesChannelCode', coalesce(nullif(p_input ->> 'currencyCode', ''), 'PEN')::char(3),
    'DRAFT', 'UNPAID', 'PENDING',
    null, null, v_due_at, nullif(btrim(p_input ->> 'notes'), ''), v_actor, v_actor
  ) returning * into v_sale;

  insert into public.inventory_movements(
    code, movement_type_code, reference_type, reference_id, reason, idempotency_key, created_by, metadata
  ) values (
    public.next_business_code('INVENTORY_MOVEMENT'), 'RESERVATION', 'SALE', v_sale.id,
    'Reserva de stock al crear la venta', 'sale-reservation-v1:' || p_idempotency_key,
    v_actor, jsonb_build_object('source', 'create_sale_v1')
  ) returning id into v_movement_id;

  for v_item in select value from jsonb_array_elements(p_input -> 'items')
  loop
    select * into v_variant
    from public.product_variants
    where id = (v_item ->> 'variantId')::uuid and is_active = true;
    if not found then raise exception 'Una variante no existe o está inactiva.'; end if;

    perform 1 from public.products where id = v_variant.product_id and is_active = true;
    if not found then raise exception 'El producto de una variante está inactivo.'; end if;

    perform 1 from public.warehouses
    where id = (v_item ->> 'warehouseId')::uuid
      and warehouse_type = 'OPERATIONAL' and is_active = true;
    if not found then raise exception 'El almacén seleccionado no existe o no está operativo.'; end if;

    if (v_item ->> 'quantity')::integer <= 0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;
    if (v_item ->> 'originalUnitPrice')::numeric < 0 or (v_item ->> 'finalUnitPrice')::numeric < 0 then
      raise exception 'Los precios no pueden ser negativos.';
    end if;
    if (v_item ->> 'finalUnitPrice')::numeric > (v_item ->> 'originalUnitPrice')::numeric then
      raise exception 'El precio final no puede superar el precio original.';
    end if;
    if (v_item ->> 'finalUnitPrice')::numeric < (v_item ->> 'originalUnitPrice')::numeric
       and (nullif(v_item ->> 'discountTypeCode', '') is null or length(btrim(coalesce(v_item ->> 'discountReason', ''))) < 3) then
      raise exception 'Todo descuento requiere tipo y motivo.';
    end if;

    insert into public.sale_items(
      sale_id, variant_id, quantity, original_unit_price, final_unit_price,
      fulfillment_type, notes, created_by, updated_by
    ) values (
      v_sale.id, v_variant.id, (v_item ->> 'quantity')::integer,
      (v_item ->> 'originalUnitPrice')::numeric, (v_item ->> 'finalUnitPrice')::numeric,
      'STOCK', nullif(btrim(v_item ->> 'notes'), ''), v_actor, v_actor
    ) returning * into v_item_row;

    v_discount := round(v_item_row.quantity * (v_item_row.original_unit_price - v_item_row.final_unit_price), 2);
    if v_discount > 0 then
      perform 1 from public.discount_types
      where code = v_item ->> 'discountTypeCode' and is_active = true;
      if not found then raise exception 'El tipo de descuento no existe o está inactivo.'; end if;

      insert into public.sale_discounts(
        sale_id, sale_item_id, discount_type_code, amount, calculated_amount,
        reason, approved_by, created_by
      ) values (
        v_sale.id, v_item_row.id, v_item ->> 'discountTypeCode', v_discount, v_discount,
        btrim(v_item ->> 'discountReason'), v_actor, v_actor
      );
    end if;

    v_needed := v_item_row.quantity;
    for v_balance in
      select ib.lot_id, ib.quantity, il.lot_code
      from public.inventory_balances ib
      join public.inventory_lots il on il.id = ib.lot_id
      where ib.variant_id = v_variant.id
        and ib.warehouse_id = (v_item ->> 'warehouseId')::uuid
        and ib.bucket_code = 'AVAILABLE'
        and ib.quantity > 0
        and il.status = 'ACTIVE'
      order by coalesce(il.received_at, il.acquired_at, il.created_at), il.created_at, il.id
      for update of ib
    loop
      exit when v_needed <= 0;
      v_take := least(v_needed, v_balance.quantity);

      insert into public.sale_item_allocations(
        sale_item_id, lot_id, warehouse_id, quantity, allocation_status, created_by, updated_by
      ) values (
        v_item_row.id, v_balance.lot_id, (v_item ->> 'warehouseId')::uuid,
        v_take, 'RESERVED', v_actor, v_actor
      );

      insert into public.inventory_movement_lines(
        movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta
      ) values
        (v_movement_id, v_variant.id, v_balance.lot_id, (v_item ->> 'warehouseId')::uuid, 'AVAILABLE', -v_take),
        (v_movement_id, v_variant.id, v_balance.lot_id, (v_item ->> 'warehouseId')::uuid, 'RESERVED', v_take);

      v_needed := v_needed - v_take;
    end loop;

    if v_needed > 0 then
      raise exception 'Stock insuficiente para % en el almacén seleccionado. Faltan % unidades.', v_item_row.product_name_snapshot, v_needed
        using errcode = 'P0001';
    end if;
  end loop;

  update public.sales
  set commercial_state_code = 'RESERVED',
      delivery_state_code = v_delivery_state,
      sold_at = now(),
      reserved_at = now(),
      updated_by = v_actor
  where id = v_sale.id
  returning * into v_sale;

  perform public.refresh_sale_totals(v_sale.id);
  select * into v_sale from public.sales where id = v_sale.id;

  if v_client.is_vip and v_vip_limit is not null then
    select coalesce(sum(greatest(balance_amount, 0)), 0)
    into v_current_balance
    from public.sales
    where client_id = v_client.id
      and id <> v_sale.id
      and commercial_state_code not in ('CANCELLED', 'ANNULLED');

    if v_current_balance + greatest(v_sale.balance_amount, 0) > v_vip_limit then
      raise exception 'La reserva supera el límite VIP disponible del cliente.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.outbox_events(event_type, aggregate_type, aggregate_id, payload, deduplication_key)
  values (
    'SALE_CONFIRMED', 'SALE', v_sale.id,
    jsonb_build_object('sale_id', v_sale.id, 'inventory_movement_id', v_movement_id),
    'sale-created-v1:' || p_idempotency_key
  ) on conflict (deduplication_key) where deduplication_key is not null do nothing;

  v_response := jsonb_build_object('id', v_sale.id, 'code', v_sale.code, 'version', v_sale.version);
  update public.idempotency_keys
  set status = 'COMPLETED', resource_type = 'SALE', resource_id = v_sale.id,
      response_payload = v_response, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'CREATE_SALE' and idempotency_key = p_idempotency_key;
  return v_response;
exception
  when others then
    update public.idempotency_keys set status = 'FAILED', completed_at = now()
    where scope = 'CREATE_SALE' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

create or replace function public.request_sale_release_v1(
  p_sale_id uuid,
  p_reason text,
  p_penalty_amount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_sale public.sales%rowtype;
  v_request public.release_requests%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'El motivo debe tener al menos 5 caracteres.'; end if;
  if coalesce(p_penalty_amount, 0) < 0 then raise exception 'La penalidad no puede ser negativa.'; end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Venta no encontrada.' using errcode = 'P0002'; end if;
  if v_sale.commercial_state_code in ('CANCELLED', 'ANNULLED', 'COMPLETED') then
    raise exception 'La venta ya se encuentra cerrada.';
  end if;
  if exists(select 1 from public.release_requests where sale_id = p_sale_id and state_code in ('REQUESTED', 'APPROVED')) then
    raise exception 'Ya existe una solicitud de liberación pendiente para esta venta.';
  end if;

  perform set_config('app.audit_reason', btrim(p_reason), true);
  insert into public.release_requests(
    sale_id, reason, requested_by, penalty_amount, currency_code
  ) values (
    p_sale_id, btrim(p_reason), v_actor, coalesce(p_penalty_amount, 0), v_sale.currency_code
  ) returning * into v_request;

  return jsonb_build_object('id', v_request.id, 'stateCode', v_request.state_code, 'version', v_request.version);
end;
$$;

create or replace function public.review_sale_release_v1(
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
  v_allocation record;
  v_movement_id uuid;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if p_decision not in ('APPROVE', 'REJECT') then raise exception 'Decisión inválida.'; end if;
  if length(btrim(coalesce(p_review_notes, ''))) < 3 then raise exception 'Las notas de revisión son obligatorias.'; end if;

  select * into v_request from public.release_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada.' using errcode = 'P0002'; end if;
  if v_request.state_code <> 'REQUESTED' then raise exception 'La solicitud ya fue revisada.'; end if;
  if v_request.requested_by = v_actor then
    raise exception 'La solicitud debe ser revisada por otra administradora.' using errcode = 'P0001';
  end if;

  perform set_config('app.audit_reason', btrim(p_review_notes), true);
  if p_decision = 'REJECT' then
    update public.release_requests
    set state_code = 'REJECTED', reviewed_at = now(), reviewed_by = v_actor, review_notes = btrim(p_review_notes)
    where id = p_request_id returning * into v_request;
    return jsonb_build_object('id', v_request.id, 'stateCode', v_request.state_code, 'version', v_request.version);
  end if;

  select * into v_sale from public.sales where id = v_request.sale_id for update;
  if not found then raise exception 'Venta no encontrada.' using errcode = 'P0002'; end if;
  if v_sale.commercial_state_code in ('CANCELLED', 'ANNULLED', 'COMPLETED') then raise exception 'La venta ya está cerrada.'; end if;

  update public.release_requests
  set state_code = 'APPROVED', reviewed_at = now(), reviewed_by = v_actor, review_notes = btrim(p_review_notes)
  where id = p_request_id returning * into v_request;

  insert into public.inventory_movements(
    code, movement_type_code, reference_type, reference_id, reason, created_by, metadata
  ) values (
    public.next_business_code('INVENTORY_MOVEMENT'), 'RELEASE', 'RELEASE_REQUEST', v_request.id,
    v_request.reason, v_actor, jsonb_build_object('sale_id', v_sale.id)
  ) returning id into v_movement_id;

  for v_allocation in
    select sia.*, si.variant_id
    from public.sale_item_allocations sia
    join public.sale_items si on si.id = sia.sale_item_id
    where si.sale_id = v_sale.id and sia.allocation_status in ('RESERVED', 'ACCUMULATED')
    for update of sia
  loop
    insert into public.inventory_movement_lines(
      movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta
    ) values
      (v_movement_id, v_allocation.variant_id, v_allocation.lot_id, v_allocation.warehouse_id,
       case when v_allocation.allocation_status = 'ACCUMULATED' then 'ACCUMULATED' else 'RESERVED' end, -v_allocation.quantity),
      (v_movement_id, v_allocation.variant_id, v_allocation.lot_id, v_allocation.warehouse_id, 'AVAILABLE', v_allocation.quantity);

    update public.sale_item_allocations
    set allocation_status = 'RELEASED', released_at = now(), updated_by = v_actor
    where id = v_allocation.id;
  end loop;

  update public.sale_items set item_status = 'RELEASED', updated_by = v_actor
  where sale_id = v_sale.id and item_status in ('ACTIVE', 'PARTIALLY_RELEASED');

  update public.sales
  set commercial_state_code = 'CANCELLED', delivery_state_code = 'CANCELLED',
      cancelled_at = now(), cancellation_reason = v_request.reason, updated_by = v_actor
  where id = v_sale.id;

  perform public.refresh_sale_totals(v_sale.id);
  update public.release_requests
  set state_code = 'EXECUTED', inventory_movement_id = v_movement_id
  where id = p_request_id returning * into v_request;

  return jsonb_build_object('id', v_request.id, 'stateCode', v_request.state_code, 'version', v_request.version);
end;
$$;

revoke all on function public.get_sale_support_v1() from public;
revoke all on function public.list_sales_v1(text, text, integer, integer) from public;
revoke all on function public.get_sale_detail_v1(uuid) from public;
revoke all on function public.create_sale_v1(jsonb, text) from public;
revoke all on function public.request_sale_release_v1(uuid, text, numeric) from public;
revoke all on function public.review_sale_release_v1(uuid, text, text) from public;

grant execute on function public.get_sale_support_v1() to authenticated;
grant execute on function public.list_sales_v1(text, text, integer, integer) to authenticated;
grant execute on function public.get_sale_detail_v1(uuid) to authenticated;
grant execute on function public.create_sale_v1(jsonb, text) to authenticated;
grant execute on function public.request_sale_release_v1(uuid, text, numeric) to authenticated;
grant execute on function public.review_sale_release_v1(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;
