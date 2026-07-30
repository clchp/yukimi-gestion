-- Yukimi Gestión
-- Comprobaciones Fase 9: finanzas, caja, préstamos y conciliación
-- Resultado correcto: Success. No rows returned

do $$
declare
  v_missing text;
begin
  select string_agg(required.name, ', ' order by required.name)
  into v_missing
  from (values
    ('get_finance_support_v1'),
    ('get_finance_dashboard_v1'),
    ('list_financial_transactions_v1'),
    ('create_manual_financial_transaction_v1'),
    ('create_financial_transfer_v1'),
    ('reverse_financial_transaction_v1'),
    ('create_obligation_v1'),
    ('pay_obligation_v1'),
    ('create_received_loan_v1'),
    ('pay_loan_installment_v1'),
    ('create_cash_closure_v1'),
    ('import_bank_statement_v1'),
    ('get_bank_reconciliation_v1'),
    ('confirm_bank_reconciliation_v1')
  ) required(name)
  where not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = required.name
  );

  if v_missing is not null then
    raise exception 'Faltan funciones de la Fase 9: %', v_missing;
  end if;

  if not exists(select 1 from storage.buckets where id = 'financial-files' and public = false) then
    raise exception 'No existe el bucket privado financial-files.';
  end if;

  if not exists(select 1 from public.financial_categories where code = 'TRANSFERS' and nature = 'TRANSFER' and is_active) then
    raise exception 'No existe la categoría de transferencias internas.';
  end if;

  if not exists(select 1 from public.financial_categories where code = 'CASH_DIFFERENCE' and nature = 'ADJUSTMENT' and is_active) then
    raise exception 'No existe la categoría de diferencias de caja.';
  end if;

  if not exists(select 1 from public.financial_accounts where code = 'BCP-PEN' and is_active)
     or not exists(select 1 from public.financial_accounts where code = 'YAPE-PEN' and is_active)
     or not exists(select 1 from public.financial_accounts where code = 'CASH-PEN' and is_active) then
    raise exception 'Faltan cuentas financieras iniciales activas.';
  end if;

  if exists (
    select 1
    from public.financial_transaction_entries e
    join public.financial_transactions ft on ft.id = e.financial_transaction_id
    join public.financial_accounts fa on fa.id = e.financial_account_id
    where trim(ft.currency_code) <> trim(fa.currency_code)
  ) then
    raise exception 'Existen líneas financieras con moneda distinta a su cuenta.';
  end if;
end;
$$;
