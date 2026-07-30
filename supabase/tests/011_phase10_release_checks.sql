-- Yukimi Gestión
-- Comprobaciones Fase 10: reportes, alertas, auditoría y preparación de publicación
-- Resultado correcto: Success. No rows returned

do $$
declare
  v_missing text;
  v_definition text;
begin
  select string_agg(required.name, ', ' order by required.name)
    into v_missing
  from (values
    ('public.refresh_operational_notifications_v1()'),
    ('public.get_notifications_v1(integer,text)'),
    ('public.set_notification_status_v1(uuid,text)'),
    ('public.get_dashboard_v2()'),
    ('public.get_reports_v1(date,date,uuid)'),
    ('public.get_audit_log_v1(text,text,text,date,date,integer,integer)'),
    ('public.register_report_export_v1(jsonb)')
  ) required(name)
  where to_regprocedure(required.name) is null;

  if v_missing is not null then
    raise exception 'Faltan funciones de la Fase 10: %', v_missing;
  end if;

  if to_regclass('public.report_exports') is null then
    raise exception 'No existe public.report_exports.';
  end if;

  if not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'notifications'
      and column_name = 'deduplication_key'
  ) then
    raise exception 'Falta notifications.deduplication_key.';
  end if;

  if not exists (
    select 1 from pg_indexes
    where schemaname = 'public'
      and indexname = 'ux_notifications_deduplication_key'
  ) then
    raise exception 'Falta el índice único de deduplicación de notificaciones.';
  end if;

  select pg_get_functiondef('public.refresh_operational_notifications_v1()'::regprocedure)
    into v_definition;

  if strpos(v_definition, 'PAYMENT_OVERDUE') = 0
     or strpos(v_definition, 'STOCK_LOW') = 0
     or strpos(v_definition, 'IMPORT_DELAYED') = 0
     or strpos(v_definition, 'DISPATCH_PENDING') = 0
     or strpos(v_definition, 'RECEIPT_PENDING') = 0 then
    raise exception 'La función de alertas no contiene todas las reglas operativas esperadas.';
  end if;

  if not exists (
    select 1 from storage.buckets where id = 'report-exports' and public = false
  ) then
    raise exception 'El bucket privado report-exports no está disponible.';
  end if;
end;
$$;
