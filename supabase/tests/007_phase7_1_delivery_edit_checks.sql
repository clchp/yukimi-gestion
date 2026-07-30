-- Yukimi Gestión - comprobaciones Fase 7.1
-- Debe finalizar con "Success. No rows returned".

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'delivery_items' and column_name = 'is_active'
  ) then raise exception 'Falta delivery_items.is_active'; end if;

  if to_regprocedure('public.update_delivery_v1(uuid,jsonb)') is null then
    raise exception 'Falta update_delivery_v1';
  end if;

  if to_regprocedure('public.get_delivery_edit_support_v1(uuid)') is null then
    raise exception 'Falta get_delivery_edit_support_v1';
  end if;

  if not exists (
    select 1 from public.workflow_transitions
    where workflow_code = 'DELIVERY'
      and from_state_code = 'PENDING_AGENCY_DISPATCH'
      and to_state_code = 'PENDING_INSTRUCTIONS'
      and is_active = true
  ) then raise exception 'Falta transición de corrección logística'; end if;
end;
$$;
