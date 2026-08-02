begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(3);

select ok(
  to_regprocedure('public.cancel_sale_draft_v1(uuid,bigint)') is not null,
  'Existe la función para eliminar borradores'
);
select like(
  pg_get_functiondef('public.cancel_sale_draft_v1(uuid,bigint)'::regprocedure),
  '%status = ''CANCELLED''%',
  'La eliminación conserva el borrador como cancelado para auditoría'
);
select like(
  pg_get_functiondef('public.cancel_sale_draft_v1(uuid,bigint)'::regprocedure),
  '%version = p_expected_version%',
  'La eliminación protege contra cambios concurrentes'
);

select * from finish();
rollback;
