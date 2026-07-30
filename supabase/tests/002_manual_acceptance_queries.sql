-- Consultas de aceptación manual. No modifican datos.

-- 1. Catálogos y configuraciones.
select setting_key, setting_value, category
from public.business_settings
order by category, setting_key;

-- 2. Estados configurados y transiciones permitidas.
select s.workflow_code, s.state_code, s.label, s.is_initial, s.is_terminal
from public.workflow_states s
order by s.workflow_code, s.sort_order;

select workflow_code, from_state_code, to_state_code, requires_confirmation, requires_reason
from public.workflow_transitions
where is_active = true
order by workflow_code, from_state_code, to_state_code;

-- 3. Almacenes y cuentas financieras iniciales.
select code, name, warehouse_type, is_virtual, is_visible_in_operations
from public.warehouses
order by code;

select code, name, account_type_code, currency_code, current_balance, linked_parent_account_id
from public.financial_accounts
order by code;

-- 4. Vistas base. Deben responder sin error aunque aún no existan operaciones.
select * from public.v_dashboard_today;
select * from public.v_inventory_summary limit 20;
select * from public.v_inventory_pipeline limit 20;
select * from public.v_sales_overview limit 20;
select * from public.v_import_overview limit 20;
