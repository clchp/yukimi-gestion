-- Yukimi Gestión
-- Migración 007: funciones, triggers y operaciones atómicas

begin;

-- =========================================================
-- Identidad, autorización y utilidades transversales
-- =========================================================

create or replace function private.current_actor_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id text;
begin
  v_user_id := nullif(current_setting('app.user_id', true), '');
  if v_user_id is not null then
    return v_user_id::uuid;
  end if;
  return auth.uid();
exception
  when invalid_text_representation then
    return auth.uid();
end;
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = private.current_actor_id()
      and p.is_active = true
  );
$$;

create or replace function private.has_role(p_role_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    join public.app_roles r on r.code = ur.role_code
    where ur.user_id = private.current_actor_id()
      and ur.role_code = p_role_code
      and ur.revoked_at is null
      and p.is_active = true
      and r.is_active = true
  );
$$;

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('ADMIN');
$$;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email_snapshot,
    display_name,
    is_active
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, 'Usuario'), '@', 1)),
    false
  )
  on conflict (id) do update
    set email_snapshot = excluded.email_snapshot,
        display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_yukimi on auth.users;
create trigger on_auth_user_created_yukimi
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create or replace function private.bootstrap_admin_by_email(
  p_email extensions.citext,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select u.id
  into v_user_id
  from auth.users u
  where lower(u.email) = lower(p_email::text)
  limit 1;

  if v_user_id is null then
    raise exception 'No existe un usuario de Auth con el correo %', p_email;
  end if;

  insert into public.profiles(id, email_snapshot, display_name, is_active)
  select u.id,
         u.email,
         coalesce(nullif(p_display_name, ''), u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1)),
         true
  from auth.users u
  where u.id = v_user_id
  on conflict (id) do update
    set email_snapshot = excluded.email_snapshot,
        display_name = excluded.display_name,
        is_active = true,
        updated_at = now();

  insert into public.user_roles(user_id, role_code, granted_by)
  values (v_user_id, 'ADMIN', v_user_id)
  on conflict (user_id, role_code) do update
    set revoked_at = null,
        granted_at = now(),
        granted_by = excluded.granted_by;

  return v_user_id;
end;
$$;

create or replace function public.next_business_code(p_counter_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_value bigint;
  v_padding smallint;
begin
  update public.business_counters
  set last_value = last_value + 1,
      updated_at = now()
  where counter_key = p_counter_key
  returning prefix, last_value, padding
  into v_prefix, v_value, v_padding;

  if not found then
    raise exception 'No existe el contador de negocio: %', p_counter_key;
  end if;

  return v_prefix || lpad(v_value::text, v_padding, '0');
end;
$$;

create or replace function private.assign_business_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counter_key text := tg_argv[0];
  v_column_name text := tg_argv[1];
  v_current_value text;
  v_new_code text;
begin
  v_current_value := to_jsonb(new) ->> v_column_name;

  if v_current_value is null or btrim(v_current_value) = '' then
    v_new_code := public.next_business_code(v_counter_key);
    new := jsonb_populate_record(new, jsonb_build_object(v_column_name, v_new_code));
  end if;

  return new;
end;
$$;

create or replace function private.touch_updated_at_and_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

create or replace function private.prevent_hard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'supabase_admin')
     or coalesce(current_setting('app.allow_hard_delete', true), 'false') = 'true' then
    return old;
  end if;

  raise exception 'El borrado físico no está permitido para %.%. Use anulación, reversión o desactivación.', tg_table_schema, tg_table_name
    using errcode = 'P0001';
end;
$$;

-- =========================================================
-- Auditoría
-- =========================================================

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_entity_id text;
  v_reason text;
  v_request_id text;
  v_session_id text;
  v_actor_role text;
  v_ip inet;
  v_user_agent text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_entity_id := coalesce(v_new ->> 'id', v_new ->> 'code');
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_entity_id := coalesce(v_new ->> 'id', v_new ->> 'code');
  else
    v_old := to_jsonb(old);
    v_entity_id := coalesce(v_old ->> 'id', v_old ->> 'code');
  end if;

  -- Evita guardar secretos o claves de suscripción en el log.
  v_old := v_old - array['auth_key', 'p256dh_key', 'request_hash'];
  v_new := v_new - array['auth_key', 'p256dh_key', 'request_hash'];

  v_reason := nullif(current_setting('app.audit_reason', true), '');
  v_request_id := nullif(current_setting('app.request_id', true), '');
  v_session_id := nullif(current_setting('app.session_id', true), '');
  v_actor_role := nullif(current_setting('request.jwt.claim.role', true), '');
  v_user_agent := nullif(current_setting('app.user_agent', true), '');

  begin
    v_ip := nullif(current_setting('app.client_ip', true), '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into public.audit_log (
    actor_user_id,
    actor_role,
    request_id,
    session_id,
    client_ip,
    user_agent,
    schema_name,
    table_name,
    entity_id,
    action,
    old_values,
    new_values,
    reason
  ) values (
    private.current_actor_id(),
    v_actor_role,
    v_request_id,
    v_session_id,
    v_ip,
    v_user_agent,
    tg_table_schema,
    tg_table_name,
    v_entity_id,
    tg_op,
    v_old,
    v_new,
    v_reason
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- =========================================================
-- Validación de transiciones de estado configurables
-- =========================================================

create or replace function private.validate_workflow_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow_code text := tg_argv[0];
  v_state_column text := tg_argv[1];
  v_old_state text;
  v_new_state text;
  v_requires_reason boolean;
begin
  v_old_state := to_jsonb(old) ->> v_state_column;
  v_new_state := to_jsonb(new) ->> v_state_column;

  if v_old_state is not distinct from v_new_state then
    return new;
  end if;

  select wt.requires_reason
  into v_requires_reason
  from public.workflow_transitions wt
  where wt.workflow_code = v_workflow_code
    and wt.from_state_code = v_old_state
    and wt.to_state_code = v_new_state
    and wt.is_active = true;

  if not found then
    raise exception 'Transición no permitida en %: % -> %', v_workflow_code, v_old_state, v_new_state;
  end if;

  if v_requires_reason and nullif(current_setting('app.audit_reason', true), '') is null then
    raise exception 'La transición % -> % requiere un motivo.', v_old_state, v_new_state;
  end if;

  return new;
end;
$$;

-- =========================================================
-- Inventario: ledger, saldos y concurrencia
-- =========================================================

create or replace function private.validate_inventory_movement_reason()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requires_reason boolean;
begin
  select requires_reason
  into v_requires_reason
  from public.inventory_movement_types
  where code = new.movement_type_code;

  if coalesce(v_requires_reason, false) and nullif(btrim(new.reason), '') is null then
    raise exception 'El movimiento de inventario % requiere un motivo.', new.movement_type_code;
  end if;

  return new;
end;
$$;

create or replace function private.apply_inventory_movement_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot_variant uuid;
  v_total_available integer;
  v_minimum_stock integer;
  v_dedup_key text;
begin
  select variant_id into v_lot_variant
  from public.inventory_lots
  where id = new.lot_id;

  if v_lot_variant is distinct from new.variant_id then
    raise exception 'El lote % no pertenece a la variante %.', new.lot_id, new.variant_id;
  end if;

  if new.quantity_delta < 0 then
    update public.inventory_balances
    set quantity = quantity + new.quantity_delta,
        updated_at = now(),
        version = version + 1
    where variant_id = new.variant_id
      and lot_id = new.lot_id
      and warehouse_id = new.warehouse_id
      and bucket_code = new.bucket_code
      and quantity + new.quantity_delta >= 0;

    if not found then
      raise exception 'Stock insuficiente para variante %, lote %, almacén %, estado %.',
        new.variant_id, new.lot_id, new.warehouse_id, new.bucket_code
        using errcode = 'P0001';
    end if;
  else
    insert into public.inventory_balances (
      variant_id, lot_id, warehouse_id, bucket_code, quantity
    ) values (
      new.variant_id, new.lot_id, new.warehouse_id, new.bucket_code, new.quantity_delta
    )
    on conflict (variant_id, lot_id, warehouse_id, bucket_code)
    do update set
      quantity = public.inventory_balances.quantity + excluded.quantity,
      updated_at = now(),
      version = public.inventory_balances.version + 1;
  end if;

  if new.bucket_code = 'AVAILABLE' then
    select coalesce(sum(ib.quantity), 0), pv.minimum_stock
    into v_total_available, v_minimum_stock
    from public.product_variants pv
    left join public.inventory_balances ib
      on ib.variant_id = pv.id
     and ib.bucket_code = 'AVAILABLE'
    where pv.id = new.variant_id
    group by pv.minimum_stock;

    if v_minimum_stock > 0 and v_total_available <= v_minimum_stock then
      v_dedup_key := 'stock-low:' || new.variant_id::text || ':' ||
        to_char(now() at time zone 'America/Lima', 'YYYYMMDD');

      insert into public.outbox_events (
        event_type,
        aggregate_type,
        aggregate_id,
        payload,
        deduplication_key
      ) values (
        'STOCK_LOW',
        'PRODUCT_VARIANT',
        new.variant_id,
        jsonb_build_object(
          'variant_id', new.variant_id,
          'available_quantity', v_total_available,
          'minimum_stock', v_minimum_stock
        ),
        v_dedup_key
      )
      on conflict (deduplication_key) where deduplication_key is not null do nothing;
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.prevent_inventory_line_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Las líneas del libro de inventario son inmutables. Registre un movimiento compensatorio.';
end;
$$;

create or replace function public.create_inventory_movement(
  p_movement_type_code text,
  p_reference_type text,
  p_reference_id uuid,
  p_reason text,
  p_lines jsonb,
  p_idempotency_key text default null,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement_id uuid;
  v_line record;
  v_requires_reason boolean;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('INVENTORY_MOVEMENT:' || p_idempotency_key, 0)
    );

    select id into v_movement_id
    from public.inventory_movements
    where idempotency_key = p_idempotency_key;

    if v_movement_id is not null then
      return v_movement_id;
    end if;
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Debe proporcionar al menos una línea de movimiento.';
  end if;

  select requires_reason
  into v_requires_reason
  from public.inventory_movement_types
  where code = p_movement_type_code and is_active = true;

  if not found then
    raise exception 'Tipo de movimiento inválido: %', p_movement_type_code;
  end if;

  if v_requires_reason and nullif(btrim(p_reason), '') is null then
    raise exception 'El movimiento requiere un motivo.';
  end if;

  insert into public.inventory_movements (
    code,
    movement_type_code,
    reference_type,
    reference_id,
    reason,
    notes,
    idempotency_key,
    created_by,
    metadata
  ) values (
    public.next_business_code('INVENTORY_MOVEMENT'),
    p_movement_type_code,
    p_reference_type,
    p_reference_id,
    p_reason,
    p_notes,
    p_idempotency_key,
    private.current_actor_id(),
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_movement_id;

  for v_line in
    select *
    from jsonb_to_recordset(p_lines) as x(
      variant_id uuid,
      lot_id uuid,
      warehouse_id uuid,
      bucket_code text,
      quantity_delta integer,
      unit_cost_pen numeric
    )
  loop
    if v_line.quantity_delta is null or v_line.quantity_delta = 0 then
      raise exception 'Cada línea debe tener quantity_delta distinto de cero.';
    end if;

    insert into public.inventory_movement_lines (
      movement_id,
      variant_id,
      lot_id,
      warehouse_id,
      bucket_code,
      quantity_delta,
      unit_cost_pen
    ) values (
      v_movement_id,
      v_line.variant_id,
      v_line.lot_id,
      v_line.warehouse_id,
      v_line.bucket_code,
      v_line.quantity_delta,
      v_line.unit_cost_pen
    );
  end loop;

  return v_movement_id;
end;
$$;

-- =========================================================
-- Pagos, ventas y finanzas
-- =========================================================

create or replace function private.populate_sale_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into v_client
    from public.clients
    where id = new.client_id and is_active = true;
  elsif new.client_id is distinct from old.client_id then
    select * into v_client
    from public.clients
    where id = new.client_id and is_active = true;
  else
    return new;
  end if;

  if not found then
    raise exception 'El cliente no existe o está inactivo.';
  end if;

  new.client_name_snapshot := v_client.full_name;
  new.client_phone_snapshot := v_client.phone;
  return new;
end;
$$;

create or replace function private.populate_sale_item_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant public.product_variants%rowtype;
  v_product public.products%rowtype;
  v_category_name text;
  v_sale_currency char(3);
begin
  select * into v_variant
  from public.product_variants
  where id = new.variant_id
    and is_active = true;

  if not found then
    raise exception 'La variante no existe o está inactiva.';
  end if;

  select * into v_product
  from public.products
  where id = v_variant.product_id
    and is_active = true;

  if not found then
    raise exception 'El producto no existe o está inactivo.';
  end if;

  select name into v_category_name
  from public.product_categories
  where id = v_product.category_id;

  select currency_code into v_sale_currency
  from public.sales
  where id = new.sale_id;

  if v_sale_currency is null then
    raise exception 'La venta indicada no existe.';
  end if;

  new.product_name_snapshot := v_product.name;
  new.variant_name_snapshot := v_variant.variant_name;
  new.sku_snapshot := v_variant.sku;
  new.category_name_snapshot := v_category_name;
  new.currency_code := v_sale_currency;
  new.original_unit_price := coalesce(new.original_unit_price, v_variant.sale_price);
  new.final_unit_price := coalesce(new.final_unit_price, new.original_unit_price, v_variant.sale_price);

  return new;
end;
$$;

create or replace function private.protect_sale_derived_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_sale_total_update', true), 'false') <> 'true'
     and (
       new.subtotal is distinct from old.subtotal
       or new.discount_total is distinct from old.discount_total
       or new.penalty_total is distinct from old.penalty_total
       or new.shipping_charge_total is distinct from old.shipping_charge_total
       or new.total_amount is distinct from old.total_amount
       or new.paid_total is distinct from old.paid_total
       or new.refunded_total is distinct from old.refunded_total
       or new.balance_amount is distinct from old.balance_amount
     ) then
    raise exception 'Los totales de la venta son derivados y no pueden editarse directamente.';
  end if;
  return new;
end;
$$;

create or replace function private.protect_payment_declared_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_payment_amount_update', true), 'false') <> 'true'
     and new.declared_amount is distinct from old.declared_amount then
    raise exception 'El importe del pago se calcula desde sus medios y no puede editarse directamente.';
  end if;
  return new;
end;
$$;

create or replace function private.protect_account_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_account_balance_update', true), 'false') <> 'true'
     and (
       new.current_balance is distinct from old.current_balance
       or new.balance_as_of is distinct from old.balance_as_of
     ) then
    raise exception 'El saldo de la cuenta es derivado y no puede editarse directamente.';
  end if;
  return new;
end;
$$;

create or replace function private.ensure_payment_part_mutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_payment_id uuid;
begin
  if tg_op = 'DELETE' then
    v_payment_id := old.payment_id;
  else
    v_payment_id := new.payment_id;
  end if;

  select state_code into v_state
  from public.payments
  where id = v_payment_id
  for update;

  if v_state <> 'PENDING' then
    raise exception 'No se pueden modificar los medios de un pago que ya no está pendiente.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.validate_payment_part_account_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_currency char(3);
  v_payment_currency char(3);
begin
  select currency_code into v_account_currency
  from public.financial_accounts
  where id = new.financial_account_id
    and is_active = true;

  if v_account_currency is null then
    raise exception 'La cuenta financiera indicada no existe o está inactiva.';
  end if;

  select currency_code into v_payment_currency
  from public.payments
  where id = new.payment_id;

  if v_payment_currency is null then
    raise exception 'El pago indicado no existe.';
  end if;

  if new.currency_code <> v_payment_currency then
    raise exception 'La moneda del medio de pago debe coincidir con la moneda del pago.';
  end if;

  if new.currency_code <> v_account_currency then
    raise exception 'La moneda del medio de pago debe coincidir con la moneda de la cuenta financiera.';
  end if;

  return new;
end;
$$;

create or replace function private.validate_sale_item_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_currency char(3);
begin
  select currency_code into v_sale_currency
  from public.sales
  where id = new.sale_id;

  if v_sale_currency is null then
    raise exception 'La venta indicada no existe.';
  end if;

  if new.currency_code <> v_sale_currency then
    raise exception 'La moneda del producto debe coincidir con la moneda de la venta.';
  end if;

  return new;
end;
$$;

create or replace function private.refresh_payment_declared_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
begin
  if tg_op = 'DELETE' then
    v_payment_id := old.payment_id;
  else
    v_payment_id := new.payment_id;
  end if;

  update public.payments p
  set declared_amount = coalesce((
        select round(sum(pp.amount), 2)
        from public.payment_parts pp
        where pp.payment_id = v_payment_id
      ), 0),
      updated_at = now(),
      version = version + 1
  where p.id = v_payment_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.refresh_sale_totals(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subtotal numeric(14,2);
  v_line_discount numeric(14,2);
  v_extra_discount numeric(14,2);
  v_penalties numeric(14,2);
  v_shipping numeric(14,2);
  v_paid numeric(14,2);
  v_refunded numeric(14,2);
  v_total numeric(14,2);
  v_balance numeric(14,2);
  v_payment_state text;
  v_due_at timestamptz;
begin
  perform 1 from public.sales where id = p_sale_id for update;
  if not found then
    return;
  end if;

  select
    coalesce(round(sum(si.line_subtotal), 2), 0),
    coalesce(round(sum(si.line_discount_total), 2), 0)
  into v_subtotal, v_line_discount
  from public.sale_items si
  where si.sale_id = p_sale_id
    and si.item_status not in ('CANCELLED', 'RELEASED');

  select coalesce(round(sum(sd.calculated_amount), 2), 0)
  into v_extra_discount
  from public.sale_discounts sd
  where sd.sale_id = p_sale_id
    and sd.sale_item_id is null
    and sd.is_active = true;

  select coalesce(round(sum(p.amount), 2), 0)
  into v_penalties
  from public.penalties p
  where p.sale_id = p_sale_id
    and p.status = 'ACTIVE';

  select coalesce(round(sum(d.shipping_cost), 2), 0)
  into v_shipping
  from public.deliveries d
  where d.sale_id = p_sale_id
    and d.cost_payer = 'CLIENT'
    and d.state_code <> 'CANCELLED';

  select coalesce(round(sum(p.declared_amount), 2), 0)
  into v_paid
  from public.payments p
  where p.sale_id = p_sale_id
    and p.state_code = 'CONFIRMED';

  select coalesce(round(sum(r.amount), 2), 0)
  into v_refunded
  from public.refunds r
  where r.sale_id = p_sale_id
    and r.state_code = 'PROCESSED';

  v_total := greatest(round(v_subtotal - v_line_discount - v_extra_discount + v_penalties + v_shipping, 2), 0);
  v_balance := round(v_total - v_paid + v_refunded, 2);

  select due_at into v_due_at from public.sales where id = p_sale_id;

  if v_paid <= 0 then
    v_payment_state := case when v_due_at is not null and v_due_at < now() and v_total > 0 then 'OVERDUE' else 'UNPAID' end;
  elsif v_paid < v_total then
    v_payment_state := case when v_due_at is not null and v_due_at < now() then 'OVERDUE' else 'PARTIAL' end;
  else
    v_payment_state := 'PAID';
  end if;

  perform set_config('app.allow_sale_total_update', 'true', true);

  update public.sales
  set subtotal = v_subtotal,
      discount_total = v_line_discount + v_extra_discount,
      penalty_total = v_penalties,
      shipping_charge_total = v_shipping,
      total_amount = v_total,
      paid_total = v_paid,
      refunded_total = v_refunded,
      balance_amount = v_balance,
      payment_state_code = v_payment_state,
      updated_at = now(),
      version = version + 1
  where id = p_sale_id;
end;
$$;

create or replace function private.refresh_sale_totals_from_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_id uuid;
begin
  if tg_op = 'DELETE' then
    v_sale_id := old.sale_id;
  else
    v_sale_id := new.sale_id;
  end if;

  perform public.refresh_sale_totals(v_sale_id);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.validate_financial_entry_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_currency char(3);
  v_account_currency char(3);
begin
  select currency_code into v_transaction_currency
  from public.financial_transactions
  where id = new.financial_transaction_id;

  select currency_code into v_account_currency
  from public.financial_accounts
  where id = new.financial_account_id
    and is_active = true;

  if v_transaction_currency is null or v_account_currency is null then
    raise exception 'La transacción o la cuenta financiera no existe o está inactiva.';
  end if;

  if v_transaction_currency <> v_account_currency then
    raise exception 'La moneda de la cuenta debe coincidir con la moneda de la transacción.';
  end if;

  return new;
end;
$$;

create or replace function private.apply_financial_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.allow_account_balance_update', 'true', true);

  update public.financial_accounts
  set current_balance = round(current_balance + new.amount_signed, 2),
      balance_as_of = now(),
      updated_at = now(),
      version = version + 1
  where id = new.financial_account_id;

  if not found then
    raise exception 'Cuenta financiera inexistente: %', new.financial_account_id;
  end if;

  return new;
end;
$$;

create or replace function private.prevent_financial_entry_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Las líneas financieras publicadas son inmutables. Registre una transacción de reversión.';
end;
$$;

create or replace function public.confirm_sale(
  p_sale_id uuid,
  p_allocations jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_allocation record;
  v_movement_id uuid;
  v_default_term_days integer;
  v_vip_term_days integer;
  v_due_at timestamptz;
  v_existing_resource uuid;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'La clave de idempotencia es obligatoria para confirmar una venta.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('CONFIRM_SALE:' || p_idempotency_key, 0)
  );

  select resource_id into v_existing_resource
  from public.idempotency_keys
  where scope = 'CONFIRM_SALE'
    and idempotency_key = p_idempotency_key
    and status = 'COMPLETED';

  if v_existing_resource is not null then
    return v_existing_resource;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('CONFIRM_SALE', p_idempotency_key, private.current_actor_id())
  on conflict (scope, idempotency_key) do nothing;

  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  if v_sale.commercial_state_code not in ('DRAFT', 'PENDING_CONFIRMATION') then
    raise exception 'La venta no puede confirmarse desde el estado %.', v_sale.commercial_state_code;
  end if;

  if not exists (
    select 1
    from public.sale_items si
    where si.sale_id = p_sale_id
      and si.item_status = 'ACTIVE'
  ) then
    raise exception 'La venta debe contener al menos un producto activo.';
  end if;

  if jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Las asignaciones deben enviarse como un arreglo JSON.';
  end if;

  -- Valida que las líneas de stock tengan asignación completa.
  if exists (
    select 1
    from public.sale_items si
    left join (
      select x.sale_item_id, sum(x.quantity) as allocated_quantity
      from jsonb_to_recordset(p_allocations) as x(
        sale_item_id uuid,
        lot_id uuid,
        warehouse_id uuid,
        quantity integer
      )
      group by x.sale_item_id
    ) a on a.sale_item_id = si.id
    where si.sale_id = p_sale_id
      and si.fulfillment_type = 'STOCK'
      and si.item_status = 'ACTIVE'
      and coalesce(a.allocated_quantity, 0) <> si.quantity
  ) then
    raise exception 'Cada producto de stock debe tener asignada exactamente la cantidad vendida.';
  end if;

  insert into public.inventory_movements (
    code,
    movement_type_code,
    reference_type,
    reference_id,
    reason,
    idempotency_key,
    created_by
  ) values (
    public.next_business_code('INVENTORY_MOVEMENT'),
    'RESERVATION',
    'SALE',
    p_sale_id,
    'Reserva de stock por confirmación de venta',
    'sale-reservation:' || p_idempotency_key,
    private.current_actor_id()
  ) returning id into v_movement_id;

  for v_allocation in
    select *
    from jsonb_to_recordset(p_allocations) as x(
      sale_item_id uuid,
      lot_id uuid,
      warehouse_id uuid,
      quantity integer
    )
  loop
    if v_allocation.quantity is null or v_allocation.quantity <= 0 then
      raise exception 'Cantidad de asignación inválida.';
    end if;

    if not exists (
      select 1 from public.sale_items si
      where si.id = v_allocation.sale_item_id
        and si.sale_id = p_sale_id
        and si.fulfillment_type = 'STOCK'
        and si.item_status = 'ACTIVE'
    ) then
      raise exception 'La asignación no corresponde a una línea válida de la venta.';
    end if;

    insert into public.sale_item_allocations (
      sale_item_id,
      lot_id,
      warehouse_id,
      quantity,
      allocation_status,
      created_by,
      updated_by
    ) values (
      v_allocation.sale_item_id,
      v_allocation.lot_id,
      v_allocation.warehouse_id,
      v_allocation.quantity,
      'RESERVED',
      private.current_actor_id(),
      private.current_actor_id()
    );

    insert into public.inventory_movement_lines (
      movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta
    )
    select v_movement_id, si.variant_id, v_allocation.lot_id, v_allocation.warehouse_id, 'AVAILABLE', -v_allocation.quantity
    from public.sale_items si where si.id = v_allocation.sale_item_id;

    insert into public.inventory_movement_lines (
      movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta
    )
    select v_movement_id, si.variant_id, v_allocation.lot_id, v_allocation.warehouse_id, 'RESERVED', v_allocation.quantity
    from public.sale_items si where si.id = v_allocation.sale_item_id;
  end loop;

  select coalesce((setting_value #>> '{}')::integer, 14)
  into v_default_term_days
  from public.business_settings
  where setting_key = 'sales.default_payment_term_days';

  select cvp.payment_term_days
  into v_vip_term_days
  from public.client_vip_profiles cvp
  where cvp.client_id = v_sale.client_id
    and v_sale.client_id in (select id from public.clients where is_vip = true)
    and (cvp.valid_until is null or cvp.valid_until > now());

  v_due_at := coalesce(v_sale.due_at, now() + make_interval(days => coalesce(v_vip_term_days, v_default_term_days, 14)));

  update public.sales
  set commercial_state_code = 'RESERVED',
      reserved_at = coalesce(reserved_at, now()),
      sold_at = coalesce(sold_at, now()),
      due_at = v_due_at,
      updated_by = private.current_actor_id()
  where id = p_sale_id;

  perform public.refresh_sale_totals(p_sale_id);

  insert into public.outbox_events (
    event_type, aggregate_type, aggregate_id, payload, deduplication_key
  ) values (
    'SALE_CONFIRMED',
    'SALE',
    p_sale_id,
    jsonb_build_object('sale_id', p_sale_id, 'inventory_movement_id', v_movement_id),
    'sale-confirmed:' || p_idempotency_key
  ) on conflict (deduplication_key) where deduplication_key is not null do nothing;

  update public.idempotency_keys
  set status = 'COMPLETED',
      resource_type = 'SALE',
      resource_id = p_sale_id,
      completed_at = now()
  where scope = 'CONFIRM_SALE' and idempotency_key = p_idempotency_key;

  return p_sale_id;
exception
  when others then
    update public.idempotency_keys
    set status = 'FAILED', completed_at = now()
    where scope = 'CONFIRM_SALE' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

create or replace function public.confirm_payment(
  p_payment_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_sale public.sales%rowtype;
  v_sum numeric(14,2);
  v_financial_transaction_id uuid;
  v_sales_category_id uuid;
  v_part record;
  v_existing_resource uuid;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'La clave de idempotencia es obligatoria para confirmar un pago.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('CONFIRM_PAYMENT:' || p_idempotency_key, 0)
  );

  select resource_id into v_existing_resource
  from public.idempotency_keys
  where scope = 'CONFIRM_PAYMENT'
    and idempotency_key = p_idempotency_key
    and status = 'COMPLETED';

  if v_existing_resource is not null then
    return v_existing_resource;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('CONFIRM_PAYMENT', p_idempotency_key, private.current_actor_id())
  on conflict (scope, idempotency_key) do nothing;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Pago no encontrado.';
  end if;

  if v_payment.state_code = 'CONFIRMED' then
    return p_payment_id;
  end if;

  if v_payment.state_code <> 'PENDING' then
    raise exception 'El pago no puede confirmarse desde el estado %.', v_payment.state_code;
  end if;

  select * into v_sale
  from public.sales
  where id = v_payment.sale_id
  for update;

  select coalesce(round(sum(amount), 2), 0)
  into v_sum
  from public.payment_parts
  where payment_id = p_payment_id;

  if v_sum <= 0 then
    raise exception 'El pago no contiene medios de pago válidos.';
  end if;

  if v_sum <> v_payment.declared_amount then
    raise exception 'El importe declarado (%) no coincide con la suma de medios (%).', v_payment.declared_amount, v_sum;
  end if;

  if exists (
    select 1 from public.payment_parts
    where payment_id = p_payment_id
      and currency_code <> v_payment.currency_code
  ) then
    raise exception 'Todos los medios del pago deben usar la misma moneda del pago.';
  end if;

  select id into v_sales_category_id
  from public.financial_categories
  where code = 'SALES' and is_active = true;

  if v_sales_category_id is null then
    raise exception 'No existe la categoría financiera SALES.';
  end if;

  insert into public.financial_transactions (
    code,
    transaction_type_code,
    state_code,
    category_id,
    occurred_at,
    description,
    currency_code,
    total_amount,
    source_type,
    source_id,
    idempotency_key,
    is_system_generated,
    created_by,
    approved_by
  ) values (
    public.next_business_code('FINANCIAL_TRANSACTION'),
    'INCOME',
    'POSTED',
    v_sales_category_id,
    v_payment.received_at,
    'Ingreso por pago ' || v_payment.code || ' de venta ' || v_sale.code,
    v_payment.currency_code,
    v_payment.declared_amount,
    'PAYMENT',
    p_payment_id,
    'payment-income:' || p_idempotency_key,
    true,
    private.current_actor_id(),
    private.current_actor_id()
  ) returning id into v_financial_transaction_id;

  for v_part in
    select * from public.payment_parts where payment_id = p_payment_id
  loop
    insert into public.financial_transaction_entries (
      financial_transaction_id,
      financial_account_id,
      amount_signed,
      description
    ) values (
      v_financial_transaction_id,
      v_part.financial_account_id,
      v_part.amount,
      'Pago mediante ' || v_part.payment_method_code
    );
  end loop;

  update public.payments
  set state_code = 'CONFIRMED',
      confirmed_at = now(),
      confirmed_by = private.current_actor_id(),
      financial_transaction_id = v_financial_transaction_id,
      updated_by = private.current_actor_id()
  where id = p_payment_id;

  perform public.refresh_sale_totals(v_payment.sale_id);

  insert into public.outbox_events (
    event_type, aggregate_type, aggregate_id, payload, deduplication_key
  ) values (
    'PAYMENT_CONFIRMED',
    'PAYMENT',
    p_payment_id,
    jsonb_build_object(
      'payment_id', p_payment_id,
      'sale_id', v_payment.sale_id,
      'amount', v_payment.declared_amount,
      'currency', v_payment.currency_code,
      'financial_transaction_id', v_financial_transaction_id
    ),
    'payment-confirmed:' || p_idempotency_key
  ) on conflict (deduplication_key) where deduplication_key is not null do nothing;

  insert into public.outbox_events (
    event_type, aggregate_type, aggregate_id, payload, deduplication_key
  ) values (
    'RECEIPT_PENDING',
    'PAYMENT',
    p_payment_id,
    jsonb_build_object('payment_id', p_payment_id, 'sale_id', v_payment.sale_id),
    'receipt-pending:' || p_payment_id::text
  ) on conflict (deduplication_key) where deduplication_key is not null do nothing;

  update public.idempotency_keys
  set status = 'COMPLETED',
      resource_type = 'PAYMENT',
      resource_id = p_payment_id,
      completed_at = now()
  where scope = 'CONFIRM_PAYMENT' and idempotency_key = p_idempotency_key;

  return p_payment_id;
exception
  when others then
    update public.idempotency_keys
    set status = 'FAILED', completed_at = now()
    where scope = 'CONFIRM_PAYMENT' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

create or replace function public.reverse_payment(
  p_payment_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_original_transaction public.financial_transactions%rowtype;
  v_reversal_id uuid;
  v_entry record;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'La reversión requiere un motivo.';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Pago no encontrado.';
  end if;

  if v_payment.state_code = 'REVERSED' then
    return p_payment_id;
  end if;

  if v_payment.state_code <> 'CONFIRMED' or v_payment.financial_transaction_id is null then
    raise exception 'Solo se puede revertir un pago confirmado con movimiento financiero.';
  end if;

  select * into v_original_transaction
  from public.financial_transactions
  where id = v_payment.financial_transaction_id
  for update;

  perform set_config('app.audit_reason', p_reason, true);

  insert into public.financial_transactions (
    code,
    transaction_type_code,
    state_code,
    category_id,
    occurred_at,
    description,
    currency_code,
    total_amount,
    source_type,
    source_id,
    idempotency_key,
    is_system_generated,
    reversal_of_id,
    reason,
    created_by,
    approved_by
  ) values (
    public.next_business_code('FINANCIAL_TRANSACTION'),
    'REVERSAL',
    'POSTED',
    v_original_transaction.category_id,
    now(),
    'Reversión del pago ' || v_payment.code,
    v_original_transaction.currency_code,
    v_original_transaction.total_amount,
    'PAYMENT_REVERSAL',
    p_payment_id,
    'payment-reversal:' || p_idempotency_key,
    true,
    v_original_transaction.id,
    p_reason,
    private.current_actor_id(),
    private.current_actor_id()
  ) returning id into v_reversal_id;

  for v_entry in
    select *
    from public.financial_transaction_entries
    where financial_transaction_id = v_original_transaction.id
  loop
    insert into public.financial_transaction_entries (
      financial_transaction_id,
      financial_account_id,
      amount_signed,
      description
    ) values (
      v_reversal_id,
      v_entry.financial_account_id,
      -v_entry.amount_signed,
      'Reversión: ' || coalesce(v_entry.description, '')
    );
  end loop;

  update public.financial_transactions
  set state_code = 'REVERSED',
      updated_by = private.current_actor_id()
  where id = v_original_transaction.id;

  update public.payments
  set state_code = 'REVERSED',
      reversed_at = now(),
      reversed_by = private.current_actor_id(),
      reversal_reason = p_reason,
      updated_by = private.current_actor_id()
  where id = p_payment_id;

  perform public.refresh_sale_totals(v_payment.sale_id);

  insert into public.outbox_events (
    event_type, aggregate_type, aggregate_id, payload, deduplication_key
  ) values (
    'PAYMENT_REVERSED',
    'PAYMENT',
    p_payment_id,
    jsonb_build_object('payment_id', p_payment_id, 'sale_id', v_payment.sale_id, 'reason', p_reason),
    'payment-reversed:' || p_idempotency_key
  ) on conflict (deduplication_key) where deduplication_key is not null do nothing;

  return p_payment_id;
end;
$$;

-- =========================================================
-- Reglas de integridad adicionales
-- =========================================================

create or replace function private.validate_sale_item_allocation_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sold integer;
  v_allocated integer;
  v_item_variant uuid;
  v_lot_variant uuid;
begin
  select quantity, variant_id into v_sold, v_item_variant
  from public.sale_items
  where id = new.sale_item_id;

  if v_sold is null then
    raise exception 'La línea de venta no existe.';
  end if;

  select variant_id into v_lot_variant
  from public.inventory_lots
  where id = new.lot_id;

  if v_lot_variant is distinct from v_item_variant then
    raise exception 'El lote asignado no corresponde a la variante vendida.';
  end if;

  select coalesce(sum(a.quantity), 0)
  into v_allocated
  from public.sale_item_allocations a
  where a.sale_item_id = new.sale_item_id
    and a.allocation_status in ('RESERVED', 'ACCUMULATED', 'DELIVERED')
    and a.id <> new.id;

  if v_allocated + new.quantity > v_sold then
    raise exception 'La cantidad asignada supera la cantidad vendida.';
  end if;

  return new;
end;
$$;

create or replace function private.validate_delivery_item_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sold integer;
  v_other_delivered integer;
  v_item_sale_id uuid;
  v_delivery_sale_id uuid;
begin
  select quantity, sale_id into v_sold, v_item_sale_id
  from public.sale_items
  where id = new.sale_item_id;

  select sale_id into v_delivery_sale_id
  from public.deliveries
  where id = new.delivery_id;

  if v_item_sale_id is null or v_delivery_sale_id is null or v_item_sale_id <> v_delivery_sale_id then
    raise exception 'El producto entregado debe pertenecer a la misma venta de la entrega.';
  end if;

  select coalesce(sum(di.quantity), 0)
  into v_other_delivered
  from public.delivery_items di
  join public.deliveries d on d.id = di.delivery_id
  where di.sale_item_id = new.sale_item_id
    and d.state_code <> 'CANCELLED'
    and di.id <> new.id;

  if v_other_delivered + new.quantity > v_sold then
    raise exception 'La cantidad total de entregas supera la cantidad vendida.';
  end if;

  return new;
end;
$$;

create or replace function private.validate_preorder_allocation_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected integer;
  v_allocated integer;
  v_import_variant uuid;
  v_sale_variant uuid;
  v_fulfillment_type text;
begin
  select expected_quantity, variant_id into v_expected, v_import_variant
  from public.import_box_items
  where id = new.import_box_item_id
  for update;

  select variant_id, fulfillment_type into v_sale_variant, v_fulfillment_type
  from public.sale_items
  where id = new.sale_item_id;

  if v_sale_variant is null or v_import_variant is null or v_sale_variant <> v_import_variant then
    raise exception 'La preventa debe corresponder a la misma variante esperada.';
  end if;

  if v_fulfillment_type <> 'PREORDER' then
    raise exception 'Solo una línea de preventa puede asignarse a una importación.';
  end if;

  select coalesce(sum(pa.quantity), 0)
  into v_allocated
  from public.preorder_allocations pa
  where pa.import_box_item_id = new.import_box_item_id
    and pa.status in ('ALLOCATED', 'RECEIVED')
    and pa.id <> new.id;

  if v_allocated + new.quantity > v_expected then
    raise exception 'La preventa supera las unidades esperadas de la importación.';
  end if;

  return new;
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
  select sale_id into v_receipt_sale
  from public.sales_receipts
  where id = new.receipt_id;

  select sale_id, declared_amount into v_payment_sale, v_payment_amount
  from public.payments
  where id = new.payment_id
    and state_code = 'CONFIRMED';

  if v_receipt_sale is null or v_payment_sale is null or v_receipt_sale <> v_payment_sale then
    raise exception 'La boleta y el pago deben pertenecer a la misma venta, y el pago debe estar confirmado.';
  end if;

  select coalesce(sum(rpa.allocated_amount), 0)
  into v_already_allocated
  from public.receipt_payment_allocations rpa
  where rpa.payment_id = new.payment_id
    and rpa.receipt_id <> new.receipt_id;

  if v_already_allocated + new.allocated_amount > v_payment_amount then
    raise exception 'La suma asignada a boletas supera el importe confirmado del pago.';
  end if;

  return new;
end;
$$;

create or replace function private.refresh_receipt_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_id uuid;
begin
  if tg_op = 'DELETE' then
    v_receipt_id := old.receipt_id;
  else
    v_receipt_id := new.receipt_id;
  end if;

  update public.sales_receipts r
  set amount = coalesce((
        select round(sum(a.allocated_amount), 2)
        from public.receipt_payment_allocations a
        where a.receipt_id = v_receipt_id
      ), 0),
      updated_at = now(),
      version = version + 1
  where r.id = v_receipt_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.record_sale_state_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.commercial_state_code is distinct from new.commercial_state_code then
    insert into public.sale_state_history(
      sale_id, state_dimension, previous_state_code, new_state_code, reason, changed_by
    ) values (
      new.id, 'COMMERCIAL', old.commercial_state_code, new.commercial_state_code,
      nullif(current_setting('app.audit_reason', true), ''), private.current_actor_id()
    );
  end if;

  if old.payment_state_code is distinct from new.payment_state_code then
    insert into public.sale_state_history(
      sale_id, state_dimension, previous_state_code, new_state_code, reason, changed_by
    ) values (
      new.id, 'PAYMENT', old.payment_state_code, new.payment_state_code,
      nullif(current_setting('app.audit_reason', true), ''), private.current_actor_id()
    );
  end if;

  if old.delivery_state_code is distinct from new.delivery_state_code then
    insert into public.sale_state_history(
      sale_id, state_dimension, previous_state_code, new_state_code, reason, changed_by
    ) values (
      new.id, 'DELIVERY', old.delivery_state_code, new.delivery_state_code,
      nullif(current_setting('app.audit_reason', true), ''), private.current_actor_id()
    );
  end if;

  return new;
end;
$$;

create or replace function private.record_delivery_state_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.state_code is distinct from new.state_code then
    insert into public.delivery_state_history(
      delivery_id, previous_state_code, new_state_code, reason, changed_by
    ) values (
      new.id, old.state_code, new.state_code,
      nullif(current_setting('app.audit_reason', true), ''), private.current_actor_id()
    );
  end if;
  return new;
end;
$$;

create or replace function private.record_import_state_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.state_code is distinct from new.state_code then
    if tg_table_name = 'import_shipments' then
      insert into public.import_status_history(
        import_shipment_id, previous_state_code, new_state_code, reason, changed_by
      ) values (
        new.id, old.state_code, new.state_code,
        nullif(current_setting('app.audit_reason', true), ''), private.current_actor_id()
      );
    else
      insert into public.import_status_history(
        import_box_id, previous_state_code, new_state_code, reason, changed_by
      ) values (
        new.id, old.state_code, new.state_code,
        nullif(current_setting('app.audit_reason', true), ''), private.current_actor_id()
      );
    end if;
  end if;
  return new;
end;
$$;

-- =========================================================
-- Triggers de códigos correlativos
-- =========================================================

create trigger trg_clients_code
before insert on public.clients
for each row execute function private.assign_business_code('CLIENT', 'code');

create trigger trg_products_code
before insert on public.products
for each row execute function private.assign_business_code('PRODUCT', 'code');

create trigger trg_product_variants_sku
before insert on public.product_variants
for each row execute function private.assign_business_code('PRODUCT_VARIANT', 'sku');

create trigger trg_inventory_lots_code
before insert on public.inventory_lots
for each row execute function private.assign_business_code('INVENTORY_LOT', 'lot_code');

create trigger trg_inventory_movements_code
before insert on public.inventory_movements
for each row execute function private.assign_business_code('INVENTORY_MOVEMENT', 'code');

create trigger trg_sales_code
before insert on public.sales
for each row execute function private.assign_business_code('SALE', 'code');

create trigger trg_payments_code
before insert on public.payments
for each row execute function private.assign_business_code('PAYMENT', 'code');

create trigger trg_refunds_code
before insert on public.refunds
for each row execute function private.assign_business_code('REFUND', 'code');

create trigger trg_return_cases_code
before insert on public.return_cases
for each row execute function private.assign_business_code('RETURN_CASE', 'code');

create trigger trg_sales_receipts_code
before insert on public.sales_receipts
for each row execute function private.assign_business_code('RECEIPT', 'code');

create trigger trg_credit_notes_code
before insert on public.credit_notes
for each row execute function private.assign_business_code('CREDIT_NOTE', 'code');

create trigger trg_deliveries_code
before insert on public.deliveries
for each row execute function private.assign_business_code('DELIVERY', 'code');

create trigger trg_import_shipments_code
before insert on public.import_shipments
for each row execute function private.assign_business_code('IMPORT', 'code');

create trigger trg_import_boxes_code
before insert on public.import_boxes
for each row execute function private.assign_business_code('IMPORT_BOX', 'code');

create trigger trg_financial_transactions_code
before insert on public.financial_transactions
for each row execute function private.assign_business_code('FINANCIAL_TRANSACTION', 'code');

create trigger trg_loans_code
before insert on public.loans
for each row execute function private.assign_business_code('LOAN', 'code');

create trigger trg_obligations_code
before insert on public.obligations
for each row execute function private.assign_business_code('OBLIGATION', 'code');

create trigger trg_cash_closures_code
before insert on public.cash_closures
for each row execute function private.assign_business_code('CASH_CLOSURE', 'code');

create trigger trg_bank_import_batches_code
before insert on public.bank_import_batches
for each row execute function private.assign_business_code('BANK_IMPORT', 'code');

-- =========================================================
-- Triggers funcionales
-- =========================================================

drop trigger if exists trg_inventory_movement_reason on public.inventory_movements;
create trigger trg_inventory_movement_reason
before insert or update of movement_type_code, reason on public.inventory_movements
for each row execute function private.validate_inventory_movement_reason();

drop trigger if exists trg_apply_inventory_line on public.inventory_movement_lines;
create trigger trg_apply_inventory_line
after insert on public.inventory_movement_lines
for each row execute function private.apply_inventory_movement_line();

drop trigger if exists trg_inventory_line_immutable on public.inventory_movement_lines;
create trigger trg_inventory_line_immutable
before update or delete on public.inventory_movement_lines
for each row execute function private.prevent_inventory_line_mutation();

drop trigger if exists trg_00_sale_snapshot on public.sales;
create trigger trg_00_sale_snapshot
before insert or update of client_id on public.sales
for each row execute function private.populate_sale_snapshot();

drop trigger if exists trg_00_sale_item_snapshot on public.sale_items;
create trigger trg_00_sale_item_snapshot
before insert or update of variant_id, sale_id on public.sale_items
for each row execute function private.populate_sale_item_snapshot();

drop trigger if exists trg_protect_sale_derived_fields on public.sales;
create trigger trg_protect_sale_derived_fields
before update on public.sales
for each row execute function private.protect_sale_derived_fields();

drop trigger if exists trg_protect_payment_declared_amount on public.payments;
create trigger trg_protect_payment_declared_amount
before update on public.payments
for each row execute function private.protect_payment_declared_amount();

drop trigger if exists trg_protect_account_balance on public.financial_accounts;
create trigger trg_protect_account_balance
before update on public.financial_accounts
for each row execute function private.protect_account_balance();

drop trigger if exists trg_payment_part_mutable on public.payment_parts;
create trigger trg_payment_part_mutable
before update or delete on public.payment_parts
for each row execute function private.ensure_payment_part_mutable();

drop trigger if exists trg_payment_part_currency on public.payment_parts;
create trigger trg_payment_part_currency
before insert or update on public.payment_parts
for each row execute function private.validate_payment_part_account_currency();

drop trigger if exists trg_refresh_payment_amount on public.payment_parts;
create trigger trg_refresh_payment_amount
after insert or update or delete on public.payment_parts
for each row execute function private.refresh_payment_declared_amount();

drop trigger if exists trg_financial_entry_currency on public.financial_transaction_entries;
create trigger trg_financial_entry_currency
before insert on public.financial_transaction_entries
for each row execute function private.validate_financial_entry_currency();

drop trigger if exists trg_financial_entry_balance on public.financial_transaction_entries;
create trigger trg_financial_entry_balance
after insert on public.financial_transaction_entries
for each row execute function private.apply_financial_entry();

drop trigger if exists trg_financial_entry_immutable on public.financial_transaction_entries;
create trigger trg_financial_entry_immutable
before update or delete on public.financial_transaction_entries
for each row execute function private.prevent_financial_entry_mutation();

drop trigger if exists trg_sale_item_currency on public.sale_items;
create trigger trg_sale_item_currency
before insert or update on public.sale_items
for each row execute function private.validate_sale_item_currency();

drop trigger if exists trg_sale_item_allocation_quantity on public.sale_item_allocations;
create trigger trg_sale_item_allocation_quantity
before insert or update on public.sale_item_allocations
for each row execute function private.validate_sale_item_allocation_quantity();

drop trigger if exists trg_delivery_item_quantity on public.delivery_items;
create trigger trg_delivery_item_quantity
before insert or update on public.delivery_items
for each row execute function private.validate_delivery_item_quantity();

drop trigger if exists trg_preorder_allocation_quantity on public.preorder_allocations;
create trigger trg_preorder_allocation_quantity
before insert or update on public.preorder_allocations
for each row execute function private.validate_preorder_allocation_quantity();

drop trigger if exists trg_receipt_payment_allocation on public.receipt_payment_allocations;
create trigger trg_receipt_payment_allocation
before insert or update on public.receipt_payment_allocations
for each row execute function private.validate_receipt_payment_allocation();

drop trigger if exists trg_refresh_receipt_amount on public.receipt_payment_allocations;
create trigger trg_refresh_receipt_amount
after insert or update or delete on public.receipt_payment_allocations
for each row execute function private.refresh_receipt_amount();

-- Totales de venta.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['sale_items', 'sale_discounts', 'penalties', 'payments', 'refunds', 'deliveries']
  loop
    execute format('drop trigger if exists trg_refresh_sale_totals on public.%I', v_table);
    execute format(
      'create trigger trg_refresh_sale_totals after insert or update or delete on public.%I for each row execute function private.refresh_sale_totals_from_child()',
      v_table
    );
  end loop;
end;
$$;

-- Historiales de estado.
drop trigger if exists trg_sales_state_history on public.sales;
create trigger trg_sales_state_history
after update on public.sales
for each row execute function private.record_sale_state_history();

drop trigger if exists trg_delivery_state_history on public.deliveries;
create trigger trg_delivery_state_history
after update on public.deliveries
for each row execute function private.record_delivery_state_history();

drop trigger if exists trg_import_shipment_state_history on public.import_shipments;
create trigger trg_import_shipment_state_history
after update on public.import_shipments
for each row execute function private.record_import_state_history();

drop trigger if exists trg_import_box_state_history on public.import_boxes;
create trigger trg_import_box_state_history
after update on public.import_boxes
for each row execute function private.record_import_state_history();

-- Transiciones de estado configurables.
create trigger trg_sales_commercial_transition
before update of commercial_state_code on public.sales
for each row execute function private.validate_workflow_transition('SALE_COMMERCIAL', 'commercial_state_code');

create trigger trg_sales_payment_transition
before update of payment_state_code on public.sales
for each row execute function private.validate_workflow_transition('SALE_PAYMENT', 'payment_state_code');

create trigger trg_sales_delivery_transition
before update of delivery_state_code on public.sales
for each row execute function private.validate_workflow_transition('SALE_DELIVERY', 'delivery_state_code');

create trigger trg_payment_transition
before update of state_code on public.payments
for each row execute function private.validate_workflow_transition('PAYMENT', 'state_code');

create trigger trg_receipt_transition
before update of state_code on public.sales_receipts
for each row execute function private.validate_workflow_transition('RECEIPT', 'state_code');

create trigger trg_release_request_transition
before update of state_code on public.release_requests
for each row execute function private.validate_workflow_transition('RELEASE_REQUEST', 'state_code');

create trigger trg_refund_transition
before update of state_code on public.refunds
for each row execute function private.validate_workflow_transition('REFUND', 'state_code');

create trigger trg_return_case_transition
before update of state_code on public.return_cases
for each row execute function private.validate_workflow_transition('RETURN_CASE', 'state_code');

create trigger trg_delivery_transition
before update of state_code on public.deliveries
for each row execute function private.validate_workflow_transition('DELIVERY', 'state_code');

create trigger trg_import_transition
before update of state_code on public.import_shipments
for each row execute function private.validate_workflow_transition('IMPORT', 'state_code');

create trigger trg_import_box_transition
before update of state_code on public.import_boxes
for each row execute function private.validate_workflow_transition('IMPORT_BOX', 'state_code');

create trigger trg_financial_transaction_transition
before update of state_code on public.financial_transactions
for each row execute function private.validate_workflow_transition('FINANCIAL_TRANSACTION', 'state_code');

-- Updated_at + optimistic version.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'app_roles', 'profiles', 'business_settings', 'partner_types', 'business_partners',
    'workflow_definitions', 'workflow_states', 'clients', 'client_addresses',
    'client_vip_profiles', 'product_categories', 'franchises', 'brands', 'product_lines',
    'product_attribute_definitions', 'products', 'product_variants',
    'product_variant_attribute_values', 'warehouses', 'inventory_bucket_types',
    'inventory_movement_types', 'inventory_lots', 'sales_channels', 'sale_types',
    'discount_types', 'payment_methods', 'sales', 'sale_items', 'payments', 'penalties',
    'release_requests', 'refunds', 'return_cases', 'sales_receipts', 'deliveries',
    'import_shipments', 'import_boxes', 'import_box_items', 'preorder_allocations',
    'import_incidents', 'insurance_claims', 'financial_account_types', 'financial_accounts',
    'financial_categories', 'financial_transaction_types', 'financial_transactions',
    'loans', 'loan_installments', 'obligations', 'cash_closures', 'notification_types',
    'notification_recipients', 'notification_preferences', 'push_subscriptions',
    'scheduled_reminders'
  ]
  loop
    execute format('drop trigger if exists trg_touch_version on public.%I', v_table);
    execute format(
      'create trigger trg_touch_version before update on public.%I for each row execute function private.touch_updated_at_and_version()',
      v_table
    );
  end loop;
end;
$$;

-- Auditoría en entidades relevantes. Se omiten libros derivados y secretos.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles', 'user_roles', 'business_settings', 'business_partners', 'attachments',
    'clients', 'client_addresses', 'client_vip_profiles', 'client_vip_history', 'client_incidents',
    'product_categories', 'franchises', 'brands', 'product_lines', 'products', 'product_variants',
    'product_price_history', 'warehouses', 'warehouse_managers', 'inventory_lots',
    'inventory_movements', 'sales', 'sale_items', 'sale_discounts', 'sale_item_allocations',
    'payments', 'payment_parts', 'penalties', 'release_requests', 'refunds', 'return_cases',
    'return_items', 'sales_receipts', 'credit_notes', 'deliveries', 'delivery_items',
    'import_shipments', 'import_boxes', 'import_box_items', 'preorder_allocations',
    'import_costs', 'import_incidents', 'insurance_claims', 'financial_accounts',
    'financial_categories', 'financial_transactions', 'loans', 'loan_installments',
    'obligations', 'cash_closures', 'bank_import_batches', 'bank_statement_rows',
    'bank_reconciliations', 'notification_preferences', 'scheduled_reminders'
  ]
  loop
    execute format('drop trigger if exists trg_audit_row_change on public.%I', v_table);
    execute format(
      'create trigger trg_audit_row_change after insert or update or delete on public.%I for each row execute function private.audit_row_change()',
      v_table
    );
  end loop;
end;
$$;

-- Protección contra borrado físico en operaciones comerciales.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'clients', 'client_addresses', 'client_vip_profiles', 'client_vip_history', 'client_incidents',
    'products', 'product_variants', 'product_price_history', 'warehouses', 'inventory_lots',
    'inventory_movements', 'inventory_movement_lines', 'sales', 'sale_items', 'sale_discounts',
    'sale_item_allocations', 'payments', 'payment_parts', 'penalties', 'release_requests',
    'refunds', 'return_cases', 'return_items', 'sales_receipts', 'credit_notes',
    'deliveries', 'delivery_items', 'import_shipments', 'import_boxes', 'import_box_items',
    'preorder_allocations', 'import_costs', 'import_incidents', 'insurance_claims',
    'financial_accounts', 'financial_transactions', 'financial_transaction_entries',
    'loans', 'loan_installments', 'obligations', 'cash_closures', 'bank_import_batches',
    'bank_statement_rows', 'bank_reconciliations', 'audit_log'
  ]
  loop
    execute format('drop trigger if exists trg_prevent_hard_delete on public.%I', v_table);
    execute format(
      'create trigger trg_prevent_hard_delete before delete on public.%I for each row execute function private.prevent_hard_delete()',
      v_table
    );
  end loop;
end;
$$;

commit;
