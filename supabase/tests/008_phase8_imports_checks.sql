-- Yukimi Gestión - comprobaciones Fase 8
-- Debe finalizar con "Success. No rows returned".

do $$
begin
  if to_regprocedure('public.get_import_support_v1()') is null then
    raise exception 'Falta get_import_support_v1';
  end if;
  if to_regprocedure('public.list_imports_v1(text,text,integer,integer)') is null then
    raise exception 'Falta list_imports_v1';
  end if;
  if to_regprocedure('public.create_import_v1(jsonb,text)') is null then
    raise exception 'Falta create_import_v1';
  end if;
  if to_regprocedure('public.get_import_detail_v1(uuid)') is null then
    raise exception 'Falta get_import_detail_v1';
  end if;
  if to_regprocedure('public.advance_import_v1(uuid,text,text,timestamp with time zone,text)') is null then
    raise exception 'Falta advance_import_v1';
  end if;
  if to_regprocedure('public.advance_import_box_v1(uuid,text,text,timestamp with time zone,text)') is null then
    raise exception 'Falta advance_import_box_v1';
  end if;
  if to_regprocedure('public.receive_import_box_v1(uuid,jsonb,text)') is null then
    raise exception 'Falta receive_import_box_v1';
  end if;
  if to_regprocedure('public.add_import_cost_v1(uuid,jsonb)') is null then
    raise exception 'Falta add_import_cost_v1';
  end if;
  if to_regprocedure('public.create_import_incident_v1(uuid,jsonb)') is null then
    raise exception 'Falta create_import_incident_v1';
  end if;
  if to_regprocedure('public.create_insurance_claim_v1(uuid,jsonb)') is null then
    raise exception 'Falta create_insurance_claim_v1';
  end if;
  if to_regprocedure('public.update_insurance_claim_v1(uuid,jsonb)') is null then
    raise exception 'Falta update_insurance_claim_v1';
  end if;
  if to_regprocedure('public.create_preorder_sale_v1(jsonb,text)') is null then
    raise exception 'Falta create_preorder_sale_v1';
  end if;
  if to_regprocedure('public.allocate_preorder_v1(jsonb)') is null then
    raise exception 'Falta allocate_preorder_v1';
  end if;
  if to_regprocedure('public.create_import_partner_v1(jsonb)') is null then
    raise exception 'Falta create_import_partner_v1';
  end if;

  if not exists (
    select 1 from public.workflow_states
    where workflow_code = 'IMPORT' and state_code = 'RECEIVED_PERU' and is_active = true
  ) then raise exception 'Falta el estado RECEIVED_PERU de importación'; end if;

  if not exists (
    select 1 from public.workflow_states
    where workflow_code = 'IMPORT_BOX' and state_code = 'STOCKED' and is_active = true
  ) then raise exception 'Falta el estado STOCKED de caja'; end if;

  if not exists (
    select 1 from public.inventory_movement_types
    where code = 'IMPORT_RECEIPT' and is_active = true
  ) then raise exception 'Falta el movimiento IMPORT_RECEIPT'; end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public' and indexname = 'ix_import_box_items_receive_lookup'
  ) then raise exception 'Falta índice de recepción de cajas'; end if;

  if not has_function_privilege('authenticated', 'public.get_import_support_v1()', 'EXECUTE') then
    raise exception 'authenticated no puede ejecutar get_import_support_v1';
  end if;
  if not has_function_privilege('authenticated', 'public.create_import_v1(jsonb,text)', 'EXECUTE') then
    raise exception 'authenticated no puede ejecutar create_import_v1';
  end if;
end;
$$;
