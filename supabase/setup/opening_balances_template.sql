-- Ejecutar una sola vez antes de registrar movimientos financieros.
-- Reemplace los importes por los saldos aprobados por el negocio.

begin;
select set_config('app.allow_account_balance_update', 'true', true);

update public.financial_accounts
set opening_balance = case code
  when 'BCP-PEN' then 0.00
  when 'SCOTIABANK-PEN' then 0.00
  when 'YAPE-PEN' then 0.00
  when 'CASH-PEN' then 0.00
  else opening_balance
end,
current_balance = case code
  when 'BCP-PEN' then 0.00
  when 'SCOTIABANK-PEN' then 0.00
  when 'YAPE-PEN' then 0.00
  when 'CASH-PEN' then 0.00
  else current_balance
end,
balance_as_of = now()
where code in ('BCP-PEN', 'SCOTIABANK-PEN', 'YAPE-PEN', 'CASH-PEN');

commit;
