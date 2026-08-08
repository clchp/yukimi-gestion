-- Yukimi Gestión
-- Migración 052: edición de personas DNI y control limitado al valor base de compra

begin;

create or replace function private.import_purchase_base_amount_v1(p_import_id uuid)
returns numeric
language sql
stable
security definer
set search_path = ''
as $$
  select coalesce(
    round(sum(i.expected_quantity * i.original_unit_cost), 4),
    0
  )
  from public.import_boxes b
  join public.import_shipments s on s.id = b.import_shipment_id
  join public.import_box_items i on i.import_box_id = b.id
  where b.import_shipment_id = p_import_id
    and i.original_currency_code = s.purchase_currency_code
$$;

create or replace function public.update_import_dni_person_v1(
  p_person_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_person public.import_dni_people%rowtype;
  v_document_number text := pg_catalog.regexp_replace(
    coalesce(p_input ->> 'documentNumber', ''),
    '[^0-9]',
    '',
    'g'
  );
  v_accumulated_usd numeric(18,4);
  v_usage_count integer;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if v_document_number !~ '^[0-9]{8}$' then
    raise exception 'El DNI debe tener 8 dígitos.';
  end if;
  if length(btrim(coalesce(p_input ->> 'fullName', ''))) < 3 then
    raise exception 'Ingresa el nombre completo.';
  end if;
  if length(btrim(coalesce(p_input ->> 'address', ''))) < 3 then
    raise exception 'Ingresa la dirección.';
  end if;
  if length(btrim(coalesce(p_input ->> 'postalCode', ''))) < 3 then
    raise exception 'Ingresa el código postal.';
  end if;

  select * into v_person
  from public.import_dni_people
  where id = p_person_id
    and is_active = true
  for update;
  if not found then
    raise exception 'La persona seleccionada no existe o está inactiva.' using errcode = 'P0002';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('IMPORT_DNI_PERSON:' || v_document_number, 0)
  );

  if exists(
    select 1
    from public.import_dni_people
    where document_number = v_document_number
      and id <> p_person_id
  ) then
    raise exception 'Ese DNI ya está registrado en otra persona.';
  end if;

  perform pg_catalog.set_config(
    'app.audit_reason',
    'Edición de persona asociada a gestión de importación por DNI.',
    true
  );

  update public.import_dni_people
  set full_name = btrim(p_input ->> 'fullName'),
      document_number = v_document_number,
      address = btrim(p_input ->> 'address'),
      postal_code = btrim(p_input ->> 'postalCode'),
      updated_by = v_actor
  where id = p_person_id
  returning * into v_person;

  select
    round(coalesce(sum(u.equivalent_usd), 0), 4),
    count(u.id)::integer
  into v_accumulated_usd, v_usage_count
  from public.import_dni_usages u
  where u.person_id = p_person_id;

  return jsonb_build_object(
    'id', v_person.id,
    'fullName', v_person.full_name,
    'documentNumber', v_person.document_number,
    'address', v_person.address,
    'postalCode', v_person.postal_code,
    'accumulatedUsd', coalesce(v_accumulated_usd, 0),
    'usageCount', coalesce(v_usage_count, 0)
  );
end;
$$;

create or replace function public.register_import_dni_usage_v1(
  p_import_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_import public.import_shipments%rowtype;
  v_person public.import_dni_people%rowtype;
  v_existing public.import_dni_usages%rowtype;
  v_usage public.import_dni_usages%rowtype;
  v_person_input jsonb := p_input -> 'person';
  v_person_id uuid := nullif(p_input ->> 'personId', '')::uuid;
  v_document_number text;
  v_purchase_amount numeric(18,4) := nullif(p_input ->> 'purchaseAmount', '')::numeric;
  v_exchange_rate numeric(18,8) := nullif(p_input ->> 'exchangeRateToUsd', '')::numeric;
  v_fee numeric(14,2) := coalesce(nullif(p_input ->> 'managementFeePen', '')::numeric, 30);
  v_equivalent_usd numeric(18,4);
  v_purchase_base numeric(18,4);
  v_already_assigned numeric(18,4);
  v_cost_result jsonb;
  v_cost_id uuid;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select * into v_import
  from public.import_shipments
  where id = p_import_id
  for update;
  if not found then
    raise exception 'Importación no encontrada.' using errcode = 'P0002';
  end if;

  if v_person_id is not null and v_person_input is not null then
    raise exception 'Selecciona una persona guardada o registra una nueva, pero no ambas.';
  end if;

  if v_person_id is not null then
    select * into v_person
    from public.import_dni_people
    where id = v_person_id and is_active = true
    for update;
    if not found then
      raise exception 'La persona seleccionada no existe o está inactiva.' using errcode = 'P0002';
    end if;
  else
    if v_person_input is null then
      raise exception 'Selecciona una persona o registra una nueva.';
    end if;
    v_document_number := pg_catalog.regexp_replace(
      coalesce(v_person_input ->> 'documentNumber', ''),
      '[^0-9]',
      '',
      'g'
    );
    if v_document_number !~ '^[0-9]{8}$' then
      raise exception 'El DNI debe tener 8 dígitos.';
    end if;
    if length(btrim(coalesce(v_person_input ->> 'fullName', ''))) < 3 then
      raise exception 'Ingresa el nombre completo.';
    end if;
    if length(btrim(coalesce(v_person_input ->> 'address', ''))) < 3 then
      raise exception 'Ingresa la dirección.';
    end if;
    if length(btrim(coalesce(v_person_input ->> 'postalCode', ''))) < 3 then
      raise exception 'Ingresa el código postal.';
    end if;

    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('IMPORT_DNI_PERSON:' || v_document_number, 0)
    );
    select * into v_person
    from public.import_dni_people
    where document_number = v_document_number
    for update;

    if found then
      update public.import_dni_people
      set full_name = btrim(v_person_input ->> 'fullName'),
          address = btrim(v_person_input ->> 'address'),
          postal_code = btrim(v_person_input ->> 'postalCode'),
          is_active = true,
          updated_by = v_actor
      where id = v_person.id
      returning * into v_person;
    else
      insert into public.import_dni_people(
        full_name, document_number, address, postal_code, created_by, updated_by
      ) values (
        btrim(v_person_input ->> 'fullName'),
        v_document_number,
        btrim(v_person_input ->> 'address'),
        btrim(v_person_input ->> 'postalCode'),
        v_actor,
        v_actor
      ) returning * into v_person;
    end if;
  end if;

  select * into v_existing
  from public.import_dni_usages
  where import_shipment_id = p_import_id
    and person_id = v_person.id;
  if found then
    return private.import_dni_usage_json_v1(v_existing.id);
  end if;

  if v_purchase_amount is null or v_purchase_amount <= 0 then
    raise exception 'El monto de compra asociado debe ser mayor que cero.';
  end if;
  if v_import.purchase_currency_code = 'USD' then
    v_exchange_rate := 1;
  elsif v_exchange_rate is null or v_exchange_rate <= 0 then
    raise exception 'Ingresa un tipo de cambio válido hacia USD.';
  end if;
  if v_fee < 0 then
    raise exception 'El costo de gestión no puede ser negativo.';
  end if;

  v_purchase_base := private.import_purchase_base_amount_v1(p_import_id);
  select coalesce(sum(u.purchase_amount), 0)
  into v_already_assigned
  from public.import_dni_usages u
  where u.import_shipment_id = p_import_id;

  if v_purchase_base <= 0 then
    raise exception 'No se encontró un valor base de compra para asociar al DNI.';
  end if;
  if v_already_assigned + v_purchase_amount > v_purchase_base + 0.0001 then
    raise exception 'El monto asociado por DNI supera el valor base de la compra, sin gastos adicionales.';
  end if;

  v_equivalent_usd := round(v_purchase_amount * v_exchange_rate, 4);
  perform pg_catalog.set_config(
    'app.audit_reason',
    'Registro de gestión de importación por DNI.',
    true
  );

  if v_fee > 0 then
    v_cost_result := public.add_import_cost_v2(
      p_import_id,
      jsonb_build_object(
        'importBoxId', null,
        'costType', 'OTHER',
        'description', 'Gestión de importación por DNI · ' || v_person.full_name || ' · DNI ****' || right(v_person.document_number, 4),
        'amount', v_fee,
        'currencyCode', 'PEN',
        'exchangeRateToPen', 1,
        'allocationMethod', 'BY_PURCHASE_VALUE',
        'isIncludedInUnitCost', true
      )
    );
    v_cost_id := (v_cost_result ->> 'id')::uuid;
  end if;

  insert into public.import_dni_usages(
    import_shipment_id,
    person_id,
    import_cost_id,
    source_currency_code,
    purchase_amount,
    exchange_rate_to_usd,
    equivalent_usd,
    management_fee_pen,
    created_by
  ) values (
    p_import_id,
    v_person.id,
    v_cost_id,
    v_import.purchase_currency_code,
    v_purchase_amount,
    v_exchange_rate,
    v_equivalent_usd,
    v_fee,
    v_actor
  ) returning * into v_usage;

  return private.import_dni_usage_json_v1(v_usage.id);
end;
$$;

revoke all on function public.update_import_dni_person_v1(uuid, jsonb) from public, anon;
grant execute on function public.update_import_dni_person_v1(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
