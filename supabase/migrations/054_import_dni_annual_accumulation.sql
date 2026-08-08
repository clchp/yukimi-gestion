-- Yukimi Gestión
-- Migración 054: acumulado anual por DNI + normalización de persona existente

begin;

create or replace function private.import_dni_yearly_history_v1(p_person_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  with current_year as (
    select extract(year from timezone('America/Lima', now()))::integer as value
  ), yearly as (
    select
      extract(year from timezone('America/Lima', u.occurred_at))::integer as year,
      round(coalesce(sum(u.equivalent_usd), 0), 4) as accumulated_usd,
      count(u.id)::integer as usage_count
    from public.import_dni_usages u
    where u.person_id = p_person_id
    group by extract(year from timezone('America/Lima', u.occurred_at))::integer
  )
  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'year', y.year,
        'accumulatedUsd', y.accumulated_usd,
        'usageCount', y.usage_count
      ) order by y.year desc
    ) filter (where y.year <> c.value),
    '[]'::jsonb
  )
  from yearly y
  cross join current_year c
$$;

create or replace function private.import_dni_usage_json_v1(p_usage_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'id', u.id,
    'importId', s.id,
    'importCode', s.code,
    'personId', p.id,
    'fullName', p.full_name,
    'documentNumber', p.document_number,
    'address', p.address,
    'postalCode', p.postal_code,
    'sourceCurrencyCode', u.source_currency_code,
    'purchaseAmount', u.purchase_amount,
    'exchangeRateToUsd', u.exchange_rate_to_usd,
    'equivalentUsd', u.equivalent_usd,
    'managementFeePen', u.management_fee_pen,
    'importCostId', u.import_cost_id,
    'occurredAt', u.occurred_at,
    'personAccumulationYear', extract(year from timezone('America/Lima', now()))::integer,
    'personAccumulatedUsd', coalesce((
      select round(sum(history.equivalent_usd), 4)
      from public.import_dni_usages history
      where history.person_id = p.id
        and extract(year from timezone('America/Lima', history.occurred_at))::integer =
            extract(year from timezone('America/Lima', now()))::integer
    ), 0),
    'personYearlyHistory', private.import_dni_yearly_history_v1(p.id)
  )
  from public.import_dni_usages u
  join public.import_shipments s on s.id = u.import_shipment_id
  join public.import_dni_people p on p.id = u.person_id
  where u.id = p_usage_id
$$;

create or replace function public.list_import_dni_people_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select case
    when private.is_active_admin() then jsonb_build_object(
      'items', coalesce((
        select jsonb_agg(
          jsonb_build_object(
            'id', p.id,
            'fullName', p.full_name,
            'documentNumber', p.document_number,
            'address', p.address,
            'postalCode', p.postal_code,
            'accumulationYear', extract(year from timezone('America/Lima', now()))::integer,
            'accumulatedUsd', coalesce(t.accumulated_usd, 0),
            'usageCount', coalesce(t.usage_count, 0),
            'yearlyHistory', private.import_dni_yearly_history_v1(p.id)
          ) order by p.full_name, p.document_number
        )
        from public.import_dni_people p
        left join lateral (
          select
            round(coalesce(sum(u.equivalent_usd), 0), 4) as accumulated_usd,
            count(u.id)::integer as usage_count
          from public.import_dni_usages u
          where u.person_id = p.id
            and extract(year from timezone('America/Lima', u.occurred_at))::integer =
                extract(year from timezone('America/Lima', now()))::integer
        ) t on true
        where p.is_active = true
      ), '[]'::jsonb)
    )
    else null
  end
$$;

-- Conserva toda la validación y auditoría de la función 052, pero la envuelve
-- para que el resultado muestre el acumulado del año vigente y el histórico previo.
alter function public.update_import_dni_person_v1(uuid, jsonb)
  rename to update_import_dni_person_raw_v1;
alter function public.update_import_dni_person_raw_v1(uuid, jsonb)
  set schema private;

create function public.update_import_dni_person_v1(
  p_person_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_raw jsonb;
begin
  v_raw := private.update_import_dni_person_raw_v1(p_person_id, p_input);

  return (
    select jsonb_build_object(
      'id', p.id,
      'fullName', p.full_name,
      'documentNumber', p.document_number,
      'address', p.address,
      'postalCode', p.postal_code,
      'accumulationYear', extract(year from timezone('America/Lima', now()))::integer,
      'accumulatedUsd', coalesce(t.accumulated_usd, 0),
      'usageCount', coalesce(t.usage_count, 0),
      'yearlyHistory', private.import_dni_yearly_history_v1(p.id)
    )
    from public.import_dni_people p
    left join lateral (
      select
        round(coalesce(sum(u.equivalent_usd), 0), 4) as accumulated_usd,
        count(u.id)::integer as usage_count
      from public.import_dni_usages u
      where u.person_id = p.id
        and extract(year from timezone('America/Lima', u.occurred_at))::integer =
            extract(year from timezone('America/Lima', now()))::integer
    ) t on true
    where p.id = p_person_id
  );
end;
$$;

-- PostgreSQL diferencia JSONB null de SQL NULL. La función anterior recibía
-- { personId: <uuid>, person: null } y lo interpretaba como si ambas opciones
-- estuvieran presentes. Esta envoltura elimina claves JSON nulas antes de validar.
alter function public.register_import_dni_usage_v1(uuid, jsonb)
  rename to register_import_dni_usage_raw_v1;
alter function public.register_import_dni_usage_raw_v1(uuid, jsonb)
  set schema private;

create function public.register_import_dni_usage_v1(
  p_import_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_input jsonb := coalesce(p_input, '{}'::jsonb);
begin
  if v_input ? 'person' and v_input -> 'person' = 'null'::jsonb then
    v_input := v_input - 'person';
  end if;
  if v_input ? 'personId' and v_input -> 'personId' = 'null'::jsonb then
    v_input := v_input - 'personId';
  end if;

  return private.register_import_dni_usage_raw_v1(p_import_id, v_input);
end;
$$;

-- Recompila el flujo de creación para que siempre pase por la envoltura normalizada.
create or replace function public.create_import_v2(
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
  v_usage jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  v_result := public.create_import_v1(p_input - 'dniUsages', p_idempotency_key);

  for v_usage in
    select value
    from jsonb_array_elements(coalesce(p_input -> 'dniUsages', '[]'::jsonb))
  loop
    perform public.register_import_dni_usage_v1((v_result ->> 'id')::uuid, v_usage);
  end loop;

  return v_result;
end;
$$;

revoke all on function private.update_import_dni_person_raw_v1(uuid, jsonb) from public, anon, authenticated;
revoke all on function private.register_import_dni_usage_raw_v1(uuid, jsonb) from public, anon, authenticated;
revoke all on function public.update_import_dni_person_v1(uuid, jsonb) from public, anon;
revoke all on function public.register_import_dni_usage_v1(uuid, jsonb) from public, anon;
revoke all on function public.create_import_v2(jsonb, text) from public, anon;

grant execute on function public.update_import_dni_person_v1(uuid, jsonb) to authenticated, service_role;
grant execute on function public.register_import_dni_usage_v1(uuid, jsonb) to authenticated, service_role;
grant execute on function public.create_import_v2(jsonb, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
