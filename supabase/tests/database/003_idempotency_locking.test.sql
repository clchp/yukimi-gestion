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
  '30000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated',
  'authenticated',
  'idempotency-admin@yukimi.test',
  '',
  now(),
  '{}'::jsonb,
  '{"display_name":"Idempotency Admin"}'::jsonb,
  now(),
  now()
);

update public.profiles
set is_active = true
where id = '30000000-0000-4000-8000-000000000001';

insert into public.user_roles(user_id, role_code, granted_by)
values (
  '30000000-0000-4000-8000-000000000001',
  'ADMIN',
  '30000000-0000-4000-8000-000000000001'
);

select set_config(
  'app.user_id',
  '30000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select lives_ok(
  $test$
    select public.create_client_v1(
      '{"fullName":"Cliente idempotente SQL"}'::jsonb,
      'pgtap-create-client-001'
    )
  $test$,
  'La primera creación idempotente funciona'
);

select lives_ok(
  $test$
    select public.create_client_v1(
      '{"fullName":"Cliente idempotente SQL"}'::jsonb,
      'pgtap-create-client-001'
    )
  $test$,
  'Repetir la misma clave idempotente no falla'
);

select results_eq(
  $$select count(*)::bigint from public.clients where full_name = 'Cliente idempotente SQL'$$,
  $$values (1::bigint)$$,
  'La repetición crea un solo cliente'
);

select results_eq(
  $$
    select count(*)::bigint
    from public.idempotency_keys
    where scope = 'CREATE_CLIENT'
      and idempotency_key = 'pgtap-create-client-001'
  $$,
  $$values (1::bigint)$$,
  'La operación conserva una sola clave de idempotencia'
);

select lives_ok(
  $test$
    select public.update_client_v1(
      (
        select id
        from public.clients
        where full_name = 'Cliente idempotente SQL'
      ),
      1,
      '{"fullName":"Cliente actualizado una vez"}'::jsonb
    )
  $test$,
  'La actualización con la versión vigente funciona'
);

select throws_ok(
  $test$
    select public.update_client_v1(
      (
        select id
        from public.clients
        where full_name = 'Cliente actualizado una vez'
      ),
      1,
      '{"fullName":"Actualización obsoleta"}'::jsonb
    )
  $test$,
  '40001',
  'El cliente fue modificado por otra administradora.',
  'Una versión obsoleta es rechazada'
);

reset role;
select * from finish();
rollback;
