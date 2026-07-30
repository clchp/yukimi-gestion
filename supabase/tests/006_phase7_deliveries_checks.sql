-- Yukimi Gestión
-- Comprobaciones no destructivas de la Fase 7
-- Resultado esperado: Success. No rows returned

do $$
declare
  v_missing text[] := array[]::text[];
begin
  if to_regprocedure('public.get_delivery_support_v1(uuid)') is null then v_missing := array_append(v_missing, 'get_delivery_support_v1'); end if;
  if to_regprocedure('public.list_deliveries_v1(text,text,integer,integer)') is null then v_missing := array_append(v_missing, 'list_deliveries_v1'); end if;
  if to_regprocedure('public.get_delivery_detail_v1(uuid)') is null then v_missing := array_append(v_missing, 'get_delivery_detail_v1'); end if;
  if to_regprocedure('public.create_delivery_v1(jsonb,text)') is null then v_missing := array_append(v_missing, 'create_delivery_v1'); end if;
  if to_regprocedure('public.advance_delivery_v1(uuid,text,text,timestamp with time zone,text)') is null then v_missing := array_append(v_missing, 'advance_delivery_v1'); end if;
  if to_regprocedure('private.ensure_sale_accumulated_inventory_v1(uuid)') is null then v_missing := array_append(v_missing, 'ensure_sale_accumulated_inventory_v1'); end if;
  if to_regprocedure('private.finalize_delivery_inventory_v1(uuid)') is null then v_missing := array_append(v_missing, 'finalize_delivery_inventory_v1'); end if;

  if array_length(v_missing, 1) is not null then
    raise exception 'Faltan funciones de Fase 7: %', array_to_string(v_missing, ', ');
  end if;
end $$;

do $$
begin
  if not has_function_privilege('authenticated', 'public.create_delivery_v1(jsonb,text)', 'EXECUTE') then
    raise exception 'authenticated no puede ejecutar create_delivery_v1';
  end if;

  if not exists (
    select 1 from public.business_partners bp
    join public.business_partner_types bpt on bpt.partner_id = bp.id
    where bp.code = 'PART-SHALOM' and bpt.partner_type_code = 'AGENCY' and bp.is_active
  ) then raise exception 'Shalom no está configurado como agencia activa.'; end if;

  if not exists (
    select 1 from public.business_partners bp
    join public.business_partner_types bpt on bpt.partner_id = bp.id
    where bp.code = 'PART-OLVA' and bpt.partner_type_code = 'AGENCY' and bp.is_active
  ) then raise exception 'Olva no está configurado como agencia activa.'; end if;

  if not exists (
    select 1 from public.business_partners bp
    join public.business_partner_types bpt on bpt.partner_id = bp.id
    where bp.code = 'PART-AFEXPRESS' and bpt.partner_type_code = 'COURIER' and bp.is_active
  ) then raise exception 'AF Express no está configurado como courier activo.'; end if;

  if not exists (
    select 1 from public.inventory_bucket_types
    where code = 'DELIVERED' and is_terminal = true and counts_as_on_hand = false
  ) then raise exception 'El bucket DELIVERED no está configurado como salida terminal.'; end if;

  if not exists (
    select 1 from public.inventory_movement_types
    where code = 'DELIVERY' and is_active = true
  ) then raise exception 'Falta el tipo de movimiento DELIVERY.'; end if;

  if not exists (
    select 1 from public.workflow_transitions
    where workflow_code = 'DELIVERY'
      and from_state_code = 'PENDING_AGENCY_DISPATCH'
      and to_state_code = 'DELIVERED_TO_AGENCY'
      and is_active = true
  ) then raise exception 'Falta la transición a Entregado a agencia.'; end if;

  if not exists (
    select 1 from public.workflow_transitions
    where workflow_code = 'DELIVERY'
      and from_state_code = 'DELIVERED_TO_AGENCY'
      and to_state_code = 'DELIVERED_TO_CLIENT'
      and is_active = true
  ) then raise exception 'Falta la transición de agencia a cliente.'; end if;

  if not exists (
    select 1 from storage.buckets where id = 'delivery-files' and public = false
  ) then raise exception 'Falta el bucket privado delivery-files.'; end if;
end $$;
