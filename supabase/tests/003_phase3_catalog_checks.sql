-- Yukimi Gestión - comprobaciones de Fase 3
-- Ejecutar después de 011_catalog_products_api.sql

do $$
begin
  if to_regclass('public.v_product_catalog') is null then
    raise exception 'Falta la vista public.v_product_catalog.';
  end if;

  if to_regprocedure('public.create_product_bundle(jsonb,text)') is null then
    raise exception 'Falta la función public.create_product_bundle(jsonb,text).';
  end if;

  if not exists (
    select 1
    from information_schema.routine_privileges
    where routine_schema = 'public'
      and routine_name = 'create_product_bundle'
      and grantee = 'authenticated'
      and privilege_type = 'EXECUTE'
  ) then
    raise exception 'El rol authenticated no puede ejecutar create_product_bundle.';
  end if;

  if (
    select count(*) from public.warehouses
    where code in ('LORENA', 'CAMILA')
      and warehouse_type = 'OPERATIONAL'
      and is_active = true
  ) <> 2 then
    raise exception 'Los almacenes operativos Lorena y Camila no están configurados correctamente.';
  end if;

  if (
    select count(*) from public.product_categories
    where code in ('PLUSH', 'FIGURE', 'ACRYLIC', 'KEYCHAIN', 'OTHER')
  ) <> 5 then
    raise exception 'Faltan categorías iniciales de productos.';
  end if;
end;
$$;
