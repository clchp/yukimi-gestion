-- Yukimi Gestión
-- Migración 036: corrige la llamada tipada al reporte usado por el resumen semanal.

begin;

create or replace function public.queue_weekly_summary_v1(p_now timestamptz default now())
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_setting jsonb;
  v_local timestamp;
  v_enabled boolean;
  v_weekday integer;
  v_hour integer;
  v_notification_id uuid;
  v_start date;
  v_end date;
  v_report jsonb;
begin
  if auth.role() <> 'service_role' and not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select setting_value
    into v_setting
  from public.business_settings
  where setting_key = 'notifications.weekly_summary';

  v_enabled := coalesce((v_setting ->> 'enabled')::boolean, false);
  v_weekday := coalesce((v_setting ->> 'weekday')::integer, 1);
  v_hour := coalesce((v_setting ->> 'hour')::integer, 8);
  v_local := timezone(coalesce(v_setting ->> 'timezone', 'America/Lima'), p_now);

  if not v_enabled
     or extract(isodow from v_local)::integer <> v_weekday
     or extract(hour from v_local)::integer <> v_hour then
    return jsonb_build_object('queued', false, 'reason', 'NOT_SCHEDULED');
  end if;

  v_end := v_local::date - 1;
  v_start := v_end - 6;
  v_report := public.get_reports_v1(v_start, v_end, null::uuid);

  v_notification_id := private.emit_notification_v1(
    'WEEKLY_SUMMARY',
    'Resumen semanal · ' || to_char(v_start, 'DD/MM') || '–' || to_char(v_end, 'DD/MM'),
    'Ventas netas S/ ' || to_char(coalesce((v_report #>> '{summary,netSales}')::numeric, 0), 'FM999999990.00') ||
      ', cobrado S/ ' || to_char(coalesce((v_report #>> '{summary,collected}')::numeric, 0), 'FM999999990.00') ||
      ', saldo S/ ' || to_char(coalesce((v_report #>> '{summary,outstandingBalance}')::numeric, 0), 'FM999999990.00') || '.',
    'NORMAL',
    'WEEKLY_REPORT',
    null,
    '/reportes',
    'WEEKLY_SUMMARY:' || v_start::text,
    jsonb_build_object('startDate', v_start, 'endDate', v_end, 'report', v_report)
  );

  return jsonb_build_object(
    'queued', true,
    'notificationId', v_notification_id,
    'startDate', v_start,
    'endDate', v_end
  );
end;
$$;

revoke all on function public.queue_weekly_summary_v1(timestamptz) from public, anon;
grant execute on function public.queue_weekly_summary_v1(timestamptz) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
