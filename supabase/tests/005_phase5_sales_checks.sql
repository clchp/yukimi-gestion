-- Yukimi Gestión - comprobaciones estructurales Fase 5
-- Resultado esperado: Success. No rows returned

do $$
declare
  v_missing text[] := array[]::text[];
begin
  if to_regprocedure('public.get_sale_support_v1()') is null then v_missing := array_append(v_missing, 'get_sale_support_v1'); end if;
  if to_regprocedure('public.list_sales_v1(text,text,integer,integer)') is null then v_missing := array_append(v_missing, 'list_sales_v1'); end if;
  if to_regprocedure('public.get_sale_detail_v1(uuid)') is null then v_missing := array_append(v_missing, 'get_sale_detail_v1'); end if;
  if to_regprocedure('public.create_sale_v1(jsonb,text)') is null then v_missing := array_append(v_missing, 'create_sale_v1'); end if;
  if to_regprocedure('public.request_sale_release_v1(uuid,text,numeric)') is null then v_missing := array_append(v_missing, 'request_sale_release_v1'); end if;
  if to_regprocedure('public.review_sale_release_v1(uuid,text,text)') is null then v_missing := array_append(v_missing, 'review_sale_release_v1'); end if;
  if array_length(v_missing, 1) is not null then
    raise exception 'Faltan funciones de Fase 5: %', array_to_string(v_missing, ', ');
  end if;
end $$;

do $$
begin
  if not exists(select 1 from public.sales_channels where code = 'WHATSAPP' and is_active) then
    raise exception 'No existe el canal WHATSAPP activo.';
  end if;
  if not exists(select 1 from public.discount_types where code = 'MANUAL' and is_active) then
    raise exception 'No existe el tipo de descuento MANUAL activo.';
  end if;
  if not exists(select 1 from public.inventory_movement_types where code = 'RESERVATION' and is_active) then
    raise exception 'No existe el movimiento RESERVATION activo.';
  end if;
  if not exists(select 1 from public.inventory_bucket_types where code = 'AVAILABLE' and counts_as_sellable) then
    raise exception 'El bucket AVAILABLE no está configurado como vendible.';
  end if;
  if not exists(select 1 from public.inventory_bucket_types where code = 'RESERVED' and counts_as_reserved) then
    raise exception 'El bucket RESERVED no está configurado como reservado.';
  end if;
end $$;
