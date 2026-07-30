-- Yukimi Gestión
-- Migración 029: costo vigente visible para advertencias comerciales

begin;

create or replace view public.v_inventory_summary
with (security_invoker = true)
as
select
  pv.id as variant_id,
  p.id as product_id,
  p.code as product_code,
  pv.sku,
  p.name as product_name,
  pv.variant_name,
  pc.name as category_name,
  f.name as franchise_name,
  w.id as warehouse_id,
  w.code as warehouse_code,
  w.name as warehouse_name,
  w.warehouse_type,
  w.is_virtual as warehouse_is_virtual,
  w.is_visible_in_operations,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'AVAILABLE'), 0)::integer as available_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'RESERVED'), 0)::integer as reserved_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'ACCUMULATED'), 0)::integer as accumulated_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'DAMAGED'), 0)::integer as damaged_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'LOST'), 0)::integer as lost_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'IN_TRANSIT'), 0)::integer as in_transit_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'PREORDER_EXPECTED'), 0)::integer as preorder_expected_quantity,
  pv.minimum_stock,
  pv.sale_price,
  pv.currency_code,
  pv.is_active,
  round(
    sum(ib.quantity * il.final_unit_cost_pen)
      filter (where ib.bucket_code = 'AVAILABLE' and ib.quantity > 0)
      / nullif(
        sum(ib.quantity)
          filter (where ib.bucket_code = 'AVAILABLE' and ib.quantity > 0),
        0
      ),
    4
  ) as current_unit_cost_pen
from public.product_variants pv
join public.products p on p.id = pv.product_id
join public.product_categories pc on pc.id = p.category_id
left join public.franchises f on f.id = p.franchise_id
cross join public.warehouses w
left join public.inventory_balances ib
  on ib.variant_id = pv.id
 and ib.warehouse_id = w.id
left join public.inventory_lots il on il.id = ib.lot_id
where w.is_active = true
group by
  pv.id, p.id, p.code, pv.sku, p.name, pv.variant_name,
  pc.name, f.name, w.id, w.code, w.name, w.warehouse_type,
  w.is_virtual, w.is_visible_in_operations,
  pv.minimum_stock, pv.sale_price, pv.currency_code, pv.is_active;

grant select on public.v_inventory_summary to authenticated, service_role;

commit;
