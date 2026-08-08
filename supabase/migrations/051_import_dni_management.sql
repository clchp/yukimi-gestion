-- Yukimi Gestión
-- Migración 051: personas y control histórico de importaciones gestionadas por DNI

begin;

create table if not exists public.import_dni_people (
  id uuid primary key default extensions.gen_random_uuid(),
  full_name text not null check (length(btrim(full_name)) >= 3),
  document_number text not null unique check (document_number ~ '^[0-9]{8}$'),
  address text not null check (length(btrim(address)) >= 3),
  postal_code text not null check (length(btrim(postal_code)) between 3 and 20),
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.import_dni_usages (
  id uuid primary key default extensions.gen_random_uuid(),
  import_shipment_id uuid not null references public.import_shipments(id) on delete restrict,
  person_id uuid not null references public.import_dni_people(id) on delete restrict,
  import_cost_id uuid unique references public.import_costs(id) on delete restrict,
  source_currency_code text not null check (char_length(source_currency_code) = 3),
  purchase_amount numeric(18,4) not null check (purchase_amount > 0),
  exchange_rate_to_usd numeric(18,8) not null check (exchange_rate_to_usd > 0),
  equivalent_usd numeric(18,4) not null check (equivalent_usd >= 0),
  management_fee_pen numeric(14,2) not null default 30 check (management_fee_pen >= 0),
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  unique(import_shipment_id, person_id)
);

create index if not exists ix_import_dni_usages_person
  on public.import_dni_usages(person_id, occurred_at desc);
create index if not exists ix_import_dni_usages_import
  on public.import_dni_usages(import_shipment_id, occurred_at desc);

alter table public.import_dni_people enable row level security;
alter table public.import_dni_people force row level security;
alter table public.import_dni_usages enable row level security;
alter table public.import_dni_usages force row level security;

grant select on public.import_dni_people to authenticated;
grant select on public.import_dni_usages to authenticated;

drop policy if exists admin_select on public.import_dni_people;
create policy admin_select on public.import_dni_people
for select to authenticated using (private.is_active_admin());

drop policy if exists admin_select on public.import_dni_usages;
create policy admin_select on public.import_dni_usages
for select to authenticated using (private.is_active_admin());

drop trigger if exists trg_touch_version on public.import_dni_people;
create trigger trg_touch_version
before update on public.import_dni_people
for each row execute function private.touch_updated_at_and_version();

drop trigger if exists trg_audit_row_change on public.import_dni_people;
create trigger trg_audit_row_change
after insert or update or delete on public.import_dni_people
for each row execute function private.audit_row_change();

drop trigger if exists trg_audit_row_change on public.import_dni_usages;
create trigger trg_audit_row_change
after insert or update or delete on public.import_dni_usages
for each row execute function private.audit_row_change();

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
    'personAccumulatedUsd', coalesce((
      select round(sum(history.equivalent_usd), 4)
      from public.import_dni_usages history
      where history.person_id = p.id
    ), 0)
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
            'accumulatedUsd', coalesce(t.accumulated_usd, 0),
            'usageCount', coalesce(t.usage_count, 0)
          ) order by p.full_name, p.document_number
        )
        from public.import_dni_people p
        left join lateral (
          select
            round(coalesce(sum(u.equivalent_usd), 0), 4) as accumulated_usd,
            count(u.id)::integer as usage_count
          from public.import_dni_usages u
          where u.person_id = p.id
        ) t on true
        where p.is_active = true
      ), '[]'::jsonb)
    )
    else null
  end
$$;

create or replace function public.get_import_dni_usages_v1(p_import_id uuid)
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
  if not exists(select 1 from public.import_shipments where id = p_import_id) then
    raise exception 'Importación no encontrada.' using errcode = 'P0002';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(private.import_dni_usage_json_v1(u.id) order by u.occurred_at, u.id)
      from public.import_dni_usages u
      where u.import_shipment_id = p_import_id
    ), '[]'::jsonb)
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
    v_document_number := pg_catalog.regexp_replace(coalesce(v_person_input ->> 'documentNumber', ''), '[^0-9]', '', 'g');
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

revoke all on function public.list_import_dni_people_v1() from public, anon;
revoke all on function public.get_import_dni_usages_v1(uuid) from public, anon;
revoke all on function public.register_import_dni_usage_v1(uuid, jsonb) from public, anon;
revoke all on function public.create_import_v2(jsonb, text) from public, anon;

grant execute on function public.list_import_dni_people_v1() to authenticated, service_role;
grant execute on function public.get_import_dni_usages_v1(uuid) to authenticated, service_role;
grant execute on function public.register_import_dni_usage_v1(uuid, jsonb) to authenticated, service_role;
grant execute on function public.create_import_v2(jsonb, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
