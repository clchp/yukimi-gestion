-- Yukimi Gestión
-- Comprobaciones no destructivas de la Fase 6

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'payments' and column_name = 'rejection_reason'
  ) then raise exception 'Falta payments.rejection_reason'; end if;

  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'sales_receipts' and column_name = 'annulment_reason'
  ) then raise exception 'Falta sales_receipts.annulment_reason'; end if;

  if to_regprocedure('public.get_payment_support_v1()') is null then raise exception 'Falta get_payment_support_v1'; end if;
  if to_regprocedure('public.get_sale_financial_detail_v1(uuid)') is null then raise exception 'Falta get_sale_financial_detail_v1'; end if;
  if to_regprocedure('public.create_payment_v1(uuid,jsonb,text)') is null then raise exception 'Falta create_payment_v1'; end if;
  if to_regprocedure('public.confirm_payment_v1(uuid,text)') is null then raise exception 'Falta confirm_payment_v1'; end if;
  if to_regprocedure('public.reject_payment_v1(uuid,text)') is null then raise exception 'Falta reject_payment_v1'; end if;
  if to_regprocedure('public.reverse_payment_v1(uuid,text,text)') is null then raise exception 'Falta reverse_payment_v1'; end if;
  if to_regprocedure('public.create_receipt_v1(uuid,jsonb,text)') is null then raise exception 'Falta create_receipt_v1'; end if;
  if to_regprocedure('public.annul_receipt_v1(uuid,text)') is null then raise exception 'Falta annul_receipt_v1'; end if;
  if to_regprocedure('public.create_credit_note_v1(uuid,jsonb)') is null then raise exception 'Falta create_credit_note_v1'; end if;
  if to_regprocedure('public.calculate_late_penalty_v1(uuid)') is null then raise exception 'Falta calculate_late_penalty_v1'; end if;
  if to_regprocedure('public.waive_penalty_v1(uuid,text)') is null then raise exception 'Falta waive_penalty_v1'; end if;

  if not has_function_privilege('authenticated', 'public.create_payment_v1(uuid,jsonb,text)', 'EXECUTE') then
    raise exception 'authenticated no puede ejecutar create_payment_v1';
  end if;

  if (select count(*) from public.payment_methods where is_active) < 3 then
    raise exception 'Deben existir Yape, transferencia y efectivo activos';
  end if;

  if not exists (select 1 from public.financial_accounts where code = 'YAPE-PEN' and is_active) then
    raise exception 'Falta la cuenta YAPE-PEN';
  end if;

  if not exists (select 1 from public.financial_accounts where code = 'CASH-PEN' and is_active) then
    raise exception 'Falta la cuenta CASH-PEN';
  end if;

  if not exists (select 1 from storage.buckets where id = 'payment-proofs' and public = false) then
    raise exception 'Falta el bucket privado payment-proofs';
  end if;

  if not exists (select 1 from storage.buckets where id = 'receipt-files' and public = false) then
    raise exception 'Falta el bucket privado receipt-files';
  end if;

  if not exists (
    select 1 from public.business_settings where setting_key = 'penalties.late_daily'
  ) then raise exception 'Falta la regla penalties.late_daily'; end if;
end;
$$;
