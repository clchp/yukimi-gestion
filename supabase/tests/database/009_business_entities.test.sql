begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(5);

select ok(
  to_regclass('public.business_entities') is not null,
  'Existe el catálogo de emisores'
);

select is(
  (
    select relrowsecurity
    from pg_class
    where oid = 'public.business_entities'::regclass
  ),
  true,
  'Emisores tiene RLS habilitado'
);

select is(
  (
    select relforcerowsecurity
    from pg_class
    where oid = 'public.business_entities'::regclass
  ),
  true,
  'Emisores fuerza RLS'
);

select is(
  (
    select setting_value ->> 'status'
    from public.business_settings
    where setting_key = 'receipts.business_entities'
  ),
  'AWAITING_LEGAL_NAMES_AND_RUCS',
  'Los dos RUC quedan pendientes sin datos inventados'
);

select is(
  (
    select setting_value ->> 'allowUndeclaredIncomeAutomation'
    from public.business_settings
    where setting_key = 'receipts.required_for_new_sales'
  ),
  'false',
  'No se automatiza el ocultamiento de ingresos'
);

select * from finish();
rollback;
