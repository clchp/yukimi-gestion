begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(3);

select ok(
  to_regprocedure('public.cancel_sale_draft_v1(uuid,bigint)') is not null,
  'Existe la función para eliminar borradores'
);
select ok(
  position(
    'status = ''CANCELLED'''
    in pg_get_functiondef('public.cancel_sale_draft_v1(uuid,bigint)'::regprocedure)
  ) > 0,
  'La eliminación conserva el borrador como cancelado para auditoría'
);
select ok(
  position(
    'version = p_expected_version'
    in pg_get_functiondef('public.cancel_sale_draft_v1(uuid,bigint)'::regprocedure)
  ) > 0,
  'La eliminación protege contra cambios concurrentes'
);

select * from finish();
rollback;
