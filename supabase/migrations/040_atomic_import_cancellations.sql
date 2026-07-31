-- Yukimi Gestión
-- Migración 040: cancelaciones atómicas y trazables de importaciones.

begin;

create or replace function public.cancel_import_box_v1(
  p_box_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_box public.import_boxes%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null or length(btrim(p_reason)) < 5 then
    raise exception 'El motivo de cancelación debe tener al menos 5 caracteres.';
  end if;

  select * into v_box
  from public.import_boxes
  where id = p_box_id
  for update;
  if not found then
    raise exception 'Caja no encontrada.' using errcode = 'P0002';
  end if;
  if v_box.state_code = 'CANCELLED' then
    return jsonb_build_object(
      'id', v_box.id,
      'code', v_box.code,
      'stateCode', v_box.state_code,
      'version', v_box.version
    );
  end if;
  if v_box.state_code = 'STOCKED' then
    raise exception 'No puedes cancelar una caja que ya fue ingresada a stock.';
  end if;
  if not exists (
    select 1
    from public.workflow_transitions wt
    where wt.workflow_code = 'IMPORT_BOX'
      and wt.from_state_code = v_box.state_code
      and wt.to_state_code = 'CANCELLED'
      and wt.is_active = true
  ) then
    raise exception 'La caja ya avanzó a % y no admite cancelación directa.', v_box.state_code;
  end if;
  if exists (
    select 1
    from public.import_box_items ibi
    where ibi.import_box_id = p_box_id
      and (ibi.received_quantity > 0 or ibi.inventory_lot_id is not null)
  ) then
    raise exception 'No puedes cancelar una caja que ya tiene unidades recibidas o ingresadas a stock.';
  end if;
  if exists (
    select 1
    from public.preorder_allocations pa
    join public.import_box_items ibi on ibi.id = pa.import_box_item_id
    where ibi.import_box_id = p_box_id
      and pa.status in ('ALLOCATED', 'RECEIVED')
  ) then
    raise exception 'No puedes cancelar la caja porque tiene preventas asignadas.';
  end if;

  perform pg_catalog.set_config('app.audit_reason', btrim(p_reason), true);

  update public.import_boxes
  set state_code = 'CANCELLED',
      updated_by = v_actor
  where id = p_box_id
  returning * into v_box;

  insert into public.import_tracking_events(
    import_box_id,
    event_at,
    description,
    source,
    external_status,
    created_by
  ) values (
    v_box.id,
    now(),
    btrim(p_reason),
    'YUKIMI',
    'CANCELLED',
    v_actor
  );

  return jsonb_build_object(
    'id', v_box.id,
    'code', v_box.code,
    'stateCode', v_box.state_code,
    'version', v_box.version
  );
end;
$$;

create or replace function public.cancel_import_v1(
  p_import_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_import public.import_shipments%rowtype;
  v_box record;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null or length(btrim(p_reason)) < 5 then
    raise exception 'El motivo de cancelación debe tener al menos 5 caracteres.';
  end if;

  select * into v_import
  from public.import_shipments
  where id = p_import_id
  for update;
  if not found then
    raise exception 'Importación no encontrada.' using errcode = 'P0002';
  end if;
  if v_import.state_code = 'CANCELLED' then
    return jsonb_build_object(
      'id', v_import.id,
      'code', v_import.code,
      'stateCode', v_import.state_code,
      'version', v_import.version
    );
  end if;
  if v_import.state_code = 'STOCKED' then
    raise exception 'No puedes cancelar una importación que ya fue ingresada a stock.';
  end if;
  if not exists (
    select 1
    from public.workflow_transitions wt
    where wt.workflow_code = 'IMPORT'
      and wt.from_state_code = v_import.state_code
      and wt.to_state_code = 'CANCELLED'
      and wt.is_active = true
  ) then
    raise exception 'La importación ya avanzó a % y no admite cancelación directa.', v_import.state_code;
  end if;
  if exists (
    select 1
    from public.import_boxes ib
    join public.import_box_items ibi on ibi.import_box_id = ib.id
    where ib.import_shipment_id = p_import_id
      and (ibi.received_quantity > 0 or ibi.inventory_lot_id is not null)
  ) then
    raise exception 'No puedes cancelar la importación porque ya tiene unidades recibidas o ingresadas a stock.';
  end if;
  if exists (
    select 1
    from public.preorder_allocations pa
    join public.import_box_items ibi on ibi.id = pa.import_box_item_id
    join public.import_boxes ib on ib.id = ibi.import_box_id
    where ib.import_shipment_id = p_import_id
      and pa.status in ('ALLOCATED', 'RECEIVED')
  ) then
    raise exception 'No puedes cancelar la importación porque tiene preventas asignadas.';
  end if;

  -- La cancelación general también cancela sus cajas, pero solo si cada una está
  -- en un estado que admite cancelación. Todo se ejecuta en una sola transacción.
  for v_box in
    select ib.id, ib.code, ib.state_code
    from public.import_boxes ib
    where ib.import_shipment_id = p_import_id
      and ib.state_code <> 'CANCELLED'
    order by ib.id
    for update
  loop
    if not exists (
      select 1
      from public.workflow_transitions wt
      where wt.workflow_code = 'IMPORT_BOX'
        and wt.from_state_code = v_box.state_code
        and wt.to_state_code = 'CANCELLED'
        and wt.is_active = true
    ) then
      raise exception 'La caja % está en % y no admite cancelación. Cancela o resuelve esa caja primero.',
        v_box.code, v_box.state_code;
    end if;
  end loop;

  perform pg_catalog.set_config('app.audit_reason', btrim(p_reason), true);

  update public.import_boxes
  set state_code = 'CANCELLED',
      updated_by = v_actor
  where import_shipment_id = p_import_id
    and state_code <> 'CANCELLED';

  insert into public.import_tracking_events(
    import_box_id,
    event_at,
    description,
    source,
    external_status,
    created_by
  )
  select
    ib.id,
    now(),
    'Cancelada junto con la importación ' || v_import.code || '. ' || btrim(p_reason),
    'YUKIMI',
    'CANCELLED',
    v_actor
  from public.import_boxes ib
  where ib.import_shipment_id = p_import_id
    and ib.state_code = 'CANCELLED';

  update public.import_shipments
  set state_code = 'CANCELLED',
      updated_by = v_actor
  where id = p_import_id
  returning * into v_import;

  insert into public.import_tracking_events(
    import_shipment_id,
    event_at,
    description,
    source,
    external_status,
    created_by
  ) values (
    v_import.id,
    now(),
    btrim(p_reason),
    'YUKIMI',
    'CANCELLED',
    v_actor
  );

  return jsonb_build_object(
    'id', v_import.id,
    'code', v_import.code,
    'stateCode', v_import.state_code,
    'version', v_import.version
  );
end;
$$;

revoke execute on function public.cancel_import_box_v1(uuid, text) from public, anon;
revoke execute on function public.cancel_import_v1(uuid, text) from public, anon;
grant execute on function public.cancel_import_box_v1(uuid, text) to authenticated, service_role;
grant execute on function public.cancel_import_v1(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
