-- Yukimi Gestión
-- Comprobaciones de la migración 022
-- Resultado correcto: Success. No rows returned

do $$
declare
  v_definition text;
begin
  if not exists (
    select 1
      from information_schema.columns
     where table_schema = 'public'
       and table_name = 'financial_transactions'
       and column_name = 'reversal_of_id'
  ) then
    raise exception 'No existe public.financial_transactions.reversal_of_id.';
  end if;

  if to_regprocedure('public.reverse_financial_transaction_v1(uuid,text,text)') is null then
    raise exception 'No existe public.reverse_financial_transaction_v1(uuid,text,text).';
  end if;

  select pg_catalog.pg_get_functiondef(
           'public.reverse_financial_transaction_v1(uuid,text,text)'::regprocedure
         )
    into v_definition;

  if pg_catalog.strpos(v_definition, 'reversal_of_id') = 0 then
    raise exception 'La función de reversión todavía no utiliza reversal_of_id.';
  end if;
end;
$$;
