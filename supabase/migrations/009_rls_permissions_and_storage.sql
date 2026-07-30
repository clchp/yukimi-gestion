-- Yukimi Gestión
-- Migración 009: RLS, permisos y Storage privado

begin;

-- El esquema private no se expone por PostgREST.
revoke all on schema private from public;
grant usage on schema private to authenticated, service_role;
grant usage on schema extensions to authenticated, service_role;

-- PostgreSQL concede EXECUTE sobre funciones a PUBLIC por defecto. Se revoca de
-- forma global y se habilitan únicamente los RPC y helpers expresamente necesarios.
revoke execute on all functions in schema public from public, anon, authenticated;
revoke execute on all functions in schema private from public, anon, authenticated;
alter default privileges in schema public revoke execute on functions from public, anon, authenticated;
alter default privileges in schema private revoke execute on functions from public, anon, authenticated;

-- Helpers requeridos por las políticas RLS.
grant execute on function private.current_actor_id() to authenticated, service_role;
grant execute on function private.is_active_user() to authenticated, service_role;
grant execute on function private.has_role(text) to authenticated, service_role;
grant execute on function private.is_active_admin() to authenticated, service_role;

-- Funciones internas que no deben invocarse desde el cliente.
revoke execute on function private.bootstrap_admin_by_email(extensions.citext, text) from public, anon, authenticated;
revoke execute on function public.next_business_code(text) from public, anon, authenticated;
revoke execute on function public.refresh_sale_totals(uuid) from public, anon, authenticated;

-- RPC de operaciones atómicas permitidos para administradoras autenticadas.
revoke execute on function public.create_inventory_movement(text, text, uuid, text, jsonb, text, text, jsonb) from public, anon;
revoke execute on function public.confirm_sale(uuid, jsonb, text) from public, anon;
revoke execute on function public.confirm_payment(uuid, text) from public, anon;
revoke execute on function public.reverse_payment(uuid, text, text) from public, anon;

grant execute on function public.create_inventory_movement(text, text, uuid, text, jsonb, text, text, jsonb) to authenticated, service_role;
grant execute on function public.confirm_sale(uuid, jsonb, text) to authenticated, service_role;
grant execute on function public.confirm_payment(uuid, text) to authenticated, service_role;
grant execute on function public.reverse_payment(uuid, text, text) to authenticated, service_role;

-- Sin acceso anónimo a datos de negocio.
revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;

-- =========================================================
-- RLS en todas las tablas públicas de la aplicación
-- =========================================================

do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'currencies', 'app_roles', 'profiles', 'user_roles', 'business_settings',
    'business_counters', 'idempotency_keys', 'partner_types', 'business_partners',
    'business_partner_types', 'attachments', 'workflow_definitions', 'workflow_states',
    'workflow_transitions', 'clients', 'client_addresses', 'client_vip_profiles',
    'client_vip_history', 'client_incidents', 'product_categories', 'franchises',
    'brands', 'product_lines', 'product_attribute_definitions', 'products',
    'product_variants', 'product_variant_attribute_values', 'product_price_history',
    'warehouses', 'warehouse_managers', 'inventory_bucket_types',
    'inventory_movement_types', 'inventory_lots', 'inventory_balances',
    'inventory_movements', 'inventory_movement_lines', 'sales_channels', 'sale_types',
    'discount_types', 'payment_methods', 'sales', 'sale_items', 'sale_discounts',
    'sale_state_history', 'sale_item_allocations', 'payments', 'payment_parts',
    'penalties', 'release_requests', 'refunds', 'return_cases', 'return_items',
    'sales_receipts', 'receipt_payment_allocations', 'credit_notes', 'deliveries',
    'delivery_items', 'delivery_state_history', 'import_shipments', 'import_boxes',
    'import_box_items', 'preorder_allocations', 'import_status_history',
    'import_tracking_events', 'import_costs', 'import_incidents', 'insurance_claims',
    'financial_account_types', 'financial_accounts', 'financial_categories',
    'financial_transaction_types', 'financial_transactions',
    'financial_transaction_entries', 'loans', 'loan_installments', 'obligations',
    'cash_closures', 'bank_import_batches', 'bank_statement_rows',
    'bank_reconciliation_candidates', 'bank_reconciliations', 'notification_types',
    'notifications', 'notification_recipients', 'notification_preferences',
    'push_subscriptions', 'outbox_events', 'scheduled_reminders', 'audit_log'
  ]
  loop
    execute format('alter table public.%I enable row level security', v_table);
    execute format('alter table public.%I force row level security', v_table);
  end loop;
end;
$$;

-- Tablas operativas editables por las administradoras.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'currencies', 'app_roles', 'profiles', 'user_roles', 'business_settings',
    'partner_types', 'business_partners', 'business_partner_types', 'attachments',
    'workflow_definitions', 'workflow_states', 'workflow_transitions', 'clients',
    'client_addresses', 'client_vip_profiles', 'client_vip_history', 'client_incidents',
    'product_categories', 'franchises', 'brands', 'product_lines',
    'product_attribute_definitions', 'products', 'product_variants',
    'product_variant_attribute_values', 'product_price_history', 'warehouses',
    'warehouse_managers', 'inventory_bucket_types', 'inventory_movement_types',
    'inventory_lots', 'sales_channels', 'sale_types', 'discount_types',
    'payment_methods', 'sales', 'sale_items', 'sale_discounts',
    'payments', 'payment_parts', 'penalties', 'release_requests', 'refunds',
    'return_cases', 'return_items', 'sales_receipts', 'receipt_payment_allocations',
    'credit_notes', 'deliveries', 'delivery_items', 'import_shipments', 'import_boxes',
    'import_box_items', 'preorder_allocations', 'import_tracking_events', 'import_costs',
    'import_incidents', 'insurance_claims', 'financial_account_types',
    'financial_accounts', 'financial_categories', 'financial_transaction_types',
    'financial_transactions', 'loans', 'loan_installments', 'obligations',
    'cash_closures', 'bank_import_batches', 'bank_statement_rows',
    'bank_reconciliation_candidates', 'bank_reconciliations', 'notification_types',
    'notifications', 'scheduled_reminders'
  ]
  loop
    execute format('grant select, insert, update on public.%I to authenticated', v_table);

    execute format('drop policy if exists admin_select on public.%I', v_table);
    execute format('drop policy if exists admin_insert on public.%I', v_table);
    execute format('drop policy if exists admin_update on public.%I', v_table);

    execute format(
      'create policy admin_select on public.%I for select to authenticated using (private.is_active_admin())',
      v_table
    );
    execute format(
      'create policy admin_insert on public.%I for insert to authenticated with check (private.is_active_admin())',
      v_table
    );
    execute format(
      'create policy admin_update on public.%I for update to authenticated using (private.is_active_admin()) with check (private.is_active_admin())',
      v_table
    );
  end loop;
end;
$$;

-- Libros y registros derivados: solo lectura directa. Las escrituras pasan por RPC/triggers.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'business_counters', 'idempotency_keys', 'inventory_balances',
    'inventory_movements', 'inventory_movement_lines', 'sale_state_history',
    'sale_item_allocations', 'delivery_state_history', 'import_status_history', 'financial_transaction_entries',
    'outbox_events', 'audit_log'
  ]
  loop
    execute format('grant select on public.%I to authenticated', v_table);
    execute format('drop policy if exists admin_read_only on public.%I', v_table);
    execute format(
      'create policy admin_read_only on public.%I for select to authenticated using (private.is_active_admin())',
      v_table
    );
  end loop;
end;
$$;

-- Notificaciones personales y suscripciones push: cada usuaria administra las propias.
grant select, insert, update on public.notification_recipients to authenticated;
drop policy if exists notification_recipients_select_own on public.notification_recipients;
drop policy if exists notification_recipients_insert_own on public.notification_recipients;
drop policy if exists notification_recipients_update_own on public.notification_recipients;
create policy notification_recipients_select_own
  on public.notification_recipients for select to authenticated
  using (private.is_active_user() and user_id = private.current_actor_id());
create policy notification_recipients_insert_own
  on public.notification_recipients for insert to authenticated
  with check (private.is_active_user() and user_id = private.current_actor_id());
create policy notification_recipients_update_own
  on public.notification_recipients for update to authenticated
  using (private.is_active_user() and user_id = private.current_actor_id())
  with check (private.is_active_user() and user_id = private.current_actor_id());

grant select, insert, update on public.notification_preferences to authenticated;
drop policy if exists notification_preferences_own on public.notification_preferences;
create policy notification_preferences_own
  on public.notification_preferences for all to authenticated
  using (private.is_active_user() and user_id = private.current_actor_id())
  with check (private.is_active_user() and user_id = private.current_actor_id());

grant select, insert, update on public.push_subscriptions to authenticated;
drop policy if exists push_subscriptions_own on public.push_subscriptions;
create policy push_subscriptions_own
  on public.push_subscriptions for all to authenticated
  using (private.is_active_user() and user_id = private.current_actor_id())
  with check (private.is_active_user() and user_id = private.current_actor_id());

-- Las vistas heredan las políticas de sus tablas por security_invoker.
grant select on public.v_inventory_summary to authenticated;
grant select on public.v_inventory_pipeline to authenticated;
grant select on public.v_sales_overview to authenticated;
grant select on public.v_client_account_summary to authenticated;
grant select on public.v_financial_account_balances to authenticated;
grant select on public.v_import_overview to authenticated;
grant select on public.v_dashboard_today to authenticated;

-- =========================================================
-- Storage privado
-- =========================================================

insert into storage.buckets (id, name, public)
values
  ('product-images', 'product-images', false),
  ('payment-proofs', 'payment-proofs', false),
  ('receipt-files', 'receipt-files', false),
  ('expense-proofs', 'expense-proofs', false),
  ('import-files', 'import-files', false),
  ('delivery-files', 'delivery-files', false),
  ('report-exports', 'report-exports', false)
on conflict (id) do update set public = excluded.public;

drop policy if exists yukimi_storage_select on storage.objects;
drop policy if exists yukimi_storage_insert on storage.objects;
drop policy if exists yukimi_storage_update on storage.objects;

create policy yukimi_storage_select
on storage.objects
for select
to authenticated
using (
  bucket_id in (
    'product-images', 'payment-proofs', 'receipt-files', 'expense-proofs',
    'import-files', 'delivery-files', 'report-exports'
  )
  and private.is_active_admin()
);

create policy yukimi_storage_insert
on storage.objects
for insert
to authenticated
with check (
  bucket_id in (
    'product-images', 'payment-proofs', 'receipt-files', 'expense-proofs',
    'import-files', 'delivery-files', 'report-exports'
  )
  and private.is_active_admin()
);

create policy yukimi_storage_update
on storage.objects
for update
to authenticated
using (
  bucket_id in (
    'product-images', 'payment-proofs', 'receipt-files', 'expense-proofs',
    'import-files', 'delivery-files', 'report-exports'
  )
  and private.is_active_admin()
)
with check (
  bucket_id in (
    'product-images', 'payment-proofs', 'receipt-files', 'expense-proofs',
    'import-files', 'delivery-files', 'report-exports'
  )
  and private.is_active_admin()
);

commit;
