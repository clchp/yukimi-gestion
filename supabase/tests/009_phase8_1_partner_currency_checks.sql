-- Yukimi Gestión
-- Comprobaciones Fase 8.1: proveedores sin duplicados y monedas internacionales
-- Resultado correcto: Success. No rows returned

do $$
declare
  v_missing text;
  v_definition text;
begin
  select pg_catalog.string_agg(required.code, ', ' order by required.code)
    into v_missing
    from (values ('PEN'), ('USD'), ('JPY'), ('CNY'), ('KRW'), ('EUR'), ('GBP'), ('HKD'), ('CAD'), ('AUD')) required(code)
   where not exists (
     select 1
     from public.currencies c
     where c.code = required.code::char(3)
       and c.is_active = true
   );

  if v_missing is not null then
    raise exception 'Faltan monedas activas: %', v_missing;
  end if;

  if to_regprocedure('private.normalize_business_partner_name(text)') is null then
    raise exception 'No existe private.normalize_business_partner_name(text).';
  end if;

  if to_regprocedure('public.create_import_partner_v1(jsonb)') is null then
    raise exception 'No existe public.create_import_partner_v1(jsonb).';
  end if;

  select pg_catalog.pg_get_functiondef('public.create_import_partner_v1(jsonb)'::regprocedure)
    into v_definition;

  if pg_catalog.strpos(v_definition, 'pg_advisory_xact_lock') = 0
     or pg_catalog.strpos(v_definition, 'reused') = 0 then
    raise exception 'La función de proveedores no contiene la protección contra duplicados esperada.';
  end if;

  if exists (
    select 1
    from public.business_partners bp
    join public.business_partner_types bpt
      on bpt.partner_id = bp.id
     and bpt.partner_type_code = 'SUPPLIER'
    where bp.is_active = true
    group by private.normalize_business_partner_name(coalesce(bp.trade_name, bp.legal_name))
    having count(*) > 1
  ) then
    raise exception 'Todavía existen proveedores activos duplicados por nombre normalizado.';
  end if;
end;
$$;
