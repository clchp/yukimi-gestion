begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(3);

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
values
  (
    '10000000-0000-4000-8000-000000000001',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-admin@yukimi.test',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"RLS Admin"}'::jsonb,
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-inactive@yukimi.test',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"RLS Inactive"}'::jsonb,
    now(),
    now()
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '00000000-0000-0000-0000-000000000000',
    'authenticated',
    'authenticated',
    'rls-no-role@yukimi.test',
    '',
    now(),
    '{}'::jsonb,
    '{"display_name":"RLS No Role"}'::jsonb,
    now(),
    now()
  );

update public.profiles
set is_active = true
where id in (
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003'
);

insert into public.user_roles(user_id, role_code, granted_by)
values
  (
    '10000000-0000-4000-8000-000000000001',
    'ADMIN',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '10000000-0000-4000-8000-000000000002',
    'ADMIN',
    '10000000-0000-4000-8000-000000000001'
  );

insert into public.clients(id, code, full_name)
values (
  '20000000-0000-4000-8000-000000000001',
  'CLI-RLS-TEST',
  'Cliente visible para prueba RLS'
);

set local role authenticated;

select set_config(
  'app.user_id',
  '10000000-0000-4000-8000-000000000001',
  true
);
select results_eq(
  $$select count(*)::bigint from public.clients where code = 'CLI-RLS-TEST'$$,
  $$values (1::bigint)$$,
  'Una administradora activa puede consultar clientes'
);

select set_config(
  'app.user_id',
  '10000000-0000-4000-8000-000000000002',
  true
);
select results_eq(
  $$select count(*)::bigint from public.clients where code = 'CLI-RLS-TEST'$$,
  $$values (0::bigint)$$,
  'Una administradora inactiva no puede consultar clientes'
);

select set_config(
  'app.user_id',
  '10000000-0000-4000-8000-000000000003',
  true
);
select results_eq(
  $$select count(*)::bigint from public.clients where code = 'CLI-RLS-TEST'$$,
  $$values (0::bigint)$$,
  'Una usuaria activa sin rol ADMIN no puede consultar clientes'
);

reset role;
select * from finish();
rollback;
