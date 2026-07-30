-- Yukimi Gestión
-- Migración 034: cierre de requisitos funcionales y operativos de la versión 1.1

begin;

-- =========================================================
-- Configuración y datos editables
-- =========================================================

alter table public.financial_accounts
  add column if not exists owner_name text;

alter table public.sales
  add column if not exists due_date_reason text;

alter table public.report_exports
  drop constraint if exists report_exports_export_format_check;

alter table public.report_exports
  add constraint report_exports_export_format_check
  check (export_format in ('CSV', 'XLSX', 'PDF', 'PDF_PRINT'));

insert into public.business_settings(setting_key, setting_value, value_type, category, description, is_sensitive)
values
  ('business.profile', jsonb_build_object(
    'tradeName', 'Yukimi',
    'legalName', null,
    'phone', null,
    'address', null,
    'timezone', 'America/Lima'
  ), 'JSON', 'BUSINESS', 'Datos generales del negocio. Los datos legales se completan solo con información real.', false),
  ('notifications.weekly_summary', jsonb_build_object(
    'enabled', false,
    'weekday', 1,
    'hour', 8,
    'timezone', 'America/Lima',
    'recipientMode', 'ACTIVE_ADMINS'
  ), 'JSON', 'NOTIFICATIONS', 'Resumen semanal configurable para los lunes a las 08:00 America/Lima.', false),
  ('notifications.dispatch_weekdays', jsonb_build_array(1, 4), 'JSON', 'NOTIFICATIONS', 'Días de despacho: lunes y jueves (ISO 1 y 4).', false),
  ('notifications.quiet_hours', jsonb_build_object('start', '21:00', 'end', '08:00', 'timezone', 'America/Lima'), 'JSON', 'NOTIFICATIONS', 'Horario silencioso para notificaciones push.', false),
  ('monitoring.capacity_thresholds', jsonb_build_object(
    'databaseRowsWarning', 500000,
    'storageBytesWarning', 800000000,
    'failedOutboxWarning', 10
  ), 'JSON', 'MONITORING', 'Umbrales preventivos para infraestructura y colas.', false),
  ('exports.backup_scope', jsonb_build_object(
    'tables', jsonb_build_array('clients','products','product_variants','sales','sale_items','payments','deliveries','import_shipments','financial_transactions'),
    'storageBuckets', jsonb_build_array('product-images','payment-proofs','receipt-files','financial-files')
  ), 'JSON', 'BACKUP', 'Alcance documentado del respaldo portable.', false)
on conflict (setting_key) do update set
  description = excluded.description,
  category = excluded.category,
  is_sensitive = excluded.is_sensitive,
  updated_at = now();

-- Dos billeteras independientes, sin inventar nombres de propietarias ni números.
insert into public.financial_accounts(
  code, name, account_type_code, currency_code, institution_name,
  owner_name, linked_parent_account_id, opening_balance, current_balance, is_active
)
select 'YAPE-1-PEN', 'Yape 1', 'WALLET', 'PEN', 'Yape', null, bcp.id, 0, 0, true
from public.financial_accounts bcp
where bcp.code = 'BCP-PEN'
on conflict (code) do update set
  name = excluded.name,
  institution_name = excluded.institution_name,
  linked_parent_account_id = excluded.linked_parent_account_id,
  is_active = true;

insert into public.financial_accounts(
  code, name, account_type_code, currency_code, institution_name,
  owner_name, linked_parent_account_id, opening_balance, current_balance, is_active
)
select 'YAPE-2-PEN', 'Yape 2', 'WALLET', 'PEN', 'Yape', null, bcp.id, 0, 0, true
from public.financial_accounts bcp
where bcp.code = 'BCP-PEN'
on conflict (code) do update set
  name = excluded.name,
  institution_name = excluded.institution_name,
  linked_parent_account_id = excluded.linked_parent_account_id,
  is_active = true;

update public.financial_accounts
set is_active = false,
    notes = concat_ws(E'\n', nullif(notes, ''), 'Cuenta histórica reemplazada por YAPE-1-PEN y YAPE-2-PEN.'),
    updated_at = now()
where code = 'YAPE-PEN' and is_active = true;

-- =========================================================
-- Borradores de venta persistentes, sin reserva de stock
-- =========================================================

insert into public.business_counters(counter_key, prefix, last_value, padding)
values ('SALE_DRAFT', 'BOR-', 0, 6)
on conflict (counter_key) do nothing;

create table if not exists public.sale_drafts (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  client_id uuid not null references public.clients(id) on delete restrict,
  status text not null default 'DRAFT' check (status in ('DRAFT', 'CONFIRMED', 'CANCELLED')),
  payload jsonb not null,
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  item_lines integer not null default 0 check (item_lines >= 0),
  confirmed_sale_id uuid references public.sales(id) on delete restrict,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

alter table public.sale_drafts enable row level security;
alter table public.sale_drafts force row level security;
grant select, insert, update on public.sale_drafts to authenticated;

drop policy if exists admin_select on public.sale_drafts;
drop policy if exists admin_insert on public.sale_drafts;
drop policy if exists admin_update on public.sale_drafts;
create policy admin_select on public.sale_drafts for select to authenticated using (private.is_active_admin());
create policy admin_insert on public.sale_drafts for insert to authenticated with check (private.is_active_admin());
create policy admin_update on public.sale_drafts for update to authenticated using (private.is_active_admin()) with check (private.is_active_admin());

drop trigger if exists trg_touch_version on public.sale_drafts;
create trigger trg_touch_version before update on public.sale_drafts
for each row execute function private.touch_updated_at_and_version();

drop trigger if exists trg_audit_row_change on public.sale_drafts;
create trigger trg_audit_row_change after insert or update or delete on public.sale_drafts
for each row execute function private.audit_row_change();

create or replace function public.save_sale_draft_v1(
  p_input jsonb,
  p_draft_id uuid default null,
  p_expected_version bigint default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_draft public.sale_drafts%rowtype;
  v_total numeric(14,2);
  v_lines integer;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_input) <> 'object' or jsonb_typeof(p_input -> 'items') <> 'array' then
    raise exception 'El borrador de venta no tiene un formato válido.';
  end if;
  if jsonb_array_length(p_input -> 'items') = 0 then
    raise exception 'Agrega al menos un producto al borrador.';
  end if;

  perform 1 from public.clients
  where id = (p_input ->> 'clientId')::uuid and is_active = true;
  if not found then
    raise exception 'El cliente no existe o está inactivo.' using errcode = 'P0001';
  end if;

  select coalesce(sum(
    greatest(0, (item ->> 'quantity')::integer) * greatest(0, (item ->> 'finalUnitPrice')::numeric)
  ), 0), count(*)::integer
  into v_total, v_lines
  from jsonb_array_elements(p_input -> 'items') item;

  perform set_config('app.audit_reason', case when p_draft_id is null then 'Creación de borrador de venta' else 'Actualización de borrador de venta' end, true);

  if p_draft_id is null then
    insert into public.sale_drafts(
      code, client_id, payload, total_amount, item_lines, created_by, updated_by
    ) values (
      public.next_business_code('SALE_DRAFT'),
      (p_input ->> 'clientId')::uuid,
      p_input,
      round(v_total, 2),
      v_lines,
      v_actor,
      v_actor
    ) returning * into v_draft;
  else
    update public.sale_drafts
    set client_id = (p_input ->> 'clientId')::uuid,
        payload = p_input,
        total_amount = round(v_total, 2),
        item_lines = v_lines,
        updated_by = v_actor
    where id = p_draft_id
      and status = 'DRAFT'
      and (p_expected_version is null or version = p_expected_version)
    returning * into v_draft;

    if not found then
      raise exception 'El borrador cambió, fue confirmado o ya no existe. Recarga antes de continuar.' using errcode = '40001';
    end if;
  end if;

  return jsonb_build_object(
    'id', v_draft.id,
    'code', v_draft.code,
    'clientId', v_draft.client_id,
    'clientName', (select full_name from public.clients where id = v_draft.client_id),
    'status', v_draft.status,
    'totalAmount', v_draft.total_amount,
    'itemLines', v_draft.item_lines,
    'payload', v_draft.payload,
    'confirmedSaleId', v_draft.confirmed_sale_id,
    'updatedAt', v_draft.updated_at,
    'version', v_draft.version
  );
end;
$$;

create or replace function public.list_sale_drafts_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', d.id,
        'code', d.code,
        'clientId', d.client_id,
        'clientName', c.full_name,
        'status', d.status,
        'totalAmount', d.total_amount,
        'itemLines', d.item_lines,
        'updatedAt', d.updated_at,
        'version', d.version
      ) order by d.updated_at desc)
      from public.sale_drafts d
      join public.clients c on c.id = d.client_id
      where d.status = 'DRAFT'
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_sale_draft_v1(p_draft_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_draft public.sale_drafts%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  select * into v_draft from public.sale_drafts where id = p_draft_id;
  if not found then raise exception 'El borrador no existe.' using errcode = 'P0002'; end if;
  return jsonb_build_object(
    'id', v_draft.id,
    'code', v_draft.code,
    'clientId', v_draft.client_id,
    'clientName', (select full_name from public.clients where id = v_draft.client_id),
    'status', v_draft.status,
    'totalAmount', v_draft.total_amount,
    'itemLines', v_draft.item_lines,
    'payload', v_draft.payload,
    'confirmedSaleId', v_draft.confirmed_sale_id,
    'updatedAt', v_draft.updated_at,
    'version', v_draft.version
  );
end;
$$;

-- Extiende la creación confirmada con tipo de venta y motivo de plazo especial.
create or replace function public.create_sale_v3(
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_sale_type text := coalesce(nullif(p_input ->> 'saleTypeCode', ''), 'REGULAR');
  v_due_reason text := nullif(btrim(p_input ->> 'dueDateReason'), '');
  v_due_at timestamptz := nullif(p_input ->> 'dueAt', '')::timestamptz;
begin
  if v_sale_type not in ('REGULAR', 'CUSTOM_ORDER') then
    raise exception 'Tipo de venta no permitido.';
  end if;
  if v_due_at is not null and length(coalesce(v_due_reason, '')) < 5 then
    raise exception 'Explica el motivo del plazo personalizado.';
  end if;

  v_result := public.create_sale_v2(p_input, p_idempotency_key);
  perform set_config('app.audit_reason', 'Confirmación de venta con condiciones comerciales', true);
  update public.sales
  set sale_type_code = v_sale_type,
      due_date_reason = v_due_reason,
      updated_by = private.current_actor_id()
  where id = (v_result ->> 'id')::uuid;
  return v_result;
end;
$$;

create or replace function public.get_sale_detail_v3(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_reason text;
begin
  v_result := public.get_sale_detail_v2(p_sale_id);
  select due_date_reason into v_reason from public.sales where id = p_sale_id;
  return jsonb_set(v_result, '{dueDateReason}', coalesce(to_jsonb(v_reason), 'null'::jsonb), true);
end;
$$;

create or replace function public.confirm_sale_draft_v1(
  p_draft_id uuid,
  p_expected_version bigint,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_draft public.sale_drafts%rowtype;
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  select * into v_draft
  from public.sale_drafts
  where id = p_draft_id and status = 'DRAFT'
  for update;
  if not found or v_draft.version <> p_expected_version then
    raise exception 'El borrador cambió o ya fue confirmado.' using errcode = '40001';
  end if;

  v_result := public.create_sale_v3(v_draft.payload, p_idempotency_key);
  perform set_config('app.audit_reason', 'Confirmación de borrador y reserva atómica de stock', true);
  update public.sale_drafts
  set status = 'CONFIRMED',
      confirmed_sale_id = (v_result ->> 'id')::uuid,
      updated_by = private.current_actor_id()
  where id = v_draft.id;

  return v_result;
end;
$$;

-- =========================================================
-- Movimientos de inventario operativos
-- =========================================================

create or replace function public.create_inventory_movement_v1(
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
  v_action text := p_input ->> 'action';
  v_variant_id uuid := (p_input ->> 'variantId')::uuid;
  v_source uuid := (p_input ->> 'sourceWarehouseId')::uuid;
  v_destination uuid := nullif(p_input ->> 'destinationWarehouseId', '')::uuid;
  v_quantity integer := (p_input ->> 'quantity')::integer;
  v_reason text := nullif(btrim(p_input ->> 'reason'), '');
  v_notes text := nullif(btrim(p_input ->> 'notes'), '');
  v_target_bucket text;
  v_movement public.inventory_movements%rowtype;
  v_balance record;
  v_needed integer;
  v_take integer;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if v_action not in ('TRANSFER','DAMAGE','LOSS','GIFT','DYNAMIC') then raise exception 'Tipo de movimiento no permitido.'; end if;
  if v_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;
  if length(coalesce(v_reason, '')) < 5 then raise exception 'El motivo es obligatorio y debe ser específico.'; end if;
  if v_action = 'TRANSFER' and (v_destination is null or v_destination = v_source) then
    raise exception 'Selecciona un almacén de destino diferente.';
  end if;

  perform 1 from public.product_variants where id = v_variant_id and is_active = true;
  if not found then raise exception 'La variante no existe o está inactiva.'; end if;
  perform 1 from public.warehouses where id = v_source and is_active = true and warehouse_type = 'OPERATIONAL';
  if not found then raise exception 'El almacén de origen no está operativo.'; end if;
  if v_destination is not null then
    perform 1 from public.warehouses where id = v_destination and is_active = true and warehouse_type = 'OPERATIONAL';
    if not found then raise exception 'El almacén de destino no está operativo.'; end if;
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('INVENTORY_MOVEMENT:' || p_idempotency_key, 0));
  select * into v_movement from public.inventory_movements where idempotency_key = p_idempotency_key;
  if found then
    return jsonb_build_object('id', v_movement.id, 'code', v_movement.code, 'action', v_movement.movement_type_code, 'quantity', v_quantity, 'createdAt', v_movement.created_at);
  end if;

  v_target_bucket := case v_action
    when 'DAMAGE' then 'DAMAGED'
    when 'LOSS' then 'LOST'
    when 'GIFT' then 'GIFTED'
    when 'DYNAMIC' then 'USED_DYNAMIC'
    else 'AVAILABLE'
  end;

  perform set_config('app.audit_reason', v_reason, true);
  insert into public.inventory_movements(
    code, movement_type_code, reference_type, reason, notes, idempotency_key, created_by, metadata
  ) values (
    public.next_business_code('INVENTORY_MOVEMENT'), v_action, 'MANUAL_OPERATION', v_reason, v_notes,
    p_idempotency_key, v_actor, jsonb_build_object('sourceWarehouseId', v_source, 'destinationWarehouseId', v_destination)
  ) returning * into v_movement;

  v_needed := v_quantity;
  for v_balance in
    select ib.lot_id, ib.quantity, il.final_unit_cost_pen
    from public.inventory_balances ib
    join public.inventory_lots il on il.id = ib.lot_id
    where ib.variant_id = v_variant_id
      and ib.warehouse_id = v_source
      and ib.bucket_code = 'AVAILABLE'
      and ib.quantity > 0
      and il.status = 'ACTIVE'
    order by coalesce(il.received_at, il.acquired_at, il.created_at), il.id
    for update of ib
  loop
    exit when v_needed <= 0;
    v_take := least(v_needed, v_balance.quantity);
    insert into public.inventory_movement_lines(movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta, unit_cost_pen)
    values (v_movement.id, v_variant_id, v_balance.lot_id, v_source, 'AVAILABLE', -v_take, v_balance.final_unit_cost_pen);

    if v_action = 'TRANSFER' then
      insert into public.inventory_movement_lines(movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta, unit_cost_pen)
      values (v_movement.id, v_variant_id, v_balance.lot_id, v_destination, 'AVAILABLE', v_take, v_balance.final_unit_cost_pen);
    else
      insert into public.inventory_movement_lines(movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta, unit_cost_pen)
      values (v_movement.id, v_variant_id, v_balance.lot_id, v_source, v_target_bucket, v_take, v_balance.final_unit_cost_pen);
    end if;
    v_needed := v_needed - v_take;
  end loop;

  if v_needed > 0 then
    raise exception 'Stock disponible insuficiente. Faltan % unidades.', v_needed using errcode = 'P0001';
  end if;

  return jsonb_build_object('id', v_movement.id, 'code', v_movement.code, 'action', v_action, 'quantity', v_quantity, 'createdAt', v_movement.created_at);
end;
$$;

-- =========================================================
-- Devoluciones y cambios con inventario trazable
-- =========================================================

create or replace function public.create_return_case_v1(
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
  v_case public.return_cases%rowtype;
  v_case_type text := p_input ->> 'caseType';
  v_reason text := nullif(btrim(p_input ->> 'reason'), '');
  v_item jsonb;
  v_sale_item public.sale_items%rowtype;
  v_movement public.inventory_movements%rowtype;
  v_allocation record;
  v_balance record;
  v_needed integer;
  v_take integer;
  v_quantity integer;
  v_destination uuid;
  v_replacement uuid;
  v_existing integer;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if v_case_type not in ('RETURN','EXCHANGE') then raise exception 'Tipo de caso no permitido.'; end if;
  if length(coalesce(v_reason, '')) < 5 then raise exception 'El motivo es obligatorio.'; end if;
  if jsonb_typeof(p_input -> 'items') <> 'array' or jsonb_array_length(p_input -> 'items') = 0 then
    raise exception 'Agrega al menos un producto.';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'La venta no existe.' using errcode = 'P0002'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('RETURN_CASE:' || p_idempotency_key, 0));
  select rc.* into v_case
  from public.return_cases rc
  where rc.id = (select (metadata ->> 'returnCaseId')::uuid from public.inventory_movements where idempotency_key = p_idempotency_key limit 1);
  if found then
    return jsonb_build_object('id', v_case.id, 'code', v_case.code, 'stateCode', v_case.state_code, 'caseType', v_case.case_type, 'version', v_case.version);
  end if;

  perform set_config('app.audit_reason', v_reason, true);
  insert into public.return_cases(
    code, sale_id, client_id, state_code, case_type, reason, created_by, resolved_by, resolved_at, resolution_notes
  ) values (
    public.next_business_code('RETURN_CASE'), v_sale.id, v_sale.client_id, 'COMPLETED', v_case_type, v_reason,
    v_actor, v_actor, now(), 'Operación procesada de forma atómica.'
  ) returning * into v_case;

  insert into public.inventory_movements(
    code, movement_type_code, reference_type, reference_id, reason, idempotency_key, created_by, metadata
  ) values (
    public.next_business_code('INVENTORY_MOVEMENT'), 'RETURN', 'RETURN_CASE', v_case.id,
    v_reason, p_idempotency_key, v_actor, jsonb_build_object('returnCaseId', v_case.id, 'caseType', v_case_type)
  ) returning * into v_movement;

  for v_item in select value from jsonb_array_elements(p_input -> 'items')
  loop
    v_quantity := (v_item ->> 'quantity')::integer;
    v_destination := (v_item ->> 'destinationWarehouseId')::uuid;
    v_replacement := nullif(v_item ->> 'replacementVariantId', '')::uuid;
    if v_quantity <= 0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;

    select * into v_sale_item
    from public.sale_items
    where id = (v_item ->> 'saleItemId')::uuid and sale_id = v_sale.id
    for update;
    if not found then raise exception 'Un producto no pertenece a la venta.'; end if;

    select coalesce(sum(ri.quantity), 0)::integer into v_existing
    from public.return_items ri
    join public.return_cases rc on rc.id = ri.return_case_id
    where ri.sale_item_id = v_sale_item.id and rc.state_code <> 'CANCELLED';
    if v_existing + v_quantity > v_sale_item.quantity then
      raise exception 'La cantidad devuelta supera la cantidad vendida de %.', v_sale_item.product_name_snapshot;
    end if;

    perform 1 from public.warehouses where id = v_destination and is_active = true and warehouse_type = 'OPERATIONAL';
    if not found then raise exception 'El almacén de retorno no está operativo.'; end if;
    if v_case_type = 'EXCHANGE' and v_replacement is null then
      raise exception 'Selecciona la variante de reemplazo.';
    end if;

    insert into public.return_items(
      return_case_id, sale_item_id, quantity, received_condition,
      replacement_variant_id, inventory_movement_id, notes
    ) values (
      v_case.id, v_sale_item.id, v_quantity,
      coalesce(nullif(v_item ->> 'receivedCondition', ''), 'OTHER'),
      v_replacement, v_movement.id, nullif(btrim(v_item ->> 'notes'), '')
    );

    -- Retorna el lote original al almacén seleccionado.
    v_needed := v_quantity;
    for v_allocation in
      select sia.lot_id, sia.quantity, il.final_unit_cost_pen
      from public.sale_item_allocations sia
      join public.inventory_lots il on il.id = sia.lot_id
      where sia.sale_item_id = v_sale_item.id
      order by sia.created_at, sia.id
    loop
      exit when v_needed <= 0;
      v_take := least(v_needed, v_allocation.quantity);
      insert into public.inventory_movement_lines(movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta, unit_cost_pen)
      values (v_movement.id, v_sale_item.variant_id, v_allocation.lot_id, v_destination, 'AVAILABLE', v_take, v_allocation.final_unit_cost_pen);
      v_needed := v_needed - v_take;
    end loop;
    if v_needed > 0 then raise exception 'No se pudo reconstruir el lote original de la devolución.'; end if;

    if v_case_type = 'EXCHANGE' then
      v_needed := v_quantity;
      for v_balance in
        select ib.lot_id, ib.quantity, il.final_unit_cost_pen
        from public.inventory_balances ib
        join public.inventory_lots il on il.id = ib.lot_id
        where ib.variant_id = v_replacement
          and ib.warehouse_id = v_destination
          and ib.bucket_code = 'AVAILABLE'
          and ib.quantity > 0
          and il.status = 'ACTIVE'
        order by coalesce(il.received_at, il.acquired_at, il.created_at), il.id
        for update of ib
      loop
        exit when v_needed <= 0;
        v_take := least(v_needed, v_balance.quantity);
        insert into public.inventory_movement_lines(movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta, unit_cost_pen)
        values
          (v_movement.id, v_replacement, v_balance.lot_id, v_destination, 'AVAILABLE', -v_take, v_balance.final_unit_cost_pen),
          (v_movement.id, v_replacement, v_balance.lot_id, v_destination, 'DELIVERED', v_take, v_balance.final_unit_cost_pen);
        v_needed := v_needed - v_take;
      end loop;
      if v_needed > 0 then raise exception 'Stock insuficiente para completar el cambio.' using errcode = 'P0001'; end if;
      update public.sale_items set item_status = 'EXCHANGED', updated_by = v_actor where id = v_sale_item.id;
    else
      update public.sale_items set item_status = 'RETURNED', updated_by = v_actor where id = v_sale_item.id;
    end if;
  end loop;

  insert into public.client_incidents(
    client_id, incident_type, severity, sale_id, description, occurred_at, resolved_at, resolution_notes, created_by
  ) values (
    v_sale.client_id, 'RETURN', 'LOW', v_sale.id,
    case when v_case_type = 'EXCHANGE' then 'Cambio de producto: ' else 'Devolución: ' end || v_reason,
    now(), now(), 'Caso ' || v_case.code || ' completado.', v_actor
  );

  perform public.refresh_sale_totals(v_sale.id);
  return jsonb_build_object('id', v_case.id, 'code', v_case.code, 'stateCode', v_case.state_code, 'caseType', v_case.case_type, 'version', v_case.version);
end;
$$;

-- =========================================================
-- Configuración editable con concurrencia y motivo
-- =========================================================

create or replace function public.update_business_setting_v1(
  p_key text,
  p_value jsonb,
  p_expected_version bigint,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.business_settings%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'El motivo es obligatorio.'; end if;
  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.business_settings
  set setting_value = p_value, updated_by = private.current_actor_id()
  where setting_key = p_key and is_editable = true and version = p_expected_version
  returning * into v_row;
  if not found then raise exception 'La configuración cambió o no es editable.' using errcode = '40001'; end if;
  return jsonb_build_object('key', v_row.setting_key, 'value', v_row.setting_value, 'version', v_row.version);
end;
$$;

create or replace function public.upsert_warehouse_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.warehouses%rowtype; v_id uuid := nullif(p_input ->> 'id','')::uuid; v_reason text := btrim(p_input ->> 'reason');
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(coalesce(v_reason,'')) < 5 then raise exception 'El motivo es obligatorio.'; end if;
  perform set_config('app.audit_reason', v_reason, true);
  if v_id is null then
    insert into public.warehouses(code,name,warehouse_type,description,is_virtual,is_visible_in_operations,is_active,created_by,updated_by)
    values (upper(btrim(p_input ->> 'code')),btrim(p_input ->> 'name'),p_input ->> 'warehouseType',nullif(btrim(p_input ->> 'description'),''),coalesce((p_input ->> 'isVirtual')::boolean,false),coalesce((p_input ->> 'isVisibleInOperations')::boolean,true),coalesce((p_input ->> 'isActive')::boolean,true),private.current_actor_id(),private.current_actor_id())
    returning * into v_row;
  else
    update public.warehouses set
      code=upper(btrim(p_input ->> 'code')), name=btrim(p_input ->> 'name'), warehouse_type=p_input ->> 'warehouseType',
      description=nullif(btrim(p_input ->> 'description'),''), is_virtual=coalesce((p_input ->> 'isVirtual')::boolean,false),
      is_visible_in_operations=coalesce((p_input ->> 'isVisibleInOperations')::boolean,true), is_active=coalesce((p_input ->> 'isActive')::boolean,true),
      updated_by=private.current_actor_id()
    where id=v_id and version=(p_input ->> 'version')::bigint returning * into v_row;
    if not found then raise exception 'El almacén cambió. Recarga antes de guardar.' using errcode='40001'; end if;
  end if;
  return jsonb_build_object('id',v_row.id,'code',v_row.code,'name',v_row.name,'version',v_row.version);
end;
$$;

create or replace function public.upsert_financial_account_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.financial_accounts%rowtype; v_id uuid := nullif(p_input ->> 'id','')::uuid; v_reason text := btrim(p_input ->> 'reason');
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(coalesce(v_reason,'')) < 5 then raise exception 'El motivo es obligatorio.'; end if;
  perform set_config('app.audit_reason', v_reason, true);
  if v_id is null then
    insert into public.financial_accounts(code,name,account_type_code,currency_code,institution_name,masked_account_number,owner_name,linked_parent_account_id,is_active,created_by,updated_by)
    values (upper(btrim(p_input ->> 'code')),btrim(p_input ->> 'name'),p_input ->> 'accountTypeCode',coalesce(nullif(p_input ->> 'currencyCode',''),'PEN')::char(3),nullif(btrim(p_input ->> 'institutionName'),''),nullif(btrim(p_input ->> 'maskedAccountNumber'),''),nullif(btrim(p_input ->> 'ownerName'),''),nullif(p_input ->> 'linkedParentAccountId','')::uuid,coalesce((p_input ->> 'isActive')::boolean,true),private.current_actor_id(),private.current_actor_id())
    returning * into v_row;
  else
    update public.financial_accounts set
      code=upper(btrim(p_input ->> 'code')), name=btrim(p_input ->> 'name'), account_type_code=p_input ->> 'accountTypeCode',
      currency_code=coalesce(nullif(p_input ->> 'currencyCode',''),'PEN')::char(3), institution_name=nullif(btrim(p_input ->> 'institutionName'),''),
      masked_account_number=nullif(btrim(p_input ->> 'maskedAccountNumber'),''), owner_name=nullif(btrim(p_input ->> 'ownerName'),''),
      linked_parent_account_id=nullif(p_input ->> 'linkedParentAccountId','')::uuid, is_active=coalesce((p_input ->> 'isActive')::boolean,true),
      updated_by=private.current_actor_id()
    where id=v_id and version=(p_input ->> 'version')::bigint returning * into v_row;
    if not found then raise exception 'La cuenta cambió. Recarga antes de guardar.' using errcode='40001'; end if;
  end if;
  return jsonb_build_object('id',v_row.id,'code',v_row.code,'name',v_row.name,'version',v_row.version);
end;
$$;

create or replace function public.update_admin_profile_v1(p_profile_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.profiles%rowtype; v_reason text := btrim(p_input ->> 'reason');
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(coalesce(v_reason,'')) < 5 then raise exception 'El motivo es obligatorio.'; end if;
  if p_profile_id = private.current_actor_id() and coalesce((p_input ->> 'isActive')::boolean,true) = false then
    raise exception 'No puedes desactivar tu propia cuenta.';
  end if;
  perform set_config('app.audit_reason', v_reason, true);
  update public.profiles set display_name=btrim(p_input ->> 'displayName'), phone=nullif(btrim(p_input ->> 'phone'),''), is_active=(p_input ->> 'isActive')::boolean
  where id=p_profile_id and version=(p_input ->> 'version')::bigint returning * into v_row;
  if not found then raise exception 'El perfil cambió. Recarga antes de guardar.' using errcode='40001'; end if;
  return jsonb_build_object('id',v_row.id,'displayName',v_row.display_name,'isActive',v_row.is_active,'version',v_row.version);
end;
$$;


create or replace function public.update_catalog_item_v1(p_kind text, p_item_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_result jsonb; v_reason text := btrim(p_input ->> 'reason');
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode='42501'; end if;
  if p_kind not in ('categories','franchises','brands','product-lines') then raise exception 'Catálogo inválido.'; end if;
  if length(coalesce(v_reason,'')) < 5 then raise exception 'El motivo es obligatorio.'; end if;
  perform set_config('app.audit_reason',v_reason,true);

  if p_kind='categories' then
    update public.product_categories set name=btrim(p_input->>'name'), description=nullif(btrim(p_input->>'description'),''),
      release_penalty_amount=nullif(p_input->>'releasePenaltyAmount','')::numeric,
      release_penalty_currency=coalesce(nullif(p_input->>'releasePenaltyCurrency',''),'PEN')::char(3),
      is_active=(p_input->>'isActive')::boolean, updated_by=private.current_actor_id()
    where id=p_item_id and version=(p_input->>'version')::bigint
    returning jsonb_build_object('id',id,'code',code,'name',name,'description',description,'isActive',is_active,'version',version,
      'releasePenaltyAmount',release_penalty_amount,'releasePenaltyCurrency',release_penalty_currency) into v_result;
  elsif p_kind='franchises' then
    update public.franchises set name=btrim(p_input->>'name'), description=nullif(btrim(p_input->>'description'),''), is_active=(p_input->>'isActive')::boolean, updated_by=private.current_actor_id()
    where id=p_item_id and version=(p_input->>'version')::bigint
    returning jsonb_build_object('id',id,'code',code,'name',name,'description',description,'isActive',is_active,'version',version) into v_result;
  elsif p_kind='brands' then
    update public.brands set name=btrim(p_input->>'name'), description=nullif(btrim(p_input->>'description'),''), is_active=(p_input->>'isActive')::boolean, updated_by=private.current_actor_id()
    where id=p_item_id and version=(p_input->>'version')::bigint
    returning jsonb_build_object('id',id,'code',code,'name',name,'description',description,'isActive',is_active,'version',version) into v_result;
  else
    update public.product_lines set name=btrim(p_input->>'name'), description=nullif(btrim(p_input->>'description'),''), brand_id=nullif(p_input->>'brandId','')::uuid,
      is_active=(p_input->>'isActive')::boolean, updated_by=private.current_actor_id()
    where id=p_item_id and version=(p_input->>'version')::bigint
    returning jsonb_build_object('id',id,'code',code,'name',name,'description',description,'isActive',is_active,'version',version,'brandId',brand_id) into v_result;
  end if;
  if v_result is null then raise exception 'El catálogo cambió. Recarga antes de guardar.' using errcode='40001'; end if;
  return v_result;
end;
$$;

-- =========================================================
-- Push, correo, scheduler y monitoreo
-- =========================================================

create or replace function public.upsert_push_subscription_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := private.current_actor_id(); v_row public.push_subscriptions%rowtype;
begin
  if not private.is_active_user() then raise exception 'Usuario no autorizado.' using errcode='42501'; end if;
  insert into public.push_subscriptions(user_id,endpoint,p256dh_key,auth_key,user_agent,device_name,is_active,last_used_at)
  values (v_actor,p_input ->> 'endpoint',p_input ->> 'p256dhKey',p_input ->> 'authKey',nullif((coalesce(nullif(current_setting('request.headers',true),''),'{}')::jsonb) ->> 'user-agent',''),nullif(btrim(p_input ->> 'deviceName'),''),true,now())
  on conflict (user_id,endpoint) do update set p256dh_key=excluded.p256dh_key,auth_key=excluded.auth_key,user_agent=excluded.user_agent,device_name=excluded.device_name,is_active=true,last_used_at=now(),updated_at=now(),version=public.push_subscriptions.version+1
  returning * into v_row;
  return jsonb_build_object('id',v_row.id,'isActive',v_row.is_active,'version',v_row.version);
end;
$$;

create or replace function public.upsert_notification_preference_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_actor uuid := private.current_actor_id(); v_row public.notification_preferences%rowtype;
begin
  if not private.is_active_user() then raise exception 'Usuario no autorizado.' using errcode='42501'; end if;
  insert into public.notification_preferences(user_id,notification_type_code,in_app_enabled,push_enabled,email_enabled,quiet_hours_start,quiet_hours_end)
  values (v_actor,p_input ->> 'notificationTypeCode',(p_input ->> 'inAppEnabled')::boolean,(p_input ->> 'pushEnabled')::boolean,(p_input ->> 'emailEnabled')::boolean,nullif(p_input ->> 'quietHoursStart','')::time,nullif(p_input ->> 'quietHoursEnd','')::time)
  on conflict (user_id,notification_type_code) do update set in_app_enabled=excluded.in_app_enabled,push_enabled=excluded.push_enabled,email_enabled=excluded.email_enabled,quiet_hours_start=excluded.quiet_hours_start,quiet_hours_end=excluded.quiet_hours_end,updated_at=now(),version=public.notification_preferences.version+1
  returning * into v_row;
  return jsonb_build_object('notificationTypeCode',v_row.notification_type_code,'version',v_row.version);
end;
$$;

create or replace function public.queue_weekly_summary_v1(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_setting jsonb;
  v_local timestamp;
  v_enabled boolean;
  v_weekday integer;
  v_hour integer;
  v_notification_id uuid;
  v_start date;
  v_end date;
  v_report jsonb;
begin
  if auth.role() <> 'service_role' and not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode='42501'; end if;
  select setting_value into v_setting from public.business_settings where setting_key='notifications.weekly_summary';
  v_enabled := coalesce((v_setting ->> 'enabled')::boolean,false);
  v_weekday := coalesce((v_setting ->> 'weekday')::integer,1);
  v_hour := coalesce((v_setting ->> 'hour')::integer,8);
  v_local := timezone(coalesce(v_setting ->> 'timezone','America/Lima'),p_now);
  if not v_enabled or extract(isodow from v_local)::integer <> v_weekday or extract(hour from v_local)::integer <> v_hour then
    return jsonb_build_object('queued',false,'reason','NOT_SCHEDULED');
  end if;
  v_end := v_local::date - 1;
  v_start := v_end - 6;
  v_report := public.get_report_data_v1(v_start,v_end,null);
  v_notification_id := private.emit_notification_v1(
    'WEEKLY_SUMMARY','Resumen semanal · ' || to_char(v_start,'DD/MM') || '–' || to_char(v_end,'DD/MM'),
    'Ventas netas S/ ' || to_char(coalesce((v_report #>> '{summary,netSales}')::numeric,0),'FM999999990.00') ||
    ', cobrado S/ ' || to_char(coalesce((v_report #>> '{summary,collected}')::numeric,0),'FM999999990.00') ||
    ', saldo S/ ' || to_char(coalesce((v_report #>> '{summary,outstandingBalance}')::numeric,0),'FM999999990.00') || '.',
    'NORMAL','WEEKLY_REPORT',null,'/reportes','WEEKLY_SUMMARY:' || v_start::text,
    jsonb_build_object('startDate',v_start,'endDate',v_end,'report',v_report)
  );
  return jsonb_build_object('queued',true,'notificationId',v_notification_id,'startDate',v_start,'endDate',v_end);
end;
$$;

create or replace function public.queue_dispatch_day_reminders_v1(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_days jsonb; v_local_date date; v_weekday integer; v_row record; v_created integer := 0;
begin
  if auth.role() <> 'service_role' and not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode='42501'; end if;
  v_local_date := timezone('America/Lima',p_now)::date;
  v_weekday := extract(isodow from timezone('America/Lima',p_now))::integer;
  select setting_value into v_days from public.business_settings where setting_key='notifications.dispatch_weekdays';
  if not coalesce(v_days,'[]'::jsonb) @> to_jsonb(array[v_weekday]) then
    return jsonb_build_object('queued',false,'reason','NOT_DISPATCH_DAY','weekday',v_weekday);
  end if;
  for v_row in
    select d.id,d.code,s.code sale_code,s.client_name_snapshot,d.planned_dispatch_date
    from public.deliveries d join public.sales s on s.id=d.sale_id
    where d.state_code in ('PENDING_INSTRUCTIONS','PENDING_AGENCY_DISPATCH')
      and (d.planned_dispatch_date is null or d.planned_dispatch_date <= v_local_date + 1)
  loop
    perform private.emit_notification_v1(
      'DISPATCH_PENDING','Día de despacho · ' || v_row.code,
      'Revisa el despacho de ' || v_row.client_name_snapshot || ' para la venta ' || v_row.sale_code || '.',
      'HIGH','DELIVERY',v_row.id,'/entregas/' || v_row.id,
      'DISPATCH_DAY:' || v_local_date::text || ':' || v_row.id::text,
      jsonb_build_object('deliveryCode',v_row.code,'saleCode',v_row.sale_code,'dispatchDay',v_local_date)
    );
    v_created := v_created + 1;
  end loop;
  return jsonb_build_object('queued',true,'created',v_created,'date',v_local_date,'weekday',v_weekday);
end;
$$;

create or replace function public.queue_notification_deliveries_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_count integer;
begin
  if auth.role() <> 'service_role' and not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode='42501'; end if;
  insert into public.outbox_events(event_type,aggregate_type,aggregate_id,payload,deduplication_key)
  select 'DELIVER_NOTIFICATION','NOTIFICATION',n.id,
    jsonb_build_object(
      'notificationId',n.id,'userId',nr.user_id,'title',n.title,'body',n.body,'actionUrl',n.action_url,
      'typeCode',n.notification_type_code,'priority',n.priority,'email',p.email_snapshot,
      'inAppEnabled',coalesce(np.in_app_enabled,true),'pushEnabled',coalesce(np.push_enabled, n.notification_type_code <> 'WEEKLY_SUMMARY'),
      'emailEnabled',coalesce(np.email_enabled,n.notification_type_code='WEEKLY_SUMMARY'),
      'quietHoursStart',coalesce(np.quiet_hours_start::text,'21:00:00'),'quietHoursEnd',coalesce(np.quiet_hours_end::text,'08:00:00'),
      'pushSubscriptions',coalesce((select jsonb_agg(jsonb_build_object('id',ps.id,'endpoint',ps.endpoint,'p256dh',ps.p256dh_key,'auth',ps.auth_key)) from public.push_subscriptions ps where ps.user_id=nr.user_id and ps.is_active=true),'[]'::jsonb)
    ),
    'DELIVER_NOTIFICATION:' || n.id::text || ':' || nr.user_id::text
  from public.notifications n
  join public.notification_recipients nr on nr.notification_id=n.id
  join public.profiles p on p.id=nr.user_id and p.is_active=true
  left join public.notification_preferences np on np.user_id=nr.user_id and np.notification_type_code=n.notification_type_code
  where nr.status in ('NEW','READ')
    and (n.expires_at is null or n.expires_at>now())
  on conflict (deduplication_key) where deduplication_key is not null do nothing;
  get diagnostics v_count = row_count;
  return jsonb_build_object('queued',v_count,'queuedAt',now());
end;
$$;

create or replace function public.claim_outbox_events_v1(p_worker text, p_limit integer default 25)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_events jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'Solo el worker de servicio puede reclamar eventos.' using errcode='42501'; end if;
  if length(coalesce(btrim(p_worker),'')) < 3 then raise exception 'El identificador del worker es obligatorio.' using errcode='22023'; end if;
  with candidates as (
    select oe.id
    from public.outbox_events oe
    where (oe.status in ('PENDING','FAILED') and oe.available_at <= now())
       or (oe.status = 'PROCESSING' and oe.locked_at < now() - interval '15 minutes')
    order by oe.available_at, oe.created_at
    for update skip locked
    limit greatest(1,least(coalesce(p_limit,25),100))
  ), claimed as (
    update public.outbox_events oe
    set status='PROCESSING', attempts=oe.attempts+1, locked_at=now(), locked_by=btrim(p_worker), last_error=null
    from candidates c
    where oe.id=c.id
    returning oe.id,oe.event_type,oe.aggregate_type,oe.aggregate_id,oe.payload,oe.attempts,oe.created_at
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id',id,'eventType',event_type,'aggregateType',aggregate_type,'aggregateId',aggregate_id,
    'payload',payload,'attempts',attempts,'createdAt',created_at
  ) order by created_at),'[]'::jsonb) into v_events from claimed;
  return v_events;
end;
$$;

create or replace function public.defer_outbox_event_v1(p_event_id uuid, p_available_at timestamptz, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.outbox_events%rowtype;
begin
  if auth.role() <> 'service_role' then raise exception 'Solo el worker de servicio puede diferir eventos.' using errcode='42501'; end if;
  update public.outbox_events set
    status='PENDING', available_at=greatest(coalesce(p_available_at,now()+interval '1 hour'),now()+interval '1 minute'),
    attempts=greatest(attempts-1,0), locked_at=null, locked_by=null,
    last_error=left(coalesce(nullif(btrim(p_reason),''),'Entrega diferida'),4000)
  where id=p_event_id and status='PROCESSING'
  returning * into v_row;
  if not found then raise exception 'El evento no está en procesamiento.' using errcode='40001'; end if;
  return jsonb_build_object('id',v_row.id,'status',v_row.status,'attempts',v_row.attempts,'availableAt',v_row.available_at);
end;
$$;

create or replace function public.complete_outbox_event_v1(p_event_id uuid, p_success boolean, p_error text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.outbox_events%rowtype; v_next_status text;
begin
  if auth.role() <> 'service_role' then raise exception 'Solo el worker de servicio puede completar eventos.' using errcode='42501'; end if;
  select * into v_row from public.outbox_events where id=p_event_id for update;
  if not found then raise exception 'Evento no encontrado.' using errcode='P0002'; end if;
  if v_row.status <> 'PROCESSING' then raise exception 'El evento no está en procesamiento.' using errcode='40001'; end if;
  v_next_status := case when p_success then 'PROCESSED' when v_row.attempts >= 5 then 'DEAD_LETTER' else 'FAILED' end;
  update public.outbox_events set
    status=v_next_status,
    processed_at=case when p_success then now() else null end,
    available_at=case when p_success then available_at else now() + make_interval(mins => least(60,power(2,greatest(v_row.attempts-1,0))::integer)) end,
    locked_at=null,
    locked_by=null,
    last_error=case when p_success then null else left(coalesce(nullif(btrim(p_error),''),'Error de entrega no especificado'),4000) end
  where id=p_event_id returning * into v_row;
  if v_row.event_type='DELIVER_NOTIFICATION' then
    update public.notification_recipients nr set
      delivery_status=coalesce(nr.delivery_status,'{}'::jsonb) || jsonb_build_object(
        'status',v_next_status,'lastAttemptAt',now(),'attempts',v_row.attempts,'error',v_row.last_error
      ), updated_at=now()
    where nr.notification_id=(v_row.payload ->> 'notificationId')::uuid
      and nr.user_id=(v_row.payload ->> 'userId')::uuid;
  end if;
  return jsonb_build_object('id',v_row.id,'status',v_row.status,'attempts',v_row.attempts,'availableAt',v_row.available_at);
end;
$$;

create or replace function public.get_capacity_snapshot_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.role() <> 'service_role' and not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode='42501'; end if;
  return jsonb_build_object(
    'checkedAt',now(),
    'tables',coalesce((
      select jsonb_agg(jsonb_build_object('table',c.relname,'estimatedRows',greatest(c.reltuples,0)::bigint) order by c.reltuples desc)
      from pg_catalog.pg_class c join pg_catalog.pg_namespace n on n.oid=c.relnamespace
      where n.nspname='public' and c.relkind='r'
    ),'[]'::jsonb),
    'storage',coalesce((
      select jsonb_agg(jsonb_build_object('bucket',x.bucket_id,'files',x.files,'bytes',x.bytes) order by x.bucket_id)
      from (select o.bucket_id,count(*)::integer files,coalesce(sum((o.metadata ->> 'size')::bigint),0)::bigint bytes from storage.objects o group by o.bucket_id) x
    ),'[]'::jsonb),
    'pendingOutbox',(select count(*)::integer from public.outbox_events where status in ('PENDING','PROCESSING')),
    'failedOutbox',(select count(*)::integer from public.outbox_events where status in ('FAILED','DEAD_LETTER')),
    'activePushSubscriptions',(select count(*)::integer from public.push_subscriptions where is_active=true)
  );
end;
$$;

-- Función para ejecución del scheduler con service role: usa temporalmente una administradora activa.
create or replace function public.run_notification_scheduler_v1(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_admin uuid; v_refresh jsonb; v_weekly jsonb; v_dispatch jsonb; v_delivery jsonb;
begin
  if auth.role() <> 'service_role' then raise exception 'Solo el scheduler de servicio puede ejecutar esta función.' using errcode='42501'; end if;
  select p.id into v_admin from public.profiles p join public.user_roles ur on ur.user_id=p.id and ur.role_code='ADMIN' and ur.revoked_at is null where p.is_active=true order by p.created_at limit 1;
  if v_admin is null then raise exception 'No existe una administradora activa.'; end if;
  perform set_config('request.jwt.claim.sub',v_admin::text,true);
  v_refresh := public.refresh_operational_notifications_v1();
  v_weekly := public.queue_weekly_summary_v1(p_now);
  v_dispatch := public.queue_dispatch_day_reminders_v1(p_now);
  v_delivery := public.queue_notification_deliveries_v1();
  return jsonb_build_object('refresh',v_refresh,'weekly',v_weekly,'dispatch',v_dispatch,'delivery',v_delivery,'ranAt',p_now);
end;
$$;



create or replace function public.register_report_export_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_id uuid := extensions.gen_random_uuid();
  v_code text := 'RPT-' || to_char(timezone('America/Lima', now()), 'YYYYMMDD-HH24MISS') || '-' || upper(left(replace(v_id::text,'-',''),6));
  v_type text := coalesce(nullif(p_input ->> 'reportType',''), 'GENERAL');
  v_format text := p_input ->> 'format';
  v_filename text := p_input ->> 'filename';
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode='42501'; end if;
  if v_format not in ('CSV','XLSX','PDF','PDF_PRINT') then raise exception 'Formato de exportación no válido.' using errcode='22023'; end if;
  if coalesce(v_filename,'')='' then raise exception 'El nombre del archivo es obligatorio.' using errcode='22023'; end if;
  insert into public.report_exports(id,code,report_type,export_format,period_start,period_end,filters,filename,object_path,generated_by)
  values (v_id,v_code,v_type,v_format,nullif(p_input->>'startDate','')::date,nullif(p_input->>'endDate','')::date,coalesce(p_input->'filters','{}'::jsonb),v_filename,nullif(p_input->>'objectPath',''),v_actor);
  insert into public.audit_log(schema_name,table_name,entity_id,action,new_values,reason,actor_user_id,actor_role,metadata)
  values ('public','report_exports',v_id::text,'OTHER',jsonb_build_object('code',v_code,'format',v_format,'filename',v_filename),'Exportación de reporte',v_actor,'ADMIN',jsonb_build_object('reportType',v_type));
  return jsonb_build_object('id',v_id,'code',v_code,'generatedAt',now());
end;
$$;

create or replace function public.update_finance_category_v1(p_category_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare v_row public.financial_categories%rowtype; v_reason text := btrim(p_input ->> 'reason');
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode='42501'; end if;
  if length(coalesce(v_reason,'')) < 5 then raise exception 'El motivo es obligatorio.'; end if;
  perform set_config('app.audit_reason',v_reason,true);
  update public.financial_categories set
    name=btrim(p_input ->> 'name'),
    nature=p_input ->> 'nature',
    description=nullif(btrim(p_input ->> 'description'),''),
    is_active=(p_input ->> 'isActive')::boolean,
    updated_by=private.current_actor_id()
  where id=p_category_id and version=(p_input ->> 'version')::bigint
  returning * into v_row;
  if not found then raise exception 'La categoría cambió. Recarga antes de guardar.' using errcode='40001'; end if;
  return jsonb_build_object('id',v_row.id,'code',v_row.code,'name',v_row.name,'nature',v_row.nature,'description',v_row.description,'isActive',v_row.is_active,'version',v_row.version);
end;
$$;

revoke all on function public.save_sale_draft_v1(jsonb,uuid,bigint) from public,anon;
revoke all on function public.list_sale_drafts_v1() from public,anon;
revoke all on function public.get_sale_draft_v1(uuid) from public,anon;
revoke all on function public.create_sale_v3(jsonb,text) from public,anon;
revoke all on function public.get_sale_detail_v3(uuid) from public,anon;
revoke all on function public.confirm_sale_draft_v1(uuid,bigint,text) from public,anon;
revoke all on function public.create_inventory_movement_v1(jsonb,text) from public,anon;
revoke all on function public.create_return_case_v1(uuid,jsonb,text) from public,anon;
revoke all on function public.update_business_setting_v1(text,jsonb,bigint,text) from public,anon;
revoke all on function public.upsert_warehouse_v1(jsonb) from public,anon;
revoke all on function public.upsert_financial_account_v1(jsonb) from public,anon;
revoke all on function public.update_admin_profile_v1(uuid,jsonb) from public,anon;
revoke all on function public.update_catalog_item_v1(text,uuid,jsonb) from public,anon;
revoke all on function public.update_finance_category_v1(uuid,jsonb) from public,anon;
revoke all on function public.upsert_push_subscription_v1(jsonb) from public,anon;
revoke all on function public.upsert_notification_preference_v1(jsonb) from public,anon;
revoke all on function public.queue_weekly_summary_v1(timestamptz) from public,anon;
revoke all on function public.queue_dispatch_day_reminders_v1(timestamptz) from public,anon;
revoke all on function public.queue_notification_deliveries_v1() from public,anon;
revoke all on function public.claim_outbox_events_v1(text,integer) from public,anon,authenticated;
revoke all on function public.defer_outbox_event_v1(uuid,timestamptz,text) from public,anon,authenticated;
revoke all on function public.complete_outbox_event_v1(uuid,boolean,text) from public,anon,authenticated;
revoke all on function public.get_capacity_snapshot_v1() from public,anon;
revoke all on function public.run_notification_scheduler_v1(timestamptz) from public,anon,authenticated;

grant execute on function public.save_sale_draft_v1(jsonb,uuid,bigint) to authenticated,service_role;
grant execute on function public.list_sale_drafts_v1() to authenticated,service_role;
grant execute on function public.get_sale_draft_v1(uuid) to authenticated,service_role;
grant execute on function public.create_sale_v3(jsonb,text) to authenticated,service_role;
grant execute on function public.get_sale_detail_v3(uuid) to authenticated,service_role;
grant execute on function public.confirm_sale_draft_v1(uuid,bigint,text) to authenticated,service_role;
grant execute on function public.create_inventory_movement_v1(jsonb,text) to authenticated,service_role;
grant execute on function public.create_return_case_v1(uuid,jsonb,text) to authenticated,service_role;
grant execute on function public.update_business_setting_v1(text,jsonb,bigint,text) to authenticated,service_role;
grant execute on function public.upsert_warehouse_v1(jsonb) to authenticated,service_role;
grant execute on function public.upsert_financial_account_v1(jsonb) to authenticated,service_role;
grant execute on function public.update_admin_profile_v1(uuid,jsonb) to authenticated,service_role;
grant execute on function public.update_catalog_item_v1(text,uuid,jsonb) to authenticated,service_role;
grant execute on function public.update_finance_category_v1(uuid,jsonb) to authenticated,service_role;
grant execute on function public.upsert_push_subscription_v1(jsonb) to authenticated,service_role;
grant execute on function public.upsert_notification_preference_v1(jsonb) to authenticated,service_role;
grant execute on function public.queue_weekly_summary_v1(timestamptz) to authenticated,service_role;
grant execute on function public.queue_dispatch_day_reminders_v1(timestamptz) to authenticated,service_role;
grant execute on function public.queue_notification_deliveries_v1() to authenticated,service_role;
grant execute on function public.claim_outbox_events_v1(text,integer) to service_role;
grant execute on function public.defer_outbox_event_v1(uuid,timestamptz,text) to service_role;
grant execute on function public.complete_outbox_event_v1(uuid,boolean,text) to service_role;
grant execute on function public.get_capacity_snapshot_v1() to authenticated,service_role;
grant execute on function public.run_notification_scheduler_v1(timestamptz) to service_role;

notify pgrst, 'reload schema';
commit;
