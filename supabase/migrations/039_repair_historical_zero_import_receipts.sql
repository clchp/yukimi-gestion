-- Yukimi Gestión
-- Migración 039: reparación controlada de cajas históricas STOCKED con cero recibidos.

begin;

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

  if coalesce(current_setting('app.import_zero_receipt_repair', true), 'false') = 'true'
     and v_old_state = 'STOCKED'
     and v_new_state = 'RECEIVED_PERU'
     and v_workflow_code in ('IMPORT', 'IMPORT_BOX') then
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

create or replace function public.repair_zero_received_import_box_v1(
  p_box_id uuid,
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_box public.import_boxes%rowtype;
  v_import public.import_shipments%rowtype;
  v_existing jsonb;
  v_reason text := nullif(btrim(p_input ->> 'reason'), '');
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) < 5 then
    raise exception 'El motivo de la corrección debe tener al menos 5 caracteres.';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'La clave de idempotencia es obligatoria.';
  end if;

  select response_payload
    into v_existing
  from public.idempotency_keys
  where scope = 'RECEIVE_IMPORT_BOX'
    and idempotency_key = p_idempotency_key
    and status = 'COMPLETED';
  if v_existing is not null then
    return v_existing;
  end if;

  select * into v_box
  from public.import_boxes
  where id = p_box_id
  for update;
  if not found then
    raise exception 'Caja no encontrada.' using errcode = 'P0002';
  end if;
  if v_box.state_code <> 'STOCKED' then
    raise exception 'La reparación solo aplica a una caja marcada como ingresada a stock.';
  end if;
  if exists (
    select 1
    from public.import_box_items
    where import_box_id = p_box_id
      and (received_quantity > 0 or inventory_lot_id is not null)
  ) then
    raise exception 'La caja ya tiene recepción o lotes registrados y no necesita esta reparación.';
  end if;
  if not exists (
    select 1
    from public.import_box_items
    where import_box_id = p_box_id
      and expected_quantity > 0
  ) then
    raise exception 'La caja no contiene productos esperados.';
  end if;

  select * into v_import
  from public.import_shipments
  where id = v_box.import_shipment_id
  for update;
  if not found then
    raise exception 'La importación de la caja no existe.';
  end if;

  perform pg_catalog.set_config('app.import_zero_receipt_repair', 'true', true);
  perform pg_catalog.set_config('app.audit_reason', v_reason, true);

  if v_import.state_code = 'STOCKED' then
    update public.import_shipments
    set state_code = 'RECEIVED_PERU',
        stock_entry_completed_at = null,
        updated_by = private.current_actor_id()
    where id = v_import.id;
  elsif v_import.state_code <> 'RECEIVED_PERU' then
    raise exception 'La importación no se encuentra en un estado reparable.';
  end if;

  update public.import_boxes
  set state_code = 'RECEIVED_PERU',
      updated_by = private.current_actor_id()
  where id = p_box_id;

  insert into public.import_tracking_events(
    import_box_id,
    event_at,
    description,
    source,
    external_status,
    created_by
  ) values (
    p_box_id,
    now(),
    'Se abrió una corrección controlada porque la caja figuraba ingresada a stock con cero unidades recibidas.',
    'YUKIMI_REPAIR',
    'RECEIVED_PERU',
    private.current_actor_id()
  );

  return public.receive_import_box_v2(p_box_id, p_input, p_idempotency_key);
end;
$$;

revoke execute on function public.repair_zero_received_import_box_v1(uuid, jsonb, text) from public, anon;
grant execute on function public.repair_zero_received_import_box_v1(uuid, jsonb, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
