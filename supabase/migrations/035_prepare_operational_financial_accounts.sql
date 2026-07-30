-- Yukimi Gestión
-- Migración 035: prepara las cuentas operativas confirmadas sin registrar datos sensibles.

begin;

-- Conserva los UUID y las referencias históricas de las cuentas sembradas en la
-- configuración inicial. Solo normaliza sus códigos y nombres operativos.
update public.financial_accounts
set code = 'BCP_MAIN',
    name = 'BCP principal',
    institution_name = 'BCP',
    is_active = true,
    updated_at = now()
where code = 'BCP-PEN'
  and not exists (
    select 1 from public.financial_accounts where code = 'BCP_MAIN'
  );

update public.financial_accounts
set code = 'SCOTIABANK_MAIN',
    name = 'Scotiabank principal',
    institution_name = 'Scotiabank',
    is_active = true,
    updated_at = now()
where code = 'SCOTIABANK-PEN'
  and not exists (
    select 1 from public.financial_accounts where code = 'SCOTIABANK_MAIN'
  );

update public.financial_accounts
set code = 'YAPE_1',
    name = 'Yape 1',
    institution_name = 'Yape',
    is_active = true,
    updated_at = now()
where code = 'YAPE-PEN'
  and not exists (
    select 1 from public.financial_accounts where code = 'YAPE_1'
  );

-- Garantiza que las cuatro cuentas existan también en instalaciones donde la
-- semilla histórica haya sido modificada. Los números y titulares quedan nulos
-- hasta que una administradora ingrese los datos reales desde Configuración.
insert into public.financial_accounts (
  code,
  name,
  account_type_code,
  currency_code,
  institution_name,
  masked_account_number,
  owner_name,
  opening_balance,
  current_balance,
  is_active
)
values
  ('BCP_MAIN', 'BCP principal', 'BANK', 'PEN', 'BCP', null, null, 0, 0, true),
  ('SCOTIABANK_MAIN', 'Scotiabank principal', 'BANK', 'PEN', 'Scotiabank', null, null, 0, 0, true),
  ('YAPE_1', 'Yape 1', 'WALLET', 'PEN', 'Yape', null, null, 0, 0, true),
  ('YAPE_2', 'Yape 2', 'WALLET', 'PEN', 'Yape', null, null, 0, 0, true)
on conflict (code) do update set
  name = excluded.name,
  account_type_code = excluded.account_type_code,
  currency_code = excluded.currency_code,
  institution_name = excluded.institution_name,
  is_active = true,
  updated_at = now();

commit;
