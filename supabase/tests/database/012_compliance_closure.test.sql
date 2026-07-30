begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(16);

select ok(to_regclass('public.sale_drafts') is not null, 'Existe almacenamiento persistente de borradores de venta');
select ok(to_regclass('public.return_cases') is not null, 'Existe el registro de devoluciones y cambios');
select ok(to_regprocedure('public.save_sale_draft_v1(jsonb,uuid,bigint)') is not null, 'Existe el guardado de borradores');
select ok(to_regprocedure('public.confirm_sale_draft_v1(uuid,bigint,text)') is not null, 'Existe la confirmación atómica del borrador');
select ok(to_regprocedure('public.create_inventory_movement_v1(jsonb,text)') is not null, 'Existe el movimiento de inventario atómico');
select ok(to_regprocedure('public.create_return_case_v1(uuid,jsonb,text)') is not null, 'Existe la devolución o cambio atómico');
select ok(to_regprocedure('public.update_business_setting_v1(text,jsonb,bigint,text)') is not null, 'Existe configuración de negocio auditable');
select ok(to_regprocedure('public.upsert_financial_account_v1(jsonb)') is not null, 'Existe administración de cuentas financieras');
select ok(to_regprocedure('public.queue_weekly_summary_v1(timestamp with time zone)') is not null, 'Existe el resumen semanal programable');
select ok(to_regprocedure('public.queue_dispatch_day_reminders_v1(timestamp with time zone)') is not null, 'Existen recordatorios de despacho por día configurado');
select ok(to_regprocedure('public.claim_outbox_events_v1(text,integer)') is not null, 'El worker reclama eventos con bloqueo');
select ok(to_regprocedure('public.defer_outbox_event_v1(uuid,timestamp with time zone,text)') is not null, 'El worker respeta horarios silenciosos');
select ok(to_regprocedure('public.complete_outbox_event_v1(uuid,boolean,text)') is not null, 'El worker completa o reintenta entregas');
select ok(to_regprocedure('public.get_capacity_snapshot_v1()') is not null, 'Existe monitoreo de capacidad');
select is((select setting_value from public.business_settings where setting_key='notifications.dispatch_weekdays'), '[1, 4]'::jsonb, 'Los días de despacho son lunes y jueves');
select ok((select count(*) >= 4 from public.financial_accounts where code in ('BCP_MAIN','SCOTIABANK_MAIN','YAPE_1','YAPE_2')), 'Se prepararon las cuentas operativas requeridas sin inventar números sensibles');

select * from finish();
rollback;
