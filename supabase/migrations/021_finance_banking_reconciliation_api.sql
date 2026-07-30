-- Yukimi Gestión
-- Migración 021: finanzas, cuentas, obligaciones, préstamos, caja y conciliación bancaria

begin;

insert into public.financial_transaction_types(code, name, description)
values
  ('LOAN_GRANTED', 'Préstamo otorgado', 'Salida de dinero por un préstamo concedido a un tercero.'),
  ('LOAN_COLLECTION', 'Cobro de préstamo', 'Ingreso por devolución de un préstamo concedido.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true;

insert into public.financial_categories(code, name, nature, description, sort_order)
values
  ('BANK_FEES', 'Comisiones bancarias', 'EXPENSE', 'Comisiones y cargos de entidades financieras.', 175),
  ('SERVICES', 'Servicios', 'EXPENSE', 'Servicios operativos y administrativos.', 176),
  ('CASH_DIFFERENCE', 'Diferencia de caja', 'ADJUSTMENT', 'Diferencias documentadas durante el cierre de caja.', 910),
  ('TRANSFERS', 'Transferencias internas', 'TRANSFER', 'Movimientos entre cuentas propias.', 920)
on conflict (code) do update set
  name = excluded.name,
  nature = excluded.nature,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'financial-files',
  'financial-files',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create index if not exists ix_financial_transactions_manual_search
  on public.financial_transactions(occurred_at desc, state_code, transaction_type_code);

create index if not exists ix_obligations_open_due
  on public.obligations(due_date, obligation_type)
  where status in ('PENDING','OVERDUE');

create index if not exists ix_bank_rows_batch_status
  on public.bank_statement_rows(batch_id, reconciliation_status, transaction_date desc);

create or replace function private.finance_category_code(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    trim(both '_' from regexp_replace(
      upper(extensions.unaccent(coalesce(p_name, ''))),
      '[^A-Z0-9]+', '_', 'g'
    )),
    50
  );
$$;

create or replace function public.get_finance_support_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fa.id,
        'code', fa.code,
        'name', fa.name,
        'accountTypeCode', fa.account_type_code,
        'currencyCode', trim(fa.currency_code),
        'institutionName', fa.institution_name,
        'currentBalance', fa.current_balance,
        'version', fa.version
      ) order by fa.account_type_code, fa.name)
      from public.financial_accounts fa
      where fa.is_active = true
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fc.id,
        'code', fc.code,
        'name', fc.name,
        'nature', fc.nature,
        'description', fc.description
      ) order by fc.sort_order, fc.name)
      from public.financial_categories fc
      where fc.is_active = true
    ), '[]'::jsonb),
    'currencies', coalesce((
      select jsonb_agg(jsonb_build_object('code', trim(c.code), 'name', c.name) order by c.code)
      from public.currencies c
      where c.is_active = true
    ), '[]'::jsonb),
    'obligationTypes', jsonb_build_array(
      jsonb_build_object('code','CREDIT_CARD','name','Tarjeta de crédito'),
      jsonb_build_object('code','SUNAT','name','SUNAT'),
      jsonb_build_object('code','CUSTOMS','name','Aduanas'),
      jsonb_build_object('code','SERVICE','name','Servicio'),
      jsonb_build_object('code','OTHER','name','Otro')
    )
  )
  where private.is_active_admin();
$$;

create or replace function public.get_finance_dashboard_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start date := date_trunc('month', timezone('America/Lima', now()))::date;
  v_end date := (date_trunc('month', timezone('America/Lima', now())) + interval '1 month')::date;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fa.id,
        'code', fa.code,
        'name', fa.name,
        'accountTypeCode', fa.account_type_code,
        'currencyCode', trim(fa.currency_code),
        'currentBalance', fa.current_balance,
        'balanceAsOf', fa.balance_as_of
      ) order by case fa.account_type_code when 'BANK' then 1 when 'WALLET' then 2 when 'CASH' then 3 else 4 end, fa.name)
      from public.financial_accounts fa
      where fa.is_active = true
    ), '[]'::jsonb),
    'monthIncome', coalesce((
      select round(sum(ft.total_amount), 2)
      from public.financial_transactions ft
      where ft.state_code = 'POSTED'
        and (ft.occurred_at at time zone 'America/Lima')::date >= v_start
        and (ft.occurred_at at time zone 'America/Lima')::date < v_end
        and ft.transaction_type_code in ('INCOME','LOAN_RECEIVED','LOAN_COLLECTION')
    ), 0),
    'monthExpense', coalesce((
      select round(sum(ft.total_amount), 2)
      from public.financial_transactions ft
      where ft.state_code = 'POSTED'
        and (ft.occurred_at at time zone 'America/Lima')::date >= v_start
        and (ft.occurred_at at time zone 'America/Lima')::date < v_end
        and ft.transaction_type_code in ('EXPENSE','LOAN_PAYMENT','LOAN_GRANTED','REFUND')
    ), 0),
    'monthlySummary', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', to_char(m.month_start, 'YYYY-MM'),
        'label', to_char(m.month_start, 'Mon'),
        'income', coalesce(s.income, 0),
        'expense', coalesce(s.expense, 0)
      ) order by m.month_start)
      from (
        select generate_series(
          date_trunc('month', timezone('America/Lima', now())) - interval '5 months',
          date_trunc('month', timezone('America/Lima', now())),
          interval '1 month'
        )::date as month_start
      ) m
      left join lateral (
        select
          round(coalesce(sum(ft.total_amount) filter (where ft.transaction_type_code in ('INCOME','LOAN_RECEIVED','LOAN_COLLECTION')), 0), 2) as income,
          round(coalesce(sum(ft.total_amount) filter (where ft.transaction_type_code in ('EXPENSE','LOAN_PAYMENT','LOAN_GRANTED','REFUND')), 0), 2) as expense
        from public.financial_transactions ft
        where ft.state_code = 'POSTED'
          and (ft.occurred_at at time zone 'America/Lima')::date >= m.month_start
          and (ft.occurred_at at time zone 'America/Lima')::date < m.month_start + interval '1 month'
      ) s on true
    ), '[]'::jsonb),
    'obligations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'code', o.code,
        'obligationType', o.obligation_type,
        'title', o.title,
        'amount', o.amount,
        'currencyCode', trim(o.currency_code),
        'dueDate', o.due_date,
        'daysRemaining', o.due_date - timezone('America/Lima', now())::date,
        'status', case when o.status = 'PENDING' and o.due_date < timezone('America/Lima', now())::date then 'OVERDUE' else o.status end,
        'version', o.version
      ) order by o.due_date, o.title)
      from (
        select * from public.obligations
        where status in ('PENDING','OVERDUE')
        order by due_date, title
        limit 10
      ) o
    ), '[]'::jsonb),
    'loans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'code', l.code,
        'lenderName', l.lender_name_snapshot,
        'principalAmount', l.principal_amount,
        'outstandingPrincipal', l.outstanding_principal,
        'currencyCode', trim(l.currency_code),
        'status', l.status,
        'nextDueDate', (
          select min(li.due_date) from public.loan_installments li
          where li.loan_id = l.id and li.status in ('PENDING','PARTIAL','OVERDUE')
        ),
        'nextInstallmentId', (
          select li.id from public.loan_installments li
          where li.loan_id = l.id and li.status in ('PENDING','PARTIAL','OVERDUE')
          order by li.due_date, li.installment_number limit 1
        ),
        'nextInstallmentAmount', (
          select round(li.total_amount - li.paid_amount, 2) from public.loan_installments li
          where li.loan_id = l.id and li.status in ('PENDING','PARTIAL','OVERDUE')
          order by li.due_date, li.installment_number limit 1
        )
      ) order by l.created_at desc)
      from public.loans l
      where l.status in ('ACTIVE','DEFAULTED')
    ), '[]'::jsonb),
    'recentTransactions', coalesce((
      select jsonb_agg(row_payload order by occurred_at desc)
      from (
        select
          ft.occurred_at,
          jsonb_build_object(
            'id', ft.id,
            'code', ft.code,
            'transactionTypeCode', ft.transaction_type_code,
            'stateCode', ft.state_code,
            'description', ft.description,
            'categoryName', fc.name,
            'occurredAt', ft.occurred_at,
            'currencyCode', trim(ft.currency_code),
            'totalAmount', ft.total_amount,
            'sourceType', ft.source_type,
            'isSystemGenerated', ft.is_system_generated,
            'createdByName', p.display_name,
            'accountNames', coalesce((
              select string_agg(distinct fa.name, ', ' order by fa.name)
              from public.financial_transaction_entries e
              join public.financial_accounts fa on fa.id = e.financial_account_id
              where e.financial_transaction_id = ft.id
            ), '')
          ) as row_payload
        from public.financial_transactions ft
        left join public.financial_categories fc on fc.id = ft.category_id
        left join public.profiles p on p.id = ft.created_by
        order by ft.occurred_at desc
        limit 12
      ) q
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.list_financial_transactions_v1(
  p_search text default null,
  p_type text default 'ALL',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := nullif(btrim(p_search), '');
  v_total bigint;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select count(*) into v_total
  from public.financial_transactions ft
  left join public.financial_categories fc on fc.id = ft.category_id
  where (p_type = 'ALL' or ft.transaction_type_code = p_type)
    and (
      v_search is null
      or ft.code ilike '%' || v_search || '%'
      or ft.description ilike '%' || v_search || '%'
      or fc.name ilike '%' || v_search || '%'
      or exists (
        select 1
        from public.financial_transaction_entries e
        join public.financial_accounts fa on fa.id = e.financial_account_id
        where e.financial_transaction_id = ft.id
          and fa.name ilike '%' || v_search || '%'
      )
    );

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'code', q.code,
        'transactionTypeCode', q.transaction_type_code,
        'stateCode', q.state_code,
        'description', q.description,
        'categoryName', q.category_name,
        'occurredAt', q.occurred_at,
        'currencyCode', trim(q.currency_code),
        'totalAmount', q.total_amount,
        'sourceType', q.source_type,
        'isSystemGenerated', q.is_system_generated,
        'createdByName', q.created_by_name,
        'accountNames', q.account_names,
        'reason', q.reason,
        'version', q.version
      ) order by q.occurred_at desc)
      from (
        select
          ft.*,
          fc.name as category_name,
          p.display_name as created_by_name,
          coalesce((
            select string_agg(distinct fa.name, ', ' order by fa.name)
            from public.financial_transaction_entries e
            join public.financial_accounts fa on fa.id = e.financial_account_id
            where e.financial_transaction_id = ft.id
          ), '') as account_names
        from public.financial_transactions ft
        left join public.financial_categories fc on fc.id = ft.category_id
        left join public.profiles p on p.id = ft.created_by
        where (p_type = 'ALL' or ft.transaction_type_code = p_type)
          and (
            v_search is null
            or ft.code ilike '%' || v_search || '%'
            or ft.description ilike '%' || v_search || '%'
            or fc.name ilike '%' || v_search || '%'
            or exists (
              select 1
              from public.financial_transaction_entries e
              join public.financial_accounts fa on fa.id = e.financial_account_id
              where e.financial_transaction_id = ft.id
                and fa.name ilike '%' || v_search || '%'
            )
          )
        order by ft.occurred_at desc
        limit v_page_size offset (v_page - 1) * v_page_size
      ) q
    ), '[]'::jsonb),
    'total', v_total,
    'page', v_page,
    'pageSize', v_page_size
  );
end;
$$;

create or replace function public.create_financial_category_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_name text := btrim(p_input ->> 'name');
  v_nature text := upper(btrim(p_input ->> 'nature'));
  v_code text;
  v_category public.financial_categories%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) < 2 then
    raise exception 'El nombre de la categoría es obligatorio.';
  end if;
  if v_nature not in ('INCOME','EXPENSE','BOTH') then
    raise exception 'Naturaleza de categoría inválida.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('FIN_CATEGORY:' || lower(extensions.unaccent(v_name)), 0));

  select * into v_category
  from public.financial_categories
  where lower(extensions.unaccent(name)) = lower(extensions.unaccent(v_name))
    and is_active = true
  limit 1;

  if found then
    return jsonb_build_object('id', v_category.id, 'code', v_category.code, 'name', v_category.name, 'reused', true);
  end if;

  v_code := private.finance_category_code(v_name);
  if v_code = '' then v_code := 'CATEGORY'; end if;
  if exists(select 1 from public.financial_categories where code = v_code) then
    v_code := left(v_code, 42) || '_' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 7));
  end if;

  insert into public.financial_categories(code, name, nature, description, sort_order, created_by, updated_by)
  values (
    v_code,
    v_name,
    v_nature,
    nullif(btrim(p_input ->> 'description'), ''),
    500,
    v_actor,
    v_actor
  ) returning * into v_category;

  return jsonb_build_object('id', v_category.id, 'code', v_category.code, 'name', v_category.name, 'reused', false);
end;
$$;

create or replace function public.create_manual_financial_transaction_v1(
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_account public.financial_accounts%rowtype;
  v_category public.financial_categories%rowtype;
  v_type text := upper(btrim(p_input ->> 'transactionTypeCode'));
  v_amount numeric(14,2) := round((p_input ->> 'amount')::numeric, 2);
  v_entry numeric(14,2);
  v_transaction public.financial_transactions%rowtype;
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if v_type not in ('INCOME','EXPENSE') then
    raise exception 'Solo se admiten ingresos o gastos manuales.';
  end if;
  if v_amount <= 0 then raise exception 'El importe debe ser mayor que cero.'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'La clave de idempotencia es obligatoria.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('FIN_MANUAL:' || p_idempotency_key, 0));
  select response_payload into v_result from public.idempotency_keys
  where scope = 'FIN_MANUAL' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_result is not null then return v_result; end if;

  select * into v_account from public.financial_accounts
  where id = (p_input ->> 'accountId')::uuid and is_active = true
  for update;
  if not found then raise exception 'La cuenta financiera no existe o está inactiva.' using errcode = 'P0002'; end if;

  select * into v_category from public.financial_categories
  where id = (p_input ->> 'categoryId')::uuid and is_active = true;
  if not found then raise exception 'La categoría financiera no existe o está inactiva.' using errcode = 'P0002'; end if;
  if v_type = 'INCOME' and v_category.nature not in ('INCOME','BOTH') then raise exception 'La categoría no admite ingresos.'; end if;
  if v_type = 'EXPENSE' and v_category.nature not in ('EXPENSE','BOTH') then raise exception 'La categoría no admite gastos.'; end if;
  if v_type = 'EXPENSE' and v_account.current_balance < v_amount then raise exception 'Saldo insuficiente en la cuenta seleccionada.' using errcode = 'P0001'; end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('FIN_MANUAL', p_idempotency_key, v_actor)
  on conflict (scope, idempotency_key) do nothing;

  insert into public.financial_transactions(
    code, transaction_type_code, state_code, category_id, occurred_at, description,
    currency_code, total_amount, idempotency_key, is_system_generated, reason, metadata, created_by
  ) values (
    null,
    v_type,
    'POSTED',
    v_category.id,
    (p_input ->> 'occurredAt')::timestamptz,
    btrim(p_input ->> 'description'),
    v_account.currency_code,
    v_amount,
    p_idempotency_key,
    false,
    nullif(btrim(p_input ->> 'reason'), ''),
    jsonb_strip_nulls(jsonb_build_object(
      'reference', nullif(btrim(p_input ->> 'reference'), ''),
      'notes', nullif(btrim(p_input ->> 'notes'), '')
    )),
    v_actor
  ) returning * into v_transaction;

  v_entry := case when v_type = 'INCOME' then v_amount else -v_amount end;
  insert into public.financial_transaction_entries(financial_transaction_id, financial_account_id, amount_signed, description)
  values (v_transaction.id, v_account.id, v_entry, v_transaction.description);

  v_result := jsonb_build_object('id', v_transaction.id, 'code', v_transaction.code, 'stateCode', v_transaction.state_code, 'version', v_transaction.version);
  update public.idempotency_keys set status = 'COMPLETED', resource_type = 'FINANCIAL_TRANSACTION', resource_id = v_transaction.id,
    response_payload = v_result, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'FIN_MANUAL' and idempotency_key = p_idempotency_key;

  return v_result;
end;
$$;

create or replace function public.create_financial_transfer_v1(
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_source public.financial_accounts%rowtype;
  v_destination public.financial_accounts%rowtype;
  v_category_id uuid;
  v_amount numeric(14,2) := round((p_input ->> 'amount')::numeric, 2);
  v_transaction public.financial_transactions%rowtype;
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if v_amount <= 0 then raise exception 'El importe debe ser mayor que cero.'; end if;
  if (p_input ->> 'sourceAccountId') = (p_input ->> 'destinationAccountId') then raise exception 'Las cuentas de origen y destino deben ser diferentes.'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'La clave de idempotencia es obligatoria.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('FIN_TRANSFER:' || p_idempotency_key, 0));
  select response_payload into v_result from public.idempotency_keys
  where scope = 'FIN_TRANSFER' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_result is not null then return v_result; end if;

  perform 1 from public.financial_accounts
  where id in ((p_input ->> 'sourceAccountId')::uuid, (p_input ->> 'destinationAccountId')::uuid)
  order by id for update;

  select * into v_source from public.financial_accounts where id = (p_input ->> 'sourceAccountId')::uuid and is_active = true;
  select * into v_destination from public.financial_accounts where id = (p_input ->> 'destinationAccountId')::uuid and is_active = true;
  if v_source.id is null or v_destination.id is null then raise exception 'Una de las cuentas no existe o está inactiva.' using errcode = 'P0002'; end if;
  if v_source.currency_code <> v_destination.currency_code then raise exception 'La transferencia directa solo admite cuentas de la misma moneda.'; end if;
  if v_source.current_balance < v_amount then raise exception 'Saldo insuficiente en la cuenta de origen.'; end if;

  select id into v_category_id from public.financial_categories where code = 'TRANSFERS';
  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('FIN_TRANSFER', p_idempotency_key, v_actor) on conflict (scope, idempotency_key) do nothing;

  insert into public.financial_transactions(
    code, transaction_type_code, state_code, category_id, occurred_at, description,
    currency_code, total_amount, idempotency_key, is_system_generated, reason, metadata, created_by
  ) values (
    null, 'TRANSFER', 'POSTED', v_category_id, (p_input ->> 'occurredAt')::timestamptz,
    coalesce(nullif(btrim(p_input ->> 'description'), ''), 'Transferencia de ' || v_source.name || ' a ' || v_destination.name),
    v_source.currency_code, v_amount, p_idempotency_key, false,
    nullif(btrim(p_input ->> 'reason'), ''),
    jsonb_build_object('sourceAccountId', v_source.id, 'destinationAccountId', v_destination.id, 'reference', nullif(btrim(p_input ->> 'reference'), '')),
    v_actor
  ) returning * into v_transaction;

  insert into public.financial_transaction_entries(financial_transaction_id, financial_account_id, amount_signed, description)
  values
    (v_transaction.id, v_source.id, -v_amount, 'Salida por transferencia'),
    (v_transaction.id, v_destination.id, v_amount, 'Ingreso por transferencia');

  v_result := jsonb_build_object('id', v_transaction.id, 'code', v_transaction.code, 'stateCode', v_transaction.state_code, 'version', v_transaction.version);
  update public.idempotency_keys set status = 'COMPLETED', resource_type = 'FINANCIAL_TRANSACTION', resource_id = v_transaction.id,
    response_payload = v_result, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'FIN_TRANSFER' and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

create or replace function public.reverse_financial_transaction_v1(
  p_transaction_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_original public.financial_transactions%rowtype;
  v_reversal public.financial_transactions%rowtype;
  v_entry record;
  v_account public.financial_accounts%rowtype;
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'El motivo de reversión debe tener al menos 5 caracteres.'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'La clave de idempotencia es obligatoria.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('FIN_REVERSAL:' || p_idempotency_key, 0));
  select response_payload into v_result from public.idempotency_keys
  where scope = 'FIN_REVERSAL' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_result is not null then return v_result; end if;

  select * into v_original from public.financial_transactions where id = p_transaction_id for update;
  if not found then raise exception 'Movimiento financiero no encontrado.' using errcode = 'P0002'; end if;
  if v_original.state_code <> 'POSTED' then raise exception 'Solo se puede revertir un movimiento publicado.'; end if;
  if v_original.is_system_generated or v_original.source_type is not null then
    raise exception 'Este movimiento fue generado por otro módulo y debe revertirse desde su operación de origen.';
  end if;
  if v_original.transaction_type_code = 'REVERSAL' then raise exception 'Una reversión no puede revertirse directamente.'; end if;

  for v_entry in select * from public.financial_transaction_entries where financial_transaction_id = v_original.id order by financial_account_id loop
    select * into v_account from public.financial_accounts where id = v_entry.financial_account_id for update;
    if (-v_entry.amount_signed) < 0 and v_account.current_balance < abs(v_entry.amount_signed) then
      raise exception 'La cuenta % no tiene saldo suficiente para revertir el movimiento.', v_account.name;
    end if;
  end loop;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('FIN_REVERSAL', p_idempotency_key, v_actor) on conflict (scope, idempotency_key) do nothing;

  insert into public.financial_transactions(
    code, transaction_type_code, state_code, category_id, occurred_at, description,
    currency_code, total_amount, idempotency_key, is_system_generated, reversal_of, reason, metadata, created_by
  ) values (
    null, 'REVERSAL', 'POSTED', v_original.category_id, now(), 'Reversión de ' || v_original.code || ': ' || v_original.description,
    v_original.currency_code, v_original.total_amount, p_idempotency_key, false, v_original.id, btrim(p_reason),
    jsonb_build_object('originalTransactionId', v_original.id), v_actor
  ) returning * into v_reversal;

  insert into public.financial_transaction_entries(financial_transaction_id, financial_account_id, amount_signed, description)
  select v_reversal.id, e.financial_account_id, -e.amount_signed, 'Reversión de ' || v_original.code
  from public.financial_transaction_entries e
  where e.financial_transaction_id = v_original.id;

  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.financial_transactions
  set state_code = 'REVERSED', reason = btrim(p_reason), updated_at = now(), version = version + 1
  where id = v_original.id;

  v_result := jsonb_build_object('id', v_reversal.id, 'code', v_reversal.code, 'stateCode', v_reversal.state_code, 'version', v_reversal.version);
  update public.idempotency_keys set status = 'COMPLETED', resource_type = 'FINANCIAL_TRANSACTION', resource_id = v_reversal.id,
    response_payload = v_result, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'FIN_REVERSAL' and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

create or replace function public.create_obligation_v1(p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_obligation public.obligations%rowtype;
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if upper(btrim(p_input ->> 'obligationType')) not in ('CREDIT_CARD','SUNAT','CUSTOMS','SERVICE','OTHER') then raise exception 'Tipo de obligación inválido.'; end if;
  if (p_input ->> 'amount')::numeric <= 0 then raise exception 'El importe debe ser mayor que cero.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('OBLIGATION:' || p_idempotency_key, 0));
  select response_payload into v_result from public.idempotency_keys
  where scope = 'OBLIGATION' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_result is not null then return v_result; end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('OBLIGATION', p_idempotency_key, v_actor) on conflict (scope, idempotency_key) do nothing;

  insert into public.obligations(
    code, obligation_type, title, description, amount, currency_code, due_date,
    alert_days_before, status, recurrence_rule, metadata, created_by, updated_by
  ) values (
    null, upper(btrim(p_input ->> 'obligationType')), btrim(p_input ->> 'title'),
    nullif(btrim(p_input ->> 'description'), ''), round((p_input ->> 'amount')::numeric, 2),
    (p_input ->> 'currencyCode')::char(3), (p_input ->> 'dueDate')::date,
    coalesce((p_input ->> 'alertDaysBefore')::integer, 3), 'PENDING',
    nullif(btrim(p_input ->> 'recurrenceRule'), ''), '{}'::jsonb, v_actor, v_actor
  ) returning * into v_obligation;

  v_result := jsonb_build_object('id', v_obligation.id, 'code', v_obligation.code, 'stateCode', v_obligation.status, 'version', v_obligation.version);
  update public.idempotency_keys set status = 'COMPLETED', resource_type = 'OBLIGATION', resource_id = v_obligation.id,
    response_payload = v_result, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'OBLIGATION' and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

create or replace function public.pay_obligation_v1(p_obligation_id uuid, p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_obligation public.obligations%rowtype;
  v_category_id uuid;
  v_fin_result jsonb;
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  select * into v_obligation from public.obligations where id = p_obligation_id for update;
  if not found then raise exception 'Obligación no encontrada.' using errcode = 'P0002'; end if;
  if v_obligation.status not in ('PENDING','OVERDUE') then raise exception 'La obligación ya no está pendiente.'; end if;
  if round((p_input ->> 'amount')::numeric, 2) <> round(v_obligation.amount, 2) then
    raise exception 'El pago debe coincidir con el importe total de la obligación.';
  end if;
  if not exists(
    select 1 from public.financial_accounts fa
    where fa.id = (p_input ->> 'accountId')::uuid
      and fa.is_active = true
      and trim(fa.currency_code) = trim(v_obligation.currency_code)
  ) then
    raise exception 'La cuenta seleccionada no usa la moneda de la obligación.';
  end if;

  select id into v_category_id from public.financial_categories
  where code = case v_obligation.obligation_type
    when 'SUNAT' then 'SUNAT'
    when 'CUSTOMS' then 'CUSTOMS'
    when 'CREDIT_CARD' then 'BANK_FEES'
    when 'SERVICE' then 'SERVICES'
    else 'OTHER' end;

  v_fin_result := public.create_manual_financial_transaction_v1(
    jsonb_build_object(
      'transactionTypeCode','EXPENSE',
      'accountId',p_input ->> 'accountId',
      'categoryId',coalesce(nullif(p_input ->> 'categoryId',''),v_category_id::text),
      'amount',coalesce((p_input ->> 'amount')::numeric,v_obligation.amount),
      'occurredAt',p_input ->> 'occurredAt',
      'description','Pago de ' || v_obligation.title || ' (' || v_obligation.code || ')',
      'reference',p_input ->> 'reference',
      'notes',p_input ->> 'notes',
      'reason','Pago de obligación registrada'
    ),
    'OBLIGATION_PAY:' || p_idempotency_key
  );

  update public.obligations
  set status = 'PAID', paid_at = (p_input ->> 'occurredAt')::timestamptz,
      financial_transaction_id = (v_fin_result ->> 'id')::uuid,
      updated_by = v_actor, updated_at = now(), version = version + 1
  where id = v_obligation.id
  returning * into v_obligation;

  return jsonb_build_object('id', v_obligation.id, 'code', v_obligation.code, 'stateCode', v_obligation.status, 'version', v_obligation.version);
end;
$$;

create or replace function public.create_received_loan_v1(p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_account public.financial_accounts%rowtype;
  v_loan public.loans%rowtype;
  v_transaction public.financial_transactions%rowtype;
  v_category_id uuid;
  v_principal numeric(14,2) := round((p_input ->> 'principalAmount')::numeric, 2);
  v_interest_rate numeric(9,6) := coalesce((p_input ->> 'interestRate')::numeric, 0);
  v_count integer := coalesce((p_input ->> 'installmentCount')::integer, 1);
  v_principal_part numeric(14,2);
  v_interest_total numeric(14,2);
  v_interest_part numeric(14,2);
  v_i integer;
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if v_principal <= 0 or v_count <= 0 then raise exception 'Importe y número de cuotas inválidos.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('LOAN_CREATE:' || p_idempotency_key, 0));
  select response_payload into v_result from public.idempotency_keys
  where scope = 'LOAN_CREATE' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_result is not null then return v_result; end if;

  select * into v_account from public.financial_accounts where id = (p_input ->> 'accountId')::uuid and is_active = true for update;
  if not found then raise exception 'Cuenta financiera no encontrada.' using errcode = 'P0002'; end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('LOAN_CREATE', p_idempotency_key, v_actor) on conflict (scope, idempotency_key) do nothing;

  insert into public.loans(
    code, lender_name_snapshot, direction, principal_amount, currency_code, interest_rate,
    installment_count, disbursed_at, first_due_date, status, outstanding_principal, notes,
    created_by, updated_by
  ) values (
    null, btrim(p_input ->> 'lenderName'), 'RECEIVED', v_principal, v_account.currency_code,
    v_interest_rate, v_count, (p_input ->> 'receivedAt')::timestamptz,
    (p_input ->> 'firstDueDate')::date, 'ACTIVE', v_principal,
    nullif(btrim(p_input ->> 'notes'), ''), v_actor, v_actor
  ) returning * into v_loan;

  v_principal_part := round(v_principal / v_count, 2);
  v_interest_total := round(v_principal * v_interest_rate / 100, 2);
  v_interest_part := round(v_interest_total / v_count, 2);
  for v_i in 1..v_count loop
    insert into public.loan_installments(loan_id, installment_number, due_date, principal_amount, interest_amount, fee_amount)
    values (
      v_loan.id,
      v_i,
      ((p_input ->> 'firstDueDate')::date + ((v_i - 1) || ' months')::interval)::date,
      case when v_i = v_count then round(v_principal - v_principal_part * (v_count - 1), 2) else v_principal_part end,
      case when v_i = v_count then round(v_interest_total - v_interest_part * (v_count - 1), 2) else v_interest_part end,
      0
    );
  end loop;

  select id into v_category_id from public.financial_categories where code = 'LOANS';
  insert into public.financial_transactions(
    code, transaction_type_code, state_code, category_id, occurred_at, description,
    currency_code, total_amount, idempotency_key, is_system_generated, source_type, source_id, metadata, created_by
  ) values (
    null, 'LOAN_RECEIVED', 'POSTED', v_category_id, (p_input ->> 'receivedAt')::timestamptz,
    'Préstamo recibido de ' || v_loan.lender_name_snapshot,
    v_account.currency_code, v_principal, 'LOAN_TX:' || p_idempotency_key, true, 'LOAN', v_loan.id,
    jsonb_build_object('loanId',v_loan.id), v_actor
  ) returning * into v_transaction;
  insert into public.financial_transaction_entries(financial_transaction_id, financial_account_id, amount_signed, description)
  values (v_transaction.id, v_account.id, v_principal, 'Desembolso del préstamo ' || v_loan.code);

  v_result := jsonb_build_object('id', v_loan.id, 'code', v_loan.code, 'stateCode', v_loan.status, 'version', v_loan.version);
  update public.idempotency_keys set status = 'COMPLETED', resource_type = 'LOAN', resource_id = v_loan.id,
    response_payload = v_result, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'LOAN_CREATE' and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

create or replace function public.pay_loan_installment_v1(p_installment_id uuid, p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_installment public.loan_installments%rowtype;
  v_loan public.loans%rowtype;
  v_account public.financial_accounts%rowtype;
  v_amount numeric(14,2) := round((p_input ->> 'amount')::numeric, 2);
  v_remaining numeric(14,2);
  v_old_principal_paid numeric(14,2);
  v_new_principal_paid numeric(14,2);
  v_category_id uuid;
  v_transaction public.financial_transactions%rowtype;
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('LOAN_PAY:' || p_idempotency_key, 0));
  select response_payload into v_result from public.idempotency_keys
  where scope = 'LOAN_PAY' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_result is not null then return v_result; end if;

  select * into v_installment from public.loan_installments where id = p_installment_id for update;
  if not found then raise exception 'Cuota no encontrada.' using errcode = 'P0002'; end if;
  if v_installment.status in ('PAID','CANCELLED') then raise exception 'La cuota ya no admite pagos.'; end if;
  select * into v_loan from public.loans where id = v_installment.loan_id for update;
  select * into v_account from public.financial_accounts where id = (p_input ->> 'accountId')::uuid and is_active = true for update;
  if not found then raise exception 'Cuenta financiera no encontrada.' using errcode = 'P0002'; end if;
  if v_account.currency_code <> v_loan.currency_code then raise exception 'La moneda de la cuenta no coincide con la del préstamo.'; end if;
  v_remaining := round(v_installment.total_amount - v_installment.paid_amount, 2);
  if v_amount <= 0 or v_amount > v_remaining then raise exception 'El importe supera el saldo de la cuota.'; end if;
  if v_account.current_balance < v_amount then raise exception 'Saldo insuficiente en la cuenta seleccionada.'; end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('LOAN_PAY', p_idempotency_key, v_actor) on conflict (scope, idempotency_key) do nothing;

  select id into v_category_id from public.financial_categories where code = 'LOANS';
  insert into public.financial_transactions(
    code, transaction_type_code, state_code, category_id, occurred_at, description,
    currency_code, total_amount, idempotency_key, is_system_generated, source_type, source_id, metadata, created_by
  ) values (
    null, 'LOAN_PAYMENT', 'POSTED', v_category_id, (p_input ->> 'occurredAt')::timestamptz,
    'Pago de cuota ' || v_installment.installment_number || ' del préstamo ' || v_loan.code,
    v_loan.currency_code, v_amount, 'LOAN_PAY_TX:' || p_idempotency_key, true, 'LOAN_INSTALLMENT', v_installment.id,
    jsonb_build_object('loanId',v_loan.id,'installmentId',v_installment.id,'reference',nullif(btrim(p_input ->> 'reference'),'')), v_actor
  ) returning * into v_transaction;
  insert into public.financial_transaction_entries(financial_transaction_id, financial_account_id, amount_signed, description)
  values (v_transaction.id, v_account.id, -v_amount, v_transaction.description);

  v_old_principal_paid := greatest(least(v_installment.paid_amount - v_installment.interest_amount - v_installment.fee_amount, v_installment.principal_amount), 0);
  v_new_principal_paid := greatest(least(v_installment.paid_amount + v_amount - v_installment.interest_amount - v_installment.fee_amount, v_installment.principal_amount), 0);

  update public.loan_installments
  set paid_amount = round(paid_amount + v_amount, 2),
      paid_at = case when round(paid_amount + v_amount, 2) >= total_amount then (p_input ->> 'occurredAt')::timestamptz else paid_at end,
      status = case when round(paid_amount + v_amount, 2) >= total_amount then 'PAID' else 'PARTIAL' end,
      financial_transaction_id = v_transaction.id,
      updated_at = now(), version = version + 1
  where id = v_installment.id
  returning * into v_installment;

  update public.loans
  set outstanding_principal = greatest(round(outstanding_principal - (v_new_principal_paid - v_old_principal_paid), 2), 0),
      status = case when not exists(
        select 1 from public.loan_installments li where li.loan_id = v_loan.id and li.id <> v_installment.id and li.status <> 'PAID'
      ) and v_installment.status = 'PAID' then 'PAID' else status end,
      updated_by = v_actor, updated_at = now(), version = version + 1
  where id = v_loan.id
  returning * into v_loan;

  return jsonb_build_object('id', v_loan.id, 'code', v_loan.code, 'stateCode', v_loan.status, 'version', v_loan.version);
end;
$$;

create or replace function public.create_cash_closure_v1(p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_account public.financial_accounts%rowtype;
  v_closure public.cash_closures%rowtype;
  v_difference numeric(14,2);
  v_category_id uuid;
  v_transaction public.financial_transactions%rowtype;
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('CASH_CLOSE:' || p_idempotency_key, 0));
  select response_payload into v_result from public.idempotency_keys
  where scope = 'CASH_CLOSE' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_result is not null then return v_result; end if;

  select * into v_account from public.financial_accounts
  where id = (p_input ->> 'accountId')::uuid and is_active = true and account_type_code = 'CASH'
  for update;
  if not found then raise exception 'La cuenta seleccionada no es una caja de efectivo activa.' using errcode = 'P0002'; end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('CASH_CLOSE', p_idempotency_key, v_actor) on conflict (scope, idempotency_key) do nothing;

  insert into public.cash_closures(code, financial_account_id, closure_date, expected_amount, counted_amount, status, notes, closed_by)
  values (null, v_account.id, (p_input ->> 'closureDate')::date, v_account.current_balance,
    round((p_input ->> 'countedAmount')::numeric, 2), 'CLOSED', nullif(btrim(p_input ->> 'notes'), ''), v_actor)
  returning * into v_closure;

  v_difference := v_closure.difference_amount;
  if v_difference <> 0 then
    if length(btrim(coalesce(p_input ->> 'reason',''))) < 5 then
      raise exception 'El motivo es obligatorio cuando existe diferencia de caja.';
    end if;
    select id into v_category_id from public.financial_categories where code = 'CASH_DIFFERENCE';
    insert into public.financial_transactions(
      code, transaction_type_code, state_code, category_id, occurred_at, description,
      currency_code, total_amount, idempotency_key, is_system_generated, source_type, source_id, reason, metadata, created_by
    ) values (
      null, 'ADJUSTMENT', 'POSTED', v_category_id, now(), 'Ajuste por cierre de caja ' || v_closure.code,
      v_account.currency_code, abs(v_difference), 'CASH_ADJ:' || p_idempotency_key, true,
      'CASH_CLOSURE', v_closure.id, btrim(p_input ->> 'reason'), jsonb_build_object('difference',v_difference), v_actor
    ) returning * into v_transaction;
    insert into public.financial_transaction_entries(financial_transaction_id, financial_account_id, amount_signed, description)
    values (v_transaction.id, v_account.id, v_difference, 'Diferencia de cierre de caja');
  end if;

  v_result := jsonb_build_object(
    'id', v_closure.id, 'code', v_closure.code, 'stateCode', v_closure.status,
    'version', v_closure.version, 'expectedAmount', v_closure.expected_amount,
    'countedAmount', v_closure.counted_amount, 'differenceAmount', v_closure.difference_amount
  );
  update public.idempotency_keys set status = 'COMPLETED', resource_type = 'CASH_CLOSURE', resource_id = v_closure.id,
    response_payload = v_result, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'CASH_CLOSE' and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

create or replace function public.register_financial_attachment_v1(p_transaction_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_attachment public.attachments%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if not exists(select 1 from public.financial_transactions where id = p_transaction_id) then
    raise exception 'Movimiento financiero no encontrado.' using errcode = 'P0002';
  end if;
  insert into public.attachments(entity_type, entity_id, attachment_type, bucket_id, object_path, original_filename, mime_type, size_bytes, uploaded_by)
  values ('FINANCIAL_TRANSACTION', p_transaction_id, 'PROOF', 'financial-files', btrim(p_input ->> 'objectPath'),
    btrim(p_input ->> 'originalFilename'), btrim(p_input ->> 'mimeType'), (p_input ->> 'sizeBytes')::bigint, v_actor)
  returning * into v_attachment;
  return jsonb_build_object('id',v_attachment.id);
end;
$$;

create or replace function public.import_bank_statement_v1(
  p_account_id uuid,
  p_original_filename text,
  p_file_checksum text,
  p_rows jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_account public.financial_accounts%rowtype;
  v_batch public.bank_import_batches%rowtype;
  v_row jsonb;
  v_ordinal bigint;
  v_statement public.bank_statement_rows%rowtype;
  v_valid integer := 0;
  v_invalid integer := 0;
  v_total integer := jsonb_array_length(coalesce(p_rows,'[]'::jsonb));
  v_fingerprint text;
  v_min_date date;
  v_max_date date;
  v_existing public.bank_import_batches%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or v_total = 0 then raise exception 'El extracto no contiene filas.'; end if;
  if v_total > 5000 then raise exception 'El archivo supera el máximo de 5000 filas por importación.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('BANK_IMPORT:' || p_account_id::text || ':' || p_file_checksum, 0));
  select * into v_existing from public.bank_import_batches
  where financial_account_id = p_account_id and file_checksum_sha256 = p_file_checksum;
  if found then
    return jsonb_build_object('id',v_existing.id,'code',v_existing.code,'stateCode',v_existing.status,
      'totalRows',v_existing.total_rows,'validRows',v_existing.valid_rows,'invalidRows',v_existing.invalid_rows,'reused',true);
  end if;

  select * into v_account from public.financial_accounts
  where id = p_account_id and is_active = true and account_type_code in ('BANK','WALLET')
  for update;
  if not found then raise exception 'Selecciona una cuenta bancaria o billetera activa.' using errcode = 'P0002'; end if;

  insert into public.bank_import_batches(code, financial_account_id, original_filename, file_checksum_sha256, total_rows, status, imported_by)
  values (null, v_account.id, btrim(p_original_filename), btrim(p_file_checksum), v_total, 'PROCESSING', v_actor)
  returning * into v_batch;

  for v_row, v_ordinal in select value, ordinality from jsonb_array_elements(p_rows) with ordinality loop
    begin
      if round((v_row ->> 'amountSigned')::numeric,2) = 0 then raise exception 'Importe cero'; end if;
      v_fingerprint := encode(extensions.digest(
        concat_ws('|',v_account.id::text,v_row ->> 'transactionDate',lower(btrim(v_row ->> 'description')),
          coalesce(v_row ->> 'reference',''),round((v_row ->> 'amountSigned')::numeric,2)::text), 'sha256'
      ), 'hex');
      insert into public.bank_statement_rows(
        batch_id, financial_account_id, row_number, transaction_date, posted_at, description,
        reference, amount_signed, currency_code, balance_after, fingerprint, raw_payload
      ) values (
        v_batch.id, v_account.id, v_ordinal::integer, (v_row ->> 'transactionDate')::date,
        nullif(v_row ->> 'postedAt','')::timestamptz, btrim(v_row ->> 'description'),
        nullif(btrim(v_row ->> 'reference'), ''), round((v_row ->> 'amountSigned')::numeric,2),
        coalesce(nullif(v_row ->> 'currencyCode',''),trim(v_account.currency_code))::char(3),
        nullif(v_row ->> 'balanceAfter','')::numeric, v_fingerprint, v_row
      ) on conflict (financial_account_id, fingerprint) do nothing
      returning * into v_statement;
      if found then
        v_valid := v_valid + 1;
        v_min_date := least(coalesce(v_min_date,v_statement.transaction_date),v_statement.transaction_date);
        v_max_date := greatest(coalesce(v_max_date,v_statement.transaction_date),v_statement.transaction_date);
      else
        v_invalid := v_invalid + 1;
      end if;
    exception when others then
      v_invalid := v_invalid + 1;
    end;
  end loop;

  insert into public.bank_reconciliation_candidates(bank_statement_row_id,candidate_type,candidate_id,confidence_score,reason)
  select distinct
    bsr.id,
    'PAYMENT',
    p.id,
    case
      when (p.received_at at time zone 'America/Lima')::date = bsr.transaction_date and coalesce(pp.reference_number,'') <> '' and lower(coalesce(pp.reference_number,'')) = lower(coalesce(bsr.reference,'')) then 0.99
      when (p.received_at at time zone 'America/Lima')::date = bsr.transaction_date then 0.94
      else 0.82
    end,
    jsonb_build_object('amount',pp.amount,'paymentCode',p.code,'dateDifference',abs((p.received_at at time zone 'America/Lima')::date - bsr.transaction_date))
  from public.bank_statement_rows bsr
  join public.payment_parts pp on pp.financial_account_id = bsr.financial_account_id and round(pp.amount,2) = round(bsr.amount_signed,2)
  join public.payments p on p.id = pp.payment_id and p.state_code = 'CONFIRMED'
  where bsr.batch_id = v_batch.id
    and bsr.amount_signed > 0
    and abs((p.received_at at time zone 'America/Lima')::date - bsr.transaction_date) <= 3
  on conflict (bank_statement_row_id,candidate_type,candidate_id) do nothing;

  insert into public.bank_reconciliation_candidates(bank_statement_row_id,candidate_type,candidate_id,confidence_score,reason)
  select distinct
    bsr.id,
    'FINANCIAL_TRANSACTION',
    ft.id,
    case when (ft.occurred_at at time zone 'America/Lima')::date = bsr.transaction_date then 0.92 else 0.80 end,
    jsonb_build_object('amount',e.amount_signed,'transactionCode',ft.code,'dateDifference',abs((ft.occurred_at at time zone 'America/Lima')::date - bsr.transaction_date))
  from public.bank_statement_rows bsr
  join public.financial_transaction_entries e on e.financial_account_id = bsr.financial_account_id and round(e.amount_signed,2) = round(bsr.amount_signed,2)
  join public.financial_transactions ft on ft.id = e.financial_transaction_id and ft.state_code = 'POSTED'
  where bsr.batch_id = v_batch.id
    and coalesce(ft.source_type, '') <> 'PAYMENT'
    and abs((ft.occurred_at at time zone 'America/Lima')::date - bsr.transaction_date) <= 3
  on conflict (bank_statement_row_id,candidate_type,candidate_id) do nothing;

  update public.bank_statement_rows bsr
  set reconciliation_status = 'SUGGESTED'
  where bsr.batch_id = v_batch.id
    and exists(select 1 from public.bank_reconciliation_candidates c where c.bank_statement_row_id = bsr.id and c.dismissed_at is null);

  update public.bank_import_batches
  set imported_from = v_min_date, imported_to = v_max_date,
      valid_rows = v_valid, invalid_rows = v_invalid,
      status = case when v_valid = 0 then 'FAILED' when v_invalid > 0 then 'PARTIAL' else 'IMPORTED' end
  where id = v_batch.id
  returning * into v_batch;

  return jsonb_build_object('id',v_batch.id,'code',v_batch.code,'stateCode',v_batch.status,
    'totalRows',v_batch.total_rows,'validRows',v_batch.valid_rows,'invalidRows',v_batch.invalid_rows,'reused',false);
end;
$$;

create or replace function public.get_bank_reconciliation_v1(p_account_id uuid default null, p_batch_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := p_account_id;
  v_batch_id uuid := p_batch_id;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if v_account_id is null then
    select id into v_account_id from public.financial_accounts where is_active and account_type_code in ('BANK','WALLET') order by name limit 1;
  end if;
  if v_batch_id is null and v_account_id is not null then
    select id into v_batch_id from public.bank_import_batches where financial_account_id = v_account_id order by imported_at desc limit 1;
  end if;

  return jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(jsonb_build_object(
      'id',fa.id,'code',fa.code,'name',fa.name,'currencyCode',trim(fa.currency_code),'currentBalance',fa.current_balance
    ) order by fa.name) from public.financial_accounts fa where fa.is_active and fa.account_type_code in ('BANK','WALLET')), '[]'::jsonb),
    'selectedAccountId', v_account_id,
    'selectedBatchId', v_batch_id,
    'batches', coalesce((select jsonb_agg(jsonb_build_object(
      'id',b.id,'code',b.code,'originalFilename',b.original_filename,'importedFrom',b.imported_from,'importedTo',b.imported_to,
      'totalRows',b.total_rows,'validRows',b.valid_rows,'invalidRows',b.invalid_rows,'status',b.status,'importedAt',b.imported_at
    ) order by b.imported_at desc) from public.bank_import_batches b where b.financial_account_id = v_account_id), '[]'::jsonb),
    'summary', jsonb_build_object(
      'total', coalesce((select count(*) from public.bank_statement_rows where batch_id = v_batch_id),0),
      'suggested', coalesce((select count(*) from public.bank_statement_rows where batch_id = v_batch_id and reconciliation_status = 'SUGGESTED'),0),
      'reconciled', coalesce((select count(*) from public.bank_statement_rows where batch_id = v_batch_id and reconciliation_status = 'RECONCILED'),0),
      'unmatched', coalesce((select count(*) from public.bank_statement_rows where batch_id = v_batch_id and reconciliation_status = 'UNMATCHED'),0),
      'ignored', coalesce((select count(*) from public.bank_statement_rows where batch_id = v_batch_id and reconciliation_status = 'IGNORED'),0)
    ),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',bsr.id,'rowNumber',bsr.row_number,'transactionDate',bsr.transaction_date,'description',bsr.description,
        'reference',bsr.reference,'amountSigned',bsr.amount_signed,'currencyCode',trim(bsr.currency_code),
        'balanceAfter',bsr.balance_after,'reconciliationStatus',bsr.reconciliation_status,
        'candidates',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',c.id,'candidateType',c.candidate_type,'candidateId',c.candidate_id,'confidenceScore',c.confidence_score,
            'label',case when c.candidate_type = 'PAYMENT' then
              coalesce((select p.code || ' · ' || s.code || ' · ' || s.client_name_snapshot from public.payments p join public.sales s on s.id = p.sale_id where p.id = c.candidate_id),'Pago')
            else coalesce((select ft.code || ' · ' || ft.description from public.financial_transactions ft where ft.id = c.candidate_id),'Movimiento') end,
            'reason',c.reason
          ) order by c.confidence_score desc)
          from public.bank_reconciliation_candidates c
          where c.bank_statement_row_id = bsr.id and c.dismissed_at is null
        ),'[]'::jsonb),
        'activeReconciliation',(
          select jsonb_build_object('id',br.id,'matchedType',br.matched_type,'matchedId',br.matched_id,'matchedAmount',br.matched_amount,
            'notes',br.notes,'reconciledAt',br.reconciled_at)
          from public.bank_reconciliations br where br.bank_statement_row_id = bsr.id and br.status = 'ACTIVE' limit 1
        )
      ) order by bsr.transaction_date desc, bsr.row_number desc)
      from public.bank_statement_rows bsr where bsr.batch_id = v_batch_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.confirm_bank_reconciliation_v1(p_row_id uuid, p_candidate_type text, p_candidate_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_row public.bank_statement_rows%rowtype;
  v_amount numeric(14,2);
  v_reconciliation public.bank_reconciliations%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  select * into v_row from public.bank_statement_rows where id = p_row_id for update;
  if not found then raise exception 'Movimiento bancario no encontrado.' using errcode = 'P0002'; end if;
  if v_row.reconciliation_status = 'RECONCILED' then raise exception 'El movimiento ya está conciliado.'; end if;
  if upper(p_candidate_type) not in ('PAYMENT','FINANCIAL_TRANSACTION') then raise exception 'Tipo de coincidencia inválido.'; end if;
  if not exists(select 1 from public.bank_reconciliation_candidates c where c.bank_statement_row_id = v_row.id and c.candidate_type = upper(p_candidate_type) and c.candidate_id = p_candidate_id and c.dismissed_at is null) then
    raise exception 'La coincidencia seleccionada no está disponible.';
  end if;

  if upper(p_candidate_type) = 'PAYMENT' then
    select coalesce(sum(pp.amount),0) into v_amount from public.payment_parts pp
    where pp.payment_id = p_candidate_id and pp.financial_account_id = v_row.financial_account_id;
  else
    select coalesce(sum(e.amount_signed),0) into v_amount from public.financial_transaction_entries e
    where e.financial_transaction_id = p_candidate_id and e.financial_account_id = v_row.financial_account_id;
  end if;
  if round(v_amount,2) <> round(v_row.amount_signed,2) then raise exception 'El importe del registro no coincide con el movimiento bancario.'; end if;

  insert into public.bank_reconciliations(bank_statement_row_id,matched_type,matched_id,matched_amount,status,notes,reconciled_by)
  values (v_row.id,upper(p_candidate_type),p_candidate_id,abs(v_row.amount_signed),'ACTIVE',nullif(btrim(p_notes),''),v_actor)
  returning * into v_reconciliation;
  update public.bank_statement_rows set reconciliation_status = 'RECONCILED' where id = v_row.id;
  return jsonb_build_object('id',v_reconciliation.id,'stateCode',v_reconciliation.status,'version',v_reconciliation.version);
end;
$$;

create or replace function public.dismiss_bank_candidate_v1(p_candidate_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_candidate public.bank_reconciliation_candidates%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  update public.bank_reconciliation_candidates
  set dismissed_at = now(), dismissed_by = v_actor,
      reason = reason || jsonb_build_object('dismissalReason',nullif(btrim(p_reason),''))
  where id = p_candidate_id and dismissed_at is null
  returning * into v_candidate;
  if not found then raise exception 'Coincidencia no encontrada.' using errcode = 'P0002'; end if;
  if not exists(select 1 from public.bank_reconciliation_candidates c where c.bank_statement_row_id = v_candidate.bank_statement_row_id and c.dismissed_at is null) then
    update public.bank_statement_rows set reconciliation_status = 'UNMATCHED'
    where id = v_candidate.bank_statement_row_id and reconciliation_status = 'SUGGESTED';
  end if;
  return jsonb_build_object('id',v_candidate.id,'stateCode','DISMISSED','version',1);
end;
$$;

create or replace function public.ignore_bank_row_v1(p_row_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.bank_statement_rows%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason,''))) < 5 then raise exception 'Indica un motivo para ignorar el movimiento.'; end if;
  update public.bank_statement_rows
  set reconciliation_status = 'IGNORED', raw_payload = raw_payload || jsonb_build_object('ignoreReason',btrim(p_reason))
  where id = p_row_id and reconciliation_status <> 'RECONCILED'
  returning * into v_row;
  if not found then raise exception 'Movimiento no encontrado o ya conciliado.' using errcode = 'P0002'; end if;
  return jsonb_build_object('id',v_row.id,'stateCode',v_row.reconciliation_status,'version',1);
end;
$$;

create or replace function public.reverse_bank_reconciliation_v1(p_reconciliation_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_rec public.bank_reconciliations%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason,''))) < 5 then raise exception 'El motivo de reversión es obligatorio.'; end if;
  update public.bank_reconciliations
  set status = 'REVERSED', reversed_by = v_actor, reversed_at = now(), reversal_reason = btrim(p_reason), version = version + 1
  where id = p_reconciliation_id and status = 'ACTIVE'
  returning * into v_rec;
  if not found then raise exception 'Conciliación activa no encontrada.' using errcode = 'P0002'; end if;
  update public.bank_statement_rows
  set reconciliation_status = case when exists(select 1 from public.bank_reconciliation_candidates c where c.bank_statement_row_id = v_rec.bank_statement_row_id and c.dismissed_at is null) then 'SUGGESTED' else 'UNMATCHED' end
  where id = v_rec.bank_statement_row_id;
  return jsonb_build_object('id',v_rec.id,'stateCode',v_rec.status,'version',v_rec.version);
end;
$$;

-- Permisos RPC.
grant execute on function public.get_finance_support_v1() to authenticated;
grant execute on function public.get_finance_dashboard_v1() to authenticated;
grant execute on function public.list_financial_transactions_v1(text,text,integer,integer) to authenticated;
grant execute on function public.create_financial_category_v1(jsonb) to authenticated;
grant execute on function public.create_manual_financial_transaction_v1(jsonb,text) to authenticated;
grant execute on function public.create_financial_transfer_v1(jsonb,text) to authenticated;
grant execute on function public.reverse_financial_transaction_v1(uuid,text,text) to authenticated;
grant execute on function public.create_obligation_v1(jsonb,text) to authenticated;
grant execute on function public.pay_obligation_v1(uuid,jsonb,text) to authenticated;
grant execute on function public.create_received_loan_v1(jsonb,text) to authenticated;
grant execute on function public.pay_loan_installment_v1(uuid,jsonb,text) to authenticated;
grant execute on function public.create_cash_closure_v1(jsonb,text) to authenticated;
grant execute on function public.register_financial_attachment_v1(uuid,jsonb) to authenticated;
grant execute on function public.import_bank_statement_v1(uuid,text,text,jsonb,text) to authenticated;
grant execute on function public.get_bank_reconciliation_v1(uuid,uuid) to authenticated;
grant execute on function public.confirm_bank_reconciliation_v1(uuid,text,uuid,text) to authenticated;
grant execute on function public.dismiss_bank_candidate_v1(uuid,text) to authenticated;
grant execute on function public.ignore_bank_row_v1(uuid,text) to authenticated;
grant execute on function public.reverse_bank_reconciliation_v1(uuid,text) to authenticated;

-- Storage privado para comprobantes financieros y extractos.
drop policy if exists financial_files_select_admin on storage.objects;
create policy financial_files_select_admin on storage.objects for select to authenticated
using (bucket_id = 'financial-files' and private.is_active_admin());
drop policy if exists financial_files_insert_admin on storage.objects;
create policy financial_files_insert_admin on storage.objects for insert to authenticated
with check (bucket_id = 'financial-files' and private.is_active_admin());
drop policy if exists financial_files_update_admin on storage.objects;
create policy financial_files_update_admin on storage.objects for update to authenticated
using (bucket_id = 'financial-files' and private.is_active_admin())
with check (bucket_id = 'financial-files' and private.is_active_admin());
drop policy if exists financial_files_delete_admin on storage.objects;
create policy financial_files_delete_admin on storage.objects for delete to authenticated
using (bucket_id = 'financial-files' and private.is_active_admin());

notify pgrst, 'reload schema';
commit;
