-- Yukimi Gestión
-- Migración 030: obligaciones detalladas de tarjeta y alerta anticipada

begin;

alter table public.obligations
  add column if not exists card_bank_name text,
  add column if not exists card_alias text,
  add column if not exists card_last_four char(4),
  add column if not exists statement_closing_date date,
  add column if not exists installment_count integer
    check (installment_count is null or installment_count > 0),
  add column if not exists installment_number integer
    check (installment_number is null or installment_number > 0),
  add column if not exists default_payment_account_id uuid
    references public.financial_accounts(id) on delete restrict,
  add constraint ck_obligation_installment_position
    check (
      installment_number is null
      or installment_count is null
      or installment_number <= installment_count
    );

insert into public.business_settings(
  setting_key,
  setting_value,
  description,
  value_type,
  is_sensitive
)
values (
  'finance.credit_card_policy',
  jsonb_build_object(
    'alertDaysBefore', 15,
    'installmentTrackingMode', 'PURCHASE_OR_STATEMENT',
    'paymentAccountRequired', false,
    'paymentAccountStatus', 'AWAITING_SCOTIABANK_ACCOUNT_CONFIRMATION'
  ),
  'Configuración editable de tarjetas usadas para mercadería e importaciones.',
  'JSON',
  true
)
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    description = excluded.description,
    value_type = excluded.value_type,
    is_sensitive = excluded.is_sensitive,
    updated_at = now();

create or replace function public.create_obligation_v2(
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_input jsonb := p_input;
  v_type text := upper(btrim(p_input ->> 'obligationType'));
  v_result jsonb;
  v_obligation public.obligations%rowtype;
  v_installment_count integer;
  v_installment_number integer;
  v_payment_account_id uuid;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if v_type = 'CREDIT_CARD' then
    if length(btrim(coalesce(p_input ->> 'cardBankName', ''))) < 2 then
      raise exception 'Registra el banco de la tarjeta.';
    end if;
    if length(btrim(coalesce(p_input ->> 'cardAlias', ''))) < 2 then
      raise exception 'Registra un alias para identificar la tarjeta.';
    end if;
    if coalesce(p_input ->> 'cardLastFour', '') !~ '^[0-9]{4}$' then
      raise exception 'Los últimos cuatro dígitos deben ser numéricos.';
    end if;
    if nullif(p_input ->> 'statementClosingDate', '') is null then
      raise exception 'Registra la fecha de cierre del estado de cuenta.';
    end if;

    v_installment_count := coalesce(
      nullif(p_input ->> 'installmentCount', '')::integer,
      1
    );
    v_installment_number := coalesce(
      nullif(p_input ->> 'installmentNumber', '')::integer,
      1
    );
    if v_installment_count <= 0
       or v_installment_number <= 0
       or v_installment_number > v_installment_count then
      raise exception 'La cuota registrada no es válida.';
    end if;

    v_payment_account_id := nullif(
      p_input ->> 'defaultPaymentAccountId',
      ''
    )::uuid;
    if v_payment_account_id is not null and not exists(
      select 1
      from public.financial_accounts
      where id = v_payment_account_id
        and is_active = true
    ) then
      raise exception 'La cuenta prevista para pagar la tarjeta no está activa.';
    end if;

    v_input := jsonb_set(v_input, '{alertDaysBefore}', '15'::jsonb, true);
  end if;

  v_result := public.create_obligation_v1(v_input, p_idempotency_key);

  update public.obligations
  set card_bank_name = case when v_type = 'CREDIT_CARD'
        then btrim(p_input ->> 'cardBankName') else null end,
      card_alias = case when v_type = 'CREDIT_CARD'
        then btrim(p_input ->> 'cardAlias') else null end,
      card_last_four = case when v_type = 'CREDIT_CARD'
        then p_input ->> 'cardLastFour' else null end,
      statement_closing_date = case when v_type = 'CREDIT_CARD'
        then (p_input ->> 'statementClosingDate')::date else null end,
      installment_count = case when v_type = 'CREDIT_CARD'
        then v_installment_count else null end,
      installment_number = case when v_type = 'CREDIT_CARD'
        then v_installment_number else null end,
      default_payment_account_id = case when v_type = 'CREDIT_CARD'
        then v_payment_account_id else null end,
      metadata = metadata || case when v_type = 'CREDIT_CARD'
        then jsonb_build_object(
          'alertDaysBefore', 15,
          'installmentTrackingMode', 'PURCHASE_OR_STATEMENT',
          'paymentAccountConfirmed',
            v_payment_account_id is not null
        )
        else '{}'::jsonb
      end
  where id = (v_result ->> 'id')::uuid
  returning * into v_obligation;

  return jsonb_build_object(
    'id', v_obligation.id,
    'code', v_obligation.code,
    'stateCode', v_obligation.status,
    'version', v_obligation.version
  );
end;
$$;

revoke all on function public.create_obligation_v2(jsonb, text) from public, anon;
grant execute on function public.create_obligation_v2(jsonb, text) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
