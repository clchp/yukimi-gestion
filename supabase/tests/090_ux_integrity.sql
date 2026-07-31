begin;

select plan(12);

select ok(
  to_regprocedure('public.update_product_bundle_v1(uuid,jsonb)') is not null,
  'Existe la edición transaccional de productos.'
);

select ok(
  to_regprocedure('public.guard_import_transition_v1(uuid,text)') is not null,
  'Existe la guarda de transición de importación.'
);

select ok(
  to_regprocedure('public.guard_import_box_transition_v1(uuid,text)') is not null,
  'Existe la guarda de transición de caja.'
);

select ok(
  to_regprocedure('public.cancel_import_v1(uuid,text)') is not null,
  'Existe la cancelación atómica de importación.'
);

select ok(
  to_regprocedure('public.cancel_import_box_v1(uuid,text)') is not null,
  'Existe la cancelación atómica de caja.'
);

select ok(
  to_regprocedure('public.repair_zero_received_import_box_v1(uuid,jsonb,text)') is not null,
  'Existe la reparación controlada de recepciones históricas.'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.import_boxes'::regclass
      and tgname = 'trg_validate_import_box_state_integrity'
      and not tgisinternal
  ),
  'Las cajas protegen el ingreso a stock.'
);

select ok(
  exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.import_shipments'::regclass
      and tgname = 'trg_validate_import_shipment_state_integrity'
      and not tgisinternal
  ),
  'Las importaciones protegen su estado final.'
);

select is(
  (
    select is_nullable
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'sale_drafts'
      and column_name = 'client_id'
  ),
  'YES',
  'El cliente es opcional mientras la venta sea borrador.'
);

select ok(
  to_regprocedure('public.list_sale_drafts_v1()') is not null,
  'La lista de borradores permanece disponible.'
);

select ok(
  exists (
    select 1
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname like '%sale%draft%'
      and p.proname <> 'list_sale_drafts_v1'
  ),
  'Existe una operación para guardar o consultar el detalle del borrador.'
);

select ok(
  not exists (
    select version
    from (
      select split_part(filename, '_', 1) as version, count(*) as quantity
      from supabase_migrations.schema_migrations sm
      cross join lateral (select sm.version || '_applied.sql' as filename) generated
      group by split_part(filename, '_', 1)
      having count(*) > 1
    ) duplicates
  ),
  'El historial aplicado no contiene versiones duplicadas.'
);

select * from finish();

rollback;
