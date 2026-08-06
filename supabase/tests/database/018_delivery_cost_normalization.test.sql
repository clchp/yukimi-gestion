begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(3);

select ok(
  to_regprocedure('private.normalize_delivery_shipping_cost()') is not null,
  'Existe la normalización del costo pagado directamente por el cliente'
);

select ok(
  exists (
    select 1
    from pg_trigger trigger_row
    join pg_class table_row on table_row.oid = trigger_row.tgrelid
    join pg_namespace schema_row on schema_row.oid = table_row.relnamespace
    where schema_row.nspname = 'public'
      and table_row.relname = 'deliveries'
      and trigger_row.tgname = 'trg_normalize_delivery_shipping_cost'
      and not trigger_row.tgisinternal
  ),
  'Las entregas normalizan el costo antes de guardar'
);

select ok(
  position(
    'new.shipping_cost := 0'
    in pg_get_functiondef('private.normalize_delivery_shipping_cost()'::regprocedure)
  ) > 0,
  'El costo se fuerza a cero cuando no pertenece a Yukimi'
);

select * from finish();
rollback;
