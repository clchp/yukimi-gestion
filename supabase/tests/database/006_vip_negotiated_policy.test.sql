begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(7);

select is(
  public.business_settings.setting_value #>> '{mode}',
  'NEGOTIATED_PER_SALE',
  'La política VIP se negocia por venta'
)
from public.business_settings
where setting_key = 'vip.separation_policy';

select is(
  public.business_settings.setting_value #>> '{globalLimitEnabled}',
  'false',
  'El límite monetario VIP global queda desactivado'
)
from public.business_settings
where setting_key = 'vip.separation_policy';

insert into public.clients(id, code, full_name, is_vip)
values (
  '61000000-0000-4000-8000-000000000001',
  'CLI-VIP-POLICY-TEST',
  'Cliente VIP de prueba',
  true
);

insert into public.client_vip_profiles(
  client_id,
  can_reserve_without_deposit,
  separation_limit_amount,
  separation_limit_currency,
  payment_term_days
)
values (
  '61000000-0000-4000-8000-000000000001',
  true,
  500,
  'PEN',
  30
);

select is(
  separation_limit_amount,
  null,
  'El límite global anterior no queda activo'
)
from public.client_vip_profiles
where client_id = '61000000-0000-4000-8000-000000000001';

select is(
  legacy_separation_limit_amount,
  500.00::numeric,
  'El límite anterior se conserva como dato histórico'
)
from public.client_vip_profiles
where client_id = '61000000-0000-4000-8000-000000000001';

select is(
  separation_policy,
  'NEGOTIATED_PER_SALE',
  'El perfil expone la política vigente'
)
from public.client_vip_profiles
where client_id = '61000000-0000-4000-8000-000000000001';

select ok(
  to_regprocedure('public.create_sale_v2(jsonb,text)') is not null,
  'Existe la creación de venta con acuerdo VIP'
);

select ok(
  (
    select count(*) = 3
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sales'
      and column_name in (
        'negotiated_minimum_deposit_amount',
        'negotiated_minimum_deposit_reason',
        'negotiated_terms_snapshot'
      )
  ),
  'Ventas conserva el acuerdo de separación negociado'
);

select * from finish();
rollback;
