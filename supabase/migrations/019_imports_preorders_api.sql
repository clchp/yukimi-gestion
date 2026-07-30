-- Yukimi Gestión
-- Migración 019: importaciones, cajas, costos, recepción y preventas

begin;

create index if not exists ix_import_box_items_receive_lookup
  on public.import_box_items(import_box_id, received_quantity, expected_quantity);

create index if not exists ix_import_tracking_events_entity_date
  on public.import_tracking_events(import_shipment_id, import_box_id, event_at desc);

create index if not exists ix_preorder_allocations_sale_item_status
  on public.preorder_allocations(sale_item_id, status);

create or replace function public.get_import_support_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'suppliers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'code', bp.code,
        'name', coalesce(bp.trade_name, bp.legal_name),
        'types', coalesce((select jsonb_agg(bpt.partner_type_code order by bpt.partner_type_code) from public.business_partner_types bpt where bpt.partner_id = bp.id), '[]'::jsonb),
        'countryCode', bp.country_code
      ) order by coalesce(bp.trade_name, bp.legal_name))
      from public.business_partners bp
      where bp.is_active = true
        and exists (select 1 from public.business_partner_types bpt where bpt.partner_id = bp.id and bpt.partner_type_code = 'SUPPLIER')
    ), '[]'::jsonb),
    'internationalOperators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'code', bp.code,
        'name', coalesce(bp.trade_name, bp.legal_name),
        'types', coalesce((select jsonb_agg(bpt.partner_type_code order by bpt.partner_type_code) from public.business_partner_types bpt where bpt.partner_id = bp.id), '[]'::jsonb),
        'countryCode', bp.country_code
      ) order by coalesce(bp.trade_name, bp.legal_name))
      from public.business_partners bp
      where bp.is_active = true
        and exists (select 1 from public.business_partner_types bpt where bpt.partner_id = bp.id and bpt.partner_type_code = 'INTERNATIONAL_OPERATOR')
    ), '[]'::jsonb),
    'localOperators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'code', bp.code,
        'name', coalesce(bp.trade_name, bp.legal_name),
        'types', coalesce((select jsonb_agg(bpt.partner_type_code order by bpt.partner_type_code) from public.business_partner_types bpt where bpt.partner_id = bp.id), '[]'::jsonb),
        'countryCode', bp.country_code
      ) order by coalesce(bp.trade_name, bp.legal_name))
      from public.business_partners bp
      where bp.is_active = true
        and exists (select 1 from public.business_partner_types bpt where bpt.partner_id = bp.id and bpt.partner_type_code = 'LOCAL_OPERATOR')
    ), '[]'::jsonb),
    'currencies', coalesce((
      select jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name, 'symbol', c.symbol) order by c.code)
      from public.currencies c where c.is_active = true
    ), '[]'::jsonb),
    'warehouses', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'code', w.code, 'name', w.name) order by w.name)
      from public.warehouses w
      where w.is_active = true and w.warehouse_type = 'OPERATIONAL'
    ), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pv.id,
        'productId', p.id,
        'productCode', p.code,
        'productName', p.name,
        'variantName', pv.variant_name,
        'sku', pv.sku,
        'salePrice', pv.sale_price,
        'currencyCode', pv.currency_code
      ) order by p.name, pv.variant_name)
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where pv.is_active = true and p.is_active = true
    ), '[]'::jsonb),
    'activeClients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'code', c.code,
        'fullName', c.full_name,
        'phone', c.phone,
        'isVip', c.is_vip
      ) order by c.full_name)
      from public.clients c
      where c.is_active = true
    ), '[]'::jsonb),
    'salesChannels', coalesce((
      select jsonb_agg(jsonb_build_object('code', sc.code, 'name', sc.name) order by sc.sort_order, sc.name)
      from public.sales_channels sc where sc.is_active = true
    ), '[]'::jsonb),
    'discountTypes', coalesce((
      select jsonb_agg(jsonb_build_object('code', dt.code, 'name', dt.name) order by dt.name)
      from public.discount_types dt where dt.is_active = true
    ), '[]'::jsonb),
    'defaultPaymentTermDays', coalesce((
      select (bs.setting_value #>> '{}')::integer from public.business_settings bs where bs.setting_key = 'sales.default_payment_term_days'
    ), 14),
    'preorderCandidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'saleItemId', x.sale_item_id,
        'saleId', x.sale_id,
        'saleCode', x.sale_code,
        'clientName', x.client_name,
        'variantId', x.variant_id,
        'productName', x.product_name,
        'variantName', x.variant_name,
        'sku', x.sku,
        'quantity', x.quantity,
        'allocatedQuantity', x.allocated_quantity,
        'remainingQuantity', x.quantity - x.allocated_quantity
      ) order by x.sale_code, x.product_name)
      from (
        select
          si.id as sale_item_id,
          s.id as sale_id,
          s.code as sale_code,
          s.client_name_snapshot as client_name,
          si.variant_id,
          si.product_name_snapshot as product_name,
          si.variant_name_snapshot as variant_name,
          si.sku_snapshot as sku,
          si.quantity,
          coalesce(sum(pa.quantity) filter (where pa.status in ('ALLOCATED', 'RECEIVED')), 0)::integer as allocated_quantity
        from public.sale_items si
        join public.sales s on s.id = si.sale_id
        left join public.preorder_allocations pa on pa.sale_item_id = si.id
        where si.fulfillment_type = 'PREORDER'
          and si.item_status = 'ACTIVE'
          and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
        group by si.id, s.id
        having si.quantity > coalesce(sum(pa.quantity) filter (where pa.status in ('ALLOCATED', 'RECEIVED')), 0)
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_import_partner_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_partner public.business_partners%rowtype;
  v_type text := p_input ->> 'partnerTypeCode';
  v_code text;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if v_type not in ('SUPPLIER', 'INTERNATIONAL_OPERATOR', 'LOCAL_OPERATOR') then
    raise exception 'Tipo de socio comercial inválido.';
  end if;
  if nullif(btrim(p_input ->> 'legalName'), '') is null then
    raise exception 'El nombre legal es obligatorio.';
  end if;

  v_code := 'PART-' || upper(substr(regexp_replace(p_input ->> 'legalName', '[^A-Za-z0-9]+', '', 'g'), 1, 8)) || '-' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 6));
  perform pg_catalog.set_config('app.audit_reason', 'Creación de proveedor u operador de importación', true);

  insert into public.business_partners(
    code, legal_name, trade_name, contact_name, phone, email, country_code, notes,
    created_by, updated_by
  ) values (
    v_code,
    btrim(p_input ->> 'legalName'),
    nullif(btrim(p_input ->> 'tradeName'), ''),
    nullif(btrim(p_input ->> 'contactName'), ''),
    nullif(btrim(p_input ->> 'phone'), ''),
    nullif(btrim(p_input ->> 'email'), '')::extensions.citext,
    upper(nullif(btrim(p_input ->> 'countryCode'), ''))::char(2),
    nullif(btrim(p_input ->> 'notes'), ''),
    v_actor, v_actor
  ) returning * into v_partner;

  insert into public.business_partner_types(partner_id, partner_type_code)
  values (v_partner.id, v_type);

  return jsonb_build_object('id', v_partner.id, 'code', v_partner.code);
end;
$$;

create or replace function public.list_imports_v1(
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
  if p_filter not in ('ALL', 'ACTIVE', 'ARRIVING', 'DELAYED', 'STOCKED', 'CANCELLED') then
    raise exception 'Filtro de importaciones inválido.';
  end if;

  with base as (
    select
      ish.id,
      ish.code,
      coalesce(bp.trade_name, bp.legal_name) as supplier_name,
      ish.transport_mode,
      ish.state_code,
      ish.purchase_currency_code,
      ish.purchase_date,
      ish.estimated_arrival_date,
      ish.actual_arrival_at,
      ish.master_tracking_number,
      ish.created_at,
      creator.display_name as created_by_name,
      ish.version,
      count(distinct ib.id)::integer as box_count,
      coalesce(sum(ibi.expected_quantity), 0)::integer as total_expected_units,
      coalesce(sum(ibi.received_quantity), 0)::integer as total_received_units,
      coalesce((select sum(ic.amount_pen) from public.import_costs ic where ic.import_shipment_id = ish.id), 0)::numeric as total_cost_pen,
      coalesce((select count(*) from public.import_incidents ii where ii.import_shipment_id = ish.id and ii.status in ('OPEN', 'UNDER_REVIEW')), 0)::integer as open_incidents,
      (ish.estimated_arrival_date is not null and ish.estimated_arrival_date < current_date and ish.state_code not in ('RECEIVED_PERU', 'STOCKED', 'CANCELLED')) as is_delayed
    from public.import_shipments ish
    left join public.business_partners bp on bp.id = ish.supplier_partner_id
    left join public.profiles creator on creator.id = ish.created_by
    left join public.import_boxes ib on ib.import_shipment_id = ish.id
    left join public.import_box_items ibi on ibi.import_box_id = ib.id
    group by ish.id, bp.id, creator.id
  ), filtered as (
    select * from base b
    where (
      nullif(btrim(p_search), '') is null
      or b.code ilike '%' || btrim(p_search) || '%'
      or coalesce(b.supplier_name, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(b.master_tracking_number, '') ilike '%' || btrim(p_search) || '%'
      or exists (
        select 1 from public.import_boxes bx
        where bx.import_shipment_id = b.id
          and (bx.code ilike '%' || btrim(p_search) || '%' or coalesce(bx.tracking_number, '') ilike '%' || btrim(p_search) || '%')
      )
      or exists (
        select 1
        from public.import_boxes bx
        join public.import_box_items bi on bi.import_box_id = bx.id
        join public.product_variants pv on pv.id = bi.variant_id
        join public.products p on p.id = pv.product_id
        where bx.import_shipment_id = b.id
          and (p.name ilike '%' || btrim(p_search) || '%' or pv.sku ilike '%' || btrim(p_search) || '%')
      )
    )
    and case p_filter
      when 'ACTIVE' then b.state_code not in ('STOCKED', 'CANCELLED')
      when 'ARRIVING' then b.state_code not in ('STOCKED', 'CANCELLED') and b.estimated_arrival_date between current_date and current_date + 14
      when 'DELAYED' then b.is_delayed
      when 'STOCKED' then b.state_code = 'STOCKED'
      when 'CANCELLED' then b.state_code = 'CANCELLED'
      else true
    end
  )
  select count(*)::integer into v_total from filtered;

  with base as (
    select
      ish.id,
      ish.code,
      coalesce(bp.trade_name, bp.legal_name) as supplier_name,
      ish.transport_mode,
      ish.state_code,
      ish.purchase_currency_code,
      ish.purchase_date,
      ish.estimated_arrival_date,
      ish.actual_arrival_at,
      ish.master_tracking_number,
      ish.created_at,
      creator.display_name as created_by_name,
      ish.version,
      count(distinct ib.id)::integer as box_count,
      coalesce(sum(ibi.expected_quantity), 0)::integer as total_expected_units,
      coalesce(sum(ibi.received_quantity), 0)::integer as total_received_units,
      coalesce((select sum(ic.amount_pen) from public.import_costs ic where ic.import_shipment_id = ish.id), 0)::numeric as total_cost_pen,
      coalesce((select count(*) from public.import_incidents ii where ii.import_shipment_id = ish.id and ii.status in ('OPEN', 'UNDER_REVIEW')), 0)::integer as open_incidents,
      (ish.estimated_arrival_date is not null and ish.estimated_arrival_date < current_date and ish.state_code not in ('RECEIVED_PERU', 'STOCKED', 'CANCELLED')) as is_delayed
    from public.import_shipments ish
    left join public.business_partners bp on bp.id = ish.supplier_partner_id
    left join public.profiles creator on creator.id = ish.created_by
    left join public.import_boxes ib on ib.import_shipment_id = ish.id
    left join public.import_box_items ibi on ibi.import_box_id = ib.id
    group by ish.id, bp.id, creator.id
  ), filtered as (
    select * from base b
    where (
      nullif(btrim(p_search), '') is null
      or b.code ilike '%' || btrim(p_search) || '%'
      or coalesce(b.supplier_name, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(b.master_tracking_number, '') ilike '%' || btrim(p_search) || '%'
      or exists (select 1 from public.import_boxes bx where bx.import_shipment_id = b.id and (bx.code ilike '%' || btrim(p_search) || '%' or coalesce(bx.tracking_number, '') ilike '%' || btrim(p_search) || '%'))
      or exists (
        select 1 from public.import_boxes bx
        join public.import_box_items bi on bi.import_box_id = bx.id
        join public.product_variants pv on pv.id = bi.variant_id
        join public.products p on p.id = pv.product_id
        where bx.import_shipment_id = b.id and (p.name ilike '%' || btrim(p_search) || '%' or pv.sku ilike '%' || btrim(p_search) || '%')
      )
    )
    and case p_filter
      when 'ACTIVE' then b.state_code not in ('STOCKED', 'CANCELLED')
      when 'ARRIVING' then b.state_code not in ('STOCKED', 'CANCELLED') and b.estimated_arrival_date between current_date and current_date + 14
      when 'DELAYED' then b.is_delayed
      when 'STOCKED' then b.state_code = 'STOCKED'
      when 'CANCELLED' then b.state_code = 'CANCELLED'
      else true
    end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'code', f.code,
    'supplierName', f.supplier_name,
    'transportMode', f.transport_mode,
    'stateCode', f.state_code,
    'purchaseCurrencyCode', f.purchase_currency_code,
    'purchaseDate', f.purchase_date,
    'estimatedArrivalDate', f.estimated_arrival_date,
    'actualArrivalAt', f.actual_arrival_at,
    'masterTrackingNumber', f.master_tracking_number,
    'boxCount', f.box_count,
    'totalExpectedUnits', f.total_expected_units,
    'totalReceivedUnits', f.total_received_units,
    'totalCostPen', f.total_cost_pen,
    'openIncidents', f.open_incidents,
    'isDelayed', f.is_delayed,
    'createdAt', f.created_at,
    'createdByName', f.created_by_name,
    'version', f.version
  ) order by f.created_at desc), '[]'::jsonb)
  into v_items
  from (select * from filtered order by created_at desc limit p_page_size offset v_offset) f;

  select jsonb_build_object(
    'activeImports', count(*) filter (where state_code not in ('STOCKED', 'CANCELLED')),
    'boxesInTransit', (select count(*) from public.import_boxes where state_code in ('SHIPPED', 'IN_TRANSIT')),
    'expectedUnits', coalesce((
      select sum(ibi.expected_quantity - ibi.received_quantity)
      from public.import_box_items ibi
      join public.import_boxes ib on ib.id = ibi.import_box_id
      join public.import_shipments ish2 on ish2.id = ib.import_shipment_id
      where ish2.state_code not in ('STOCKED', 'CANCELLED') and ib.state_code <> 'CANCELLED'
    ), 0),
    'delayedImports', count(*) filter (where estimated_arrival_date < current_date and state_code not in ('RECEIVED_PERU', 'STOCKED', 'CANCELLED'))
  ) into v_summary
  from public.import_shipments;

  return jsonb_build_object('items', v_items, 'summary', v_summary, 'page', greatest(p_page, 1), 'pageSize', p_page_size, 'total', v_total);
end;
$$;

create or replace function public.create_import_v1(p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_existing jsonb;
  v_existing_hash text;
  v_import public.import_shipments%rowtype;
  v_box public.import_boxes%rowtype;
  v_box_json jsonb;
  v_item_json jsonb;
  v_response jsonb;
  v_supplier uuid := nullif(p_input ->> 'supplierPartnerId', '')::uuid;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if jsonb_typeof(p_input) <> 'object' then raise exception 'La importación debe enviarse como un objeto JSON.'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'La clave de idempotencia es obligatoria.'; end if;
  if jsonb_typeof(p_input -> 'boxes') <> 'array' or jsonb_array_length(p_input -> 'boxes') = 0 then raise exception 'Agrega al menos una caja.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('CREATE_IMPORT:' || p_idempotency_key, 0));
  select response_payload, request_hash into v_existing, v_existing_hash
  from public.idempotency_keys where scope = 'CREATE_IMPORT' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_existing is not null then
    if v_existing_hash is distinct from pg_catalog.md5(p_input::text) then raise exception 'La clave de idempotencia ya fue utilizada con otros datos.'; end if;
    return v_existing;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id, request_hash, status, expires_at)
  values ('CREATE_IMPORT', p_idempotency_key, v_actor, pg_catalog.md5(p_input::text), 'IN_PROGRESS', now() + interval '24 hours')
  on conflict (scope, idempotency_key) do update set actor_user_id = excluded.actor_user_id, request_hash = excluded.request_hash, status = 'IN_PROGRESS', locked_at = now(), expires_at = excluded.expires_at;

  if v_supplier is not null and not exists (
    select 1 from public.business_partners bp
    join public.business_partner_types bpt on bpt.partner_id = bp.id and bpt.partner_type_code = 'SUPPLIER'
    where bp.id = v_supplier and bp.is_active = true
  ) then raise exception 'Selecciona un proveedor activo.'; end if;

  if not exists (select 1 from public.currencies where code = (p_input ->> 'purchaseCurrencyCode')::char(3) and is_active = true) then
    raise exception 'La moneda de compra no es válida.';
  end if;
  if coalesce((p_input ->> 'sunatExchangeRate')::numeric, 0) <= 0 then raise exception 'El tipo de cambio debe ser mayor que cero.'; end if;

  perform pg_catalog.set_config('app.audit_reason', 'Creación de importación y cajas', true);
  insert into public.import_shipments(
    code, supplier_partner_id, state_code, transport_mode, purchase_currency_code,
    sunat_exchange_rate, purchase_date, estimated_arrival_date, master_tracking_number,
    notes, created_by, updated_by
  ) values (
    null, v_supplier, 'QUOTATION', p_input ->> 'transportMode', (p_input ->> 'purchaseCurrencyCode')::char(3),
    (p_input ->> 'sunatExchangeRate')::numeric, nullif(p_input ->> 'purchaseDate', '')::date,
    nullif(p_input ->> 'estimatedArrivalDate', '')::date, nullif(btrim(p_input ->> 'masterTrackingNumber'), ''),
    nullif(btrim(p_input ->> 'notes'), ''), v_actor, v_actor
  ) returning * into v_import;

  insert into public.import_status_history(import_shipment_id, previous_state_code, new_state_code, reason, changed_by)
  values (v_import.id, null, 'QUOTATION', 'Importación creada', v_actor);

  for v_box_json in select value from jsonb_array_elements(p_input -> 'boxes')
  loop
    if jsonb_typeof(v_box_json -> 'items') <> 'array' or jsonb_array_length(v_box_json -> 'items') = 0 then raise exception 'Cada caja debe tener al menos un producto.'; end if;

    insert into public.import_boxes(
      code, import_shipment_id, state_code, international_operator_id, local_operator_id,
      tracking_number, estimated_arrival_date, weight_grams, notes, created_by, updated_by
    ) values (
      null, v_import.id, 'REGISTERED', nullif(v_box_json ->> 'internationalOperatorId', '')::uuid,
      nullif(v_box_json ->> 'localOperatorId', '')::uuid, nullif(btrim(v_box_json ->> 'trackingNumber'), ''),
      nullif(v_box_json ->> 'estimatedArrivalDate', '')::date, nullif(v_box_json ->> 'weightGrams', '')::numeric,
      nullif(btrim(v_box_json ->> 'notes'), ''), v_actor, v_actor
    ) returning * into v_box;

    insert into public.import_status_history(import_box_id, previous_state_code, new_state_code, reason, changed_by)
    values (v_box.id, null, 'REGISTERED', 'Caja registrada', v_actor);

    for v_item_json in select value from jsonb_array_elements(v_box_json -> 'items')
    loop
      if coalesce((v_item_json ->> 'expectedQuantity')::integer, 0) <= 0 then raise exception 'La cantidad esperada debe ser mayor que cero.'; end if;
      if coalesce((v_item_json ->> 'originalUnitCost')::numeric, -1) < 0 then raise exception 'El costo unitario no puede ser negativo.'; end if;
      if coalesce((v_item_json ->> 'exchangeRateToPen')::numeric, 0) <= 0 then raise exception 'El tipo de cambio del producto debe ser mayor que cero.'; end if;
      if not exists (select 1 from public.product_variants pv join public.products p on p.id = pv.product_id where pv.id = (v_item_json ->> 'variantId')::uuid and pv.is_active and p.is_active) then raise exception 'Una variante no existe o está inactiva.'; end if;
      if not exists (select 1 from public.warehouses where id = (v_item_json ->> 'destinationWarehouseId')::uuid and is_active and warehouse_type = 'OPERATIONAL') then raise exception 'El almacén de destino no es válido.'; end if;

      insert into public.import_box_items(
        import_box_id, variant_id, destination_warehouse_id, expected_quantity,
        original_unit_cost, original_currency_code, exchange_rate_to_pen, notes,
        created_by, updated_by
      ) values (
        v_box.id, (v_item_json ->> 'variantId')::uuid, (v_item_json ->> 'destinationWarehouseId')::uuid,
        (v_item_json ->> 'expectedQuantity')::integer, (v_item_json ->> 'originalUnitCost')::numeric,
        (v_item_json ->> 'originalCurrencyCode')::char(3), (v_item_json ->> 'exchangeRateToPen')::numeric,
        nullif(btrim(v_item_json ->> 'notes'), ''), v_actor, v_actor
      );
    end loop;
  end loop;

  v_response := jsonb_build_object('id', v_import.id, 'code', v_import.code, 'stateCode', v_import.state_code, 'version', v_import.version);
  update public.idempotency_keys
  set status = 'COMPLETED', resource_type = 'IMPORT', resource_id = v_import.id, response_payload = v_response, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'CREATE_IMPORT' and idempotency_key = p_idempotency_key;
  return v_response;
exception
  when others then
    update public.idempotency_keys set status = 'FAILED', completed_at = now() where scope = 'CREATE_IMPORT' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

create or replace function public.get_import_detail_v1(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;

  select jsonb_build_object(
    'id', ish.id,
    'code', ish.code,
    'supplierPartnerId', ish.supplier_partner_id,
    'supplierName', coalesce(bp.trade_name, bp.legal_name),
    'stateCode', ish.state_code,
    'transportMode', ish.transport_mode,
    'purchaseCurrencyCode', ish.purchase_currency_code,
    'sunatExchangeRate', ish.sunat_exchange_rate,
    'purchaseDate', ish.purchase_date,
    'estimatedArrivalDate', ish.estimated_arrival_date,
    'actualArrivalAt', ish.actual_arrival_at,
    'stockEntryCompletedAt', ish.stock_entry_completed_at,
    'masterTrackingNumber', ish.master_tracking_number,
    'notes', ish.notes,
    'createdAt', ish.created_at,
    'createdByName', creator.display_name,
    'version', ish.version,
    'totals', jsonb_build_object(
      'expectedUnits', coalesce((select sum(ibi.expected_quantity) from public.import_box_items ibi join public.import_boxes ib on ib.id = ibi.import_box_id where ib.import_shipment_id = ish.id and ib.state_code <> 'CANCELLED'), 0),
      'receivedUnits', coalesce((select sum(ibi.received_quantity) from public.import_box_items ibi join public.import_boxes ib on ib.id = ibi.import_box_id where ib.import_shipment_id = ish.id and ib.state_code <> 'CANCELLED'), 0),
      'purchaseValuePen', coalesce((select sum(ibi.expected_quantity * ibi.original_unit_cost * ibi.exchange_rate_to_pen) from public.import_box_items ibi join public.import_boxes ib on ib.id = ibi.import_box_id where ib.import_shipment_id = ish.id and ib.state_code <> 'CANCELLED'), 0),
      'extraCostsPen', coalesce((select sum(ic.amount_pen) from public.import_costs ic where ic.import_shipment_id = ish.id), 0),
      'allocatedPreorders', coalesce((select sum(pa.quantity) from public.preorder_allocations pa join public.import_box_items ibi on ibi.id = pa.import_box_item_id join public.import_boxes ib on ib.id = ibi.import_box_id where ib.import_shipment_id = ish.id and pa.status in ('ALLOCATED', 'RECEIVED')), 0)
    ),
    'boxes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ib.id,
        'code', ib.code,
        'stateCode', ib.state_code,
        'internationalOperatorId', ib.international_operator_id,
        'internationalOperatorName', coalesce(iop.trade_name, iop.legal_name),
        'localOperatorId', ib.local_operator_id,
        'localOperatorName', coalesce(lop.trade_name, lop.legal_name),
        'trackingNumber', ib.tracking_number,
        'estimatedArrivalDate', ib.estimated_arrival_date,
        'actualArrivalAt', ib.actual_arrival_at,
        'weightGrams', ib.weight_grams,
        'notes', ib.notes,
        'version', ib.version,
        'canReceive', ib.state_code = 'RECEIVED_PERU' and exists (select 1 from public.import_box_items r where r.import_box_id = ib.id and r.received_quantity < r.expected_quantity),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ibi.id,
            'variantId', ibi.variant_id,
            'productName', p.name,
            'variantName', pv.variant_name,
            'sku', pv.sku,
            'destinationWarehouseId', ibi.destination_warehouse_id,
            'destinationWarehouseName', w.name,
            'expectedQuantity', ibi.expected_quantity,
            'receivedQuantity', ibi.received_quantity,
            'missingQuantity', ibi.missing_quantity,
            'originalUnitCost', ibi.original_unit_cost,
            'originalCurrencyCode', ibi.original_currency_code,
            'exchangeRateToPen', ibi.exchange_rate_to_pen,
            'finalUnitCostPen', ibi.final_unit_cost_pen,
            'preorderAllocatedQuantity', coalesce((select sum(pa.quantity) from public.preorder_allocations pa where pa.import_box_item_id = ibi.id and pa.status in ('ALLOCATED', 'RECEIVED')), 0),
            'inventoryLotId', ibi.inventory_lot_id,
            'notes', ibi.notes
          ) order by p.name, pv.variant_name)
          from public.import_box_items ibi
          join public.product_variants pv on pv.id = ibi.variant_id
          join public.products p on p.id = pv.product_id
          left join public.warehouses w on w.id = ibi.destination_warehouse_id
          where ibi.import_box_id = ib.id
        ), '[]'::jsonb),
        'allowedTransitions', coalesce((
          select jsonb_agg(jsonb_build_object('stateCode', wt.to_state_code, 'name', ws.label, 'requiresReason', wt.requires_reason) order by ws.sort_order)
          from public.workflow_transitions wt
          join public.workflow_states ws on ws.workflow_code = wt.workflow_code and ws.state_code = wt.to_state_code
          where wt.workflow_code = 'IMPORT_BOX' and wt.from_state_code = ib.state_code and wt.is_active = true
        ), '[]'::jsonb)
      ) order by ib.created_at, ib.code)
      from public.import_boxes ib
      left join public.business_partners iop on iop.id = ib.international_operator_id
      left join public.business_partners lop on lop.id = ib.local_operator_id
      where ib.import_shipment_id = ish.id
    ), '[]'::jsonb),
    'costs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ic.id,
        'importBoxId', ic.import_box_id,
        'boxCode', ib.code,
        'costType', ic.cost_type,
        'description', ic.description,
        'amount', ic.amount,
        'currencyCode', ic.currency_code,
        'exchangeRateToPen', ic.exchange_rate_to_pen,
        'amountPen', ic.amount_pen,
        'allocationMethod', ic.allocation_method,
        'isIncludedInUnitCost', ic.is_included_in_unit_cost,
        'occurredAt', ic.occurred_at
      ) order by ic.occurred_at desc)
      from public.import_costs ic
      left join public.import_boxes ib on ib.id = ic.import_box_id
      where ic.import_shipment_id = ish.id
    ), '[]'::jsonb),
    'incidents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ii.id,
        'importBoxId', ii.import_box_id,
        'boxCode', ib.code,
        'importBoxItemId', ii.import_box_item_id,
        'itemLabel', case when p.id is null then null else p.name || ' · ' || pv.variant_name end,
        'incidentType', ii.incident_type,
        'affectedQuantity', ii.affected_quantity,
        'description', ii.description,
        'status', ii.status,
        'occurredAt', ii.occurred_at,
        'resolvedAt', ii.resolved_at,
        'resolutionNotes', ii.resolution_notes,
        'insuranceClaims', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', icl.id,
            'claimNumber', icl.claim_number,
            'claimedAmount', icl.claimed_amount,
            'approvedAmount', icl.approved_amount,
            'currencyCode', icl.currency_code,
            'status', icl.status,
            'submittedAt', icl.submitted_at,
            'resolvedAt', icl.resolved_at,
            'notes', icl.notes
          ) order by icl.created_at desc)
          from public.insurance_claims icl
          where icl.import_incident_id = ii.id
        ), '[]'::jsonb)
      ) order by ii.occurred_at desc)
      from public.import_incidents ii
      left join public.import_boxes ib on ib.id = ii.import_box_id
      left join public.import_box_items ibi on ibi.id = ii.import_box_item_id
      left join public.product_variants pv on pv.id = ibi.variant_id
      left join public.products p on p.id = pv.product_id
      where ii.import_shipment_id = ish.id
    ), '[]'::jsonb),
    'preorderAllocations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pa.id,
        'saleItemId', pa.sale_item_id,
        'saleId', s.id,
        'saleCode', s.code,
        'clientName', s.client_name_snapshot,
        'importBoxItemId', pa.import_box_item_id,
        'itemLabel', p.name || ' · ' || pv.variant_name,
        'quantity', pa.quantity,
        'status', pa.status,
        'allocatedAt', pa.allocated_at
      ) order by pa.allocated_at desc)
      from public.preorder_allocations pa
      join public.sale_items si on si.id = pa.sale_item_id
      join public.sales s on s.id = si.sale_id
      join public.import_box_items ibi on ibi.id = pa.import_box_item_id
      join public.import_boxes ib on ib.id = ibi.import_box_id
      join public.product_variants pv on pv.id = ibi.variant_id
      join public.products p on p.id = pv.product_id
      where ib.import_shipment_id = ish.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(h.row_json order by h.changed_at desc)
      from (
        select ih.changed_at, jsonb_build_object(
          'id', ih.id,
          'entityType', case when ih.import_shipment_id is not null then 'SHIPMENT' else 'BOX' end,
          'entityCode', coalesce(hs.code, hb.code),
          'previousStateCode', ih.previous_state_code,
          'newStateCode', ih.new_state_code,
          'reason', ih.reason,
          'changedByName', hp.display_name,
          'changedAt', ih.changed_at
        ) as row_json
        from public.import_status_history ih
        left join public.import_shipments hs on hs.id = ih.import_shipment_id
        left join public.import_boxes hb on hb.id = ih.import_box_id
        left join public.profiles hp on hp.id = ih.changed_by
        where ih.import_shipment_id = ish.id or ih.import_box_id in (select id from public.import_boxes where import_shipment_id = ish.id)
      ) h
    ), '[]'::jsonb),
    'allowedTransitions', coalesce((
      select jsonb_agg(jsonb_build_object('stateCode', wt.to_state_code, 'name', ws.label, 'requiresReason', wt.requires_reason) order by ws.sort_order)
      from public.workflow_transitions wt
      join public.workflow_states ws on ws.workflow_code = wt.workflow_code and ws.state_code = wt.to_state_code
      where wt.workflow_code = 'IMPORT' and wt.from_state_code = ish.state_code and wt.is_active = true
    ), '[]'::jsonb)
  ) into v_result
  from public.import_shipments ish
  left join public.business_partners bp on bp.id = ish.supplier_partner_id
  left join public.profiles creator on creator.id = ish.created_by
  where ish.id = p_import_id;

  if v_result is null then raise exception 'Importación no encontrada.' using errcode = 'P0002'; end if;
  return v_result;
end;
$$;

create or replace function public.advance_import_v1(
  p_import_id uuid,
  p_next_state_code text,
  p_reason text,
  p_occurred_at timestamptz default null,
  p_master_tracking_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.import_shipments%rowtype;
  v_when timestamptz := coalesce(p_occurred_at, now());
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Indica el motivo o detalle del cambio.'; end if;
  select * into v_import from public.import_shipments where id = p_import_id for update;
  if not found then raise exception 'Importación no encontrada.' using errcode = 'P0002'; end if;

  perform pg_catalog.set_config('app.audit_reason', btrim(p_reason), true);
  update public.import_shipments
  set state_code = p_next_state_code,
      purchase_date = case when p_next_state_code = 'PURCHASE_CONFIRMED' then coalesce(purchase_date, v_when::date) else purchase_date end,
      foreign_warehouse_arrival_at = case when p_next_state_code = 'FOREIGN_WAREHOUSE' then v_when else foreign_warehouse_arrival_at end,
      dispatch_confirmation_at = case when p_next_state_code = 'DISPATCH_CONFIRMED' then v_when else dispatch_confirmation_at end,
      shipped_at = case when p_next_state_code in ('SHIPPED', 'IN_TRANSIT') then coalesce(shipped_at, v_when) else shipped_at end,
      actual_arrival_at = case when p_next_state_code = 'RECEIVED_PERU' then v_when else actual_arrival_at end,
      stock_entry_completed_at = case when p_next_state_code = 'STOCKED' then v_when else stock_entry_completed_at end,
      master_tracking_number = coalesce(nullif(btrim(p_master_tracking_number), ''), master_tracking_number),
      updated_by = private.current_actor_id()
  where id = p_import_id
  returning * into v_import;

  insert into public.import_tracking_events(import_shipment_id, event_at, description, source, external_status, created_by)
  values (v_import.id, v_when, btrim(p_reason), 'YUKIMI', p_next_state_code, private.current_actor_id());

  return jsonb_build_object('id', v_import.id, 'code', v_import.code, 'stateCode', v_import.state_code, 'version', v_import.version);
end;
$$;

create or replace function public.advance_import_box_v1(
  p_box_id uuid,
  p_next_state_code text,
  p_reason text,
  p_occurred_at timestamptz default null,
  p_tracking_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_box public.import_boxes%rowtype;
  v_when timestamptz := coalesce(p_occurred_at, now());
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Indica el motivo o detalle del cambio.'; end if;
  select * into v_box from public.import_boxes where id = p_box_id for update;
  if not found then raise exception 'Caja no encontrada.' using errcode = 'P0002'; end if;

  perform pg_catalog.set_config('app.audit_reason', btrim(p_reason), true);
  update public.import_boxes
  set state_code = p_next_state_code,
      actual_arrival_at = case when p_next_state_code = 'RECEIVED_PERU' then v_when else actual_arrival_at end,
      tracking_number = coalesce(nullif(btrim(p_tracking_number), ''), tracking_number),
      updated_by = private.current_actor_id()
  where id = p_box_id
  returning * into v_box;

  insert into public.import_tracking_events(import_box_id, event_at, description, source, external_status, created_by)
  values (v_box.id, v_when, btrim(p_reason), 'YUKIMI', p_next_state_code, private.current_actor_id());

  return jsonb_build_object('id', v_box.id, 'code', v_box.code, 'stateCode', v_box.state_code, 'version', v_box.version);
end;
$$;

create or replace function public.add_import_cost_v1(p_import_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost public.import_costs%rowtype;
  v_box_id uuid := nullif(p_input ->> 'importBoxId', '')::uuid;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if not exists (select 1 from public.import_shipments where id = p_import_id and state_code <> 'CANCELLED') then raise exception 'La importación no existe o está cancelada.'; end if;
  if v_box_id is not null and not exists (select 1 from public.import_boxes where id = v_box_id and import_shipment_id = p_import_id) then raise exception 'La caja no pertenece a la importación.'; end if;
  if coalesce((p_input ->> 'amount')::numeric, -1) < 0 then raise exception 'El importe no puede ser negativo.'; end if;
  if coalesce((p_input ->> 'exchangeRateToPen')::numeric, 0) <= 0 then raise exception 'El tipo de cambio debe ser mayor que cero.'; end if;

  perform pg_catalog.set_config('app.audit_reason', 'Registro de costo de importación', true);
  insert into public.import_costs(
    import_shipment_id, import_box_id, cost_type, description, amount, currency_code,
    exchange_rate_to_pen, allocation_method, is_included_in_unit_cost, occurred_at, created_by
  ) values (
    p_import_id, v_box_id, p_input ->> 'costType', nullif(btrim(p_input ->> 'description'), ''),
    (p_input ->> 'amount')::numeric, (p_input ->> 'currencyCode')::char(3),
    (p_input ->> 'exchangeRateToPen')::numeric, p_input ->> 'allocationMethod',
    coalesce((p_input ->> 'isIncludedInUnitCost')::boolean, false),
    coalesce(nullif(p_input ->> 'occurredAt', '')::timestamptz, now()), private.current_actor_id()
  ) returning * into v_cost;
  return jsonb_build_object('id', v_cost.id, 'code', null);
end;
$$;

create or replace function public.create_import_incident_v1(p_import_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident public.import_incidents%rowtype;
  v_box_id uuid := nullif(p_input ->> 'importBoxId', '')::uuid;
  v_item_id uuid := nullif(p_input ->> 'importBoxItemId', '')::uuid;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if not exists (select 1 from public.import_shipments where id = p_import_id) then raise exception 'Importación no encontrada.'; end if;
  if v_box_id is not null and not exists (select 1 from public.import_boxes where id = v_box_id and import_shipment_id = p_import_id) then raise exception 'La caja no pertenece a la importación.'; end if;
  if v_item_id is not null and not exists (select 1 from public.import_box_items ibi join public.import_boxes ib on ib.id = ibi.import_box_id where ibi.id = v_item_id and ib.import_shipment_id = p_import_id) then raise exception 'El producto no pertenece a la importación.'; end if;

  perform pg_catalog.set_config('app.audit_reason', 'Registro de incidencia de importación', true);
  insert into public.import_incidents(
    import_shipment_id, import_box_id, import_box_item_id, incident_type, affected_quantity,
    description, occurred_at, created_by, updated_by
  ) values (
    p_import_id, v_box_id, v_item_id, p_input ->> 'incidentType', nullif(p_input ->> 'affectedQuantity', '')::integer,
    btrim(p_input ->> 'description'), coalesce(nullif(p_input ->> 'occurredAt', '')::timestamptz, now()),
    private.current_actor_id(), private.current_actor_id()
  ) returning * into v_incident;
  return jsonb_build_object('id', v_incident.id, 'code', null);
end;
$$;


create or replace function public.create_insurance_claim_v1(p_import_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_incident public.import_incidents%rowtype;
  v_claim public.insurance_claims%rowtype;
  v_status text := coalesce(nullif(p_input ->> 'status', ''), 'SUBMITTED');
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;

  select * into v_incident
  from public.import_incidents
  where id = (p_input ->> 'importIncidentId')::uuid
    and import_shipment_id = p_import_id
  for update;
  if not found then raise exception 'La incidencia no pertenece a esta importación.'; end if;
  if v_incident.incident_type not in ('MISSING', 'DAMAGED') then
    raise exception 'El seguro solo puede asociarse a faltantes o productos dañados.';
  end if;
  if v_status not in ('PENDING', 'SUBMITTED') then raise exception 'Estado inicial del reclamo inválido.'; end if;
  if coalesce((p_input ->> 'claimedAmount')::numeric, -1) < 0 then raise exception 'El importe reclamado no puede ser negativo.'; end if;
  if not exists (select 1 from public.currencies where code = (p_input ->> 'currencyCode')::char(3) and is_active = true) then
    raise exception 'La moneda del reclamo no es válida.';
  end if;
  if exists (
    select 1 from public.insurance_claims
    where import_incident_id = v_incident.id and status not in ('REJECTED', 'CLOSED')
  ) then raise exception 'La incidencia ya tiene un reclamo de seguro activo.'; end if;

  perform pg_catalog.set_config('app.audit_reason', 'Registro de reclamo al seguro', true);
  insert into public.insurance_claims(
    import_incident_id, claim_number, claimed_amount, currency_code, status,
    submitted_at, notes, created_by, updated_by
  ) values (
    v_incident.id, nullif(btrim(p_input ->> 'claimNumber'), ''),
    (p_input ->> 'claimedAmount')::numeric, (p_input ->> 'currencyCode')::char(3), v_status,
    case when v_status = 'SUBMITTED' then coalesce(nullif(p_input ->> 'submittedAt', '')::timestamptz, now()) else null end,
    nullif(btrim(p_input ->> 'notes'), ''), v_actor, v_actor
  ) returning * into v_claim;

  update public.import_incidents
  set status = 'UNDER_REVIEW', updated_by = v_actor
  where id = v_incident.id;

  return jsonb_build_object('id', v_claim.id, 'code', v_claim.claim_number);
end;
$$;

create or replace function public.update_insurance_claim_v1(p_claim_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_claim public.insurance_claims%rowtype;
  v_status text := p_input ->> 'status';
  v_approved numeric(14,2) := nullif(p_input ->> 'approvedAmount', '')::numeric;
  v_notes text := btrim(p_input ->> 'resolutionNotes');
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if v_status not in ('PENDING', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'CLOSED') then
    raise exception 'Estado del reclamo inválido.';
  end if;
  if nullif(v_notes, '') is null then raise exception 'Indica el detalle de la actualización.'; end if;

  select * into v_claim from public.insurance_claims where id = p_claim_id for update;
  if not found then raise exception 'Reclamo de seguro no encontrado.' using errcode = 'P0002'; end if;
  if v_approved is not null and (v_approved < 0 or (v_claim.claimed_amount is not null and v_approved > v_claim.claimed_amount)) then
    raise exception 'El importe aprobado no puede superar el importe reclamado.';
  end if;

  perform pg_catalog.set_config('app.audit_reason', v_notes, true);
  update public.insurance_claims
  set status = v_status,
      approved_amount = coalesce(v_approved, approved_amount),
      submitted_at = case when v_status = 'SUBMITTED' then coalesce(submitted_at, now()) else submitted_at end,
      resolved_at = case when v_status in ('APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'CLOSED') then now() else null end,
      notes = case when notes is null then v_notes else notes || E'\n' || v_notes end,
      updated_by = v_actor
  where id = p_claim_id
  returning * into v_claim;

  update public.import_incidents
  set status = case
        when v_status in ('APPROVED', 'PARTIALLY_APPROVED', 'PAID', 'CLOSED') then 'COVERED'
        when v_status = 'REJECTED' then 'REJECTED'
        else 'UNDER_REVIEW'
      end,
      resolved_at = case when v_status in ('APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'CLOSED') then now() else null end,
      resolution_notes = v_notes,
      updated_by = v_actor
  where id = v_claim.import_incident_id;

  return jsonb_build_object('id', v_claim.id, 'code', v_claim.claim_number);
end;
$$;


create or replace function public.create_preorder_sale_v1(p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_existing jsonb;
  v_existing_hash text;
  v_import_item public.import_box_items%rowtype;
  v_sale public.sales%rowtype;
  v_sale_item public.sale_items%rowtype;
  v_client public.clients%rowtype;
  v_quantity integer := coalesce((p_input ->> 'quantity')::integer, 0);
  v_allocated integer;
  v_default_days integer;
  v_vip_days integer;
  v_due_at timestamptz;
  v_original_price numeric(14,2) := coalesce((p_input ->> 'originalUnitPrice')::numeric, -1);
  v_final_price numeric(14,2) := coalesce((p_input ->> 'finalUnitPrice')::numeric, -1);
  v_discount numeric(14,2);
  v_response jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if jsonb_typeof(p_input) <> 'object' then raise exception 'La preventa debe enviarse como un objeto JSON.'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'La clave de idempotencia es obligatoria.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('CREATE_PREORDER_SALE:' || p_idempotency_key, 0));
  select response_payload, request_hash into v_existing, v_existing_hash
  from public.idempotency_keys
  where scope = 'CREATE_PREORDER_SALE' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_existing is not null then
    if v_existing_hash is distinct from pg_catalog.md5(p_input::text) then raise exception 'La clave de idempotencia ya fue utilizada con otros datos.'; end if;
    return v_existing;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id, request_hash, status, expires_at)
  values ('CREATE_PREORDER_SALE', p_idempotency_key, v_actor, pg_catalog.md5(p_input::text), 'IN_PROGRESS', now() + interval '24 hours')
  on conflict (scope, idempotency_key) do update set
    actor_user_id = excluded.actor_user_id,
    request_hash = excluded.request_hash,
    status = 'IN_PROGRESS',
    locked_at = now(),
    expires_at = excluded.expires_at;

  select * into v_client from public.clients where id = (p_input ->> 'clientId')::uuid and is_active = true for update;
  if not found then raise exception 'El cliente no existe o está inactivo.' using errcode = 'P0001'; end if;

  select ibi.* into v_import_item
  from public.import_box_items ibi
  join public.import_boxes ib on ib.id = ibi.import_box_id
  join public.import_shipments ish on ish.id = ib.import_shipment_id
  where ibi.id = (p_input ->> 'importBoxItemId')::uuid
    and ib.state_code <> 'CANCELLED'
    and ish.state_code not in ('CANCELLED', 'STOCKED')
  for update of ibi;
  if not found then raise exception 'El producto importado no existe o ya no admite preventas.' using errcode = 'P0001'; end if;

  if v_quantity <= 0 then raise exception 'La cantidad de preventa debe ser mayor que cero.'; end if;
  select coalesce(sum(pa.quantity), 0)::integer into v_allocated
  from public.preorder_allocations pa
  where pa.import_box_item_id = v_import_item.id and pa.status in ('ALLOCATED', 'RECEIVED');
  if v_allocated + v_quantity > v_import_item.expected_quantity then raise exception 'La cantidad supera las unidades disponibles para preventa.'; end if;

  if v_original_price < 0 or v_final_price < 0 or v_final_price > v_original_price then raise exception 'Revisa los precios de la preventa.'; end if;
  if not exists (select 1 from public.sales_channels where code = p_input ->> 'salesChannelCode' and is_active = true) then raise exception 'El canal de venta no es válido.'; end if;
  if v_final_price < v_original_price then
    if nullif(btrim(p_input ->> 'discountTypeCode'), '') is null or nullif(btrim(p_input ->> 'discountReason'), '') is null then
      raise exception 'Todo descuento requiere tipo y motivo.';
    end if;
    if not exists (select 1 from public.discount_types where code = p_input ->> 'discountTypeCode' and is_active = true) then raise exception 'El tipo de descuento no es válido.'; end if;
  end if;

  select coalesce((setting_value #>> '{}')::integer, 14) into v_default_days
  from public.business_settings where setting_key = 'sales.default_payment_term_days';
  if v_client.is_vip then
    select payment_term_days into v_vip_days
    from public.client_vip_profiles
    where client_id = v_client.id and (valid_until is null or valid_until > now());
  end if;
  v_due_at := nullif(p_input ->> 'dueAt', '')::timestamptz;
  if v_due_at is null then v_due_at := now() + make_interval(days => coalesce(v_vip_days, v_default_days, 14)); end if;
  if v_due_at < now() then raise exception 'La fecha de vencimiento no puede estar en el pasado.'; end if;

  perform pg_catalog.set_config('app.audit_reason', 'Creación de preventa vinculada a importación', true);
  insert into public.sales(
    code, client_id, sale_type_code, sales_channel_code, currency_code,
    commercial_state_code, payment_state_code, delivery_state_code,
    due_at, notes, created_by, updated_by
  ) values (
    null, v_client.id, 'PREORDER', p_input ->> 'salesChannelCode', 'PEN',
    'DRAFT', 'UNPAID', case when p_input ->> 'deliveryMode' = 'ACCUMULATED' then 'ACCUMULATED' else 'PENDING' end,
    v_due_at, nullif(btrim(p_input ->> 'notes'), ''), v_actor, v_actor
  ) returning * into v_sale;

  insert into public.sale_items(
    sale_id, variant_id, quantity, original_unit_price, final_unit_price,
    currency_code, fulfillment_type, item_status, notes, created_by, updated_by
  ) values (
    v_sale.id, v_import_item.variant_id, v_quantity, v_original_price, v_final_price,
    'PEN', 'PREORDER', 'ACTIVE', nullif(btrim(p_input ->> 'notes'), ''), v_actor, v_actor
  ) returning * into v_sale_item;

  if v_final_price < v_original_price then
    v_discount := round(v_quantity * (v_original_price - v_final_price), 2);
    insert into public.sale_discounts(
      sale_id, sale_item_id, discount_type_code, description, amount,
      calculated_amount, reason, approved_by, created_by
    ) values (
      v_sale.id, v_sale_item.id, p_input ->> 'discountTypeCode', 'Descuento de preventa', v_discount,
      v_discount, btrim(p_input ->> 'discountReason'), v_actor, v_actor
    );
  end if;

  insert into public.preorder_allocations(
    sale_item_id, import_box_item_id, quantity, status, created_by, updated_by
  ) values (
    v_sale_item.id, v_import_item.id, v_quantity, 'ALLOCATED', v_actor, v_actor
  );

  perform public.refresh_sale_totals(v_sale.id);
  update public.sales
  set commercial_state_code = 'RESERVED', reserved_at = now(), sold_at = now(), updated_by = v_actor
  where id = v_sale.id
  returning * into v_sale;

  v_response := jsonb_build_object('id', v_sale.id, 'code', v_sale.code, 'version', v_sale.version);
  update public.idempotency_keys
  set status = 'COMPLETED', resource_type = 'SALE', resource_id = v_sale.id,
      response_payload = v_response, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'CREATE_PREORDER_SALE' and idempotency_key = p_idempotency_key;
  return v_response;
exception
  when others then
    update public.idempotency_keys set status = 'FAILED', completed_at = now()
    where scope = 'CREATE_PREORDER_SALE' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

create or replace function public.allocate_preorder_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allocation public.preorder_allocations%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  perform pg_catalog.set_config('app.audit_reason', 'Asignación de preventa a importación', true);
  insert into public.preorder_allocations(sale_item_id, import_box_item_id, quantity, created_by, updated_by)
  values ((p_input ->> 'saleItemId')::uuid, (p_input ->> 'importBoxItemId')::uuid, (p_input ->> 'quantity')::integer, private.current_actor_id(), private.current_actor_id())
  returning * into v_allocation;
  return jsonb_build_object('id', v_allocation.id, 'code', null);
end;
$$;

create or replace function public.receive_import_box_v1(p_box_id uuid, p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_box public.import_boxes%rowtype;
  v_import public.import_shipments%rowtype;
  v_item_input jsonb;
  v_item public.import_box_items%rowtype;
  v_lot public.inventory_lots%rowtype;
  v_received integer;
  v_final_cost numeric(14,4);
  v_allocated integer;
  v_available integer;
  v_preorder record;
  v_target_bucket text;
  v_lines jsonb := '[]'::jsonb;
  v_movement_id uuid;
  v_response jsonb;
  v_existing jsonb;
  v_existing_hash text;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if jsonb_typeof(p_input -> 'items') <> 'array' or jsonb_array_length(p_input -> 'items') = 0 then raise exception 'Registra las cantidades recibidas.'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'La clave de idempotencia es obligatoria.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('RECEIVE_IMPORT_BOX:' || p_idempotency_key, 0));
  select response_payload, request_hash into v_existing, v_existing_hash
  from public.idempotency_keys where scope = 'RECEIVE_IMPORT_BOX' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_existing is not null then
    if v_existing_hash is distinct from pg_catalog.md5((p_box_id::text || p_input::text)) then raise exception 'La clave de idempotencia ya fue utilizada con otros datos.'; end if;
    return v_existing;
  end if;
  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id, request_hash, status, expires_at)
  values ('RECEIVE_IMPORT_BOX', p_idempotency_key, v_actor, pg_catalog.md5((p_box_id::text || p_input::text)), 'IN_PROGRESS', now() + interval '24 hours')
  on conflict (scope, idempotency_key) do update set actor_user_id = excluded.actor_user_id, request_hash = excluded.request_hash, status = 'IN_PROGRESS', locked_at = now(), expires_at = excluded.expires_at;

  select * into v_box from public.import_boxes where id = p_box_id for update;
  if not found then raise exception 'Caja no encontrada.' using errcode = 'P0002'; end if;
  if v_box.state_code <> 'RECEIVED_PERU' then raise exception 'La caja debe estar marcada como recibida en Perú antes de ingresar stock.'; end if;
  select * into v_import from public.import_shipments where id = v_box.import_shipment_id for update;
  if v_import.state_code <> 'RECEIVED_PERU' then
    raise exception 'La importación general debe estar marcada como recibida en Perú antes de ingresar una caja a stock.';
  end if;

  perform 1 from public.import_box_items where import_box_id = p_box_id order by id for update;
  perform pg_catalog.set_config('app.audit_reason', btrim(p_input ->> 'reason'), true);

  for v_item_input in select value from jsonb_array_elements(p_input -> 'items')
  loop
    select * into v_item from public.import_box_items where id = (v_item_input ->> 'importBoxItemId')::uuid and import_box_id = p_box_id for update;
    if not found then raise exception 'Un producto no pertenece a la caja.'; end if;
    if v_item.inventory_lot_id is not null then raise exception 'Una línea de la caja ya fue ingresada a stock.'; end if;

    v_received := coalesce((v_item_input ->> 'receivedQuantity')::integer, 0);
    v_final_cost := coalesce((v_item_input ->> 'finalUnitCostPen')::numeric, v_item.original_unit_cost * v_item.exchange_rate_to_pen);
    if v_received < 0 or v_received > v_item.expected_quantity then raise exception 'La cantidad recibida no puede superar la esperada.'; end if;

    select coalesce(sum(pa.quantity), 0)::integer into v_allocated
    from public.preorder_allocations pa where pa.import_box_item_id = v_item.id and pa.status = 'ALLOCATED';
    if v_allocated > v_received then raise exception 'La cantidad recibida es menor que las preventas asignadas para %.', v_item.id; end if;

    insert into public.inventory_lots(
      lot_code, variant_id, source_type, source_id, status, original_currency_code,
      original_unit_cost, exchange_rate_to_pen, final_unit_cost_pen, expected_quantity,
      received_quantity, acquired_at, received_at, notes, created_by, updated_by
    ) values (
      'LOT-' || v_box.code || '-' || upper(substr(replace(v_item.id::text, '-', ''), 1, 6)),
      v_item.variant_id, 'IMPORT', v_item.id, 'ACTIVE', v_item.original_currency_code,
      v_item.original_unit_cost, v_item.exchange_rate_to_pen, v_final_cost, v_item.expected_quantity,
      v_received, v_import.purchase_date::timestamptz, coalesce(nullif(p_input ->> 'occurredAt', '')::timestamptz, now()),
      nullif(btrim(v_item_input ->> 'notes'), ''), v_actor, v_actor
    ) returning * into v_lot;

    update public.import_box_items
    set received_quantity = v_received, final_unit_cost_pen = v_final_cost, inventory_lot_id = v_lot.id,
        notes = coalesce(nullif(btrim(v_item_input ->> 'notes'), ''), notes), updated_by = v_actor
    where id = v_item.id;

    v_available := v_received - v_allocated;
    if v_available > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'variant_id', v_item.variant_id, 'lot_id', v_lot.id, 'warehouse_id', v_item.destination_warehouse_id,
        'bucket_code', 'AVAILABLE', 'quantity_delta', v_available, 'unit_cost_pen', v_final_cost
      ));
    end if;
    if v_allocated > 0 then
      for v_preorder in
        select
          pa.id as preorder_allocation_id,
          pa.sale_item_id,
          pa.quantity,
          case when s.delivery_state_code = 'ACCUMULATED' then 'ACCUMULATED' else 'RESERVED' end as target_bucket
        from public.preorder_allocations pa
        join public.sale_items si on si.id = pa.sale_item_id
        join public.sales s on s.id = si.sale_id
        where pa.import_box_item_id = v_item.id
          and pa.status = 'ALLOCATED'
        order by pa.created_at, pa.id
      loop
        v_target_bucket := v_preorder.target_bucket;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'variant_id', v_item.variant_id,
          'lot_id', v_lot.id,
          'warehouse_id', v_item.destination_warehouse_id,
          'bucket_code', v_target_bucket,
          'quantity_delta', v_preorder.quantity,
          'unit_cost_pen', v_final_cost
        ));

        insert into public.sale_item_allocations(
          sale_item_id, lot_id, warehouse_id, quantity, allocation_status, created_by, updated_by
        ) values (
          v_preorder.sale_item_id, v_lot.id, v_item.destination_warehouse_id,
          v_preorder.quantity, v_target_bucket, v_actor, v_actor
        );

        update public.preorder_allocations
        set status = 'RECEIVED', updated_by = v_actor
        where id = v_preorder.preorder_allocation_id;
      end loop;
    end if;

    if v_received < v_item.expected_quantity then
      insert into public.import_incidents(
        import_shipment_id, import_box_id, import_box_item_id, incident_type, affected_quantity,
        description, status, occurred_at, created_by, updated_by
      ) values (
        v_import.id, v_box.id, v_item.id, 'MISSING', v_item.expected_quantity - v_received,
        'Faltante detectado durante la recepción de la caja ' || v_box.code, 'OPEN',
        coalesce(nullif(p_input ->> 'occurredAt', '')::timestamptz, now()), v_actor, v_actor
      );
    end if;
  end loop;

  if jsonb_array_length(v_lines) > 0 then
    v_movement_id := public.create_inventory_movement(
      'IMPORT_RECEIPT', 'IMPORT_BOX', v_box.id, btrim(p_input ->> 'reason'), v_lines,
      'import-receipt-v1:' || p_idempotency_key, 'Ingreso de caja importada ' || v_box.code,
      jsonb_build_object('import_id', v_import.id, 'box_id', v_box.id)
    );
  end if;

  update public.import_boxes
  set state_code = 'STOCKED', actual_arrival_at = coalesce(actual_arrival_at, coalesce(nullif(p_input ->> 'occurredAt', '')::timestamptz, now())), updated_by = v_actor
  where id = v_box.id returning * into v_box;

  if not exists (select 1 from public.import_boxes where import_shipment_id = v_import.id and state_code not in ('STOCKED', 'CANCELLED')) then
    update public.import_shipments
    set state_code = 'STOCKED', stock_entry_completed_at = coalesce(nullif(p_input ->> 'occurredAt', '')::timestamptz, now()), updated_by = v_actor
    where id = v_import.id;
  end if;

  v_response := jsonb_build_object('id', v_box.id, 'code', v_box.code, 'stateCode', v_box.state_code, 'version', v_box.version);
  update public.idempotency_keys
  set status = 'COMPLETED', resource_type = 'IMPORT_BOX', resource_id = v_box.id, response_payload = v_response, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'RECEIVE_IMPORT_BOX' and idempotency_key = p_idempotency_key;
  return v_response;
exception
  when others then
    update public.idempotency_keys set status = 'FAILED', completed_at = now() where scope = 'RECEIVE_IMPORT_BOX' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

revoke execute on function public.get_import_support_v1() from public, anon;
revoke execute on function public.create_import_partner_v1(jsonb) from public, anon;
revoke execute on function public.list_imports_v1(text, text, integer, integer) from public, anon;
revoke execute on function public.create_import_v1(jsonb, text) from public, anon;
revoke execute on function public.get_import_detail_v1(uuid) from public, anon;
revoke execute on function public.advance_import_v1(uuid, text, text, timestamptz, text) from public, anon;
revoke execute on function public.advance_import_box_v1(uuid, text, text, timestamptz, text) from public, anon;
revoke execute on function public.add_import_cost_v1(uuid, jsonb) from public, anon;
revoke execute on function public.create_import_incident_v1(uuid, jsonb) from public, anon;
revoke execute on function public.create_insurance_claim_v1(uuid, jsonb) from public, anon;
revoke execute on function public.update_insurance_claim_v1(uuid, jsonb) from public, anon;
revoke execute on function public.create_preorder_sale_v1(jsonb, text) from public, anon;
revoke execute on function public.allocate_preorder_v1(jsonb) from public, anon;
revoke execute on function public.receive_import_box_v1(uuid, jsonb, text) from public, anon;

grant execute on function public.get_import_support_v1() to authenticated, service_role;
grant execute on function public.create_import_partner_v1(jsonb) to authenticated, service_role;
grant execute on function public.list_imports_v1(text, text, integer, integer) to authenticated, service_role;
grant execute on function public.create_import_v1(jsonb, text) to authenticated, service_role;
grant execute on function public.get_import_detail_v1(uuid) to authenticated, service_role;
grant execute on function public.advance_import_v1(uuid, text, text, timestamptz, text) to authenticated, service_role;
grant execute on function public.advance_import_box_v1(uuid, text, text, timestamptz, text) to authenticated, service_role;
grant execute on function public.add_import_cost_v1(uuid, jsonb) to authenticated, service_role;
grant execute on function public.create_import_incident_v1(uuid, jsonb) to authenticated, service_role;
grant execute on function public.create_insurance_claim_v1(uuid, jsonb) to authenticated, service_role;
grant execute on function public.update_insurance_claim_v1(uuid, jsonb) to authenticated, service_role;
grant execute on function public.create_preorder_sale_v1(jsonb, text) to authenticated, service_role;
grant execute on function public.allocate_preorder_v1(jsonb) to authenticated, service_role;
grant execute on function public.receive_import_box_v1(uuid, jsonb, text) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';
