-- Yukimi Gestión
-- Migración 015: pagos parciales, boletas, notas de crédito y penalidades

begin;

alter table public.payments
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references public.profiles(id) on delete set null,
  add column if not exists rejection_reason text;

alter table public.sales_receipts
  add column if not exists annulled_at timestamptz,
  add column if not exists annulled_by uuid references public.profiles(id) on delete set null,
  add column if not exists annulment_reason text;

create index if not exists ix_payments_sale_received
  on public.payments(sale_id, received_at desc);

create index if not exists ix_receipts_sale_issue
  on public.sales_receipts(sale_id, issue_date desc, created_at desc);

with duplicate_late_penalties as (
  select id, row_number() over (partition by sale_id order by created_at desc, id desc) as rn
  from public.penalties
  where status = 'ACTIVE' and penalty_type = 'LATE_DAILY'
)
update public.penalties p
set status = 'REVERSED',
    reason = p.reason || E'\nRevertida automáticamente al consolidar penalidades duplicadas.',
    updated_at = now()
from duplicate_late_penalties d
where p.id = d.id and d.rn > 1;

create unique index if not exists ux_penalties_active_late_daily
  on public.penalties(sale_id, penalty_type)
  where status = 'ACTIVE' and penalty_type = 'LATE_DAILY';

create or replace function public.get_payment_support_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select setting_value into v_rule
  from public.business_settings
  where setting_key = 'penalties.late_daily';

  return jsonb_build_object(
    'paymentMethods', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', pm.code,
        'name', pm.name,
        'requiresProof', pm.requires_proof
      ) order by pm.name)
      from public.payment_methods pm
      where pm.is_active = true
    ), '[]'::jsonb),
    'financialAccounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fa.id,
        'code', fa.code,
        'name', fa.name,
        'accountTypeCode', fa.account_type_code,
        'currencyCode', fa.currency_code
      ) order by fa.name)
      from public.financial_accounts fa
      where fa.is_active = true and fa.currency_code = 'PEN'
    ), '[]'::jsonb),
    'latePenalty', jsonb_build_object(
      'enabled', coalesce((v_rule ->> 'enabled')::boolean, true),
      'amountPerDay', coalesce((v_rule ->> 'amount')::numeric, 1),
      'currencyCode', coalesce(v_rule ->> 'currency', 'PEN')
    )
  );
end;
$$;

create or replace function public.get_sale_financial_detail_v1(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'saleId', s.id,
    'saleCode', s.code,
    'currencyCode', s.currency_code,
    'totalAmount', s.total_amount,
    'paidTotal', s.paid_total,
    'balanceAmount', s.balance_amount,
    'paymentStateCode', s.payment_state_code,
    'dueAt', s.due_at,
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'code', p.code,
        'stateCode', p.state_code,
        'declaredAmount', p.declared_amount,
        'currencyCode', p.currency_code,
        'receivedAt', p.received_at,
        'confirmedAt', p.confirmed_at,
        'rejectedAt', p.rejected_at,
        'reversedAt', p.reversed_at,
        'rejectionReason', p.rejection_reason,
        'reversalReason', p.reversal_reason,
        'notes', p.notes,
        'createdByName', creator.display_name,
        'confirmedByName', confirmer.display_name,
        'parts', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', pp.id,
            'paymentMethodCode', pp.payment_method_code,
            'paymentMethodName', pm.name,
            'requiresProof', pm.requires_proof,
            'financialAccountId', pp.financial_account_id,
            'financialAccountName', fa.name,
            'amount', pp.amount,
            'referenceNumber', pp.reference_number,
            'notes', pp.notes
          ) order by pp.created_at, pp.id)
          from public.payment_parts pp
          join public.payment_methods pm on pm.code = pp.payment_method_code
          join public.financial_accounts fa on fa.id = pp.financial_account_id
          where pp.payment_id = p.id
        ), '[]'::jsonb),
        'proofs', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', a.id,
            'bucketId', a.bucket_id,
            'objectPath', a.object_path,
            'originalFilename', a.original_filename,
            'mimeType', a.mime_type,
            'sizeBytes', a.size_bytes,
            'signedUrl', null,
            'createdAt', a.created_at
          ) order by a.created_at)
          from public.attachments a
          where a.entity_type = 'PAYMENT'
            and a.entity_id = p.id
            and a.attachment_type = 'PROOF'
            and a.is_active = true
        ), '[]'::jsonb),
        'receiptAllocatedAmount', coalesce((
          select round(sum(rpa.allocated_amount), 2)
          from public.receipt_payment_allocations rpa
          join public.sales_receipts sr on sr.id = rpa.receipt_id
          where rpa.payment_id = p.id
            and sr.state_code not in ('ANNULLED', 'CREDIT_NOTE')
        ), 0),
        'unreceiptedAmount', greatest(p.declared_amount - coalesce((
          select round(sum(rpa.allocated_amount), 2)
          from public.receipt_payment_allocations rpa
          join public.sales_receipts sr on sr.id = rpa.receipt_id
          where rpa.payment_id = p.id
            and sr.state_code not in ('ANNULLED', 'CREDIT_NOTE')
        ), 0), 0),
        'createdAt', p.created_at,
        'version', p.version
      ) order by p.received_at desc, p.created_at desc)
      from public.payments p
      left join public.profiles creator on creator.id = p.created_by
      left join public.profiles confirmer on confirmer.id = p.confirmed_by
      where p.sale_id = s.id
    ), '[]'::jsonb),
    'receipts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'code', r.code,
        'stateCode', r.state_code,
        'receiptType', r.receipt_type,
        'series', r.series,
        'receiptNumber', r.receipt_number,
        'fullNumber', r.full_number,
        'issueDate', r.issue_date,
        'amount', r.amount,
        'notes', r.notes,
        'annulledAt', r.annulled_at,
        'annulmentReason', r.annulment_reason,
        'createdByName', receipt_creator.display_name,
        'allocations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'paymentId', rp.payment_id,
            'paymentCode', p2.code,
            'allocatedAmount', rp.allocated_amount
          ) order by p2.received_at)
          from public.receipt_payment_allocations rp
          join public.payments p2 on p2.id = rp.payment_id
          where rp.receipt_id = r.id
        ), '[]'::jsonb),
        'files', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', a.id,
            'bucketId', a.bucket_id,
            'objectPath', a.object_path,
            'originalFilename', a.original_filename,
            'mimeType', a.mime_type,
            'sizeBytes', a.size_bytes,
            'signedUrl', null,
            'createdAt', a.created_at
          ) order by a.created_at)
          from public.attachments a
          where a.entity_type = 'RECEIPT'
            and a.entity_id = r.id
            and a.attachment_type = 'FILE'
            and a.is_active = true
        ), '[]'::jsonb),
        'creditNotes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', cn.id,
            'code', cn.code,
            'fullNumber', cn.full_number,
            'issueDate', cn.issue_date,
            'amount', cn.amount,
            'reason', cn.reason,
            'createdByName', cnp.display_name,
            'createdAt', cn.created_at
          ) order by cn.issue_date desc, cn.created_at desc)
          from public.credit_notes cn
          left join public.profiles cnp on cnp.id = cn.created_by
          where cn.receipt_id = r.id
        ), '[]'::jsonb),
        'createdAt', r.created_at,
        'version', r.version
      ) order by r.issue_date desc nulls last, r.created_at desc)
      from public.sales_receipts r
      left join public.profiles receipt_creator on receipt_creator.id = r.created_by
      where r.sale_id = s.id
    ), '[]'::jsonb),
    'penalties', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'penaltyType', pe.penalty_type,
        'amount', pe.amount,
        'unitAmount', pe.unit_amount,
        'daysLate', case when pe.penalty_type = 'LATE_DAILY' then coalesce(pe.quantity_basis, 0)::integer else null end,
        'reason', pe.reason,
        'status', pe.status,
        'calculatedFrom', pe.calculated_from,
        'calculatedTo', pe.calculated_to,
        'createdByName', pep.display_name,
        'createdAt', pe.created_at,
        'version', pe.version
      ) order by pe.created_at desc)
      from public.penalties pe
      left join public.profiles pep on pep.id = pe.created_by
      where pe.sale_id = s.id
    ), '[]'::jsonb)
  ) into v_result
  from public.sales s
  where s.id = p_sale_id;

  if v_result is null then
    raise exception 'Venta no encontrada.' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

create or replace function public.create_payment_v1(
  p_sale_id uuid,
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
  v_sale public.sales%rowtype;
  v_payment public.payments%rowtype;
  v_part jsonb;
  v_method public.payment_methods%rowtype;
  v_account public.financial_accounts%rowtype;
  v_total numeric(14,2) := 0;
  v_amount numeric(14,2);
  v_existing jsonb;
  v_existing_hash text;
  v_response jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_input) <> 'object' then
    raise exception 'El pago debe enviarse como un objeto JSON.';
  end if;
  if jsonb_typeof(p_input -> 'parts') <> 'array' or jsonb_array_length(p_input -> 'parts') = 0 then
    raise exception 'El pago debe contener al menos un medio de pago.';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'La clave de idempotencia es obligatoria.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('CREATE_PAYMENT:' || p_idempotency_key, 0));
  select response_payload, request_hash into v_existing, v_existing_hash
  from public.idempotency_keys
  where scope = 'CREATE_PAYMENT' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_existing is not null then
    if v_existing_hash is distinct from pg_catalog.md5((jsonb_build_object('saleId', p_sale_id, 'input', p_input))::text) then
      raise exception 'La clave de idempotencia ya fue utilizada con otros datos.';
    end if;
    return v_existing;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id, request_hash, status, expires_at)
  values (
    'CREATE_PAYMENT', p_idempotency_key, v_actor,
    pg_catalog.md5((jsonb_build_object('saleId', p_sale_id, 'input', p_input))::text),
    'IN_PROGRESS', now() + interval '24 hours'
  )
  on conflict (scope, idempotency_key) do update set
    actor_user_id = excluded.actor_user_id,
    request_hash = excluded.request_hash,
    status = 'IN_PROGRESS',
    locked_at = now(),
    expires_at = excluded.expires_at;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Venta no encontrada.' using errcode = 'P0002'; end if;
  if v_sale.commercial_state_code in ('CANCELLED', 'ANNULLED') then
    raise exception 'No se pueden registrar pagos en una venta cancelada o anulada.';
  end if;
  if v_sale.balance_amount <= 0 then
    raise exception 'La venta no tiene saldo pendiente.';
  end if;

  for v_part in select value from jsonb_array_elements(p_input -> 'parts')
  loop
    v_amount := round((v_part ->> 'amount')::numeric, 2);
    if v_amount <= 0 then raise exception 'Cada medio de pago debe tener un importe mayor que cero.'; end if;

    select * into v_method from public.payment_methods
    where code = v_part ->> 'paymentMethodCode' and is_active = true;
    if not found then raise exception 'El medio de pago no existe o está inactivo.'; end if;

    select * into v_account from public.financial_accounts
    where id = (v_part ->> 'financialAccountId')::uuid and is_active = true for share;
    if not found then raise exception 'La cuenta financiera no existe o está inactiva.'; end if;
    if v_account.currency_code <> v_sale.currency_code then
      raise exception 'La cuenta financiera debe usar la misma moneda de la venta.';
    end if;

    v_total := v_total + v_amount;
  end loop;

  v_total := round(v_total, 2);
  if v_total > v_sale.balance_amount then
    raise exception 'El pago (%) supera el saldo pendiente (%).', v_total, v_sale.balance_amount using errcode = 'P0001';
  end if;

  insert into public.payments(
    code, sale_id, state_code, declared_amount, currency_code, received_at,
    notes, idempotency_key, created_by, updated_by
  ) values (
    public.next_business_code('PAYMENT'), p_sale_id, 'PENDING', 0, v_sale.currency_code,
    coalesce(nullif(p_input ->> 'receivedAt', '')::timestamptz, now()),
    nullif(btrim(p_input ->> 'notes'), ''), p_idempotency_key, v_actor, v_actor
  ) returning * into v_payment;

  for v_part in select value from jsonb_array_elements(p_input -> 'parts')
  loop
    insert into public.payment_parts(
      payment_id, payment_method_code, financial_account_id, amount,
      currency_code, reference_number, notes
    ) values (
      v_payment.id,
      v_part ->> 'paymentMethodCode',
      (v_part ->> 'financialAccountId')::uuid,
      round((v_part ->> 'amount')::numeric, 2),
      v_sale.currency_code,
      nullif(btrim(v_part ->> 'referenceNumber'), ''),
      nullif(btrim(v_part ->> 'notes'), '')
    );
  end loop;

  select * into v_payment from public.payments where id = v_payment.id;
  v_response := jsonb_build_object(
    'id', v_payment.id,
    'code', v_payment.code,
    'stateCode', v_payment.state_code,
    'version', v_payment.version
  );

  update public.idempotency_keys
  set status = 'COMPLETED', resource_type = 'PAYMENT', resource_id = v_payment.id,
      response_payload = v_response, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'CREATE_PAYMENT' and idempotency_key = p_idempotency_key;

  return v_response;
exception
  when others then
    update public.idempotency_keys set status = 'FAILED', completed_at = now()
    where scope = 'CREATE_PAYMENT' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

create or replace function public.confirm_payment_v1(
  p_payment_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_sale public.sales%rowtype;
  v_result uuid;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Pago no encontrado.' using errcode = 'P0002'; end if;

  select * into v_sale from public.sales where id = v_payment.sale_id for update;
  if not found then raise exception 'Venta no encontrada.' using errcode = 'P0002'; end if;
  if v_payment.state_code = 'PENDING' and v_payment.declared_amount > v_sale.balance_amount then
    raise exception 'El pago supera el saldo pendiente actualizado de la venta.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.payment_parts pp
    join public.payment_methods pm on pm.code = pp.payment_method_code
    where pp.payment_id = p_payment_id and pm.requires_proof = true
  ) and not exists (
    select 1 from public.attachments a
    where a.entity_type = 'PAYMENT' and a.entity_id = p_payment_id
      and a.attachment_type = 'PROOF' and a.is_active = true
  ) then
    raise exception 'Este pago requiere una constancia antes de confirmarse.' using errcode = 'P0001';
  end if;

  v_result := public.confirm_payment(p_payment_id, p_idempotency_key);
  select * into v_payment from public.payments where id = v_result;
  return jsonb_build_object('id', v_payment.id, 'stateCode', v_payment.state_code, 'version', v_payment.version);
end;
$$;

create or replace function public.reject_payment_v1(
  p_payment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_actor uuid := private.current_actor_id();
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'El rechazo requiere un motivo.'; end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Pago no encontrado.' using errcode = 'P0002'; end if;
  if v_payment.state_code <> 'PENDING' then raise exception 'Solo se puede rechazar un pago pendiente.'; end if;

  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.payments
  set state_code = 'REJECTED', rejected_at = now(), rejected_by = v_actor,
      rejection_reason = btrim(p_reason), updated_by = v_actor
  where id = p_payment_id returning * into v_payment;

  return jsonb_build_object('id', v_payment.id, 'stateCode', v_payment.state_code, 'version', v_payment.version);
end;
$$;

create or replace function public.reverse_payment_v1(
  p_payment_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_result uuid;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if exists (
    select 1
    from public.receipt_payment_allocations rpa
    join public.sales_receipts r on r.id = rpa.receipt_id
    where rpa.payment_id = p_payment_id and r.state_code = 'ISSUED'
  ) then
    raise exception 'Primero anula la boleta emitida y registra su nota de crédito.' using errcode = 'P0001';
  end if;
  v_result := public.reverse_payment(p_payment_id, p_reason, p_idempotency_key);
  select * into v_payment from public.payments where id = v_result;
  return jsonb_build_object('id', v_payment.id, 'stateCode', v_payment.state_code, 'version', v_payment.version);
end;
$$;

create or replace function public.create_receipt_v1(
  p_sale_id uuid,
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
  v_sale public.sales%rowtype;
  v_receipt public.sales_receipts%rowtype;
  v_allocation jsonb;
  v_payment public.payments%rowtype;
  v_amount numeric(14,2);
  v_total numeric(14,2) := 0;
  v_full_number text;
  v_existing jsonb;
  v_existing_hash text;
  v_response jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if jsonb_typeof(p_input -> 'allocations') <> 'array' or jsonb_array_length(p_input -> 'allocations') = 0 then
    raise exception 'La boleta debe asociarse al menos a un pago confirmado.';
  end if;
  if nullif(btrim(p_input ->> 'series'), '') is null or nullif(btrim(p_input ->> 'receiptNumber'), '') is null then
    raise exception 'La serie y el número de boleta son obligatorios.';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'La clave de idempotencia es obligatoria.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('CREATE_RECEIPT:' || p_idempotency_key, 0));
  select response_payload, request_hash into v_existing, v_existing_hash
  from public.idempotency_keys
  where scope = 'CREATE_RECEIPT' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_existing is not null then
    if v_existing_hash is distinct from pg_catalog.md5((jsonb_build_object('saleId', p_sale_id, 'input', p_input))::text) then
      raise exception 'La clave de idempotencia ya fue utilizada con otros datos.';
    end if;
    return v_existing;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id, request_hash, status, expires_at)
  values ('CREATE_RECEIPT', p_idempotency_key, v_actor,
    pg_catalog.md5((jsonb_build_object('saleId', p_sale_id, 'input', p_input))::text),
    'IN_PROGRESS', now() + interval '24 hours')
  on conflict (scope, idempotency_key) do update set actor_user_id = excluded.actor_user_id,
    request_hash = excluded.request_hash, status = 'IN_PROGRESS', locked_at = now(), expires_at = excluded.expires_at;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Venta no encontrada.' using errcode = 'P0002'; end if;

  v_full_number := upper(btrim(p_input ->> 'series')) || '-' || btrim(p_input ->> 'receiptNumber');

  insert into public.sales_receipts(
    code, sale_id, state_code, receipt_type, series, receipt_number, full_number,
    issue_date, amount, currency_code, notes, created_by, updated_by
  ) values (
    public.next_business_code('RECEIPT'), p_sale_id, 'PENDING',
    coalesce(nullif(p_input ->> 'receiptType', ''), 'BOLETA'),
    upper(btrim(p_input ->> 'series')), btrim(p_input ->> 'receiptNumber'), v_full_number,
    (p_input ->> 'issueDate')::date, 0, v_sale.currency_code,
    nullif(btrim(p_input ->> 'notes'), ''), v_actor, v_actor
  ) returning * into v_receipt;

  for v_allocation in select value from jsonb_array_elements(p_input -> 'allocations')
  loop
    select * into v_payment from public.payments
    where id = (v_allocation ->> 'paymentId')::uuid and sale_id = p_sale_id and state_code = 'CONFIRMED'
    for update;
    if not found then raise exception 'La boleta solo puede asociarse a pagos confirmados de la misma venta.'; end if;

    v_amount := round((v_allocation ->> 'amount')::numeric, 2);
    if v_amount <= 0 then raise exception 'Cada importe asignado debe ser mayor que cero.'; end if;
    v_total := v_total + v_amount;

    insert into public.receipt_payment_allocations(receipt_id, payment_id, allocated_amount)
    values (v_receipt.id, v_payment.id, v_amount);
  end loop;

  if v_total <= 0 then raise exception 'El importe de la boleta debe ser mayor que cero.'; end if;

  update public.sales_receipts
  set state_code = 'ISSUED', updated_by = v_actor
  where id = v_receipt.id returning * into v_receipt;

  v_response := jsonb_build_object('id', v_receipt.id, 'stateCode', v_receipt.state_code, 'version', v_receipt.version);
  update public.idempotency_keys
  set status = 'COMPLETED', resource_type = 'RECEIPT', resource_id = v_receipt.id,
      response_payload = v_response, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'CREATE_RECEIPT' and idempotency_key = p_idempotency_key;
  return v_response;
exception
  when others then
    update public.idempotency_keys set status = 'FAILED', completed_at = now()
    where scope = 'CREATE_RECEIPT' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

create or replace function public.annul_receipt_v1(
  p_receipt_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.sales_receipts%rowtype;
  v_actor uuid := private.current_actor_id();
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'La anulación requiere un motivo.'; end if;
  select * into v_receipt from public.sales_receipts where id = p_receipt_id for update;
  if not found then raise exception 'Boleta no encontrada.' using errcode = 'P0002'; end if;
  if v_receipt.state_code <> 'ISSUED' then raise exception 'Solo se puede anular una boleta emitida.'; end if;

  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.sales_receipts
  set state_code = 'ANNULLED', annulled_at = now(), annulled_by = v_actor,
      annulment_reason = btrim(p_reason), updated_by = v_actor
  where id = p_receipt_id returning * into v_receipt;

  return jsonb_build_object('id', v_receipt.id, 'stateCode', v_receipt.state_code, 'version', v_receipt.version);
end;
$$;

create or replace function public.create_credit_note_v1(
  p_receipt_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.sales_receipts%rowtype;
  v_note public.credit_notes%rowtype;
  v_actor uuid := private.current_actor_id();
  v_amount numeric(14,2);
  v_full_number text;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_input ->> 'reason', ''))) < 5 then raise exception 'La nota de crédito requiere un motivo.'; end if;

  select * into v_receipt from public.sales_receipts where id = p_receipt_id for update;
  if not found then raise exception 'Boleta no encontrada.' using errcode = 'P0002'; end if;
  if v_receipt.state_code <> 'ANNULLED' then raise exception 'Primero debe anularse la boleta.'; end if;
  if exists(select 1 from public.credit_notes where receipt_id = p_receipt_id) then
    raise exception 'La boleta ya tiene una nota de crédito registrada.';
  end if;

  v_amount := round((p_input ->> 'amount')::numeric, 2);
  if v_amount <> v_receipt.amount then
    raise exception 'La nota de crédito debe cubrir el importe completo de la boleta anulada.';
  end if;
  v_full_number := upper(btrim(p_input ->> 'series')) || '-' || btrim(p_input ->> 'noteNumber');

  insert into public.credit_notes(
    code, receipt_id, series, note_number, full_number, issue_date,
    amount, currency_code, reason, created_by
  ) values (
    public.next_business_code('CREDIT_NOTE'), p_receipt_id,
    upper(btrim(p_input ->> 'series')), btrim(p_input ->> 'noteNumber'), v_full_number,
    (p_input ->> 'issueDate')::date, v_amount, v_receipt.currency_code,
    btrim(p_input ->> 'reason'), v_actor
  ) returning * into v_note;

  update public.sales_receipts set state_code = 'CREDIT_NOTE', updated_by = v_actor
  where id = p_receipt_id;

  return jsonb_build_object('id', v_note.id, 'stateCode', 'CREDIT_NOTE', 'version', v_note.version);
end;
$$;

create or replace function public.calculate_late_penalty_v1(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_penalty public.penalties%rowtype;
  v_actor uuid := private.current_actor_id();
  v_rule jsonb;
  v_enabled boolean;
  v_unit numeric(14,2);
  v_currency text;
  v_days integer;
  v_amount numeric(14,2);
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Venta no encontrada.' using errcode = 'P0002'; end if;
  if v_sale.due_at is null then raise exception 'La venta no tiene fecha de vencimiento.'; end if;
  if v_sale.balance_amount <= 0 then raise exception 'La venta no tiene saldo pendiente.'; end if;

  select setting_value into v_rule from public.business_settings where setting_key = 'penalties.late_daily';
  v_enabled := coalesce((v_rule ->> 'enabled')::boolean, true);
  v_unit := coalesce((v_rule ->> 'amount')::numeric, 1);
  v_currency := coalesce(v_rule ->> 'currency', 'PEN');
  if not v_enabled then raise exception 'La penalidad diaria está desactivada.'; end if;
  if v_currency <> v_sale.currency_code then raise exception 'La moneda de la regla no coincide con la venta.'; end if;

  v_days := greatest(
    (now() at time zone 'America/Lima')::date - (v_sale.due_at at time zone 'America/Lima')::date,
    0
  );
  if v_days = 0 then raise exception 'La venta todavía no tiene días de retraso.' using errcode = 'P0001'; end if;
  v_amount := round(v_days * v_unit, 2);

  perform set_config('app.audit_reason', 'Actualización de penalidad diaria por atraso', true);
  select * into v_penalty from public.penalties
  where sale_id = p_sale_id and penalty_type = 'LATE_DAILY' and status = 'ACTIVE'
  for update;

  if found then
    update public.penalties
    set client_id = v_sale.client_id,
        quantity_basis = v_days,
        unit_amount = v_unit,
        amount = v_amount,
        currency_code = v_sale.currency_code,
        calculated_from = v_sale.due_at,
        calculated_to = now(),
        rule_snapshot = v_rule,
        reason = format('Penalidad de %s día(s) de retraso a S/%s por día.', v_days, v_unit),
        updated_at = now()
    where id = v_penalty.id returning * into v_penalty;
  else
    insert into public.penalties(
      sale_id, client_id, penalty_type, quantity_basis, unit_amount, amount,
      currency_code, calculated_from, calculated_to, rule_snapshot, reason,
      status, approved_by, created_by
    ) values (
      p_sale_id, v_sale.client_id, 'LATE_DAILY', v_days, v_unit, v_amount,
      v_sale.currency_code, v_sale.due_at, now(), v_rule,
      format('Penalidad de %s día(s) de retraso a S/%s por día.', v_days, v_unit),
      'ACTIVE', v_actor, v_actor
    ) returning * into v_penalty;
  end if;

  perform public.refresh_sale_totals(p_sale_id);
  return jsonb_build_object('id', v_penalty.id, 'stateCode', v_penalty.status, 'version', v_penalty.version);
end;
$$;

create or replace function public.waive_penalty_v1(
  p_penalty_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_penalty public.penalties%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'La exoneración requiere un motivo.'; end if;
  select * into v_penalty from public.penalties where id = p_penalty_id for update;
  if not found then raise exception 'Penalidad no encontrada.' using errcode = 'P0002'; end if;
  if v_penalty.status <> 'ACTIVE' then raise exception 'Solo se puede exonerar una penalidad activa.'; end if;

  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.penalties
  set status = 'WAIVED', reason = reason || E'\nExoneración: ' || btrim(p_reason), updated_at = now()
  where id = p_penalty_id returning * into v_penalty;
  perform public.refresh_sale_totals(v_penalty.sale_id);
  return jsonb_build_object('id', v_penalty.id, 'stateCode', v_penalty.status, 'version', v_penalty.version);
end;
$$;

create or replace function private.validate_receipt_payment_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_sale uuid;
  v_payment_sale uuid;
  v_payment_amount numeric(14,2);
  v_already_allocated numeric(14,2);
begin
  select sale_id into v_receipt_sale from public.sales_receipts where id = new.receipt_id;
  select sale_id, declared_amount into v_payment_sale, v_payment_amount
  from public.payments where id = new.payment_id and state_code = 'CONFIRMED';

  if v_receipt_sale is null or v_payment_sale is null or v_receipt_sale <> v_payment_sale then
    raise exception 'La boleta y el pago deben pertenecer a la misma venta, y el pago debe estar confirmado.';
  end if;

  select coalesce(sum(rpa.allocated_amount), 0) into v_already_allocated
  from public.receipt_payment_allocations rpa
  join public.sales_receipts r on r.id = rpa.receipt_id
  where rpa.payment_id = new.payment_id
    and rpa.receipt_id <> new.receipt_id
    and r.state_code not in ('ANNULLED', 'CREDIT_NOTE');

  if v_already_allocated + new.allocated_amount > v_payment_amount then
    raise exception 'La suma asignada a boletas supera el importe confirmado del pago.';
  end if;
  return new;
end;
$$;

revoke all on function public.get_payment_support_v1() from public;
revoke all on function public.get_sale_financial_detail_v1(uuid) from public;
revoke all on function public.create_payment_v1(uuid, jsonb, text) from public;
revoke all on function public.confirm_payment_v1(uuid, text) from public;
revoke all on function public.reject_payment_v1(uuid, text) from public;
revoke all on function public.reverse_payment_v1(uuid, text, text) from public;
revoke all on function public.create_receipt_v1(uuid, jsonb, text) from public;
revoke all on function public.annul_receipt_v1(uuid, text) from public;
revoke all on function public.create_credit_note_v1(uuid, jsonb) from public;
revoke all on function public.calculate_late_penalty_v1(uuid) from public;
revoke all on function public.waive_penalty_v1(uuid, text) from public;

grant execute on function public.get_payment_support_v1() to authenticated;
grant execute on function public.get_sale_financial_detail_v1(uuid) to authenticated;
grant execute on function public.create_payment_v1(uuid, jsonb, text) to authenticated;
grant execute on function public.confirm_payment_v1(uuid, text) to authenticated;
grant execute on function public.reject_payment_v1(uuid, text) to authenticated;
grant execute on function public.reverse_payment_v1(uuid, text, text) to authenticated;
grant execute on function public.create_receipt_v1(uuid, jsonb, text) to authenticated;
grant execute on function public.annul_receipt_v1(uuid, text) to authenticated;
grant execute on function public.create_credit_note_v1(uuid, jsonb) to authenticated;
grant execute on function public.calculate_late_penalty_v1(uuid) to authenticated;
grant execute on function public.waive_penalty_v1(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;
