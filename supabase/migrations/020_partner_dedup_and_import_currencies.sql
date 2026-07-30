-- Yukimi Gestión
-- Migración 020 CORREGIDA: proveedores sin duplicados y monedas internacionales para importaciones

begin;

-- Monedas habituales para compras internacionales de merchandising.
insert into public.currencies(code, name, symbol, decimal_places, is_active)
values
  ('PEN', 'Sol peruano', 'S/', 2, true),
  ('USD', 'Dólar estadounidense', 'US$', 2, true),
  ('JPY', 'Yen japonés', '¥', 0, true),
  ('CNY', 'Yuan chino', 'CN¥', 2, true),
  ('KRW', 'Won surcoreano', '₩', 0, true),
  ('EUR', 'Euro', '€', 2, true),
  ('GBP', 'Libra esterlina', '£', 2, true),
  ('HKD', 'Dólar de Hong Kong', 'HK$', 2, true),
  ('CAD', 'Dólar canadiense', 'C$', 2, true),
  ('AUD', 'Dólar australiano', 'A$', 2, true)
on conflict (code) do update set
  name = excluded.name,
  symbol = excluded.symbol,
  decimal_places = excluded.decimal_places,
  is_active = true;

create or replace function private.normalize_business_partner_name(p_value text)
returns text
language sql
stable
set search_path = ''
as $$
  select pg_catalog.regexp_replace(
    pg_catalog.lower(extensions.unaccent(coalesce(pg_catalog.btrim(p_value), ''))),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

comment on function private.normalize_business_partner_name(text) is
  'Normaliza nombres de socios comerciales para impedir duplicados por mayúsculas, espacios, signos o tildes.';

-- Consolida proveedores activos repetidos que pudieran haberse creado antes de esta corrección.
do $$
declare
  v_duplicate record;
begin
  perform pg_catalog.set_config('app.audit_reason', 'Consolidación de proveedores duplicados previa a la migración 020', true);

  for v_duplicate in
    with supplier_partners as (
      select
        bp.id,
        bp.created_at,
        private.normalize_business_partner_name(coalesce(bp.trade_name, bp.legal_name)) as normalized_name
      from public.business_partners bp
      where bp.is_active = true
        and exists (
          select 1
          from public.business_partner_types bpt
          where bpt.partner_id = bp.id
            and bpt.partner_type_code = 'SUPPLIER'
        )
    ), ranked as (
      select
        sp.*,
        pg_catalog.first_value(sp.id) over (
          partition by sp.normalized_name
          order by sp.created_at, sp.id
        ) as keeper_id,
        pg_catalog.row_number() over (
          partition by sp.normalized_name
          order by sp.created_at, sp.id
        ) as duplicate_order
      from supplier_partners sp
      where sp.normalized_name <> ''
    )
    select id as duplicate_id, keeper_id
    from ranked
    where duplicate_order > 1
  loop
    insert into public.business_partner_types(partner_id, partner_type_code)
    select v_duplicate.keeper_id, bpt.partner_type_code
    from public.business_partner_types bpt
    where bpt.partner_id = v_duplicate.duplicate_id
    on conflict do nothing;

    update public.client_addresses
       set preferred_partner_id = v_duplicate.keeper_id
     where preferred_partner_id = v_duplicate.duplicate_id;

    update public.deliveries
       set operator_partner_id = v_duplicate.keeper_id
     where operator_partner_id = v_duplicate.duplicate_id;

    update public.import_shipments
       set supplier_partner_id = v_duplicate.keeper_id
     where supplier_partner_id = v_duplicate.duplicate_id;

    update public.import_boxes
       set international_operator_id = v_duplicate.keeper_id
     where international_operator_id = v_duplicate.duplicate_id;

    update public.import_boxes
       set local_operator_id = v_duplicate.keeper_id
     where local_operator_id = v_duplicate.duplicate_id;

    update public.loans
       set lender_partner_id = v_duplicate.keeper_id
     where lender_partner_id = v_duplicate.duplicate_id;

    update public.business_partners
       set is_active = false,
           metadata = metadata || jsonb_build_object(
             'mergedIntoPartnerId', v_duplicate.keeper_id,
             'mergedAt', pg_catalog.now(),
             'mergedByMigration', '020'
           ),
           notes = pg_catalog.concat_ws(E'\n', notes, 'Registro duplicado consolidado por la migración 020.'),
           updated_at = pg_catalog.now(),
           version = version + 1
     where id = v_duplicate.duplicate_id;
  end loop;
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
  v_existing public.business_partners%rowtype;
  v_type text := p_input ->> 'partnerTypeCode';
  v_legal_name text := pg_catalog.btrim(p_input ->> 'legalName');
  v_trade_name text := nullif(pg_catalog.btrim(p_input ->> 'tradeName'), '');
  v_normalized_name text;
  v_code text;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if v_type not in ('SUPPLIER', 'INTERNATIONAL_OPERATOR', 'LOCAL_OPERATOR') then
    raise exception 'Tipo de socio comercial inválido.';
  end if;
  if nullif(v_legal_name, '') is null then
    raise exception 'El nombre legal es obligatorio.';
  end if;

  v_normalized_name := private.normalize_business_partner_name(coalesce(v_trade_name, v_legal_name));
  if v_normalized_name = '' then
    raise exception 'El nombre del proveedor u operador no es válido.';
  end if;

  -- Serializa altas del mismo nombre para impedir duplicados incluso con dos administradoras.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('IMPORT_PARTNER:' || v_normalized_name));

  select bp.*
    into v_existing
    from public.business_partners bp
   where private.normalize_business_partner_name(coalesce(bp.trade_name, bp.legal_name)) = v_normalized_name
      or private.normalize_business_partner_name(bp.legal_name) = v_normalized_name
   order by bp.is_active desc, bp.created_at, bp.id
   limit 1
   for update;

  if found then
    perform pg_catalog.set_config('app.audit_reason', 'Reutilización de proveedor u operador existente', true);

    if not v_existing.is_active then
      update public.business_partners
         set is_active = true,
             updated_by = v_actor,
             updated_at = pg_catalog.now(),
             version = version + 1
       where id = v_existing.id
       returning * into v_existing;
    end if;

    insert into public.business_partner_types(partner_id, partner_type_code)
    values (v_existing.id, v_type)
    on conflict do nothing;

    return jsonb_build_object(
      'id', v_existing.id,
      'code', v_existing.code,
      'reused', true
    );
  end if;

  v_code := 'PART-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.regexp_replace(v_legal_name, '[^A-Za-z0-9]+', '', 'g'), 1, 8))
    || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(extensions.gen_random_uuid()::text, '-', ''), 1, 6));
  perform pg_catalog.set_config('app.audit_reason', 'Creación de proveedor u operador de importación', true);

  insert into public.business_partners(
    code, legal_name, trade_name, contact_name, phone, email, country_code, notes,
    created_by, updated_by
  ) values (
    v_code,
    v_legal_name,
    v_trade_name,
    nullif(pg_catalog.btrim(p_input ->> 'contactName'), ''),
    nullif(pg_catalog.btrim(p_input ->> 'phone'), ''),
    nullif(pg_catalog.btrim(p_input ->> 'email'), '')::extensions.citext,
    pg_catalog.upper(nullif(pg_catalog.btrim(p_input ->> 'countryCode'), ''))::char(2),
    nullif(pg_catalog.btrim(p_input ->> 'notes'), ''),
    v_actor, v_actor
  ) returning * into v_partner;

  insert into public.business_partner_types(partner_id, partner_type_code)
  values (v_partner.id, v_type);

  return jsonb_build_object(
    'id', v_partner.id,
    'code', v_partner.code,
    'reused', false
  );
end;
$$;

notify pgrst, 'reload schema';

commit;
