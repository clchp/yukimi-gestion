begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(8);

select is(private.normalize_search_text('María López'), 'maria lopez', 'La búsqueda ignora tildes');
select is(private.normalize_search_text('PELÚCHE'), 'peluche', 'La normalización conserva texto comparable');
select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'products'
      and column_name = 'search_name_normalized'
  ),
  'Productos tiene nombre normalizado'
);
select ok(
  exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'franchises'
      and column_name = 'search_name_normalized'
  ),
  'Franquicias tiene nombre normalizado'
);
select ok(to_regprocedure('public.create_sale_v3(jsonb,text)') is not null, 'Venta v3 continúa disponible');
select ok(to_regprocedure('public.list_sales_v1(text,text,integer,integer)') is not null, 'Lista de ventas continúa disponible');
select ok(to_regprocedure('public.list_clients_v1(text,text,integer,integer)') is not null, 'Lista de clientes continúa disponible');
select ok(pg_get_viewdef('public.v_sales_overview'::regclass, true) ilike '%OVERDUE%', 'La vista calcula vencimiento efectivo');

select * from finish();
rollback;
