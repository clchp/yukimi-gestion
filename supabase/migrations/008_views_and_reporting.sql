-- Yukimi Gestión
-- Migración 008: vistas de consulta y reportes base

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
  pv.is_active
from public.product_variants pv
join public.products p on p.id = pv.product_id
join public.product_categories pc on pc.id = p.category_id
left join public.franchises f on f.id = p.franchise_id
cross join public.warehouses w
left join public.inventory_balances ib
  on ib.variant_id = pv.id
 and ib.warehouse_id = w.id
where w.is_active = true
group by
  pv.id, p.id, p.code, pv.sku, p.name, pv.variant_name,
  pc.name, f.name, w.id, w.code, w.name, w.warehouse_type, w.is_virtual, w.is_visible_in_operations,
  pv.minimum_stock, pv.sale_price, pv.currency_code, pv.is_active;

create or replace view public.v_inventory_pipeline
with (security_invoker = true)
as
select
  pv.id as variant_id,
  p.id as product_id,
  p.code as product_code,
  pv.sku,
  p.name as product_name,
  pv.variant_name,
  coalesce(sum(ibi.expected_quantity) filter (
    where ish.state_code not in ('STOCKED', 'CANCELLED')
  ), 0)::integer as expected_quantity,
  coalesce(sum(ibi.expected_quantity) filter (
    where ish.state_code in ('SHIPPED', 'IN_TRANSIT')
  ), 0)::integer as in_transit_quantity,
  coalesce(sum(ibi.received_quantity) filter (
    where ish.state_code not in ('CANCELLED')
  ), 0)::integer as received_quantity,
  coalesce((
    select sum(pa.quantity)
    from public.preorder_allocations pa
    join public.sale_items si on si.id = pa.sale_item_id
    where si.variant_id = pv.id
      and pa.status in ('ALLOCATED', 'RECEIVED')
  ), 0)::integer as preorder_allocated_quantity,
  greatest(
    coalesce(sum(ibi.expected_quantity) filter (
      where ish.state_code not in ('STOCKED', 'CANCELLED')
    ), 0)
    - coalesce((
      select sum(pa.quantity)
      from public.preorder_allocations pa
      join public.sale_items si on si.id = pa.sale_item_id
      where si.variant_id = pv.id
        and pa.status in ('ALLOCATED', 'RECEIVED')
    ), 0),
    0
  )::integer as preorder_unallocated_quantity
from public.product_variants pv
join public.products p on p.id = pv.product_id
left join public.import_box_items ibi on ibi.variant_id = pv.id
left join public.import_boxes ib on ib.id = ibi.import_box_id
left join public.import_shipments ish on ish.id = ib.import_shipment_id
group by pv.id, p.id, p.code, pv.sku, p.name, pv.variant_name;

create or replace view public.v_sales_overview
with (security_invoker = true)
as
select
  s.id,
  s.code,
  s.client_id,
  s.client_name_snapshot,
  s.client_phone_snapshot,
  s.sale_type_code,
  s.sales_channel_code,
  s.commercial_state_code,
  s.payment_state_code,
  s.delivery_state_code,
  s.currency_code,
  s.sold_at,
  s.reserved_at,
  s.due_at,
  s.subtotal,
  s.discount_total,
  s.penalty_total,
  s.shipping_charge_total,
  s.total_amount,
  s.paid_total,
  s.refunded_total,
  s.balance_amount,
  count(distinct si.id)::integer as item_lines,
  coalesce(sum(si.quantity), 0)::integer as total_units,
  s.created_by,
  creator.display_name as created_by_name,
  s.created_at,
  s.updated_at,
  s.version
from public.sales s
left join public.sale_items si
  on si.sale_id = s.id
 and si.item_status not in ('CANCELLED', 'RELEASED')
left join public.profiles creator on creator.id = s.created_by
group by
  s.id, creator.display_name;

create or replace view public.v_client_account_summary
with (security_invoker = true)
as
select
  c.id as client_id,
  c.code as client_code,
  c.full_name,
  c.phone,
  c.is_vip,
  count(s.id) filter (where s.commercial_state_code not in ('CANCELLED', 'ANNULLED'))::integer as sales_count,
  coalesce(sum(s.total_amount) filter (where s.commercial_state_code not in ('CANCELLED', 'ANNULLED')), 0)::numeric(14,2) as total_purchased,
  coalesce(sum(s.paid_total) filter (where s.commercial_state_code not in ('CANCELLED', 'ANNULLED')), 0)::numeric(14,2) as total_paid,
  coalesce(sum(s.balance_amount) filter (where s.commercial_state_code not in ('CANCELLED', 'ANNULLED')), 0)::numeric(14,2) as outstanding_balance,
  count(s.id) filter (where s.payment_state_code = 'OVERDUE')::integer as overdue_sales,
  max(s.sold_at) as last_purchase_at,
  c.is_active
from public.clients c
left join public.sales s on s.client_id = c.id
group by c.id;

create or replace view public.v_financial_account_balances
with (security_invoker = true)
as
select
  fa.id,
  fa.code,
  fa.name,
  fa.account_type_code,
  fa.currency_code,
  fa.institution_name,
  fa.opening_balance,
  fa.current_balance,
  fa.balance_as_of,
  fa.linked_parent_account_id,
  fa.is_active,
  coalesce(sum(fte.amount_signed) filter (
    where ft.occurred_at >= date_trunc('month', now())
      and fte.amount_signed > 0
      and ft.state_code = 'POSTED'
  ), 0)::numeric(14,2) as month_inflows,
  coalesce(abs(sum(fte.amount_signed) filter (
    where ft.occurred_at >= date_trunc('month', now())
      and fte.amount_signed < 0
      and ft.state_code = 'POSTED'
  )), 0)::numeric(14,2) as month_outflows
from public.financial_accounts fa
left join public.financial_transaction_entries fte on fte.financial_account_id = fa.id
left join public.financial_transactions ft on ft.id = fte.financial_transaction_id
group by fa.id;

create or replace view public.v_import_overview
with (security_invoker = true)
as
select
  i.id,
  i.code,
  i.state_code,
  i.transport_mode,
  i.purchase_currency_code,
  i.sunat_exchange_rate,
  i.purchase_date,
  i.estimated_arrival_date,
  i.actual_arrival_at,
  i.master_tracking_number,
  supplier.legal_name as supplier_name,
  count(distinct b.id)::integer as box_count,
  coalesce(sum(ibi.expected_quantity), 0)::integer as expected_units,
  coalesce(sum(ibi.received_quantity), 0)::integer as received_units,
  coalesce(sum(ibi.missing_quantity), 0)::integer as missing_units,
  case
    when i.estimated_arrival_date is not null
      and i.actual_arrival_at is null
      and i.estimated_arrival_date < (now() at time zone 'America/Lima')::date
    then ((now() at time zone 'America/Lima')::date - i.estimated_arrival_date)
    else 0
  end as delay_days,
  i.created_by,
  i.created_at,
  i.updated_at,
  i.version
from public.import_shipments i
left join public.business_partners supplier on supplier.id = i.supplier_partner_id
left join public.import_boxes b on b.import_shipment_id = i.id
left join public.import_box_items ibi on ibi.import_box_id = b.id
group by i.id, supplier.legal_name;

create or replace view public.v_dashboard_today
with (security_invoker = true)
as
select
  (now() at time zone 'America/Lima')::date as business_date,
  coalesce((
    select count(*)
    from public.sales s
    where (coalesce(s.sold_at, s.created_at) at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
      and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
  ), 0)::integer as sales_count,
  coalesce((
    select sum(s.total_amount)
    from public.sales s
    where (coalesce(s.sold_at, s.created_at) at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
      and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
  ), 0)::numeric(14,2) as sales_amount,
  coalesce((
    select sum(p.declared_amount)
    from public.payments p
    where (p.confirmed_at at time zone 'America/Lima')::date = (now() at time zone 'America/Lima')::date
      and p.state_code = 'CONFIRMED'
  ), 0)::numeric(14,2) as confirmed_payments_amount,
  coalesce((
    select count(*)
    from public.sales s
    where s.balance_amount > 0
      and s.due_at between now() and now() + interval '3 days'
      and s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')
  ), 0)::integer as payments_due_soon,
  coalesce((
    select count(*)
    from public.sales s
    where s.balance_amount > 0
      and s.due_at < now()
      and s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')
  ), 0)::integer as overdue_payments,
  coalesce((
    select count(*)
    from public.deliveries d
    where d.state_code in ('PENDING_INSTRUCTIONS', 'PENDING_AGENCY_DISPATCH')
  ), 0)::integer as pending_deliveries,
  coalesce((
    select count(*)
    from public.sales_receipts r
    where r.state_code = 'PENDING'
  ), 0)::integer as pending_receipts,
  coalesce((
    select count(distinct inv.variant_id)
    from public.v_inventory_summary inv
    where inv.is_visible_in_operations = true
      and inv.available_quantity <= inv.minimum_stock
      and inv.minimum_stock > 0
      and inv.is_active = true
  ), 0)::integer as low_stock_variants;

commit;
