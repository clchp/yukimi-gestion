begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(8);

insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '70000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'cost-admin@yukimi.test', '', now(),
  '{}'::jsonb, '{"display_name":"Cost Admin"}'::jsonb, now(), now()
);

update public.profiles
set is_active = true
where id = '70000000-0000-4000-8000-000000000001';

insert into public.user_roles(user_id, role_code, granted_by)
values (
  '70000000-0000-4000-8000-000000000001',
  'ADMIN',
  '70000000-0000-4000-8000-000000000001'
);

insert into public.products(id, code, name, category_id)
select
  '71000000-0000-4000-8000-000000000001',
  'PROD-COST-TEST',
  'Producto de costo',
  id
from public.product_categories
where code = 'OTHER';

insert into public.product_variants(
  id, product_id, sku, variant_name, sale_price, currency_code
)
values
  (
    '72000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'SKU-COST-A', 'Costo A', 50, 'PEN'
  ),
  (
    '72000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000001',
    'SKU-COST-B', 'Costo B', 60, 'PEN'
  );

insert into public.import_shipments(
  id, code, state_code, transport_mode, purchase_currency_code,
  sunat_exchange_rate
)
values (
  '73000000-0000-4000-8000-000000000001',
  'IMP-COST-TEST',
  'QUOTATION',
  'AIR',
  'PEN',
  1
);

insert into public.import_boxes(
  id, code, import_shipment_id, state_code, weight_grams
)
values (
  '74000000-0000-4000-8000-000000000001',
  'BOX-COST-TEST',
  '73000000-0000-4000-8000-000000000001',
  'REGISTERED',
  null
);

insert into public.import_box_items(
  id, import_box_id, variant_id, expected_quantity, original_unit_cost,
  original_currency_code, exchange_rate_to_pen
)
values
  (
    '75000000-0000-4000-8000-000000000001',
    '74000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    10, 10, 'PEN', 1
  ),
  (
    '75000000-0000-4000-8000-000000000002',
    '74000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000002',
    10, 30, 'PEN', 1
  );

select set_config(
  'app.user_id',
  '70000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select ok(
  to_regprocedure('public.calculate_import_landed_cost_v1(uuid)') is not null,
  'Existe el cálculo automático de costo importado'
);

select lives_ok(
  $test$
    select public.add_import_cost_v2(
      '73000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'costType', 'CARD',
        'amount', 20,
        'currencyCode', 'PEN',
        'exchangeRateToPen', 1,
        'allocationMethod', 'BY_QUANTITY',
        'isIncludedInUnitCost', true
      )
    )
  $test$,
  'La comisión de tarjeta se registra y distribuye'
);

select is(
  allocation_method,
  'BY_PURCHASE_VALUE',
  'Tarjeta se distribuye por valor de compra'
)
from public.import_costs
where import_shipment_id = '73000000-0000-4000-8000-000000000001'
  and cost_type = 'CARD';

select is(
  (
    select sum(allocated_amount_pen)
    from public.import_cost_allocations
    where is_active = true
  ),
  20.0000::numeric,
  'La distribución conserva el importe total'
);

select is(
  final_unit_cost_pen,
  10.5000::numeric,
  'La primera línea recibe su proporción por valor'
)
from public.import_box_items
where id = '75000000-0000-4000-8000-000000000001';

select lives_ok(
  $test$
    select public.add_import_cost_v2(
      '73000000-0000-4000-8000-000000000001',
      jsonb_build_object(
        'costType', 'FREIGHT',
        'amount', 10,
        'currencyCode', 'PEN',
        'exchangeRateToPen', 1,
        'allocationMethod', 'BY_WEIGHT',
        'isIncludedInUnitCost', true
      )
    )
  $test$,
  'El flete sin peso usa el criterio alternativo'
);

select is(
  allocation_method,
  'BY_QUANTITY',
  'Sin peso, el flete se distribuye por cantidad'
)
from public.import_costs
where import_shipment_id = '73000000-0000-4000-8000-000000000001'
  and cost_type = 'FREIGHT';

select results_eq(
  $$
    select id, final_unit_cost_pen
    from public.import_box_items
    where import_box_id = '74000000-0000-4000-8000-000000000001'
    order by id
  $$,
  $$
    values
      (
        '75000000-0000-4000-8000-000000000001'::uuid,
        11.0000::numeric
      ),
      (
        '75000000-0000-4000-8000-000000000002'::uuid,
        32.0000::numeric
      )
  $$,
  'El costo unitario final incorpora tarjeta y flete'
);

reset role;
select * from finish();
rollback;
