begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(2);

select ok(
  pg_get_functiondef('public.reverse_payment(uuid,text,text)'::regprocedure)
    ~ '(?s)update public\.financial_transactions\s+set state_code = ''REVERSED''\s+where',
  'La reversión conserva el movimiento compensatorio y marca la transacción original'
);

select ok(
  pg_get_functiondef('public.reverse_payment(uuid,text,text)'::regprocedure)
    !~ '(?s)update public\.financial_transactions\s+set\s+state_code = ''REVERSED''\s*,\s*updated_by',
  'La transacción financiera no intenta escribir una columna updated_by inexistente'
);

select * from finish();
rollback;
