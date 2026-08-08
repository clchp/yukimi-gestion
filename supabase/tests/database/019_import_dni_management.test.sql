begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(9);

insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '81000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'dni-admin@yukimi.test', '', now(),
  '{}'::jsonb, '{"display_name":"DNI Admin"}'::jsonb, now(), now()
);

update public.profiles
set is_active = true
where id = '81000000-0000-4000-8000-000000000001';

insert into public.user_roles(user_id, role_code, granted_by)
values (
  '81000000-0000-4000-8000-000000000001',
  'ADMIN',
  '81000000-0000-4000-8000-000000000001'
);

insert into public.products(id, code, name, category_id)
select
  '82000000-0000-4000-8000-000000000001',
  'PROD-DNI-TEST',
  'Producto DNI',
  id
from public.product_categories
where code = 'OTHER';

insert into public.product_variants(
  id, product_id, sku, variant_name, sale_price, currency_code
)
values (
  '83000000-0000-4000-8000-000000000001',
  '82000000-0000-4000-8000-000000000001',
  'SKU-DNI-TEST', 'DNI', 120, 'PEN'
);

insert into public.import_shipments(
  id, code, state_code, transport_mode, purchase_currency_code,
  sunat_exchange_rate
)
values (
  '84000000-0000-4000-8000-000000000001',
  'IMP-DNI-TEST',
  'QUOTATION',
  'OTHER',
  'CNY',
  0.52
);

insert into public.import_boxes(
  id, code, import_shipment_id, state_code
)
values (
  '85000000-0000-4000-8000-000000000001',
  'BOX-DNI-TEST',
  '84000000-0000-4000-8000-000000000001',
  'REGISTERED'
);

insert into public.import_box_items(
  id, import_box_id, variant_id, expected_quantity, original_unit_cost,
  original_currency_code, exchange_rate_to_pen
)
values (
  '86000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000001',
  1, 7438, 'CNY', 0.52
);

select set_config(
  'app.user_id',
  '81000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select ok(
  to_regprocedure('public.register_import_dni_usage_v1(uuid,jsonb)') is not null,
  'Existe el registro de gestión por DNI'
);

select ok(
  to_regprocedure('public.create_import_v2(jsonb,text)') is not null,
  'Existe la creación de importación con gestiones por DNI'
);

select lives_ok(
  $test$
    select public.register_import_dni_usage_v1(
      '84000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'person', jsonb_build_object(
          'fullName', 'Persona de prueba DNI',
          'documentNumber', '12345678',
          'address', 'Av. Prueba 123',
          'postalCode', '15001'
        ),
        'purchaseAmount', 7438,
        'exchangeRateToUsd', 0.139,
        'managementFeePen', 30
      )
    )
  $test$,
  'La gestión por DNI se registra con una persona nueva'
);

select is(
  (select full_name from public.import_dni_people where document_number = '12345678'),
  'Persona de prueba DNI',
  'La persona queda guardada para futuras importaciones'
);

select is(
  (select equivalent_usd from public.import_dni_usages where import_shipment_id = '84000000-0000-4000-8000-000000000001'),
  1033.8820::numeric,
  'La compra se convierte a USD con la tasa ingresada'
);

select is(
  (select management_fee_pen from public.import_dni_usages where import_shipment_id = '84000000-0000-4000-8000-000000000001'),
  30.00::numeric,
  'El costo de gestión usa S/ 30 como valor inicial'
);

select is(
  (
    select amount_pen
    from public.import_costs
    where import_shipment_id = '84000000-0000-4000-8000-000000000001'
      and cost_type = 'OTHER'
      and description like 'Gestión de importación por DNI%'
  ),
  30.0000::numeric,
  'El cargo se registra como costo adicional de la importación'
);

select lives_ok(
  $test$
    select public.register_import_dni_usage_v1(
      '84000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'personId', (select id from public.import_dni_people where document_number = '12345678'),
        'purchaseAmount', 7438,
        'exchangeRateToUsd', 0.139,
        'managementFeePen', 30
      )
    )
  $test$,
  'Reintentar la misma persona en la importación no duplica la gestión'
);

select results_eq(
  $$
    select
      (select count(*) from public.import_dni_usages where import_shipment_id = '84000000-0000-4000-8000-000000000001')::bigint,
      (select count(*) from public.import_costs where import_shipment_id = '84000000-0000-4000-8000-000000000001' and description like 'Gestión de importación por DNI%')::bigint
  $$,
  $$ values (1::bigint, 1::bigint) $$,
  'La gestión y el costo permanecen únicos al reintentar'
);

reset role;
select * from finish();
rollback;
