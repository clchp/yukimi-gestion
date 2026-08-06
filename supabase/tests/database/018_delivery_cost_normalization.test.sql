begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(3);

select has_function(
  'private',
  'normalize_delivery_shipping_cost',
  array[]::text[],
  'Existe la normalización del costo pagado directamente por el cliente'
);

select trigger_is(
  'public',
  'deliveries',
  'trg_normalize_delivery_shipping_cost',
  'private',
  'normalize_delivery_shipping_cost',
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
