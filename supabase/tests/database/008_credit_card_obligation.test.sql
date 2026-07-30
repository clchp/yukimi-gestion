begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(7);

insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '80000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'card-admin@yukimi.test', '', now(),
  '{}'::jsonb, '{"display_name":"Card Admin"}'::jsonb, now(), now()
);

update public.profiles
set is_active = true
where id = '80000000-0000-4000-8000-000000000001';

insert into public.user_roles(user_id, role_code, granted_by)
values (
  '80000000-0000-4000-8000-000000000001',
  'ADMIN',
  '80000000-0000-4000-8000-000000000001'
);

select set_config(
  'app.user_id',
  '80000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select ok(
  to_regprocedure('public.create_obligation_v2(jsonb,text)') is not null,
  'Existe el registro detallado de tarjeta'
);

select lives_ok(
  $test$
    select public.create_obligation_v2(
      jsonb_build_object(
        'obligationType', 'CREDIT_CARD',
        'title', 'Estado de cuenta de importación',
        'amount', 620,
        'currencyCode', 'PEN',
        'dueDate', (current_date + 30)::text,
        'cardBankName', 'Banco de prueba',
        'cardAlias', 'Tarjeta mercadería',
        'cardLastFour', '1234',
        'statementClosingDate', (current_date + 10)::text,
        'installmentCount', 3,
        'installmentNumber', 1
      ),
      'card-obligation-test'
    )
  $test$,
  'La obligación de tarjeta se registra'
);

select is(
  alert_days_before,
  15,
  'La alerta de tarjeta queda a quince días'
)
from public.obligations
where title = 'Estado de cuenta de importación';

select is(
  card_last_four,
  '1234'::char(4),
  'Se conservan solo los últimos cuatro dígitos'
)
from public.obligations
where title = 'Estado de cuenta de importación';

select is(
  installment_count,
  3,
  'Se registra el total de cuotas'
)
from public.obligations
where title = 'Estado de cuenta de importación';

select is(
  installment_number,
  1,
  'Se registra la cuota actual'
)
from public.obligations
where title = 'Estado de cuenta de importación';

select is(
  (
    select setting_value ->> 'paymentAccountStatus'
    from public.business_settings
    where setting_key = 'finance.credit_card_policy'
  ),
  'AWAITING_SCOTIABANK_ACCOUNT_CONFIRMATION',
  'La cuenta Scotiabank queda pendiente de confirmación exacta'
);

reset role;
select * from finish();
rollback;
