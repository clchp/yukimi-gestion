-- Yukimi Gestión
-- Migración 043: borradores de venta realmente parciales.

begin;

-- Función actualizada: save_sale_draft_v1
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

-- Función actualizada: list_sale_drafts_v1
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
      left join public.clients c on c.id = d.client_id
      where d.status = 'DRAFT'
    ), '[]'::jsonb)
  );
end;
$$;

-- Función actualizada: get_sale_draft_v1
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

-- Función actualizada: confirm_sale_draft_v1
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

notify pgrst, 'reload schema';

commit;
