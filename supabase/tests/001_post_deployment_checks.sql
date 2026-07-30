-- Verificaciones posteriores al despliegue.
-- El script no crea datos comerciales y puede ejecutarse desde el SQL Editor.

do $$
declare
  v_missing text[];
  v_rls_missing text[];
  v_bad_workflows text[];
begin
  select array_agg(required_table)
  into v_missing
  from unnest(array[
    'profiles','clients','products','product_variants','warehouses',
    'inventory_lots','inventory_balances','inventory_movements',
    'sales','sale_items','payments','sales_receipts','deliveries',
    'import_shipments','import_boxes','financial_accounts',
    'financial_transactions','notifications','audit_log'
  ]) as required_table
  where to_regclass('public.' || required_table) is null;

  if v_missing is not null then
    raise exception 'Faltan tablas requeridas: %', v_missing;
  end if;

  select array_agg(c.relname order by c.relname)
  into v_rls_missing
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind = 'r'
    and c.relname in (
      'profiles','clients','products','product_variants','warehouses',
      'inventory_lots','inventory_balances','inventory_movements',
      'sales','sale_items','payments','sales_receipts','deliveries',
      'import_shipments','import_boxes','financial_accounts',
      'financial_transactions','notifications','audit_log'
    )
    and c.relrowsecurity = false;

  if v_rls_missing is not null then
    raise exception 'RLS no está habilitado en: %', v_rls_missing;
  end if;

  select array_agg(w.code)
  into v_bad_workflows
  from public.workflow_definitions w
  left join lateral (
    select count(*) as initial_count
    from public.workflow_states s
    where s.workflow_code = w.code
      and s.is_initial = true
      and s.is_active = true
  ) x on true
  where x.initial_count <> 1;

  if v_bad_workflows is not null then
    raise exception 'Workflows sin exactamente un estado inicial: %', v_bad_workflows;
  end if;

  if not exists (select 1 from public.app_roles where code = 'ADMIN' and is_active) then
    raise exception 'No existe el rol ADMIN.';
  end if;

  if (select count(*) from public.warehouses where code in ('LORENA','CAMILA')) <> 2 then
    raise exception 'No se crearon los almacenes Lorena y Camila.';
  end if;

  if (select count(*) from public.product_categories where code in ('PLUSH','FIGURE','ACRYLIC','KEYCHAIN','OTHER')) <> 5 then
    raise exception 'No se cargaron las categorías iniciales.';
  end if;

  if exists (
    select 1 from storage.buckets
    where id in (
      'product-images','payment-proofs','receipt-files','expense-proofs',
      'import-files','delivery-files','report-exports'
    ) and public = true
  ) then
    raise exception 'Existe al menos un bucket de Yukimi configurado como público.';
  end if;

  raise notice 'Verificación completada: estructura, RLS, workflows, semillas y buckets correctos.';
end;
$$;
