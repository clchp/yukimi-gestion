-- Yukimi Gestión
-- Migración 011: RPC atómico de productos, vista de catálogo y permisos

begin;

create or replace view public.v_product_catalog
with (security_invoker = true)
as
select
  p.id as product_id,
  p.code as product_code,
  p.name as product_name,
  p.character_name,
  p.description,
  p.has_variants,
  p.is_active as product_is_active,
  p.version as product_version,
  p.created_at,
  p.updated_at,
  pc.id as category_id,
  pc.code as category_code,
  pc.name as category_name,
  f.id as franchise_id,
  f.code as franchise_code,
  f.name as franchise_name,
  b.id as brand_id,
  b.code as brand_code,
  b.name as brand_name,
  pl.id as product_line_id,
  pl.code as product_line_code,
  pl.name as product_line_name,
  pv.id as variant_id,
  pv.sku,
  pv.variant_name,
  pv.sale_price,
  pv.currency_code,
  pv.minimum_stock,
  pv.barcode,
  pv.qr_payload,
  pv.is_active as variant_is_active,
  pv.version as variant_version,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'AVAILABLE'), 0)::integer as available_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'RESERVED'), 0)::integer as reserved_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'ACCUMULATED'), 0)::integer as accumulated_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'DAMAGED'), 0)::integer as damaged_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'LOST'), 0)::integer as lost_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'IN_TRANSIT'), 0)::integer as in_transit_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'PREORDER_EXPECTED'), 0)::integer as preorder_expected_quantity
from public.products p
join public.product_categories pc on pc.id = p.category_id
left join public.franchises f on f.id = p.franchise_id
left join public.brands b on b.id = p.brand_id
left join public.product_lines pl on pl.id = p.product_line_id
join public.product_variants pv on pv.product_id = p.id
left join public.inventory_balances ib on ib.variant_id = pv.id
left join public.warehouses w on w.id = ib.warehouse_id and w.is_active = true
group by
  p.id, pc.id, f.id, b.id, pl.id, pv.id;

create or replace function public.create_product_bundle(
  p_payload jsonb,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_product_id uuid;
  v_product_code text;
  v_product_line_brand_id uuid;
  v_variants jsonb;
  v_variant jsonb;
  v_variant_id uuid;
  v_variant_sku text;
  v_variant_result jsonb := '[]'::jsonb;
  v_attribute jsonb;
  v_attribute_type text;
  v_stock jsonb;
  v_lot_id uuid;
  v_lines jsonb := '[]'::jsonb;
  v_inventory_movement_id uuid;
  v_response jsonb;
  v_existing jsonb;
  v_existing_hash text;
  v_quantity integer;
  v_original_currency char(3);
  v_original_cost numeric(14,4);
  v_exchange_rate numeric(14,6);
  v_final_cost numeric(14,4);
  v_has_variants boolean;
  v_variant_count integer;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  v_actor := private.current_actor_id();

  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'El producto debe enviarse como un objeto JSON.';
  end if;

  if nullif(btrim(p_payload->>'name'), '') is null then
    raise exception 'El nombre del producto es obligatorio.';
  end if;

  if nullif(p_payload->>'category_id', '') is null then
    raise exception 'La categoría del producto es obligatoria.';
  end if;

  perform 1
  from public.product_categories
  where id = (p_payload->>'category_id')::uuid
    and is_active = true;
  if not found then
    raise exception 'La categoría seleccionada no existe o está inactiva.';
  end if;

  if nullif(p_payload->>'franchise_id', '') is not null then
    perform 1 from public.franchises
    where id = (p_payload->>'franchise_id')::uuid and is_active = true;
    if not found then
      raise exception 'La franquicia seleccionada no existe o está inactiva.';
    end if;
  end if;

  if nullif(p_payload->>'brand_id', '') is not null then
    perform 1 from public.brands
    where id = (p_payload->>'brand_id')::uuid and is_active = true;
    if not found then
      raise exception 'La marca seleccionada no existe o está inactiva.';
    end if;
  end if;

  if nullif(p_payload->>'product_line_id', '') is not null then
    select brand_id into v_product_line_brand_id
    from public.product_lines
    where id = (p_payload->>'product_line_id')::uuid and is_active = true;

    if not found then
      raise exception 'La línea seleccionada no existe o está inactiva.';
    end if;

    if v_product_line_brand_id is not null
      and v_product_line_brand_id is distinct from nullif(p_payload->>'brand_id', '')::uuid then
      raise exception 'La línea seleccionada no pertenece a la marca indicada.';
    end if;
  end if;

  v_variants := coalesce(p_payload->'variants', '[]'::jsonb);
  if jsonb_typeof(v_variants) <> 'array' or jsonb_array_length(v_variants) = 0 then
    raise exception 'Debe registrar al menos una variante, incluso para un producto estándar.';
  end if;

  v_variant_count := jsonb_array_length(v_variants);
  v_has_variants := v_variant_count > 1
    or lower(coalesce(v_variants->0->>'variant_name', 'estándar')) not in ('estándar', 'estandar', 'standard');

  if p_idempotency_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('CREATE_PRODUCT:' || p_idempotency_key, 0)
    );

    select response_payload, request_hash into v_existing, v_existing_hash
    from public.idempotency_keys
    where scope = 'CREATE_PRODUCT'
      and idempotency_key = p_idempotency_key
      and status = 'COMPLETED';

    if v_existing is not null then
      if v_existing_hash is distinct from pg_catalog.md5(p_payload::text) then
        raise exception 'La clave de idempotencia ya fue utilizada con otros datos.';
      end if;
      return v_existing;
    end if;

    insert into public.idempotency_keys(
      scope, idempotency_key, actor_user_id, request_hash, status, expires_at
    ) values (
      'CREATE_PRODUCT', p_idempotency_key, v_actor,
      pg_catalog.md5(p_payload::text), 'IN_PROGRESS', now() + interval '24 hours'
    )
    on conflict (scope, idempotency_key) do update set
      actor_user_id = excluded.actor_user_id,
      request_hash = excluded.request_hash,
      status = 'IN_PROGRESS',
      locked_at = now(),
      expires_at = excluded.expires_at;
  end if;

  v_product_code := public.next_business_code('PRODUCT');

  insert into public.products(
    code,
    name,
    franchise_id,
    character_name,
    category_id,
    brand_id,
    product_line_id,
    description,
    has_variants,
    is_active,
    created_by,
    updated_by
  ) values (
    v_product_code,
    btrim(p_payload->>'name'),
    nullif(p_payload->>'franchise_id', '')::uuid,
    nullif(btrim(p_payload->>'character_name'), ''),
    (p_payload->>'category_id')::uuid,
    nullif(p_payload->>'brand_id', '')::uuid,
    nullif(p_payload->>'product_line_id', '')::uuid,
    nullif(btrim(p_payload->>'description'), ''),
    v_has_variants,
    coalesce((p_payload->>'is_active')::boolean, true),
    v_actor,
    v_actor
  ) returning id into v_product_id;

  for v_variant in
    select value from jsonb_array_elements(v_variants)
  loop
    if coalesce((v_variant->>'sale_price')::numeric, 0) < 0 then
      raise exception 'El precio de venta no puede ser negativo.';
    end if;

    if coalesce((v_variant->>'minimum_stock')::integer, 0) < 0 then
      raise exception 'El stock mínimo no puede ser negativo.';
    end if;

    v_variant_sku := public.next_business_code('PRODUCT_VARIANT');

    insert into public.product_variants(
      product_id,
      sku,
      variant_name,
      barcode,
      qr_payload,
      sale_price,
      currency_code,
      minimum_stock,
      weight_grams,
      dimensions,
      is_active,
      created_by,
      updated_by
    ) values (
      v_product_id,
      v_variant_sku,
      coalesce(nullif(btrim(v_variant->>'variant_name'), ''), 'Estándar'),
      nullif(btrim(v_variant->>'barcode'), ''),
      coalesce(nullif(btrim(v_variant->>'qr_payload'), ''), v_variant_sku),
      coalesce((v_variant->>'sale_price')::numeric, 0),
      coalesce(nullif(v_variant->>'currency_code', ''), 'PEN')::char(3),
      coalesce((v_variant->>'minimum_stock')::integer, 0),
      nullif(v_variant->>'weight_grams', '')::numeric,
      coalesce(v_variant->'dimensions', '{}'::jsonb),
      coalesce((v_variant->>'is_active')::boolean, true),
      v_actor,
      v_actor
    ) returning id into v_variant_id;

    for v_attribute in
      select value from jsonb_array_elements(coalesce(v_variant->'attributes', '[]'::jsonb))
    loop
      select data_type into v_attribute_type
      from public.product_attribute_definitions
      where id = (v_attribute->>'attribute_id')::uuid
        and is_active = true;
      if not found then
        raise exception 'Se indicó un atributo inexistente o inactivo.';
      end if;

      if v_attribute_type in ('TEXT', 'COLOR') and nullif(v_attribute->>'value_text', '') is null then
        raise exception 'El atributo de texto o color requiere value_text.';
      elsif v_attribute_type = 'NUMBER' and nullif(v_attribute->>'value_number', '') is null then
        raise exception 'El atributo numérico requiere value_number.';
      elsif v_attribute_type = 'BOOLEAN' and nullif(v_attribute->>'value_boolean', '') is null then
        raise exception 'El atributo booleano requiere value_boolean.';
      elsif v_attribute_type = 'DATE' and nullif(v_attribute->>'value_date', '') is null then
        raise exception 'El atributo de fecha requiere value_date.';
      end if;

      insert into public.product_variant_attribute_values(
        variant_id,
        attribute_id,
        value_text,
        value_number,
        value_boolean,
        value_date
      ) values (
        v_variant_id,
        (v_attribute->>'attribute_id')::uuid,
        nullif(v_attribute->>'value_text', ''),
        nullif(v_attribute->>'value_number', '')::numeric,
        nullif(v_attribute->>'value_boolean', '')::boolean,
        nullif(v_attribute->>'value_date', '')::date
      );
    end loop;

    for v_stock in
      select value from jsonb_array_elements(coalesce(v_variant->'initial_stock', '[]'::jsonb))
    loop
      v_quantity := coalesce((v_stock->>'quantity')::integer, 0);
      if v_quantity < 0 then
        raise exception 'La cantidad inicial no puede ser negativa.';
      end if;

      if v_quantity = 0 then
        continue;
      end if;

      perform 1
      from public.warehouses
      where id = (v_stock->>'warehouse_id')::uuid
        and warehouse_type = 'OPERATIONAL'
        and is_active = true;
      if not found then
        raise exception 'El almacén del stock inicial no existe o no es operativo.';
      end if;

      v_original_currency := coalesce(nullif(v_stock->>'original_currency_code', ''), 'PEN')::char(3);
      v_original_cost := coalesce((v_stock->>'original_unit_cost')::numeric, 0);
      v_exchange_rate := coalesce((v_stock->>'exchange_rate_to_pen')::numeric, 1);

      if v_original_cost < 0 or v_exchange_rate <= 0 then
        raise exception 'El costo y el tipo de cambio del stock inicial no son válidos.';
      end if;

      v_final_cost := round(v_original_cost * v_exchange_rate, 4);

      insert into public.inventory_lots(
        lot_code,
        variant_id,
        source_type,
        source_id,
        status,
        original_currency_code,
        original_unit_cost,
        exchange_rate_to_pen,
        final_unit_cost_pen,
        expected_quantity,
        received_quantity,
        acquired_at,
        received_at,
        notes,
        created_by,
        updated_by
      ) values (
        public.next_business_code('INVENTORY_LOT'),
        v_variant_id,
        'INITIAL_STOCK',
        v_product_id,
        'ACTIVE',
        v_original_currency,
        v_original_cost,
        v_exchange_rate,
        v_final_cost,
        v_quantity,
        v_quantity,
        now(),
        now(),
        'Stock inicial registrado al crear el producto.',
        v_actor,
        v_actor
      ) returning id into v_lot_id;

      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'variant_id', v_variant_id,
        'lot_id', v_lot_id,
        'warehouse_id', (v_stock->>'warehouse_id')::uuid,
        'bucket_code', 'AVAILABLE',
        'quantity_delta', v_quantity,
        'unit_cost_pen', v_final_cost
      ));
    end loop;

    v_variant_result := v_variant_result || jsonb_build_array(jsonb_build_object(
      'id', v_variant_id,
      'sku', v_variant_sku,
      'variantName', coalesce(nullif(btrim(v_variant->>'variant_name'), ''), 'Estándar')
    ));
  end loop;

  if jsonb_array_length(v_lines) > 0 then
    v_inventory_movement_id := public.create_inventory_movement(
      'INITIAL_STOCK',
      'PRODUCT',
      v_product_id,
      'Carga inicial al crear el producto.',
      v_lines,
      case when p_idempotency_key is null then null else p_idempotency_key || ':inventory' end,
      null,
      jsonb_build_object('source', 'CREATE_PRODUCT_BUNDLE')
    );
  end if;

  v_response := jsonb_build_object(
    'productId', v_product_id,
    'productCode', v_product_code,
    'variants', v_variant_result,
    'inventoryMovementId', v_inventory_movement_id
  );

  if p_idempotency_key is not null then
    update public.idempotency_keys
    set status = 'COMPLETED',
        resource_type = 'PRODUCT',
        resource_id = v_product_id,
        response_payload = v_response,
        completed_at = now()
    where scope = 'CREATE_PRODUCT'
      and idempotency_key = p_idempotency_key;
  end if;

  return v_response;
end;
$$;

revoke execute on function public.create_product_bundle(jsonb, text) from public, anon;
grant execute on function public.create_product_bundle(jsonb, text) to authenticated, service_role;

grant select on public.v_product_catalog to authenticated, service_role;

commit;
