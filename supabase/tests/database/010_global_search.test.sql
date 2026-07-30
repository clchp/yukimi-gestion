begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(4);

insert into auth.users(
  id, instance_id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '90000000-0000-4000-8000-000000000001',
  '00000000-0000-0000-0000-000000000000',
  'authenticated', 'authenticated', 'search-admin@yukimi.test', '', now(),
  '{}'::jsonb, '{"display_name":"Search Admin"}'::jsonb, now(), now()
);

update public.profiles
set is_active = true
where id = '90000000-0000-4000-8000-000000000001';

insert into public.user_roles(user_id, role_code, granted_by)
values (
  '90000000-0000-4000-8000-000000000001',
  'ADMIN',
  '90000000-0000-4000-8000-000000000001'
);

insert into public.clients(id, code, full_name, phone)
values (
  '91000000-0000-4000-8000-000000000001',
  'CLI-SEARCH-TEST',
  'Andrea Búsqueda Global',
  '999111222'
);

select set_config(
  'app.user_id',
  '90000000-0000-4000-8000-000000000001',
  true
);
set local role authenticated;

select ok(
  to_regprocedure('public.global_search_v1(text,integer)') is not null,
  'Existe la búsqueda global'
);

select is(
  jsonb_array_length(public.global_search_v1('A', 12) -> 'items'),
  0,
  'Una consulta demasiado corta no busca'
);

select is(
  public.global_search_v1('Andrea Búsqueda', 12)
    #>> '{items,0,entityType}',
  'CLIENT',
  'La búsqueda encuentra datos reales del cliente'
);

select is(
  public.global_search_v1('999111222', 12)
    #>> '{items,0,route}',
  '/clientes/91000000-0000-4000-8000-000000000001',
  'El resultado lleva al detalle correcto'
);

reset role;
select * from finish();
rollback;
