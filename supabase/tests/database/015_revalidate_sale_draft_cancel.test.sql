begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(3);

select ok(
  to_regprocedure('public.cancel_sale_draft_v1(uuid,bigint)') is not null,
  'La función de eliminación de borradores está publicada'
);
select ok(
  position(
    'status = ''CANCELLED'''
    in pg_get_functiondef('public.cancel_sale_draft_v1(uuid,bigint)'::regprocedure)
  ) > 0,
  'La eliminación sigue siendo lógica y auditable'
);
select ok(
  has_function_privilege(
    'authenticated',
    'public.cancel_sale_draft_v1(uuid,bigint)',
    'EXECUTE'
  ),
  'El rol autenticado puede invocar la función mediante PostgREST'
);

select * from finish();
rollback;
