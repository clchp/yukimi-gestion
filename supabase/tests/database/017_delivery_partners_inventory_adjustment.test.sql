begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(7);

select has_function(
  'public',
  'list_delivery_partners_v1',
  array[]::text[],
  'Existe la consulta administrable de agencias y couriers'
);

select has_function(
  'public',
  'upsert_delivery_partner_v1',
  array['jsonb'],
  'Existe el alta y edición auditada de agencias y couriers'
);

select has_function(
  'public',
  'update_product_bundle_v2',
  array['uuid', 'jsonb'],
  'Existe la edición de producto con atributos de variante'
);

select ok(
  position(
    'if v_action = ''DYNAMIC'' then'
    in pg_get_functiondef('public.create_inventory_movement_v1(jsonb,text)'::regprocedure)
  ) > 0,
  'El ajuste manual positivo tiene un flujo propio'
);

select ok(
  position(
    '''AVAILABLE'', v_quantity, v_unit_cost'
    in pg_get_functiondef('public.create_inventory_movement_v1(jsonb,text)'::regprocedure)
  ) > 0,
  'El ajuste manual agrega la cantidad encontrada a disponible'
);

select ok(
  position(
    'when ''DYNAMIC'' then ''USED_DYNAMIC'''
    in pg_get_functiondef('public.create_inventory_movement_v1(jsonb,text)'::regprocedure)
  ) = 0,
  'El ajuste manual ya no consume disponible hacia USED_DYNAMIC'
);

select ok(
  position(
    'product_variant_attribute_values'
    in pg_get_functiondef('public.update_product_bundle_v2(uuid,jsonb)'::regprocedure)
  ) > 0,
  'La edición de producto conserva y actualiza atributos de variante'
);

select * from finish();
rollback;
