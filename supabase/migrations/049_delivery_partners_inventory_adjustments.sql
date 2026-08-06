-- Yukimi Gestión
-- Migración 049: operadores de entrega, atributos editables y ajustes positivos de inventario

begin;

-- =========================================================
-- Agencias y couriers/motorizados administrables
-- =========================================================

create or replace function public.list_delivery_partners_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(
        jsonb_build_object(
          'id', bp.id,
          'code', bp.code,
          'name', coalesce(nullif(bp.trade_name, ''), bp.legal_name),
          'legalName', bp.legal_name,
          'tradeName', bp.trade_name,
          'partnerTypeCode', types.partner_type_code,
          'contactName', bp.contact_name,
          'phone', bp.phone,
          'email', bp.email,
          'notes', bp.notes,
          'isActive', bp.is_active,
          'version', bp.version
        ) order by bp.is_active desc, coalesce(nullif(bp.trade_name, ''), bp.legal_name), bp.id
      )
      from public.business_partners bp
      join lateral (
        select min(bpt.partner_type_code) as partner_type_code
        from public.business_partner_types bpt
        where bpt.partner_id = bp.id
          and bpt.partner_type_code in ('AGENCY', 'COURIER')
      ) types on types.partner_type_code is not null
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.upsert_delivery_partner_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_id uuid := nullif(p_input ->> 'id', '')::uuid;
  v_type text := p_input ->> 'partnerTypeCode';
  v_legal_name text := nullif(btrim(p_input ->> 'legalName'), '');
  v_trade_name text := nullif(btrim(p_input ->> 'tradeName'), '');
  v_reason text := nullif(btrim(p_input ->> 'reason'), '');
  v_partner public.business_partners%rowtype;
  v_normalized text;
  v_code text;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if v_type not in ('AGENCY', 'COURIER') then
    raise exception 'Selecciona Agencia o Courier/motorizado.';
  end if;
  if v_legal_name is null or length(v_legal_name) < 2 then
    raise exception 'El nombre debe tener al menos 2 caracteres.';
  end if;
  if v_reason is null or length(v_reason) < 5 then
    raise exception 'El motivo debe tener al menos 5 caracteres.';
  end if;

  perform pg_catalog.set_config('app.audit_reason', v_reason, true);
  v_normalized := private.normalize_business_partner_name(coalesce(v_trade_name, v_legal_name));

  if v_id is null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('DELIVERY_PARTNER:' || v_normalized, 0)
    );

    select bp.* into v_partner
    from public.business_partners bp
    where private.normalize_business_partner_name(coalesce(bp.trade_name, bp.legal_name)) = v_normalized
       or private.normalize_business_partner_name(bp.legal_name) = v_normalized
    order by bp.is_active desc, bp.created_at, bp.id
    limit 1
    for update;

    if found then
      update public.business_partners
      set legal_name = v_legal_name,
          trade_name = v_trade_name,
          contact_name = nullif(btrim(p_input ->> 'contactName'), ''),
          phone = nullif(btrim(p_input ->> 'phone'), ''),
          email = nullif(btrim(p_input ->> 'email'), '')::extensions.citext,
          notes = nullif(btrim(p_input ->> 'notes'), ''),
          is_active = coalesce((p_input ->> 'isActive')::boolean, true),
          updated_by = v_actor,
          updated_at = now(),
          version = version + 1
      where id = v_partner.id
      returning * into v_partner;
    else
      v_code := 'PART-' || pg_catalog.upper(
        pg_catalog.substr(pg_catalog.regexp_replace(v_legal_name, '[^A-Za-z0-9]+', '', 'g'), 1, 8)
      ) || '-' || pg_catalog.upper(
        pg_catalog.substr(pg_catalog.replace(extensions.gen_random_uuid()::text, '-', ''), 1, 6)
      );

      insert into public.business_partners(
        code, legal_name, trade_name, contact_name, phone, email, notes,
        is_active, created_by, updated_by
      ) values (
        v_code,
        v_legal_name,
        v_trade_name,
        nullif(btrim(p_input ->> 'contactName'), ''),
        nullif(btrim(p_input ->> 'phone'), ''),
        nullif(btrim(p_input ->> 'email'), '')::extensions.citext,
        nullif(btrim(p_input ->> 'notes'), ''),
        coalesce((p_input ->> 'isActive')::boolean, true),
        v_actor,
        v_actor
      ) returning * into v_partner;
    end if;
  else
    update public.business_partners
    set legal_name = v_legal_name,
        trade_name = v_trade_name,
        contact_name = nullif(btrim(p_input ->> 'contactName'), ''),
        phone = nullif(btrim(p_input ->> 'phone'), ''),
        email = nullif(btrim(p_input ->> 'email'), '')::extensions.citext,
        notes = nullif(btrim(p_input ->> 'notes'), ''),
        is_active = coalesce((p_input ->> 'isActive')::boolean, true),
        updated_by = v_actor,
        updated_at = now(),
        version = version + 1
    where id = v_id
      and version = (p_input ->> 'version')::bigint
    returning * into v_partner;

    if not found then
      raise exception 'El operador cambió desde que abriste la pantalla. Recarga y vuelve a intentarlo.'
        using errcode = '40001';
    end if;
  end if;

  delete from public.business_partner_types
  where partner_id = v_partner.id
    and partner_type_code in ('AGENCY', 'COURIER');

  insert into public.business_partner_types(partner_id, partner_type_code)
  values (v_partner.id, v_type)
  on conflict do nothing;

  return jsonb_build_object(
    'id', v_partner.id,
    'code', v_partner.code,
    'name', coalesce(nullif(v_partner.trade_name, ''), v_partner.legal_name),
    'legalName', v_partner.legal_name,
    'tradeName', v_partner.trade_name,
    'partnerTypeCode', v_type,
    'contactName', v_partner.contact_name,
    'phone', v_partner.phone,
    'email', v_partner.email,
    'notes', v_partner.notes,
    'isActive', v_partner.is_active,
    'version', v_partner.version
  );
end;
$$;

-- =========================================================
-- Atributos de variantes editables sin tocar stock histórico
-- =========================================================

create or replace function public.update_product_bundle_v2(
  p_product_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_variant_payload jsonb;
  v_attribute jsonb;
  v_variant_id uuid;
  v_attribute_type text;
begin
  -- La versión v1 conserva las validaciones, historial de precios, concurrencia y auditoría.
  v_result := public.update_product_bundle_v1(p_product_id, p_payload);

  for v_variant_payload in
    select value from jsonb_array_elements(coalesce(p_payload -> 'variants', '[]'::jsonb))
  loop
    if not (v_variant_payload ? 'attributes') then
      continue;
    end if;

    v_variant_id := (v_variant_payload ->> 'id')::uuid;
    perform 1
    from public.product_variants
    where id = v_variant_id and product_id = p_product_id;
    if not found then
      raise exception 'Una de las variantes no pertenece al producto.';
    end if;

    if jsonb_typeof(coalesce(v_variant_payload -> 'attributes', '[]'::jsonb)) <> 'array' then
      raise exception 'Los atributos de la variante deben enviarse como una lista.';
    end if;

    delete from public.product_variant_attribute_values
    where variant_id = v_variant_id;

    for v_attribute in
      select value
      from jsonb_array_elements(coalesce(v_variant_payload -> 'attributes', '[]'::jsonb))
    loop
      select data_type into v_attribute_type
      from public.product_attribute_definitions
      where id = (v_attribute ->> 'attributeId')::uuid
        and is_active = true;

      if not found then
        raise exception 'Se indicó un atributo inexistente o inactivo.';
      end if;

      if v_attribute_type in ('TEXT', 'COLOR')
        and nullif(btrim(v_attribute ->> 'valueText'), '') is null then
        raise exception 'El atributo de texto o color requiere un valor.';
      elsif v_attribute_type = 'NUMBER'
        and nullif(v_attribute ->> 'valueNumber', '') is null then
        raise exception 'El atributo numérico requiere un valor.';
      elsif v_attribute_type = 'BOOLEAN'
        and nullif(v_attribute ->> 'valueBoolean', '') is null then
        raise exception 'El atributo booleano requiere un valor.';
      elsif v_attribute_type = 'DATE'
        and nullif(v_attribute ->> 'valueDate', '') is null then
        raise exception 'El atributo de fecha requiere un valor.';
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
        (v_attribute ->> 'attributeId')::uuid,
        nullif(btrim(v_attribute ->> 'valueText'), ''),
        nullif(v_attribute ->> 'valueNumber', '')::numeric,
        nullif(v_attribute ->> 'valueBoolean', '')::boolean,
        nullif(v_attribute ->> 'valueDate', '')::date
      );
    end loop;
  end loop;

  return v_result;
end;
$$;

-- =========================================================
-- Ajuste manual positivo: agrega una unidad encontrada, no consume stock previo
-- =========================================================

create or replace function public.create_inventory_movement_v1(
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
  v_action text := p_input ->> 'action';
  v_variant_id uuid := (p_input ->> 'variantId')::uuid;
  v_source uuid := (p_input ->> 'sourceWarehouseId')::uuid;
  v_destination uuid := nullif(p_input ->> 'destinationWarehouseId', '')::uuid;
  v_quantity integer := (p_input ->> 'quantity')::integer;
  v_reason text := nullif(btrim(p_input ->> 'reason'), '');
  v_notes text := nullif(btrim(p_input ->> 'notes'), '');
  v_target_bucket text;
  v_movement public.inventory_movements%rowtype;
  v_balance record;
  v_needed integer;
  v_take integer;
  v_lot_id uuid;
  v_unit_cost numeric(14,4) := 0;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if v_action not in ('TRANSFER','DAMAGE','LOSS','GIFT','DYNAMIC') then
    raise exception 'Tipo de movimiento no permitido.';
  end if;
  if v_quantity <= 0 then
    raise exception 'La cantidad debe ser mayor que cero.';
  end if;
  if length(coalesce(v_reason, '')) < 5 then
    raise exception 'El motivo es obligatorio y debe ser específico.';
  end if;
  if v_action = 'TRANSFER' and (v_destination is null or v_destination = v_source) then
    raise exception 'Selecciona un almacén de destino diferente.';
  end if;

  perform 1 from public.product_variants where id = v_variant_id and is_active = true;
  if not found then raise exception 'La variante no existe o está inactiva.'; end if;
  perform 1 from public.warehouses
  where id = v_source and is_active = true and warehouse_type = 'OPERATIONAL';
  if not found then raise exception 'El almacén afectado no está operativo.'; end if;
  if v_destination is not null then
    perform 1 from public.warehouses
    where id = v_destination and is_active = true and warehouse_type = 'OPERATIONAL';
    if not found then raise exception 'El almacén de destino no está operativo.'; end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('INVENTORY_MOVEMENT:' || p_idempotency_key, 0)
  );
  select * into v_movement
  from public.inventory_movements
  where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object(
      'id', v_movement.id,
      'code', v_movement.code,
      'action', v_movement.movement_type_code,
      'quantity', v_quantity,
      'createdAt', v_movement.created_at
    );
  end if;

  perform pg_catalog.set_config('app.audit_reason', v_reason, true);
  insert into public.inventory_movements(
    code, movement_type_code, reference_type, reason, notes,
    idempotency_key, created_by, metadata
  ) values (
    public.next_business_code('INVENTORY_MOVEMENT'),
    v_action,
    'MANUAL_OPERATION',
    v_reason,
    v_notes,
    p_idempotency_key,
    v_actor,
    jsonb_build_object(
      'sourceWarehouseId', v_source,
      'destinationWarehouseId', v_destination,
      'adjustmentDirection', case when v_action = 'DYNAMIC' then 'INCREASE' else null end
    )
  ) returning * into v_movement;

  if v_action = 'DYNAMIC' then
    select coalesce(
      (
        select round(
          sum(ib.quantity * il.final_unit_cost_pen) / nullif(sum(ib.quantity), 0),
          4
        )
        from public.inventory_balances ib
        join public.inventory_lots il on il.id = ib.lot_id
        where ib.variant_id = v_variant_id
          and ib.warehouse_id = v_source
          and ib.bucket_code = 'AVAILABLE'
          and ib.quantity > 0
          and il.status = 'ACTIVE'
      ),
      (
        select round(avg(il.final_unit_cost_pen), 4)
        from public.inventory_lots il
        where il.variant_id = v_variant_id and il.status = 'ACTIVE'
      ),
      0
    ) into v_unit_cost;

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
      v_movement.id,
      'ACTIVE',
      'PEN',
      v_unit_cost,
      1,
      v_unit_cost,
      v_quantity,
      v_quantity,
      now(),
      now(),
      concat('Ajuste positivo por conteo físico. ', v_reason),
      v_actor,
      v_actor
    ) returning id into v_lot_id;

    insert into public.inventory_movement_lines(
      movement_id, variant_id, lot_id, warehouse_id,
      bucket_code, quantity_delta, unit_cost_pen
    ) values (
      v_movement.id, v_variant_id, v_lot_id, v_source,
      'AVAILABLE', v_quantity, v_unit_cost
    );

    return jsonb_build_object(
      'id', v_movement.id,
      'code', v_movement.code,
      'action', v_action,
      'quantity', v_quantity,
      'createdAt', v_movement.created_at
    );
  end if;

  v_target_bucket := case v_action
    when 'DAMAGE' then 'DAMAGED'
    when 'LOSS' then 'LOST'
    when 'GIFT' then 'GIFTED'
    else 'AVAILABLE'
  end;

  v_needed := v_quantity;
  for v_balance in
    select ib.lot_id, ib.quantity, il.final_unit_cost_pen
    from public.inventory_balances ib
    join public.inventory_lots il on il.id = ib.lot_id
    where ib.variant_id = v_variant_id
      and ib.warehouse_id = v_source
      and ib.bucket_code = 'AVAILABLE'
      and ib.quantity > 0
      and il.status = 'ACTIVE'
    order by coalesce(il.received_at, il.acquired_at, il.created_at), il.id
    for update of ib
  loop
    exit when v_needed <= 0;
    v_take := least(v_needed, v_balance.quantity);

    insert into public.inventory_movement_lines(
      movement_id, variant_id, lot_id, warehouse_id,
      bucket_code, quantity_delta, unit_cost_pen
    ) values (
      v_movement.id, v_variant_id, v_balance.lot_id, v_source,
      'AVAILABLE', -v_take, v_balance.final_unit_cost_pen
    );

    if v_action = 'TRANSFER' then
      insert into public.inventory_movement_lines(
        movement_id, variant_id, lot_id, warehouse_id,
        bucket_code, quantity_delta, unit_cost_pen
      ) values (
        v_movement.id, v_variant_id, v_balance.lot_id, v_destination,
        'AVAILABLE', v_take, v_balance.final_unit_cost_pen
      );
    else
      insert into public.inventory_movement_lines(
        movement_id, variant_id, lot_id, warehouse_id,
        bucket_code, quantity_delta, unit_cost_pen
      ) values (
        v_movement.id, v_variant_id, v_balance.lot_id, v_source,
        v_target_bucket, v_take, v_balance.final_unit_cost_pen
      );
    end if;
    v_needed := v_needed - v_take;
  end loop;

  if v_needed > 0 then
    raise exception 'Stock disponible insuficiente. Faltan % unidades.', v_needed
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'id', v_movement.id,
    'code', v_movement.code,
    'action', v_action,
    'quantity', v_quantity,
    'createdAt', v_movement.created_at
  );
end;
$$;

revoke execute on function public.list_delivery_partners_v1() from public, anon;
revoke execute on function public.upsert_delivery_partner_v1(jsonb) from public, anon;
revoke execute on function public.update_product_bundle_v2(uuid, jsonb) from public, anon;
revoke execute on function public.create_inventory_movement_v1(jsonb, text) from public, anon;

grant execute on function public.list_delivery_partners_v1() to authenticated, service_role;
grant execute on function public.upsert_delivery_partner_v1(jsonb) to authenticated, service_role;
grant execute on function public.update_product_bundle_v2(uuid, jsonb) to authenticated, service_role;
grant execute on function public.create_inventory_movement_v1(jsonb, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
