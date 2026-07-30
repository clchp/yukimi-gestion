begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(10);

select ok(
  to_regclass('public.clients') is not null,
  'La tabla de clientes existe'
);

select is(
  (
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relrowsecurity
  ),
  0::bigint,
  'Todas las tablas públicas tienen RLS habilitado'
);

select is(
  (
    select count(*)::bigint
    from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
      and not c.relforcerowsecurity
  ),
  0::bigint,
  'Todas las tablas públicas fuerzan RLS'
);

select is(
  (
    select count(*)::bigint
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname in ('public', 'private')
      and p.prosecdef
      and not exists (
        select 1
        from unnest(coalesce(p.proconfig, '{}'::text[])) as setting
        where setting like 'search_path=%'
      )
  ),
  0::bigint,
  'Toda función SECURITY DEFINER fija search_path'
);

select ok(
  not has_table_privilege('anon', 'public.clients', 'SELECT'),
  'anon no puede consultar clientes'
);

select ok(
  not has_table_privilege('anon', 'public.payments', 'SELECT'),
  'anon no puede consultar pagos'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_client_v1(jsonb,text)',
    'EXECUTE'
  ),
  'authenticated puede ejecutar el RPC controlado de creación de clientes'
);

select is(
  (
    select count(*)::bigint
    from storage.buckets
    where id in (
      'product-images',
      'payment-proofs',
      'receipt-files',
      'expense-proofs',
      'import-files',
      'delivery-files',
      'report-exports'
    )
  ),
  7::bigint,
  'Existen los siete buckets privados esperados'
);

select is(
  (
    select count(*)::bigint
    from storage.buckets
    where id in (
      'product-images',
      'payment-proofs',
      'receipt-files',
      'expense-proofs',
      'import-files',
      'delivery-files',
      'report-exports'
    )
      and public
  ),
  0::bigint,
  'Ningún bucket de Yukimi es público'
);

select is(
  (
    select count(*)::bigint
    from pg_policies
    where schemaname = 'storage'
      and tablename = 'objects'
      and policyname in (
        'yukimi_storage_select',
        'yukimi_storage_insert',
        'yukimi_storage_update'
      )
  ),
  3::bigint,
  'Storage tiene políticas explícitas de lectura, inserción y actualización'
);

select * from finish();
rollback;
