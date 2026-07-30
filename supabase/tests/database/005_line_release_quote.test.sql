begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(6);

insert into auth.users(
  id,
  instance_id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values (
  '50000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'release-admin@yukimi.test',
  '',
  now(),
  '{}'::jsonb,
  '{"display_name":"Release Admin"}'::jsonb,
  now(),
  now()
);

update public.profiles
set is_active = true
where id = '50000000-0000-4000-8000-000000000001';

insert into public.user_roles(user_id, role_code, granted_by)
values (
  '50000000-0000-4000-8000-000000000001',
  'ADMIN',
  '50000000-0000-4000-8000-000000000001'
);

insert into public.clients(id, code, full_name)
values (
  '51000000-0000-4000-8000-000000000001',
  'CLI-RELEASE-TEST',
  'Cliente de liberación'
);

insert into public.products(id, code, name, category_id)
select
  '52000000-0000-4000-8000-000000000001',
  'PROD-RELEASE-TEST',
  'Acrílico de prueba',
  id
from public.product_categories
where code = 'ACRYLIC';

insert into public.product_variants(
  id,
  product_id,
  sku,
  variant_name,
  sale_price,
  currency_code
)
values (
  '53000000-0000-4000-8000-000000000001',
  '52000000-0000-4000-8000-000000000001',
  'SKU-RELEASE-TEST',
  'Estándar',
  30,
  'PEN'
);

insert into public.sales(
  id,
  code,
  client_id,
  sale_type_code,
  sales_channel_code,
  currency_code,
  commercial_state_code,
  payment_state_code,
  delivery_state_code,
  sold_at,
  reserved_at,
  due_at
)
values (
  '54000000-0000-4000-8000-000000000001',
  'VEN-RELEASE-TEST',
  '51000000-0000-4000-8000-000000000001',
  'REGULAR',
  'WHATSAPP',
  'PEN',
  'RESERVED',
  'UNPAID',
  'PENDING',
  now() - interval '25 hours',
  now() - interval '25 hours',
  now() + interval '10 days'
);

insert into public.sale_items(
  id,
  sale_id,
  variant_id,
  quantity,
  original_unit_price,
  final_unit_price
)
values (
  '55000000-0000-4000-8000-000000000001',
  '54000000-0000-4000-8000-000000000001',
  '53000000-0000-4000-8000-000000000001',
  1,
  30,
  30
);

select public.refresh_sale_totals('54000000-0000-4000-8000-000000000001');

select set_config(
  'app.user_id',
  '50000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select ok(
  to_regprocedure('public.get_sale_release_quote_v2(uuid)') is not null,
  'Existe el cotizador de liberación por línea'
);

select is(
  (
    public.get_sale_release_quote_v2(
      '55000000-0000-4000-8000-000000000001'
    ) ->> 'categoryCode'
  ),
  'ACRYLIC',
  'La cotización identifica la categoría real'
);

select is(
  (
    public.get_sale_release_quote_v2(
      '55000000-0000-4000-8000-000000000001'
    ) ->> 'suggestedReleasePenaltyAmount'
  )::numeric,
  3.00::numeric,
  'Después de 24 horas el acrílico propone S/3'
);

select is(
  (
    public.get_sale_release_quote_v2(
      '55000000-0000-4000-8000-000000000001'
    ) #>> '{rule,scope}'
  ),
  'SALE_LINE',
  'La penalidad se calcula por línea de venta'
);

select lives_ok(
  $test$
    select public.request_sale_release_v2(
      '55000000-0000-4000-8000-000000000001',
      'El cliente canceló el producto reservado',
      null
    )
  $test$,
  'La solicitud acepta la penalidad sugerida'
);

select results_eq(
  $$
    select sale_item_id, penalty_amount
    from public.release_requests
    where sale_item_id = '55000000-0000-4000-8000-000000000001'
  $$,
  $$
    values (
      '55000000-0000-4000-8000-000000000001'::uuid,
      3.00::numeric
    )
  $$,
  'La solicitud conserva línea e importe sugerido'
);

reset role;
select * from finish();
rollback;
