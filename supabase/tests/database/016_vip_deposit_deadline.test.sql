begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(4);

select has_column(
  'public',
  'sales',
  'negotiated_minimum_deposit_due_at',
  'Las ventas guardan la fecha límite del adelanto VIP'
);

select ok(
  position(
    'negotiatedMinimumDepositDueAt'
    in pg_get_functiondef('public.create_sale_v3(jsonb,text)'::regprocedure)
  ) > 0,
  'La confirmación de venta procesa la fecha límite del adelanto'
);

select ok(
  position(
    'Indica la fecha límite para pagar el adelanto mínimo'
    in pg_get_functiondef('public.create_sale_v3(jsonb,text)'::regprocedure)
  ) > 0,
  'La fecha es obligatoria cuando el adelanto es mayor que cero'
);

select ok(
  position(
    'negotiatedMinimumDepositDueAt'
    in pg_get_functiondef('public.get_sale_detail_v3(uuid)'::regprocedure)
  ) > 0,
  'El detalle de venta expone la fecha límite registrada'
);

select * from finish();
rollback;
