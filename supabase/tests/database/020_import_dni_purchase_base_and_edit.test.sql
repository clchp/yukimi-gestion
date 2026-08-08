begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(10);

insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '87000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'dni-edit-admin@yukimi.test', '', now(),
  '{}'::jsonb, '{"display_name":"DNI Edit Admin"}'::jsonb, now(), now()
);

update public.profiles
set is_active = true
where id = '87000000-0000-4000-8000-000000000001';

insert into public.user_roles(user_id, role_code, granted_by)
values (
  '87000000-0000-4000-8000-000000000001',
  'ADMIN',
  '87000000-0000-4000-8000-000000000001'
);

insert into public.products(id, code, name, category_id)
select
  '88000000-0000-4000-8000-000000000001',
  'PROD-DNI-BASE',
  'Producto DNI base',
  id
from public.product_categories
where code = 'OTHER';

insert into public.product_variants(
  id, product_id, sku, variant_name, sale_price, currency_code
)
values (
  '89000000-0000-4000-8000-000000000001',
  '88000000-0000-4000-8000-000000000001',
  'SKU-DNI-BASE', 'DNI base', 120, 'PEN'
);

insert into public.import_shipments(
  id, code, state_code, transport_mode, purchase_currency_code,
  sunat_exchange_rate
)
values (
  '8a000000-0000-4000-8000-000000000001',
  'IMP-DNI-BASE',
  'QUOTATION',
  'OTHER',
  'JPY',
  0.025
);

insert into public.import_boxes(
  id, code, import_shipment_id, state_code
)
values (
  '8b000000-0000-4000-8000-000000000001',
  'BOX-DNI-BASE',
  '8a000000-0000-4000-8000-000000000001',
  'REGISTERED'
);

insert into public.import_box_items(
  id, import_box_id, variant_id, expected_quantity, original_unit_cost,
  original_currency_code, exchange_rate_to_pen
)
values (
  '8c000000-0000-4000-8000-000000000001',
  '8b000000-0000-4000-8000-000000000001',
  '89000000-0000-4000-8000-000000000001',
  1, 1100, 'JPY', 0.025
);

select ok(
  to_regprocedure('public.update_import_dni_person_v1(uuid,jsonb)') is not null,
  'Existe la edición de personas asociadas a DNI'
);

select is(
  private.import_purchase_base_amount_v1('8a000000-0000-4000-8000-000000000001'),
  1100.0000::numeric,
  'La base de control DNI corresponde solo al valor original de productos'
);

select set_config(
  'app.user_id',
  '87000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select lives_ok(
  $test$
    select public.add_import_cost_v2(
      '8a000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'costType', 'OTHER',
        'description', 'Gasto adicional que no pertenece al monto DNI',
        'amount', 700,
        'currencyCode', 'JPY',
        'exchangeRateToPen', 0.025,
        'allocationMethod', 'BY_PURCHASE_VALUE',
        'isIncludedInUnitCost', true
      )
    )
  $test$,
  'Se puede registrar un gasto adicional sin alterar la base de compra DNI'
);

select lives_ok(
  $test$
    select public.register_import_dni_usage_v1(
      '8a000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'person', jsonb_build_object(
          'fullName', 'Persona DNI Uno',
          'documentNumber', '11112222',
          'address', 'Dirección original 123',
          'postalCode', '15001'
        ),
        'purchaseAmount', 1000,
        'exchangeRateToUsd', 0.0036,
        'managementFeePen', 30
      )
    )
  $test$,
  'La primera persona puede tomar parte del monto base de compra'
);

select throws_ok(
  $test$
    select public.register_import_dni_usage_v1(
      '8a000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'person', jsonb_build_object(
          'fullName', 'Persona DNI Dos',
          'documentNumber', '33334444',
          'address', 'Otra dirección 456',
          'postalCode', '15002'
        ),
        'purchaseAmount', 200,
        'exchangeRateToUsd', 0.0036,
        'managementFeePen', 30
      )
    )
  $test$,
  'P0001',
  'El monto asociado por DNI supera el valor base de la compra, sin gastos adicionales.',
  'Los gastos adicionales no permiten asociar más dinero al control por DNI'
);

select lives_ok(
  $test$
    select public.register_import_dni_usage_v1(
      '8a000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'person', jsonb_build_object(
          'fullName', 'Persona DNI Dos',
          'documentNumber', '33334444',
          'address', 'Otra dirección 456',
          'postalCode', '15002'
        ),
        'purchaseAmount', 100,
        'exchangeRateToUsd', 0.0036,
        'managementFeePen', 30
      )
    )
  $test$,
  'La segunda persona puede usar únicamente el saldo real de la compra'
);

select is(
  (
    select sum(purchase_amount)
    from public.import_dni_usages
    where import_shipment_id = '8a000000-0000-4000-8000-000000000001'
  ),
  1100.0000::numeric,
  'La suma asociada a DNI nunca supera los JPY 1100 de compra base'
);

select is(
  (
    select sum(equivalent_usd)
    from public.import_dni_usages
    where import_shipment_id = '8a000000-0000-4000-8000-000000000001'
  ),
  3.9600::numeric,
  'El acumulado USD usa solo el monto de compra asociado y su tipo de cambio'
);

select lives_ok(
  $test$
    select public.update_import_dni_person_v1(
      (select id from public.import_dni_people where document_number = '11112222'),
      jsonb_build_object(
        'fullName', 'Persona DNI Uno Editada',
        'documentNumber', '11112222',
        'address', 'Dirección corregida 999',
        'postalCode', 'LIMA1501'
      )
    )
  $test$,
  'Los datos de una persona guardada se pueden editar'
);

select results_eq(
  $$
    select full_name, address, postal_code
    from public.import_dni_people
    where document_number = '11112222'
  $$,
  $$
    values ('Persona DNI Uno Editada'::text, 'Dirección corregida 999'::text, 'LIMA1501'::text)
  $$,
  'La edición queda persistida en la persona asociada'
);

reset role;
select * from finish();
rollback;
