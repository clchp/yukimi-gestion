-- Yukimi Gestión - comprobaciones estructurales Fase 4

do $$
declare
  v_missing text[];
begin
  select array_agg(required_name)
  into v_missing
  from (
    values
      ('list_clients_v1'),
      ('get_client_detail_v1'),
      ('create_client_v1'),
      ('update_client_v1'),
      ('set_client_status_v1'),
      ('set_client_vip_v1'),
      ('save_client_address_v1'),
      ('create_client_incident_v1'),
      ('resolve_client_incident_v1')
  ) required(required_name)
  where not exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public' and p.proname = required.required_name
  );

  if v_missing is not null then
    raise exception 'Faltan funciones de clientes: %', array_to_string(v_missing, ', ');
  end if;

  if not exists(select 1 from pg_indexes where schemaname = 'public' and indexname = 'ix_client_incidents_unresolved') then
    raise exception 'Falta el índice de incidentes pendientes.';
  end if;

  raise notice 'Fase 4: funciones e índices de clientes correctos.';
end;
$$;
