begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(5);

insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '91000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'dni-annual-admin@yukimi.test', '', now(),
  '{}'::jsonb, '{"display_name":"DNI Annual Admin"}'::jsonb, now(), now()
);

update public.profiles
set is_active = true
where id = '91000000-0000-4000-8000-000000000001';

insert into public.user_roles(user_id, role_code, granted_by)
values (
  '91000000-0000-4000-8000-000000000001',
  'ADMIN',
  '91000000-0000-4000-8000-000000000001'
);

insert into public.products(id, code, name, category_id)
select
  '92000000-0000-4000-8000-000000000001',
  'PROD-DNI-ANNUAL',
  'Producto DNI anual',
  id
from public.product_categories
where code = 'OTHER';

insert into public.product_variants(
  id, product_id, sku, variant_name, sale_price, currency_code
)
values (
  '93000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  'SKU-DNI-ANNUAL', 'DNI anual', 120, 'PEN'
);

insert into public.import_shipments(
  id, code, state_code, transport_mode, purchase_currency_code, sunat_exchange_rate
)
values
  ('94000000-0000-4000-8000-000000000001', 'IMP-DNI-ANNUAL-1', 'QUOTATION', 'OTHER', 'PEN', 1),
  ('94000000-0000-4000-8000-000000000002', 'IMP-DNI-ANNUAL-2', 'QUOTATION', 'OTHER', 'PEN', 1);

insert into public.import_boxes(id, code, import_shipment_id, state_code)
values
  ('95000000-0000-4000-8000-000000000001', 'BOX-DNI-ANNUAL-1', '94000000-0000-4000-8000-000000000001', 'REGISTERED'),
  ('95000000-0000-4000-8000-000000000002', 'BOX-DNI-ANNUAL-2', '94000000-0000-4000-8000-000000000002', 'REGISTERED');

insert into public.import_box_items(
  id, import_box_id, variant_id, expected_quantity, original_unit_cost,
  original_currency_code, exchange_rate_to_pen
)
values
  ('96000000-0000-4000-8000-000000000001', '95000000-0000-4000-8000-000000000001', '93000000-0000-4000-8000-000000000001', 1, 1000, 'PEN', 1),
  ('96000000-0000-4000-8000-000000000002', '95000000-0000-4000-8000-000000000002', '93000000-0000-4000-8000-000000000001', 1, 1000, 'PEN', 1);

select set_config('app.user_id', '91000000-0000-4000-8000-000000000001', true);
set local role authenticated;

select lives_ok(
  $test$
    select public.register_import_dni_usage_v1(
      '94000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'person', jsonb_build_object(
          'fullName', 'Persona DNI Anual',
          'documentNumber', '55556666',
          'address', 'Dirección anual 123',
          'postalCode', '15001'
        ),
        'purchaseAmount', 500,
        'exchangeRateToUsd', 0.1,
        'managementFeePen', 0
      )
    )
  $test$,
  'Se registra el primer uso del DNI'
);

reset role;
update public.import_dni_usages
set occurred_at = make_timestamptz(
  extract(year from timezone('America/Lima', now()))::integer - 1,
  6, 15, 12, 0, 0, 'America/Lima'
)
where import_shipment_id = '94000000-0000-4000-8000-000000000001';

set local role authenticated;

select lives_ok(
  $test$
    select public.register_import_dni_usage_v1(
      '94000000-0000-4000-8000-000000000002',
      jsonb_build_object(
        'personId', (select id from public.import_dni_people where document_number = '55556666'),
        'person', null,
        'purchaseAmount', 200,
        'exchangeRateToUsd', 0.1,
        'managementFeePen', 0
      )
    )
  $test$,
  'Una persona guardada se reutiliza aunque el cliente envíe person como JSON null'
);

select is(
  ((public.list_import_dni_people_v1() -> 'items' -> 0 ->> 'accumulatedUsd')::numeric),
  20.0000::numeric,
  'El acumulado vigente contiene únicamente el año actual'
);

select is(
  ((public.list_import_dni_people_v1() -> 'items' -> 0 -> 'yearlyHistory' -> 0 ->> 'accumulatedUsd')::numeric),
  50.0000::numeric,
  'El acumulado del año anterior permanece guardado en el histórico'
);

select is(
  ((public.list_import_dni_people_v1() -> 'items' -> 0 -> 'yearlyHistory' -> 0 ->> 'year')::integer),
  extract(year from timezone('America/Lima', now()))::integer - 1,
  'El histórico conserva el año al que pertenece el acumulado anterior'
);

reset role;
select * from finish();
rollback;
