-- Yukimi Gestión
-- Migración 038: protege cancelaciones e ingreso a stock de importaciones.

begin;

create or replace function private.validate_import_box_state_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_received integer;
  v_expected integer;
begin
  if new.state_code = 'STOCKED' then
    select
      coalesce(sum(received_quantity), 0)::integer,
      coalesce(sum(expected_quantity), 0)::integer
      into v_received, v_expected
    from public.import_box_items
    where import_box_id = new.id;

    if v_expected <= 0 then
      raise exception 'La caja no contiene productos y no puede ingresarse a stock.';
    end if;
    if v_received <= 0 then
      raise exception 'Registra al menos una unidad recibida antes de ingresar la caja a stock.';
    end if;
  end if;

  if new.state_code = 'CANCELLED' and old.state_code <> 'CANCELLED' then
    if exists (
      select 1
      from public.import_box_items ibi
      where ibi.import_box_id = new.id
        and (ibi.received_quantity > 0 or ibi.inventory_lot_id is not null)
    ) then
      raise exception 'No puedes cancelar una caja que ya tiene unidades recibidas o ingresadas a stock.';
    end if;

    if exists (
      select 1
      from public.preorder_allocations pa
      join public.import_box_items ibi on ibi.id = pa.import_box_item_id
      where ibi.import_box_id = new.id
        and pa.status in ('ALLOCATED', 'RECEIVED')
    ) then
      raise exception 'No puedes cancelar la caja porque tiene preventas asignadas.';
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.validate_import_shipment_state_integrity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_pending_boxes integer;
  v_invalid_boxes integer;
begin
  if new.state_code = 'STOCKED' then
    select count(*)::integer
      into v_pending_boxes
    from public.import_boxes
    where import_shipment_id = new.id
      and state_code not in ('STOCKED', 'CANCELLED');

    select count(*)::integer
      into v_invalid_boxes
    from public.import_boxes ib
    where ib.import_shipment_id = new.id
      and ib.state_code = 'STOCKED'
      and coalesce((
        select sum(ibi.received_quantity)
        from public.import_box_items ibi
        where ibi.import_box_id = ib.id
      ), 0) <= 0;

    if v_pending_boxes > 0 then
      raise exception 'La importación no puede finalizar mientras existan cajas pendientes de recepción.';
    end if;
    if v_invalid_boxes > 0 then
      raise exception 'Existen cajas marcadas como ingresadas a stock sin cantidades recibidas.';
    end if;
  end if;

  if new.state_code = 'CANCELLED' and old.state_code <> 'CANCELLED' then
    if exists (
      select 1
      from public.import_boxes ib
      join public.import_box_items ibi on ibi.import_box_id = ib.id
      where ib.import_shipment_id = new.id
        and (ibi.received_quantity > 0 or ibi.inventory_lot_id is not null)
    ) then
      raise exception 'No puedes cancelar la importación porque ya tiene unidades recibidas o ingresadas a stock.';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists trg_validate_import_box_state_integrity on public.import_boxes;
create trigger trg_validate_import_box_state_integrity
before update of state_code on public.import_boxes
for each row execute function private.validate_import_box_state_integrity();

drop trigger if exists trg_validate_import_shipment_state_integrity on public.import_shipments;
create trigger trg_validate_import_shipment_state_integrity
before update of state_code on public.import_shipments
for each row execute function private.validate_import_shipment_state_integrity();

create or replace function public.guard_import_transition_v1(
  p_import_id uuid,
  p_next_state_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if p_next_state_code = 'STOCKED' then
    raise exception 'El ingreso a stock se completa al recibir todas las cajas. Usa “Recibir e ingresar caja a stock”.';
  end if;

  if p_next_state_code = 'CANCELLED' then
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
  end if;
end;
$$;

create or replace function public.guard_import_box_transition_v1(
  p_box_id uuid,
  p_next_state_code text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if p_next_state_code = 'STOCKED' then
    raise exception 'No marques la caja como ingresada manualmente. Usa “Recibir e ingresar caja a stock”.';
  end if;

  if p_next_state_code = 'CANCELLED' then
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
  end if;
end;
$$;

revoke execute on function public.guard_import_transition_v1(uuid, text) from public, anon;
revoke execute on function public.guard_import_box_transition_v1(uuid, text) from public, anon;
grant execute on function public.guard_import_transition_v1(uuid, text) to authenticated, service_role;
grant execute on function public.guard_import_box_transition_v1(uuid, text) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
