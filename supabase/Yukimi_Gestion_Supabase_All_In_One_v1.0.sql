

-- =========================================================
-- 000_extensions_and_schemas.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 000: extensiones y esquemas base
-- Requiere: Supabase PostgreSQL

begin;

create schema if not exists extensions;
create schema if not exists private;

create extension if not exists pgcrypto with schema extensions;
create extension if not exists citext with schema extensions;
create extension if not exists pg_trgm with schema extensions;
create extension if not exists unaccent with schema extensions;

comment on schema private is
  'Funciones internas y helpers de seguridad. No debe exponerse mediante la API.';

-- Supabase trabaja en UTC. Las fechas de negocio se almacenan como timestamptz
-- y la capa de presentación las mostrará en America/Lima.

commit;


-- =========================================================
-- 001_core_security_and_configuration.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 001: seguridad, usuarios, configuración y catálogos transversales

begin;

create table if not exists public.currencies (
  code char(3) primary key,
  name text not null,
  symbol text not null,
  decimal_places smallint not null default 2 check (decimal_places between 0 and 4),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.app_roles (
  code text primary key,
  name text not null,
  description text,
  is_system boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email_snapshot extensions.citext,
  display_name text not null default 'Usuario',
  phone text,
  avatar_path text,
  is_active boolean not null default false,
  last_login_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create unique index if not exists ux_profiles_email_snapshot
  on public.profiles(email_snapshot)
  where email_snapshot is not null;

create table if not exists public.user_roles (
  user_id uuid not null references public.profiles(id) on delete cascade,
  role_code text not null references public.app_roles(code) on delete restrict,
  granted_by uuid references public.profiles(id) on delete set null,
  granted_at timestamptz not null default now(),
  revoked_at timestamptz,
  primary key (user_id, role_code)
);

create index if not exists ix_user_roles_active
  on public.user_roles(user_id, role_code)
  where revoked_at is null;

create table if not exists public.business_settings (
  setting_key text primary key,
  setting_value jsonb not null,
  value_type text not null default 'JSON'
    check (value_type in ('JSON', 'STRING', 'NUMBER', 'BOOLEAN', 'DATE', 'TIME', 'DURATION', 'MONEY')),
  category text not null default 'GENERAL',
  description text,
  is_editable boolean not null default true,
  is_sensitive boolean not null default false,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create index if not exists ix_business_settings_category
  on public.business_settings(category, setting_key);

create table if not exists public.business_counters (
  counter_key text primary key,
  prefix text not null,
  last_value bigint not null default 0 check (last_value >= 0),
  padding smallint not null default 6 check (padding between 1 and 18),
  updated_at timestamptz not null default now()
);

create table if not exists public.idempotency_keys (
  id uuid primary key default extensions.gen_random_uuid(),
  scope text not null,
  idempotency_key text not null,
  actor_user_id uuid references public.profiles(id) on delete set null,
  request_hash text,
  status text not null default 'IN_PROGRESS'
    check (status in ('IN_PROGRESS', 'COMPLETED', 'FAILED')),
  resource_type text,
  resource_id uuid,
  response_payload jsonb,
  locked_at timestamptz not null default now(),
  completed_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now(),
  unique (scope, idempotency_key)
);

create index if not exists ix_idempotency_keys_expires_at
  on public.idempotency_keys(expires_at)
  where expires_at is not null;

create table if not exists public.partner_types (
  code text primary key,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.business_partners (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  legal_name text not null,
  trade_name text,
  document_type text,
  document_number text,
  contact_name text,
  phone text,
  email extensions.citext,
  country_code char(2),
  address text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create index if not exists ix_business_partners_name_trgm
  on public.business_partners using gin (legal_name extensions.gin_trgm_ops);

create index if not exists ix_business_partners_trade_name_trgm
  on public.business_partners using gin (trade_name extensions.gin_trgm_ops)
  where trade_name is not null;

create table if not exists public.business_partner_types (
  partner_id uuid not null references public.business_partners(id) on delete cascade,
  partner_type_code text not null references public.partner_types(code) on delete restrict,
  created_at timestamptz not null default now(),
  primary key (partner_id, partner_type_code)
);

create table if not exists public.attachments (
  id uuid primary key default extensions.gen_random_uuid(),
  entity_type text not null,
  entity_id uuid not null,
  attachment_type text not null,
  bucket_id text not null,
  object_path text not null,
  original_filename text not null,
  mime_type text not null,
  size_bytes bigint not null check (size_bytes >= 0),
  checksum_sha256 text,
  metadata jsonb not null default '{}'::jsonb,
  is_active boolean not null default true,
  uploaded_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deactivated_at timestamptz,
  deactivated_by uuid references public.profiles(id) on delete set null,
  version bigint not null default 1,
  unique (bucket_id, object_path)
);

create index if not exists ix_attachments_entity
  on public.attachments(entity_type, entity_id, attachment_type)
  where is_active = true;

create table if not exists public.workflow_definitions (
  code text primary key,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.workflow_states (
  workflow_code text not null references public.workflow_definitions(code) on delete cascade,
  state_code text not null,
  label text not null,
  description text,
  sort_order integer not null default 0,
  is_initial boolean not null default false,
  is_terminal boolean not null default false,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  primary key (workflow_code, state_code)
);

create unique index if not exists ux_workflow_single_initial_state
  on public.workflow_states(workflow_code)
  where is_initial = true and is_active = true;

create table if not exists public.workflow_transitions (
  id uuid primary key default extensions.gen_random_uuid(),
  workflow_code text not null references public.workflow_definitions(code) on delete cascade,
  from_state_code text not null,
  to_state_code text not null,
  requires_confirmation boolean not null default false,
  requires_reason boolean not null default false,
  permission_code text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  unique (workflow_code, from_state_code, to_state_code),
  foreign key (workflow_code, from_state_code)
    references public.workflow_states(workflow_code, state_code) on delete cascade,
  foreign key (workflow_code, to_state_code)
    references public.workflow_states(workflow_code, state_code) on delete cascade
);

create index if not exists ix_workflow_transitions_from
  on public.workflow_transitions(workflow_code, from_state_code)
  where is_active = true;

commit;


-- =========================================================
-- 002_clients_catalog_and_inventory.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 002: clientes, catálogo, almacenes e inventario

begin;

-- =============================
-- Clientes y condición VIP
-- =============================

create table if not exists public.clients (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  full_name text not null,
  document_type text,
  document_number text,
  phone text,
  secondary_phone text,
  email extensions.citext,
  notes text,
  is_vip boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  check (document_number is null or btrim(document_number) <> ''),
  check (phone is null or btrim(phone) <> '')
);

create unique index if not exists ux_clients_document
  on public.clients(document_type, document_number)
  where document_type is not null and document_number is not null and is_active = true;

create index if not exists ix_clients_name_trgm
  on public.clients using gin (full_name extensions.gin_trgm_ops);

create index if not exists ix_clients_phone
  on public.clients(phone)
  where phone is not null;

create index if not exists ix_clients_vip_active
  on public.clients(is_vip, is_active);

create table if not exists public.client_addresses (
  id uuid primary key default extensions.gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  label text not null default 'Principal',
  address_line text not null,
  district text,
  province text,
  department text,
  reference text,
  preferred_partner_id uuid references public.business_partners(id) on delete set null,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create unique index if not exists ux_client_single_default_address
  on public.client_addresses(client_id)
  where is_default = true and is_active = true;

create table if not exists public.client_vip_profiles (
  client_id uuid primary key references public.clients(id) on delete restrict,
  can_reserve_without_deposit boolean not null default false,
  separation_limit_amount numeric(14,2) check (separation_limit_amount is null or separation_limit_amount >= 0),
  separation_limit_currency char(3) references public.currencies(code) on delete restrict,
  payment_term_days integer check (payment_term_days is null or payment_term_days > 0),
  valid_from timestamptz not null default now(),
  valid_until timestamptz,
  granted_reason text,
  granted_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  check (valid_until is null or valid_until > valid_from)
);

create table if not exists public.client_vip_history (
  id uuid primary key default extensions.gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  action text not null check (action in ('GRANTED', 'UPDATED', 'REVOKED')),
  previous_values jsonb,
  new_values jsonb,
  reason text not null,
  performed_by uuid references public.profiles(id) on delete set null,
  occurred_at timestamptz not null default now()
);

create index if not exists ix_client_vip_history_client
  on public.client_vip_history(client_id, occurred_at desc);

create table if not exists public.client_incidents (
  id uuid primary key default extensions.gen_random_uuid(),
  client_id uuid not null references public.clients(id) on delete restrict,
  incident_type text not null
    check (incident_type in ('LATE_PAYMENT', 'PENALTY', 'RELEASE', 'NON_CONTACT', 'RETURN', 'OTHER')),
  severity text not null default 'MEDIUM'
    check (severity in ('LOW', 'MEDIUM', 'HIGH')),
  sale_id uuid,
  description text not null,
  amount numeric(14,2) check (amount is null or amount >= 0),
  currency_code char(3) references public.currencies(code) on delete restrict,
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_notes text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  version bigint not null default 1
);

create index if not exists ix_client_incidents_client
  on public.client_incidents(client_id, occurred_at desc);

-- =============================
-- Catálogo de productos
-- =============================

create table if not exists public.product_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  parent_id uuid references public.product_categories(id) on delete restrict,
  release_penalty_amount numeric(14,2) check (release_penalty_amount is null or release_penalty_amount >= 0),
  release_penalty_currency char(3) references public.currencies(code) on delete restrict,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create unique index if not exists ux_product_categories_name_active
  on public.product_categories(lower(name))
  where is_active = true;

create table if not exists public.franchises (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create index if not exists ix_franchises_name_trgm
  on public.franchises using gin (name extensions.gin_trgm_ops);

create table if not exists public.brands (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.product_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  brand_id uuid references public.brands(id) on delete restrict,
  code text not null unique,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.product_attribute_definitions (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null,
  data_type text not null default 'TEXT'
    check (data_type in ('TEXT', 'NUMBER', 'BOOLEAN', 'COLOR', 'DATE')),
  allowed_values jsonb,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.products (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null,
  franchise_id uuid references public.franchises(id) on delete restrict,
  character_name text,
  category_id uuid not null references public.product_categories(id) on delete restrict,
  brand_id uuid references public.brands(id) on delete restrict,
  product_line_id uuid references public.product_lines(id) on delete restrict,
  description text,
  has_variants boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create index if not exists ix_products_name_trgm
  on public.products using gin (name extensions.gin_trgm_ops);

create index if not exists ix_products_character_trgm
  on public.products using gin (character_name extensions.gin_trgm_ops)
  where character_name is not null;

create index if not exists ix_products_catalog_filters
  on public.products(category_id, franchise_id, brand_id, is_active);

create table if not exists public.product_variants (
  id uuid primary key default extensions.gen_random_uuid(),
  product_id uuid not null references public.products(id) on delete restrict,
  sku text not null unique,
  variant_name text not null default 'Estándar',
  barcode text,
  qr_payload text,
  sale_price numeric(14,2) not null default 0 check (sale_price >= 0),
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  minimum_stock integer not null default 0 check (minimum_stock >= 0),
  weight_grams numeric(12,3) check (weight_grams is null or weight_grams >= 0),
  dimensions jsonb,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create unique index if not exists ux_product_variants_barcode
  on public.product_variants(barcode)
  where barcode is not null;

create index if not exists ix_product_variants_product
  on public.product_variants(product_id, is_active);

create index if not exists ix_product_variants_name_trgm
  on public.product_variants using gin (variant_name extensions.gin_trgm_ops);

create table if not exists public.product_variant_attribute_values (
  variant_id uuid not null references public.product_variants(id) on delete cascade,
  attribute_id uuid not null references public.product_attribute_definitions(id) on delete restrict,
  value_text text,
  value_number numeric,
  value_boolean boolean,
  value_date date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  primary key (variant_id, attribute_id),
  check (num_nonnulls(value_text, value_number, value_boolean, value_date) = 1)
);

create table if not exists public.product_price_history (
  id uuid primary key default extensions.gen_random_uuid(),
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  previous_price numeric(14,2) check (previous_price is null or previous_price >= 0),
  new_price numeric(14,2) not null check (new_price >= 0),
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  reason text not null,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now()
);

create index if not exists ix_product_price_history_variant
  on public.product_price_history(variant_id, changed_at desc);

-- =============================
-- Almacenes e inventario
-- =============================

create table if not exists public.warehouses (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null,
  warehouse_type text not null default 'OPERATIONAL'
    check (warehouse_type in ('OPERATIONAL', 'FOREIGN', 'TRANSIT', 'OTHER')),
  description text,
  is_virtual boolean not null default false,
  is_visible_in_operations boolean not null default true,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.warehouse_managers (
  warehouse_id uuid not null references public.warehouses(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  is_primary boolean not null default false,
  assigned_at timestamptz not null default now(),
  assigned_by uuid references public.profiles(id) on delete set null,
  primary key (warehouse_id, user_id)
);

create unique index if not exists ux_warehouse_primary_manager
  on public.warehouse_managers(warehouse_id)
  where is_primary = true;

create table if not exists public.inventory_bucket_types (
  code text primary key,
  name text not null,
  description text,
  counts_as_on_hand boolean not null default false,
  counts_as_sellable boolean not null default false,
  counts_as_reserved boolean not null default false,
  is_terminal boolean not null default false,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.inventory_movement_types (
  code text primary key,
  name text not null,
  description text,
  requires_reason boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.inventory_lots (
  id uuid primary key default extensions.gen_random_uuid(),
  lot_code text not null unique,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  source_type text not null default 'MANUAL',
  source_id uuid,
  status text not null default 'ACTIVE'
    check (status in ('PLANNED', 'ACTIVE', 'EXHAUSTED', 'CANCELLED')),
  original_currency_code char(3) not null references public.currencies(code) on delete restrict,
  original_unit_cost numeric(14,4) not null default 0 check (original_unit_cost >= 0),
  exchange_rate_to_pen numeric(14,6) not null default 1 check (exchange_rate_to_pen > 0),
  final_unit_cost_pen numeric(14,4) not null default 0 check (final_unit_cost_pen >= 0),
  expected_quantity integer check (expected_quantity is null or expected_quantity >= 0),
  received_quantity integer check (received_quantity is null or received_quantity >= 0),
  acquired_at timestamptz,
  received_at timestamptz,
  expires_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  check (received_quantity is null or expected_quantity is null or received_quantity <= expected_quantity)
);

create index if not exists ix_inventory_lots_variant
  on public.inventory_lots(variant_id, status, received_at desc);

create table if not exists public.inventory_balances (
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  lot_id uuid not null references public.inventory_lots(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  bucket_code text not null references public.inventory_bucket_types(code) on delete restrict,
  quantity integer not null default 0 check (quantity >= 0),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  primary key (variant_id, lot_id, warehouse_id, bucket_code)
);

create index if not exists ix_inventory_balances_variant_warehouse
  on public.inventory_balances(variant_id, warehouse_id, bucket_code);

create index if not exists ix_inventory_balances_sellable
  on public.inventory_balances(warehouse_id, variant_id)
  where bucket_code = 'AVAILABLE' and quantity > 0;

create table if not exists public.inventory_movements (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  movement_type_code text not null references public.inventory_movement_types(code) on delete restrict,
  occurred_at timestamptz not null default now(),
  reference_type text,
  reference_id uuid,
  reason text,
  notes text,
  idempotency_key text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  reversed_movement_id uuid references public.inventory_movements(id) on delete restrict,
  is_reversed boolean not null default false,
  metadata jsonb not null default '{}'::jsonb
);

create unique index if not exists ux_inventory_movements_idempotency
  on public.inventory_movements(idempotency_key)
  where idempotency_key is not null;

create index if not exists ix_inventory_movements_reference
  on public.inventory_movements(reference_type, reference_id, occurred_at desc);

create index if not exists ix_inventory_movements_type_date
  on public.inventory_movements(movement_type_code, occurred_at desc);

create table if not exists public.inventory_movement_lines (
  id uuid primary key default extensions.gen_random_uuid(),
  movement_id uuid not null references public.inventory_movements(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  lot_id uuid not null references public.inventory_lots(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  bucket_code text not null references public.inventory_bucket_types(code) on delete restrict,
  quantity_delta integer not null check (quantity_delta <> 0),
  unit_cost_pen numeric(14,4) check (unit_cost_pen is null or unit_cost_pen >= 0),
  created_at timestamptz not null default now()
);

create index if not exists ix_inventory_movement_lines_position
  on public.inventory_movement_lines(variant_id, lot_id, warehouse_id, bucket_code);

create index if not exists ix_inventory_movement_lines_movement
  on public.inventory_movement_lines(movement_id);

commit;


-- =========================================================
-- 003_sales_payments_and_receipts.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 003: ventas, reservas, pagos, penalidades y comprobantes

begin;

create table if not exists public.sales_channels (
  code text primary key,
  name text not null,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.sale_types (
  code text primary key,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.discount_types (
  code text primary key,
  name text not null,
  calculation_mode text not null default 'AMOUNT'
    check (calculation_mode in ('AMOUNT', 'PERCENTAGE', 'MANUAL')),
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.payment_methods (
  code text primary key,
  name text not null,
  requires_proof boolean not null default false,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.sales (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  client_id uuid not null references public.clients(id) on delete restrict,
  client_name_snapshot text not null,
  client_phone_snapshot text,
  sale_type_code text not null references public.sale_types(code) on delete restrict,
  sales_channel_code text not null references public.sales_channels(code) on delete restrict,
  currency_code char(3) not null references public.currencies(code) on delete restrict,

  commercial_workflow_code text generated always as ('SALE_COMMERCIAL') stored,
  commercial_state_code text not null default 'DRAFT',
  payment_workflow_code text generated always as ('SALE_PAYMENT') stored,
  payment_state_code text not null default 'UNPAID',
  delivery_workflow_code text generated always as ('SALE_DELIVERY') stored,
  delivery_state_code text not null default 'PENDING',

  sold_at timestamptz,
  reserved_at timestamptz,
  due_at timestamptz,
  completed_at timestamptz,
  cancelled_at timestamptz,

  subtotal numeric(14,2) not null default 0 check (subtotal >= 0),
  discount_total numeric(14,2) not null default 0 check (discount_total >= 0),
  penalty_total numeric(14,2) not null default 0 check (penalty_total >= 0),
  shipping_charge_total numeric(14,2) not null default 0 check (shipping_charge_total >= 0),
  total_amount numeric(14,2) not null default 0 check (total_amount >= 0),
  paid_total numeric(14,2) not null default 0 check (paid_total >= 0),
  refunded_total numeric(14,2) not null default 0 check (refunded_total >= 0),
  balance_amount numeric(14,2) not null default 0,

  notes text,
  cancellation_reason text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,

  foreign key (commercial_workflow_code, commercial_state_code)
    references public.workflow_states(workflow_code, state_code) on delete restrict,
  foreign key (payment_workflow_code, payment_state_code)
    references public.workflow_states(workflow_code, state_code) on delete restrict,
  foreign key (delivery_workflow_code, delivery_state_code)
    references public.workflow_states(workflow_code, state_code) on delete restrict,
  check (due_at is null or reserved_at is null or due_at >= reserved_at),
  check (completed_at is null or sold_at is null or completed_at >= sold_at)
);

create index if not exists ix_sales_client_date
  on public.sales(client_id, created_at desc);

create index if not exists ix_sales_states_due
  on public.sales(commercial_state_code, payment_state_code, due_at)
  where commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED');

create index if not exists ix_sales_code_trgm
  on public.sales using gin (code extensions.gin_trgm_ops);

create table if not exists public.sale_items (
  id uuid primary key default extensions.gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  product_name_snapshot text not null,
  variant_name_snapshot text not null,
  sku_snapshot text not null,
  category_name_snapshot text not null,
  quantity integer not null check (quantity > 0),
  original_unit_price numeric(14,2) not null check (original_unit_price >= 0),
  final_unit_price numeric(14,2) not null check (final_unit_price >= 0),
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  fulfillment_type text not null default 'STOCK'
    check (fulfillment_type in ('STOCK', 'PREORDER', 'CUSTOM_ORDER')),
  item_status text not null default 'ACTIVE'
    check (item_status in ('ACTIVE', 'PARTIALLY_RELEASED', 'RELEASED', 'RETURNED', 'EXCHANGED', 'CANCELLED')),
  line_subtotal numeric(14,2) generated always as (round(quantity * original_unit_price, 2)) stored,
  line_discount_total numeric(14,2) generated always as (round(quantity * (original_unit_price - final_unit_price), 2)) stored,
  line_total numeric(14,2) generated always as (round(quantity * final_unit_price, 2)) stored,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  check (final_unit_price <= original_unit_price)
);

create index if not exists ix_sale_items_sale
  on public.sale_items(sale_id);

create index if not exists ix_sale_items_variant
  on public.sale_items(variant_id, created_at desc);

create table if not exists public.sale_discounts (
  id uuid primary key default extensions.gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  sale_item_id uuid references public.sale_items(id) on delete restrict,
  discount_type_code text not null references public.discount_types(code) on delete restrict,
  description text,
  amount numeric(14,2) check (amount is null or amount >= 0),
  percentage numeric(7,4) check (percentage is null or (percentage >= 0 and percentage <= 100)),
  calculated_amount numeric(14,2) not null check (calculated_amount >= 0),
  reason text not null,
  is_active boolean not null default true,
  approved_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  deactivated_at timestamptz,
  version bigint not null default 1,
  check (num_nonnulls(amount, percentage) >= 1)
);

create index if not exists ix_sale_discounts_sale
  on public.sale_discounts(sale_id)
  where is_active = true;

create table if not exists public.sale_state_history (
  id uuid primary key default extensions.gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  state_dimension text not null check (state_dimension in ('COMMERCIAL', 'PAYMENT', 'DELIVERY')),
  previous_state_code text,
  new_state_code text not null,
  reason text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists ix_sale_state_history_sale
  on public.sale_state_history(sale_id, changed_at desc);

create table if not exists public.sale_item_allocations (
  id uuid primary key default extensions.gen_random_uuid(),
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  lot_id uuid not null references public.inventory_lots(id) on delete restrict,
  warehouse_id uuid not null references public.warehouses(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  allocation_status text not null default 'RESERVED'
    check (allocation_status in ('RESERVED', 'ACCUMULATED', 'DELIVERED', 'RELEASED', 'RETURNED')),
  reserved_at timestamptz not null default now(),
  released_at timestamptz,
  delivered_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create index if not exists ix_sale_item_allocations_item
  on public.sale_item_allocations(sale_item_id, allocation_status);

create index if not exists ix_sale_item_allocations_stock
  on public.sale_item_allocations(lot_id, warehouse_id, allocation_status);

create table if not exists public.payments (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  sale_id uuid not null references public.sales(id) on delete restrict,
  workflow_code text generated always as ('PAYMENT') stored,
  state_code text not null default 'PENDING',
  declared_amount numeric(14,2) not null default 0 check (declared_amount >= 0),
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  received_at timestamptz not null default now(),
  confirmed_at timestamptz,
  reversed_at timestamptz,
  confirmed_by uuid references public.profiles(id) on delete set null,
  reversed_by uuid references public.profiles(id) on delete set null,
  reversal_reason text,
  notes text,
  idempotency_key text,
  financial_transaction_id uuid,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  foreign key (workflow_code, state_code)
    references public.workflow_states(workflow_code, state_code) on delete restrict
);

create unique index if not exists ux_payments_idempotency
  on public.payments(idempotency_key)
  where idempotency_key is not null;

create index if not exists ix_payments_sale_state
  on public.payments(sale_id, state_code, received_at desc);

create table if not exists public.payment_parts (
  id uuid primary key default extensions.gen_random_uuid(),
  payment_id uuid not null references public.payments(id) on delete restrict,
  payment_method_code text not null references public.payment_methods(code) on delete restrict,
  financial_account_id uuid not null,
  amount numeric(14,2) not null check (amount > 0),
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  reference_number text,
  notes text,
  created_at timestamptz not null default now()
);

create index if not exists ix_payment_parts_payment
  on public.payment_parts(payment_id);

create table if not exists public.penalties (
  id uuid primary key default extensions.gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  sale_item_id uuid references public.sale_items(id) on delete restrict,
  penalty_type text not null check (penalty_type in ('LATE_DAILY', 'RELEASE', 'OTHER')),
  quantity_basis numeric(14,4),
  unit_amount numeric(14,2),
  amount numeric(14,2) not null check (amount >= 0),
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  calculated_from timestamptz,
  calculated_to timestamptz,
  rule_snapshot jsonb not null default '{}'::jsonb,
  reason text not null,
  status text not null default 'ACTIVE'
    check (status in ('PROPOSED', 'ACTIVE', 'WAIVED', 'REVERSED')),
  approved_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create index if not exists ix_penalties_sale_status
  on public.penalties(sale_id, status);

create table if not exists public.release_requests (
  id uuid primary key default extensions.gen_random_uuid(),
  sale_id uuid not null references public.sales(id) on delete restrict,
  sale_item_id uuid references public.sale_items(id) on delete restrict,
  workflow_code text generated always as ('RELEASE_REQUEST') stored,
  state_code text not null default 'REQUESTED',
  reason text not null,
  requested_at timestamptz not null default now(),
  requested_by uuid references public.profiles(id) on delete set null,
  reviewed_at timestamptz,
  reviewed_by uuid references public.profiles(id) on delete set null,
  review_notes text,
  penalty_amount numeric(14,2) not null default 0 check (penalty_amount >= 0),
  refundable_amount numeric(14,2) not null default 0 check (refundable_amount >= 0),
  retained_amount numeric(14,2) not null default 0 check (retained_amount >= 0),
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  inventory_movement_id uuid references public.inventory_movements(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  foreign key (workflow_code, state_code)
    references public.workflow_states(workflow_code, state_code) on delete restrict
);

create index if not exists ix_release_requests_sale_state
  on public.release_requests(sale_id, state_code, requested_at desc);

create table if not exists public.refunds (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  sale_id uuid not null references public.sales(id) on delete restrict,
  payment_id uuid references public.payments(id) on delete restrict,
  release_request_id uuid references public.release_requests(id) on delete restrict,
  workflow_code text generated always as ('REFUND') stored,
  state_code text not null default 'PENDING',
  amount numeric(14,2) not null check (amount > 0),
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  financial_account_id uuid,
  financial_transaction_id uuid,
  reason text not null,
  processed_at timestamptz,
  processed_by uuid references public.profiles(id) on delete set null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  foreign key (workflow_code, state_code)
    references public.workflow_states(workflow_code, state_code) on delete restrict
);

create index if not exists ix_refunds_sale_state
  on public.refunds(sale_id, state_code);

create table if not exists public.return_cases (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  sale_id uuid not null references public.sales(id) on delete restrict,
  client_id uuid not null references public.clients(id) on delete restrict,
  workflow_code text generated always as ('RETURN_CASE') stored,
  state_code text not null default 'OPEN',
  case_type text not null check (case_type in ('RETURN', 'EXCHANGE')),
  reason text not null,
  opened_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_notes text,
  created_by uuid references public.profiles(id) on delete set null,
  resolved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  foreign key (workflow_code, state_code)
    references public.workflow_states(workflow_code, state_code) on delete restrict
);

create table if not exists public.return_items (
  id uuid primary key default extensions.gen_random_uuid(),
  return_case_id uuid not null references public.return_cases(id) on delete restrict,
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  received_condition text,
  replacement_variant_id uuid references public.product_variants(id) on delete restrict,
  inventory_movement_id uuid references public.inventory_movements(id) on delete restrict,
  notes text,
  created_at timestamptz not null default now()
);

create table if not exists public.sales_receipts (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  sale_id uuid not null references public.sales(id) on delete restrict,
  workflow_code text generated always as ('RECEIPT') stored,
  state_code text not null default 'PENDING',
  receipt_type text not null default 'BOLETA'
    check (receipt_type in ('BOLETA', 'CLIENTES_VARIOS', 'OTHER')),
  series text,
  receipt_number text,
  full_number text,
  issue_date date,
  amount numeric(14,2) not null default 0 check (amount >= 0),
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  foreign key (workflow_code, state_code)
    references public.workflow_states(workflow_code, state_code) on delete restrict
);

create unique index if not exists ux_sales_receipts_full_number
  on public.sales_receipts(full_number)
  where full_number is not null;

create index if not exists ix_sales_receipts_sale_state
  on public.sales_receipts(sale_id, state_code, issue_date desc);

create table if not exists public.receipt_payment_allocations (
  receipt_id uuid not null references public.sales_receipts(id) on delete restrict,
  payment_id uuid not null references public.payments(id) on delete restrict,
  allocated_amount numeric(14,2) not null check (allocated_amount > 0),
  created_at timestamptz not null default now(),
  primary key (receipt_id, payment_id)
);

create table if not exists public.credit_notes (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  receipt_id uuid not null references public.sales_receipts(id) on delete restrict,
  series text,
  note_number text,
  full_number text,
  issue_date date not null,
  amount numeric(14,2) not null check (amount >= 0),
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  reason text not null,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  version bigint not null default 1
);

create unique index if not exists ux_credit_notes_full_number
  on public.credit_notes(full_number)
  where full_number is not null;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_client_incidents_sale'
  ) then
    alter table public.client_incidents
      add constraint fk_client_incidents_sale
      foreign key (sale_id) references public.sales(id) on delete restrict;
  end if;
end;
$$;

commit;


-- =========================================================
-- 004_deliveries_and_imports.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 004: entregas, compras e importaciones

begin;

-- =============================
-- Entregas
-- =============================

create table if not exists public.deliveries (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  sale_id uuid not null references public.sales(id) on delete restrict,
  workflow_code text generated always as ('DELIVERY') stored,
  state_code text not null default 'PENDING_INSTRUCTIONS',
  delivery_method text not null
    check (delivery_method in ('AGENCY', 'MOTORBIKE', 'IN_PERSON', 'WAREHOUSE_ACCUMULATION', 'OTHER')),
  operator_partner_id uuid references public.business_partners(id) on delete restrict,
  destination_address_id uuid references public.client_addresses(id) on delete restrict,
  tracking_number text,
  shipping_cost numeric(14,2) not null default 0 check (shipping_cost >= 0),
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  cost_payer text not null default 'CLIENT'
    check (cost_payer in ('CLIENT', 'BUSINESS', 'SHARED', 'NOT_APPLICABLE')),
  planned_dispatch_date date,
  dispatched_at timestamptz,
  agency_received_at timestamptz,
  delivered_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  foreign key (workflow_code, state_code)
    references public.workflow_states(workflow_code, state_code) on delete restrict,
  check (delivered_at is null or dispatched_at is null or delivered_at >= dispatched_at)
);

create index if not exists ix_deliveries_sale_state
  on public.deliveries(sale_id, state_code, planned_dispatch_date);

create index if not exists ix_deliveries_tracking
  on public.deliveries(tracking_number)
  where tracking_number is not null;

create table if not exists public.delivery_items (
  id uuid primary key default extensions.gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  created_at timestamptz not null default now(),
  unique (delivery_id, sale_item_id)
);

create index if not exists ix_delivery_items_sale_item
  on public.delivery_items(sale_item_id);

create table if not exists public.delivery_state_history (
  id uuid primary key default extensions.gen_random_uuid(),
  delivery_id uuid not null references public.deliveries(id) on delete restrict,
  previous_state_code text,
  new_state_code text not null,
  reason text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists ix_delivery_state_history_delivery
  on public.delivery_state_history(delivery_id, changed_at desc);

-- =============================
-- Importaciones
-- =============================

create table if not exists public.import_shipments (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  supplier_partner_id uuid references public.business_partners(id) on delete restrict,
  workflow_code text generated always as ('IMPORT') stored,
  state_code text not null default 'QUOTATION',
  transport_mode text not null check (transport_mode in ('AIR', 'SEA', 'OTHER')),
  purchase_currency_code char(3) not null references public.currencies(code) on delete restrict,
  sunat_exchange_rate numeric(14,6) not null default 1 check (sunat_exchange_rate > 0),
  purchase_date date,
  foreign_warehouse_arrival_at timestamptz,
  dispatch_confirmation_at timestamptz,
  shipped_at timestamptz,
  estimated_arrival_date date,
  actual_arrival_at timestamptz,
  stock_entry_completed_at timestamptz,
  master_tracking_number text,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  foreign key (workflow_code, state_code)
    references public.workflow_states(workflow_code, state_code) on delete restrict
);

create index if not exists ix_import_shipments_state_eta
  on public.import_shipments(state_code, estimated_arrival_date)
  where state_code not in ('STOCKED', 'CANCELLED');

create index if not exists ix_import_shipments_tracking
  on public.import_shipments(master_tracking_number)
  where master_tracking_number is not null;

create table if not exists public.import_boxes (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  import_shipment_id uuid not null references public.import_shipments(id) on delete restrict,
  workflow_code text generated always as ('IMPORT_BOX') stored,
  state_code text not null default 'REGISTERED',
  international_operator_id uuid references public.business_partners(id) on delete restrict,
  local_operator_id uuid references public.business_partners(id) on delete restrict,
  tracking_number text,
  estimated_arrival_date date,
  actual_arrival_at timestamptz,
  weight_grams numeric(14,3) check (weight_grams is null or weight_grams >= 0),
  dimensions jsonb,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  foreign key (workflow_code, state_code)
    references public.workflow_states(workflow_code, state_code) on delete restrict
);

create index if not exists ix_import_boxes_import_state
  on public.import_boxes(import_shipment_id, state_code);

create index if not exists ix_import_boxes_tracking
  on public.import_boxes(tracking_number)
  where tracking_number is not null;

create table if not exists public.import_box_items (
  id uuid primary key default extensions.gen_random_uuid(),
  import_box_id uuid not null references public.import_boxes(id) on delete restrict,
  variant_id uuid not null references public.product_variants(id) on delete restrict,
  destination_warehouse_id uuid references public.warehouses(id) on delete restrict,
  expected_quantity integer not null check (expected_quantity > 0),
  received_quantity integer not null default 0 check (received_quantity >= 0),
  missing_quantity integer generated always as (greatest(expected_quantity - received_quantity, 0)) stored,
  original_unit_cost numeric(14,4) not null default 0 check (original_unit_cost >= 0),
  original_currency_code char(3) not null references public.currencies(code) on delete restrict,
  exchange_rate_to_pen numeric(14,6) not null default 1 check (exchange_rate_to_pen > 0),
  final_unit_cost_pen numeric(14,4) check (final_unit_cost_pen is null or final_unit_cost_pen >= 0),
  inventory_lot_id uuid references public.inventory_lots(id) on delete restrict,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  check (received_quantity <= expected_quantity)
);

create index if not exists ix_import_box_items_box
  on public.import_box_items(import_box_id);

create index if not exists ix_import_box_items_variant
  on public.import_box_items(variant_id, created_at desc);

create table if not exists public.preorder_allocations (
  id uuid primary key default extensions.gen_random_uuid(),
  sale_item_id uuid not null references public.sale_items(id) on delete restrict,
  import_box_item_id uuid not null references public.import_box_items(id) on delete restrict,
  quantity integer not null check (quantity > 0),
  status text not null default 'ALLOCATED'
    check (status in ('ALLOCATED', 'RECEIVED', 'RELEASED', 'CANCELLED')),
  allocated_at timestamptz not null default now(),
  released_at timestamptz,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  unique (sale_item_id, import_box_item_id)
);

create index if not exists ix_preorder_allocations_import_item
  on public.preorder_allocations(import_box_item_id, status);

create table if not exists public.import_status_history (
  id uuid primary key default extensions.gen_random_uuid(),
  import_shipment_id uuid references public.import_shipments(id) on delete restrict,
  import_box_id uuid references public.import_boxes(id) on delete restrict,
  previous_state_code text,
  new_state_code text not null,
  reason text,
  changed_by uuid references public.profiles(id) on delete set null,
  changed_at timestamptz not null default now(),
  metadata jsonb not null default '{}'::jsonb,
  check (num_nonnulls(import_shipment_id, import_box_id) = 1)
);

create index if not exists ix_import_status_history_shipment
  on public.import_status_history(import_shipment_id, changed_at desc)
  where import_shipment_id is not null;

create index if not exists ix_import_status_history_box
  on public.import_status_history(import_box_id, changed_at desc)
  where import_box_id is not null;

create table if not exists public.import_tracking_events (
  id uuid primary key default extensions.gen_random_uuid(),
  import_shipment_id uuid references public.import_shipments(id) on delete restrict,
  import_box_id uuid references public.import_boxes(id) on delete restrict,
  event_at timestamptz not null,
  location text,
  description text not null,
  source text,
  external_status text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  check (num_nonnulls(import_shipment_id, import_box_id) = 1)
);

create table if not exists public.import_costs (
  id uuid primary key default extensions.gen_random_uuid(),
  import_shipment_id uuid not null references public.import_shipments(id) on delete restrict,
  import_box_id uuid references public.import_boxes(id) on delete restrict,
  cost_type text not null
    check (cost_type in ('CARD', 'COMMISSION', 'FREIGHT', 'CUSTOMS', 'INSURANCE', 'LOCAL_DELIVERY', 'OTHER')),
  description text,
  amount numeric(14,2) not null check (amount >= 0),
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  exchange_rate_to_pen numeric(14,6) not null default 1 check (exchange_rate_to_pen > 0),
  amount_pen numeric(14,2) generated always as (round(amount * exchange_rate_to_pen, 2)) stored,
  allocation_method text not null default 'MANUAL'
    check (allocation_method in ('MANUAL', 'BY_QUANTITY', 'BY_PURCHASE_VALUE', 'BY_WEIGHT', 'NOT_ALLOCATED')),
  is_included_in_unit_cost boolean not null default false,
  occurred_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  version bigint not null default 1
);

create index if not exists ix_import_costs_shipment
  on public.import_costs(import_shipment_id, cost_type);

create table if not exists public.import_incidents (
  id uuid primary key default extensions.gen_random_uuid(),
  import_shipment_id uuid not null references public.import_shipments(id) on delete restrict,
  import_box_id uuid references public.import_boxes(id) on delete restrict,
  import_box_item_id uuid references public.import_box_items(id) on delete restrict,
  incident_type text not null
    check (incident_type in ('MISSING', 'DAMAGED', 'DELAY', 'WRONG_ITEM', 'OTHER')),
  affected_quantity integer check (affected_quantity is null or affected_quantity > 0),
  description text not null,
  status text not null default 'OPEN'
    check (status in ('OPEN', 'UNDER_REVIEW', 'COVERED', 'REJECTED', 'CLOSED')),
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  resolution_notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create index if not exists ix_import_incidents_shipment_status
  on public.import_incidents(import_shipment_id, status);

create table if not exists public.insurance_claims (
  id uuid primary key default extensions.gen_random_uuid(),
  import_incident_id uuid not null references public.import_incidents(id) on delete restrict,
  claim_number text,
  claimed_amount numeric(14,2) check (claimed_amount is null or claimed_amount >= 0),
  approved_amount numeric(14,2) check (approved_amount is null or approved_amount >= 0),
  currency_code char(3) references public.currencies(code) on delete restrict,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'CLOSED')),
  submitted_at timestamptz,
  resolved_at timestamptz,
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

commit;


-- =========================================================
-- 005_finance_and_banking.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 005: finanzas, cuentas, préstamos y conciliación bancaria

begin;

create table if not exists public.financial_account_types (
  code text primary key,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.financial_accounts (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null,
  account_type_code text not null references public.financial_account_types(code) on delete restrict,
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  institution_name text,
  masked_account_number text,
  linked_parent_account_id uuid references public.financial_accounts(id) on delete restrict,
  opening_balance numeric(14,2) not null default 0,
  current_balance numeric(14,2) not null default 0,
  balance_as_of timestamptz not null default now(),
  notes text,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create index if not exists ix_financial_accounts_active
  on public.financial_accounts(account_type_code, is_active);

create table if not exists public.financial_categories (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  name text not null,
  nature text not null check (nature in ('INCOME', 'EXPENSE', 'BOTH', 'TRANSFER', 'LOAN', 'ADJUSTMENT')),
  parent_id uuid references public.financial_categories(id) on delete restrict,
  description text,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.financial_transaction_types (
  code text primary key,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.financial_transactions (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  transaction_type_code text not null references public.financial_transaction_types(code) on delete restrict,
  workflow_code text generated always as ('FINANCIAL_TRANSACTION') stored,
  state_code text not null default 'POSTED',
  category_id uuid references public.financial_categories(id) on delete restrict,
  occurred_at timestamptz not null default now(),
  description text not null,
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  total_amount numeric(14,2) not null check (total_amount >= 0),
  source_type text,
  source_id uuid,
  idempotency_key text,
  is_system_generated boolean not null default false,
  reversal_of_id uuid references public.financial_transactions(id) on delete restrict,
  reason text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  approved_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  foreign key (workflow_code, state_code)
    references public.workflow_states(workflow_code, state_code) on delete restrict
);

create unique index if not exists ux_financial_transactions_idempotency
  on public.financial_transactions(idempotency_key)
  where idempotency_key is not null;

create index if not exists ix_financial_transactions_date_type
  on public.financial_transactions(occurred_at desc, transaction_type_code);

create index if not exists ix_financial_transactions_source
  on public.financial_transactions(source_type, source_id);

create table if not exists public.financial_transaction_entries (
  id uuid primary key default extensions.gen_random_uuid(),
  financial_transaction_id uuid not null references public.financial_transactions(id) on delete restrict,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  amount_signed numeric(14,2) not null check (amount_signed <> 0),
  description text,
  created_at timestamptz not null default now()
);

create index if not exists ix_financial_entries_account_date
  on public.financial_transaction_entries(financial_account_id, created_at desc);

create index if not exists ix_financial_entries_transaction
  on public.financial_transaction_entries(financial_transaction_id);

create table if not exists public.loans (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  lender_partner_id uuid references public.business_partners(id) on delete restrict,
  lender_name_snapshot text not null,
  direction text not null check (direction in ('RECEIVED', 'GRANTED')),
  principal_amount numeric(14,2) not null check (principal_amount > 0),
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  interest_rate numeric(9,6) check (interest_rate is null or interest_rate >= 0),
  installment_count integer check (installment_count is null or installment_count > 0),
  disbursed_at timestamptz,
  first_due_date date,
  status text not null default 'ACTIVE'
    check (status in ('DRAFT', 'ACTIVE', 'PAID', 'DEFAULTED', 'CANCELLED')),
  outstanding_principal numeric(14,2) not null check (outstanding_principal >= 0),
  notes text,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create index if not exists ix_loans_status_due
  on public.loans(status, first_due_date);

create table if not exists public.loan_installments (
  id uuid primary key default extensions.gen_random_uuid(),
  loan_id uuid not null references public.loans(id) on delete restrict,
  installment_number integer not null check (installment_number > 0),
  due_date date not null,
  principal_amount numeric(14,2) not null default 0 check (principal_amount >= 0),
  interest_amount numeric(14,2) not null default 0 check (interest_amount >= 0),
  fee_amount numeric(14,2) not null default 0 check (fee_amount >= 0),
  total_amount numeric(14,2) generated always as (round(principal_amount + interest_amount + fee_amount, 2)) stored,
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  paid_at timestamptz,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PARTIAL', 'PAID', 'OVERDUE', 'CANCELLED')),
  financial_transaction_id uuid references public.financial_transactions(id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  unique (loan_id, installment_number),
  check (paid_amount <= total_amount)
);

create index if not exists ix_loan_installments_due
  on public.loan_installments(status, due_date);

create table if not exists public.obligations (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  obligation_type text not null check (obligation_type in ('CREDIT_CARD', 'SUNAT', 'CUSTOMS', 'SERVICE', 'OTHER')),
  title text not null,
  description text,
  amount numeric(14,2) check (amount is null or amount >= 0),
  currency_code char(3) references public.currencies(code) on delete restrict,
  due_date date not null,
  alert_days_before integer not null default 3 check (alert_days_before >= 0),
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PAID', 'OVERDUE', 'CANCELLED')),
  paid_at timestamptz,
  financial_transaction_id uuid references public.financial_transactions(id) on delete restrict,
  recurrence_rule text,
  metadata jsonb not null default '{}'::jsonb,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create index if not exists ix_obligations_due_status
  on public.obligations(status, due_date);

create table if not exists public.cash_closures (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  closure_date date not null,
  expected_amount numeric(14,2) not null,
  counted_amount numeric(14,2) not null,
  difference_amount numeric(14,2) generated always as (round(counted_amount - expected_amount, 2)) stored,
  status text not null default 'CLOSED' check (status in ('DRAFT', 'CLOSED', 'REOPENED')),
  notes text,
  closed_by uuid references public.profiles(id) on delete set null,
  reopened_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  unique (financial_account_id, closure_date)
);

create table if not exists public.bank_import_batches (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  original_filename text not null,
  file_checksum_sha256 text not null,
  imported_from date,
  imported_to date,
  total_rows integer not null default 0 check (total_rows >= 0),
  valid_rows integer not null default 0 check (valid_rows >= 0),
  invalid_rows integer not null default 0 check (invalid_rows >= 0),
  status text not null default 'IMPORTED'
    check (status in ('PROCESSING', 'IMPORTED', 'PARTIAL', 'FAILED', 'CANCELLED')),
  error_summary jsonb,
  imported_by uuid references public.profiles(id) on delete set null,
  imported_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  unique (financial_account_id, file_checksum_sha256)
);

create index if not exists ix_bank_import_batches_account_date
  on public.bank_import_batches(financial_account_id, imported_at desc);

create table if not exists public.bank_statement_rows (
  id uuid primary key default extensions.gen_random_uuid(),
  batch_id uuid not null references public.bank_import_batches(id) on delete restrict,
  financial_account_id uuid not null references public.financial_accounts(id) on delete restrict,
  row_number integer not null check (row_number > 0),
  transaction_date date not null,
  posted_at timestamptz,
  description text not null,
  reference text,
  amount_signed numeric(14,2) not null check (amount_signed <> 0),
  currency_code char(3) not null references public.currencies(code) on delete restrict,
  balance_after numeric(14,2),
  fingerprint text not null,
  raw_payload jsonb not null default '{}'::jsonb,
  reconciliation_status text not null default 'UNMATCHED'
    check (reconciliation_status in ('UNMATCHED', 'SUGGESTED', 'RECONCILED', 'IGNORED')),
  created_at timestamptz not null default now(),
  unique (financial_account_id, fingerprint)
);

create index if not exists ix_bank_statement_rows_match
  on public.bank_statement_rows(financial_account_id, transaction_date, amount_signed, reconciliation_status);

create table if not exists public.bank_reconciliation_candidates (
  id uuid primary key default extensions.gen_random_uuid(),
  bank_statement_row_id uuid not null references public.bank_statement_rows(id) on delete restrict,
  candidate_type text not null check (candidate_type in ('PAYMENT', 'FINANCIAL_TRANSACTION')),
  candidate_id uuid not null,
  confidence_score numeric(6,5) not null check (confidence_score between 0 and 1),
  reason jsonb not null default '{}'::jsonb,
  generated_at timestamptz not null default now(),
  dismissed_at timestamptz,
  dismissed_by uuid references public.profiles(id) on delete set null,
  unique (bank_statement_row_id, candidate_type, candidate_id)
);

create index if not exists ix_bank_reconciliation_candidates_row_score
  on public.bank_reconciliation_candidates(bank_statement_row_id, confidence_score desc)
  where dismissed_at is null;

create table if not exists public.bank_reconciliations (
  id uuid primary key default extensions.gen_random_uuid(),
  bank_statement_row_id uuid not null references public.bank_statement_rows(id) on delete restrict,
  matched_type text not null check (matched_type in ('PAYMENT', 'FINANCIAL_TRANSACTION')),
  matched_id uuid not null,
  matched_amount numeric(14,2) not null check (matched_amount > 0),
  status text not null default 'ACTIVE' check (status in ('ACTIVE', 'REVERSED')),
  notes text,
  reconciled_by uuid references public.profiles(id) on delete set null,
  reconciled_at timestamptz not null default now(),
  reversed_by uuid references public.profiles(id) on delete set null,
  reversed_at timestamptz,
  reversal_reason text,
  created_at timestamptz not null default now(),
  version bigint not null default 1
);

create unique index if not exists ux_bank_reconciliation_single_active
  on public.bank_reconciliations(bank_statement_row_id)
  where status = 'ACTIVE';

create index if not exists ix_bank_reconciliations_match
  on public.bank_reconciliations(matched_type, matched_id)
  where status = 'ACTIVE';

-- Relaciones diferidas con tablas creadas en la migración de ventas.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'fk_payment_parts_financial_account'
  ) then
    alter table public.payment_parts
      add constraint fk_payment_parts_financial_account
      foreign key (financial_account_id) references public.financial_accounts(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fk_payments_financial_transaction'
  ) then
    alter table public.payments
      add constraint fk_payments_financial_transaction
      foreign key (financial_transaction_id) references public.financial_transactions(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fk_refunds_financial_account'
  ) then
    alter table public.refunds
      add constraint fk_refunds_financial_account
      foreign key (financial_account_id) references public.financial_accounts(id) on delete restrict;
  end if;

  if not exists (
    select 1 from pg_constraint where conname = 'fk_refunds_financial_transaction'
  ) then
    alter table public.refunds
      add constraint fk_refunds_financial_transaction
      foreign key (financial_transaction_id) references public.financial_transactions(id) on delete restrict;
  end if;
end;
$$;

commit;


-- =========================================================
-- 006_notifications_outbox_and_audit.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 006: notificaciones, outbox y auditoría

begin;

create table if not exists public.notification_types (
  code text primary key,
  name text not null,
  default_priority text not null default 'NORMAL'
    check (default_priority in ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
  default_channels text[] not null default array['IN_APP']::text[],
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create table if not exists public.notifications (
  id uuid primary key default extensions.gen_random_uuid(),
  notification_type_code text not null references public.notification_types(code) on delete restrict,
  title text not null,
  body text not null,
  priority text not null default 'NORMAL'
    check (priority in ('LOW', 'NORMAL', 'HIGH', 'CRITICAL')),
  related_entity_type text,
  related_entity_id uuid,
  action_url text,
  scheduled_for timestamptz,
  expires_at timestamptz,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  created_by uuid references public.profiles(id) on delete set null,
  check (expires_at is null or expires_at > created_at)
);

create index if not exists ix_notifications_related
  on public.notifications(related_entity_type, related_entity_id, created_at desc);

create index if not exists ix_notifications_schedule
  on public.notifications(scheduled_for)
  where scheduled_for is not null;

create table if not exists public.notification_recipients (
  notification_id uuid not null references public.notifications(id) on delete restrict,
  user_id uuid not null references public.profiles(id) on delete restrict,
  status text not null default 'NEW'
    check (status in ('NEW', 'READ', 'RESOLVED', 'DISMISSED')),
  read_at timestamptz,
  resolved_at timestamptz,
  dismissed_at timestamptz,
  delivery_status jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  primary key (notification_id, user_id)
);

create index if not exists ix_notification_recipients_user_status
  on public.notification_recipients(user_id, status, created_at desc);

create table if not exists public.notification_preferences (
  user_id uuid not null references public.profiles(id) on delete cascade,
  notification_type_code text not null references public.notification_types(code) on delete cascade,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default true,
  email_enabled boolean not null default false,
  quiet_hours_start time,
  quiet_hours_end time,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  primary key (user_id, notification_type_code)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default extensions.gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  endpoint text not null,
  p256dh_key text not null,
  auth_key text not null,
  user_agent text,
  device_name text,
  is_active boolean not null default true,
  last_used_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  unique (user_id, endpoint)
);

create table if not exists public.outbox_events (
  id uuid primary key default extensions.gen_random_uuid(),
  event_type text not null,
  aggregate_type text not null,
  aggregate_id uuid not null,
  payload jsonb not null default '{}'::jsonb,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'PROCESSING', 'PROCESSED', 'FAILED', 'DEAD_LETTER')),
  attempts integer not null default 0 check (attempts >= 0),
  available_at timestamptz not null default now(),
  locked_at timestamptz,
  locked_by text,
  processed_at timestamptz,
  last_error text,
  deduplication_key text,
  created_at timestamptz not null default now()
);

create unique index if not exists ux_outbox_events_deduplication
  on public.outbox_events(deduplication_key)
  where deduplication_key is not null;

create index if not exists ix_outbox_events_pending
  on public.outbox_events(status, available_at, created_at)
  where status in ('PENDING', 'FAILED');

create table if not exists public.scheduled_reminders (
  id uuid primary key default extensions.gen_random_uuid(),
  reminder_type text not null,
  related_entity_type text not null,
  related_entity_id uuid not null,
  scheduled_for timestamptz not null,
  status text not null default 'PENDING'
    check (status in ('PENDING', 'QUEUED', 'SENT', 'CANCELLED', 'FAILED')),
  payload jsonb not null default '{}'::jsonb,
  attempts integer not null default 0 check (attempts >= 0),
  last_error text,
  created_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1,
  unique (reminder_type, related_entity_type, related_entity_id, scheduled_for)
);

create index if not exists ix_scheduled_reminders_due
  on public.scheduled_reminders(status, scheduled_for)
  where status = 'PENDING';

create table if not exists public.audit_log (
  id bigint generated always as identity primary key,
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references public.profiles(id) on delete set null,
  actor_role text,
  request_id text,
  session_id text,
  client_ip inet,
  user_agent text,
  schema_name text not null,
  table_name text not null,
  entity_id text,
  action text not null check (action in ('INSERT', 'UPDATE', 'DELETE', 'STATE_CHANGE', 'CONFIRM', 'REVERSE', 'LOGIN', 'LOGOUT', 'OTHER')),
  old_values jsonb,
  new_values jsonb,
  reason text,
  metadata jsonb not null default '{}'::jsonb
);

create index if not exists ix_audit_log_table_entity
  on public.audit_log(table_name, entity_id, occurred_at desc);

create index if not exists ix_audit_log_actor_date
  on public.audit_log(actor_user_id, occurred_at desc);

create index if not exists ix_audit_log_date
  on public.audit_log(occurred_at desc);

commit;


-- =========================================================
-- 007_functions_triggers_and_atomic_operations.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 007: funciones, triggers y operaciones atómicas

begin;

-- =========================================================
-- Identidad, autorización y utilidades transversales
-- =========================================================

create or replace function private.current_actor_id()
returns uuid
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_user_id text;
begin
  v_user_id := nullif(current_setting('app.user_id', true), '');
  if v_user_id is not null then
    return v_user_id::uuid;
  end if;
  return auth.uid();
exception
  when invalid_text_representation then
    return auth.uid();
end;
$$;

create or replace function private.is_active_user()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.profiles p
    where p.id = private.current_actor_id()
      and p.is_active = true
  );
$$;

create or replace function private.has_role(p_role_code text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1
    from public.user_roles ur
    join public.profiles p on p.id = ur.user_id
    join public.app_roles r on r.code = ur.role_code
    where ur.user_id = private.current_actor_id()
      and ur.role_code = p_role_code
      and ur.revoked_at is null
      and p.is_active = true
      and r.is_active = true
  );
$$;

create or replace function private.is_active_admin()
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select private.has_role('ADMIN');
$$;

create or replace function private.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.profiles (
    id,
    email_snapshot,
    display_name,
    is_active
  )
  values (
    new.id,
    new.email,
    coalesce(new.raw_user_meta_data ->> 'display_name', new.raw_user_meta_data ->> 'name', split_part(coalesce(new.email, 'Usuario'), '@', 1)),
    false
  )
  on conflict (id) do update
    set email_snapshot = excluded.email_snapshot,
        display_name = coalesce(nullif(public.profiles.display_name, ''), excluded.display_name),
        updated_at = now();

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_yukimi on auth.users;
create trigger on_auth_user_created_yukimi
after insert on auth.users
for each row execute function private.handle_new_auth_user();

create or replace function private.bootstrap_admin_by_email(
  p_email extensions.citext,
  p_display_name text default null
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid;
begin
  select u.id
  into v_user_id
  from auth.users u
  where lower(u.email) = lower(p_email::text)
  limit 1;

  if v_user_id is null then
    raise exception 'No existe un usuario de Auth con el correo %', p_email;
  end if;

  insert into public.profiles(id, email_snapshot, display_name, is_active)
  select u.id,
         u.email,
         coalesce(nullif(p_display_name, ''), u.raw_user_meta_data ->> 'display_name', split_part(u.email, '@', 1)),
         true
  from auth.users u
  where u.id = v_user_id
  on conflict (id) do update
    set email_snapshot = excluded.email_snapshot,
        display_name = excluded.display_name,
        is_active = true,
        updated_at = now();

  insert into public.user_roles(user_id, role_code, granted_by)
  values (v_user_id, 'ADMIN', v_user_id)
  on conflict (user_id, role_code) do update
    set revoked_at = null,
        granted_at = now(),
        granted_by = excluded.granted_by;

  return v_user_id;
end;
$$;

create or replace function public.next_business_code(p_counter_key text)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_prefix text;
  v_value bigint;
  v_padding smallint;
begin
  update public.business_counters
  set last_value = last_value + 1,
      updated_at = now()
  where counter_key = p_counter_key
  returning prefix, last_value, padding
  into v_prefix, v_value, v_padding;

  if not found then
    raise exception 'No existe el contador de negocio: %', p_counter_key;
  end if;

  return v_prefix || lpad(v_value::text, v_padding, '0');
end;
$$;

create or replace function private.assign_business_code()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_counter_key text := tg_argv[0];
  v_column_name text := tg_argv[1];
  v_current_value text;
  v_new_code text;
begin
  v_current_value := to_jsonb(new) ->> v_column_name;

  if v_current_value is null or btrim(v_current_value) = '' then
    v_new_code := public.next_business_code(v_counter_key);
    new := jsonb_populate_record(new, jsonb_build_object(v_column_name, v_new_code));
  end if;

  return new;
end;
$$;

create or replace function private.touch_updated_at_and_version()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at := now();
  new.version := old.version + 1;
  return new;
end;
$$;

create or replace function private.prevent_hard_delete()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if current_user in ('postgres', 'supabase_admin')
     or coalesce(current_setting('app.allow_hard_delete', true), 'false') = 'true' then
    return old;
  end if;

  raise exception 'El borrado físico no está permitido para %.%. Use anulación, reversión o desactivación.', tg_table_schema, tg_table_name
    using errcode = 'P0001';
end;
$$;

-- =========================================================
-- Auditoría
-- =========================================================

create or replace function private.audit_row_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_old jsonb;
  v_new jsonb;
  v_entity_id text;
  v_reason text;
  v_request_id text;
  v_session_id text;
  v_actor_role text;
  v_ip inet;
  v_user_agent text;
begin
  if tg_op = 'INSERT' then
    v_new := to_jsonb(new);
    v_entity_id := coalesce(v_new ->> 'id', v_new ->> 'code');
  elsif tg_op = 'UPDATE' then
    v_old := to_jsonb(old);
    v_new := to_jsonb(new);
    v_entity_id := coalesce(v_new ->> 'id', v_new ->> 'code');
  else
    v_old := to_jsonb(old);
    v_entity_id := coalesce(v_old ->> 'id', v_old ->> 'code');
  end if;

  -- Evita guardar secretos o claves de suscripción en el log.
  v_old := v_old - array['auth_key', 'p256dh_key', 'request_hash'];
  v_new := v_new - array['auth_key', 'p256dh_key', 'request_hash'];

  v_reason := nullif(current_setting('app.audit_reason', true), '');
  v_request_id := nullif(current_setting('app.request_id', true), '');
  v_session_id := nullif(current_setting('app.session_id', true), '');
  v_actor_role := nullif(current_setting('request.jwt.claim.role', true), '');
  v_user_agent := nullif(current_setting('app.user_agent', true), '');

  begin
    v_ip := nullif(current_setting('app.client_ip', true), '')::inet;
  exception when others then
    v_ip := null;
  end;

  insert into public.audit_log (
    actor_user_id,
    actor_role,
    request_id,
    session_id,
    client_ip,
    user_agent,
    schema_name,
    table_name,
    entity_id,
    action,
    old_values,
    new_values,
    reason
  ) values (
    private.current_actor_id(),
    v_actor_role,
    v_request_id,
    v_session_id,
    v_ip,
    v_user_agent,
    tg_table_schema,
    tg_table_name,
    v_entity_id,
    tg_op,
    v_old,
    v_new,
    v_reason
  );

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- =========================================================
-- Validación de transiciones de estado configurables
-- =========================================================

create or replace function private.validate_workflow_transition()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_workflow_code text := tg_argv[0];
  v_state_column text := tg_argv[1];
  v_old_state text;
  v_new_state text;
  v_requires_reason boolean;
begin
  v_old_state := to_jsonb(old) ->> v_state_column;
  v_new_state := to_jsonb(new) ->> v_state_column;

  if v_old_state is not distinct from v_new_state then
    return new;
  end if;

  select wt.requires_reason
  into v_requires_reason
  from public.workflow_transitions wt
  where wt.workflow_code = v_workflow_code
    and wt.from_state_code = v_old_state
    and wt.to_state_code = v_new_state
    and wt.is_active = true;

  if not found then
    raise exception 'Transición no permitida en %: % -> %', v_workflow_code, v_old_state, v_new_state;
  end if;

  if v_requires_reason and nullif(current_setting('app.audit_reason', true), '') is null then
    raise exception 'La transición % -> % requiere un motivo.', v_old_state, v_new_state;
  end if;

  return new;
end;
$$;

-- =========================================================
-- Inventario: ledger, saldos y concurrencia
-- =========================================================

create or replace function private.validate_inventory_movement_reason()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_requires_reason boolean;
begin
  select requires_reason
  into v_requires_reason
  from public.inventory_movement_types
  where code = new.movement_type_code;

  if coalesce(v_requires_reason, false) and nullif(btrim(new.reason), '') is null then
    raise exception 'El movimiento de inventario % requiere un motivo.', new.movement_type_code;
  end if;

  return new;
end;
$$;

create or replace function private.apply_inventory_movement_line()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lot_variant uuid;
  v_total_available integer;
  v_minimum_stock integer;
  v_dedup_key text;
begin
  select variant_id into v_lot_variant
  from public.inventory_lots
  where id = new.lot_id;

  if v_lot_variant is distinct from new.variant_id then
    raise exception 'El lote % no pertenece a la variante %.', new.lot_id, new.variant_id;
  end if;

  if new.quantity_delta < 0 then
    update public.inventory_balances
    set quantity = quantity + new.quantity_delta,
        updated_at = now(),
        version = version + 1
    where variant_id = new.variant_id
      and lot_id = new.lot_id
      and warehouse_id = new.warehouse_id
      and bucket_code = new.bucket_code
      and quantity + new.quantity_delta >= 0;

    if not found then
      raise exception 'Stock insuficiente para variante %, lote %, almacén %, estado %.',
        new.variant_id, new.lot_id, new.warehouse_id, new.bucket_code
        using errcode = 'P0001';
    end if;
  else
    insert into public.inventory_balances (
      variant_id, lot_id, warehouse_id, bucket_code, quantity
    ) values (
      new.variant_id, new.lot_id, new.warehouse_id, new.bucket_code, new.quantity_delta
    )
    on conflict (variant_id, lot_id, warehouse_id, bucket_code)
    do update set
      quantity = public.inventory_balances.quantity + excluded.quantity,
      updated_at = now(),
      version = public.inventory_balances.version + 1;
  end if;

  if new.bucket_code = 'AVAILABLE' then
    select coalesce(sum(ib.quantity), 0), pv.minimum_stock
    into v_total_available, v_minimum_stock
    from public.product_variants pv
    left join public.inventory_balances ib
      on ib.variant_id = pv.id
     and ib.bucket_code = 'AVAILABLE'
    where pv.id = new.variant_id
    group by pv.minimum_stock;

    if v_minimum_stock > 0 and v_total_available <= v_minimum_stock then
      v_dedup_key := 'stock-low:' || new.variant_id::text || ':' ||
        to_char(now() at time zone 'America/Lima', 'YYYYMMDD');

      insert into public.outbox_events (
        event_type,
        aggregate_type,
        aggregate_id,
        payload,
        deduplication_key
      ) values (
        'STOCK_LOW',
        'PRODUCT_VARIANT',
        new.variant_id,
        jsonb_build_object(
          'variant_id', new.variant_id,
          'available_quantity', v_total_available,
          'minimum_stock', v_minimum_stock
        ),
        v_dedup_key
      )
      on conflict (deduplication_key) where deduplication_key is not null do nothing;
    end if;
  end if;

  return new;
end;
$$;

create or replace function private.prevent_inventory_line_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Las líneas del libro de inventario son inmutables. Registre un movimiento compensatorio.';
end;
$$;

create or replace function public.create_inventory_movement(
  p_movement_type_code text,
  p_reference_type text,
  p_reference_id uuid,
  p_reason text,
  p_lines jsonb,
  p_idempotency_key text default null,
  p_notes text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_movement_id uuid;
  v_line record;
  v_requires_reason boolean;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if p_idempotency_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('INVENTORY_MOVEMENT:' || p_idempotency_key, 0)
    );

    select id into v_movement_id
    from public.inventory_movements
    where idempotency_key = p_idempotency_key;

    if v_movement_id is not null then
      return v_movement_id;
    end if;
  end if;

  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'Debe proporcionar al menos una línea de movimiento.';
  end if;

  select requires_reason
  into v_requires_reason
  from public.inventory_movement_types
  where code = p_movement_type_code and is_active = true;

  if not found then
    raise exception 'Tipo de movimiento inválido: %', p_movement_type_code;
  end if;

  if v_requires_reason and nullif(btrim(p_reason), '') is null then
    raise exception 'El movimiento requiere un motivo.';
  end if;

  insert into public.inventory_movements (
    code,
    movement_type_code,
    reference_type,
    reference_id,
    reason,
    notes,
    idempotency_key,
    created_by,
    metadata
  ) values (
    public.next_business_code('INVENTORY_MOVEMENT'),
    p_movement_type_code,
    p_reference_type,
    p_reference_id,
    p_reason,
    p_notes,
    p_idempotency_key,
    private.current_actor_id(),
    coalesce(p_metadata, '{}'::jsonb)
  ) returning id into v_movement_id;

  for v_line in
    select *
    from jsonb_to_recordset(p_lines) as x(
      variant_id uuid,
      lot_id uuid,
      warehouse_id uuid,
      bucket_code text,
      quantity_delta integer,
      unit_cost_pen numeric
    )
  loop
    if v_line.quantity_delta is null or v_line.quantity_delta = 0 then
      raise exception 'Cada línea debe tener quantity_delta distinto de cero.';
    end if;

    insert into public.inventory_movement_lines (
      movement_id,
      variant_id,
      lot_id,
      warehouse_id,
      bucket_code,
      quantity_delta,
      unit_cost_pen
    ) values (
      v_movement_id,
      v_line.variant_id,
      v_line.lot_id,
      v_line.warehouse_id,
      v_line.bucket_code,
      v_line.quantity_delta,
      v_line.unit_cost_pen
    );
  end loop;

  return v_movement_id;
end;
$$;

-- =========================================================
-- Pagos, ventas y finanzas
-- =========================================================

create or replace function private.populate_sale_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_client public.clients%rowtype;
begin
  if tg_op = 'INSERT' then
    select * into v_client
    from public.clients
    where id = new.client_id and is_active = true;
  elsif new.client_id is distinct from old.client_id then
    select * into v_client
    from public.clients
    where id = new.client_id and is_active = true;
  else
    return new;
  end if;

  if not found then
    raise exception 'El cliente no existe o está inactivo.';
  end if;

  new.client_name_snapshot := v_client.full_name;
  new.client_phone_snapshot := v_client.phone;
  return new;
end;
$$;

create or replace function private.populate_sale_item_snapshot()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_variant public.product_variants%rowtype;
  v_product public.products%rowtype;
  v_category_name text;
  v_sale_currency char(3);
begin
  select * into v_variant
  from public.product_variants
  where id = new.variant_id
    and is_active = true;

  if not found then
    raise exception 'La variante no existe o está inactiva.';
  end if;

  select * into v_product
  from public.products
  where id = v_variant.product_id
    and is_active = true;

  if not found then
    raise exception 'El producto no existe o está inactivo.';
  end if;

  select name into v_category_name
  from public.product_categories
  where id = v_product.category_id;

  select currency_code into v_sale_currency
  from public.sales
  where id = new.sale_id;

  if v_sale_currency is null then
    raise exception 'La venta indicada no existe.';
  end if;

  new.product_name_snapshot := v_product.name;
  new.variant_name_snapshot := v_variant.variant_name;
  new.sku_snapshot := v_variant.sku;
  new.category_name_snapshot := v_category_name;
  new.currency_code := v_sale_currency;
  new.original_unit_price := coalesce(new.original_unit_price, v_variant.sale_price);
  new.final_unit_price := coalesce(new.final_unit_price, new.original_unit_price, v_variant.sale_price);

  return new;
end;
$$;

create or replace function private.protect_sale_derived_fields()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_sale_total_update', true), 'false') <> 'true'
     and (
       new.subtotal is distinct from old.subtotal
       or new.discount_total is distinct from old.discount_total
       or new.penalty_total is distinct from old.penalty_total
       or new.shipping_charge_total is distinct from old.shipping_charge_total
       or new.total_amount is distinct from old.total_amount
       or new.paid_total is distinct from old.paid_total
       or new.refunded_total is distinct from old.refunded_total
       or new.balance_amount is distinct from old.balance_amount
     ) then
    raise exception 'Los totales de la venta son derivados y no pueden editarse directamente.';
  end if;
  return new;
end;
$$;

create or replace function private.protect_payment_declared_amount()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_payment_amount_update', true), 'false') <> 'true'
     and new.declared_amount is distinct from old.declared_amount then
    raise exception 'El importe del pago se calcula desde sus medios y no puede editarse directamente.';
  end if;
  return new;
end;
$$;

create or replace function private.protect_account_balance()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if coalesce(current_setting('app.allow_account_balance_update', true), 'false') <> 'true'
     and (
       new.current_balance is distinct from old.current_balance
       or new.balance_as_of is distinct from old.balance_as_of
     ) then
    raise exception 'El saldo de la cuenta es derivado y no puede editarse directamente.';
  end if;
  return new;
end;
$$;

create or replace function private.ensure_payment_part_mutable()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_state text;
  v_payment_id uuid;
begin
  if tg_op = 'DELETE' then
    v_payment_id := old.payment_id;
  else
    v_payment_id := new.payment_id;
  end if;

  select state_code into v_state
  from public.payments
  where id = v_payment_id
  for update;

  if v_state <> 'PENDING' then
    raise exception 'No se pueden modificar los medios de un pago que ya no está pendiente.';
  end if;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.validate_payment_part_account_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_account_currency char(3);
  v_payment_currency char(3);
begin
  select currency_code into v_account_currency
  from public.financial_accounts
  where id = new.financial_account_id
    and is_active = true;

  if v_account_currency is null then
    raise exception 'La cuenta financiera indicada no existe o está inactiva.';
  end if;

  select currency_code into v_payment_currency
  from public.payments
  where id = new.payment_id;

  if v_payment_currency is null then
    raise exception 'El pago indicado no existe.';
  end if;

  if new.currency_code <> v_payment_currency then
    raise exception 'La moneda del medio de pago debe coincidir con la moneda del pago.';
  end if;

  if new.currency_code <> v_account_currency then
    raise exception 'La moneda del medio de pago debe coincidir con la moneda de la cuenta financiera.';
  end if;

  return new;
end;
$$;

create or replace function private.validate_sale_item_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_currency char(3);
begin
  select currency_code into v_sale_currency
  from public.sales
  where id = new.sale_id;

  if v_sale_currency is null then
    raise exception 'La venta indicada no existe.';
  end if;

  if new.currency_code <> v_sale_currency then
    raise exception 'La moneda del producto debe coincidir con la moneda de la venta.';
  end if;

  return new;
end;
$$;

create or replace function private.refresh_payment_declared_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
begin
  if tg_op = 'DELETE' then
    v_payment_id := old.payment_id;
  else
    v_payment_id := new.payment_id;
  end if;

  update public.payments p
  set declared_amount = coalesce((
        select round(sum(pp.amount), 2)
        from public.payment_parts pp
        where pp.payment_id = v_payment_id
      ), 0),
      updated_at = now(),
      version = version + 1
  where p.id = v_payment_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function public.refresh_sale_totals(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_subtotal numeric(14,2);
  v_line_discount numeric(14,2);
  v_extra_discount numeric(14,2);
  v_penalties numeric(14,2);
  v_shipping numeric(14,2);
  v_paid numeric(14,2);
  v_refunded numeric(14,2);
  v_total numeric(14,2);
  v_balance numeric(14,2);
  v_payment_state text;
  v_due_at timestamptz;
begin
  perform 1 from public.sales where id = p_sale_id for update;
  if not found then
    return;
  end if;

  select
    coalesce(round(sum(si.line_subtotal), 2), 0),
    coalesce(round(sum(si.line_discount_total), 2), 0)
  into v_subtotal, v_line_discount
  from public.sale_items si
  where si.sale_id = p_sale_id
    and si.item_status not in ('CANCELLED', 'RELEASED');

  select coalesce(round(sum(sd.calculated_amount), 2), 0)
  into v_extra_discount
  from public.sale_discounts sd
  where sd.sale_id = p_sale_id
    and sd.sale_item_id is null
    and sd.is_active = true;

  select coalesce(round(sum(p.amount), 2), 0)
  into v_penalties
  from public.penalties p
  where p.sale_id = p_sale_id
    and p.status = 'ACTIVE';

  select coalesce(round(sum(d.shipping_cost), 2), 0)
  into v_shipping
  from public.deliveries d
  where d.sale_id = p_sale_id
    and d.cost_payer = 'CLIENT'
    and d.state_code <> 'CANCELLED';

  select coalesce(round(sum(p.declared_amount), 2), 0)
  into v_paid
  from public.payments p
  where p.sale_id = p_sale_id
    and p.state_code = 'CONFIRMED';

  select coalesce(round(sum(r.amount), 2), 0)
  into v_refunded
  from public.refunds r
  where r.sale_id = p_sale_id
    and r.state_code = 'PROCESSED';

  v_total := greatest(round(v_subtotal - v_line_discount - v_extra_discount + v_penalties + v_shipping, 2), 0);
  v_balance := round(v_total - v_paid + v_refunded, 2);

  select due_at into v_due_at from public.sales where id = p_sale_id;

  if v_paid <= 0 then
    v_payment_state := case when v_due_at is not null and v_due_at < now() and v_total > 0 then 'OVERDUE' else 'UNPAID' end;
  elsif v_paid < v_total then
    v_payment_state := case when v_due_at is not null and v_due_at < now() then 'OVERDUE' else 'PARTIAL' end;
  else
    v_payment_state := 'PAID';
  end if;

  perform set_config('app.allow_sale_total_update', 'true', true);

  update public.sales
  set subtotal = v_subtotal,
      discount_total = v_line_discount + v_extra_discount,
      penalty_total = v_penalties,
      shipping_charge_total = v_shipping,
      total_amount = v_total,
      paid_total = v_paid,
      refunded_total = v_refunded,
      balance_amount = v_balance,
      payment_state_code = v_payment_state,
      updated_at = now(),
      version = version + 1
  where id = p_sale_id;
end;
$$;

create or replace function private.refresh_sale_totals_from_child()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale_id uuid;
begin
  if tg_op = 'DELETE' then
    v_sale_id := old.sale_id;
  else
    v_sale_id := new.sale_id;
  end if;

  perform public.refresh_sale_totals(v_sale_id);
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.validate_financial_entry_currency()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_transaction_currency char(3);
  v_account_currency char(3);
begin
  select currency_code into v_transaction_currency
  from public.financial_transactions
  where id = new.financial_transaction_id;

  select currency_code into v_account_currency
  from public.financial_accounts
  where id = new.financial_account_id
    and is_active = true;

  if v_transaction_currency is null or v_account_currency is null then
    raise exception 'La transacción o la cuenta financiera no existe o está inactiva.';
  end if;

  if v_transaction_currency <> v_account_currency then
    raise exception 'La moneda de la cuenta debe coincidir con la moneda de la transacción.';
  end if;

  return new;
end;
$$;

create or replace function private.apply_financial_entry()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform set_config('app.allow_account_balance_update', 'true', true);

  update public.financial_accounts
  set current_balance = round(current_balance + new.amount_signed, 2),
      balance_as_of = now(),
      updated_at = now(),
      version = version + 1
  where id = new.financial_account_id;

  if not found then
    raise exception 'Cuenta financiera inexistente: %', new.financial_account_id;
  end if;

  return new;
end;
$$;

create or replace function private.prevent_financial_entry_mutation()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  raise exception 'Las líneas financieras publicadas son inmutables. Registre una transacción de reversión.';
end;
$$;

create or replace function public.confirm_sale(
  p_sale_id uuid,
  p_allocations jsonb,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_allocation record;
  v_movement_id uuid;
  v_default_term_days integer;
  v_vip_term_days integer;
  v_due_at timestamptz;
  v_existing_resource uuid;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'La clave de idempotencia es obligatoria para confirmar una venta.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('CONFIRM_SALE:' || p_idempotency_key, 0)
  );

  select resource_id into v_existing_resource
  from public.idempotency_keys
  where scope = 'CONFIRM_SALE'
    and idempotency_key = p_idempotency_key
    and status = 'COMPLETED';

  if v_existing_resource is not null then
    return v_existing_resource;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('CONFIRM_SALE', p_idempotency_key, private.current_actor_id())
  on conflict (scope, idempotency_key) do nothing;

  select * into v_sale
  from public.sales
  where id = p_sale_id
  for update;

  if not found then
    raise exception 'Venta no encontrada.';
  end if;

  if v_sale.commercial_state_code not in ('DRAFT', 'PENDING_CONFIRMATION') then
    raise exception 'La venta no puede confirmarse desde el estado %.', v_sale.commercial_state_code;
  end if;

  if not exists (
    select 1
    from public.sale_items si
    where si.sale_id = p_sale_id
      and si.item_status = 'ACTIVE'
  ) then
    raise exception 'La venta debe contener al menos un producto activo.';
  end if;

  if jsonb_typeof(p_allocations) <> 'array' then
    raise exception 'Las asignaciones deben enviarse como un arreglo JSON.';
  end if;

  -- Valida que las líneas de stock tengan asignación completa.
  if exists (
    select 1
    from public.sale_items si
    left join (
      select x.sale_item_id, sum(x.quantity) as allocated_quantity
      from jsonb_to_recordset(p_allocations) as x(
        sale_item_id uuid,
        lot_id uuid,
        warehouse_id uuid,
        quantity integer
      )
      group by x.sale_item_id
    ) a on a.sale_item_id = si.id
    where si.sale_id = p_sale_id
      and si.fulfillment_type = 'STOCK'
      and si.item_status = 'ACTIVE'
      and coalesce(a.allocated_quantity, 0) <> si.quantity
  ) then
    raise exception 'Cada producto de stock debe tener asignada exactamente la cantidad vendida.';
  end if;

  insert into public.inventory_movements (
    code,
    movement_type_code,
    reference_type,
    reference_id,
    reason,
    idempotency_key,
    created_by
  ) values (
    public.next_business_code('INVENTORY_MOVEMENT'),
    'RESERVATION',
    'SALE',
    p_sale_id,
    'Reserva de stock por confirmación de venta',
    'sale-reservation:' || p_idempotency_key,
    private.current_actor_id()
  ) returning id into v_movement_id;

  for v_allocation in
    select *
    from jsonb_to_recordset(p_allocations) as x(
      sale_item_id uuid,
      lot_id uuid,
      warehouse_id uuid,
      quantity integer
    )
  loop
    if v_allocation.quantity is null or v_allocation.quantity <= 0 then
      raise exception 'Cantidad de asignación inválida.';
    end if;

    if not exists (
      select 1 from public.sale_items si
      where si.id = v_allocation.sale_item_id
        and si.sale_id = p_sale_id
        and si.fulfillment_type = 'STOCK'
        and si.item_status = 'ACTIVE'
    ) then
      raise exception 'La asignación no corresponde a una línea válida de la venta.';
    end if;

    insert into public.sale_item_allocations (
      sale_item_id,
      lot_id,
      warehouse_id,
      quantity,
      allocation_status,
      created_by,
      updated_by
    ) values (
      v_allocation.sale_item_id,
      v_allocation.lot_id,
      v_allocation.warehouse_id,
      v_allocation.quantity,
      'RESERVED',
      private.current_actor_id(),
      private.current_actor_id()
    );

    insert into public.inventory_movement_lines (
      movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta
    )
    select v_movement_id, si.variant_id, v_allocation.lot_id, v_allocation.warehouse_id, 'AVAILABLE', -v_allocation.quantity
    from public.sale_items si where si.id = v_allocation.sale_item_id;

    insert into public.inventory_movement_lines (
      movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta
    )
    select v_movement_id, si.variant_id, v_allocation.lot_id, v_allocation.warehouse_id, 'RESERVED', v_allocation.quantity
    from public.sale_items si where si.id = v_allocation.sale_item_id;
  end loop;

  select coalesce((setting_value #>> '{}')::integer, 14)
  into v_default_term_days
  from public.business_settings
  where setting_key = 'sales.default_payment_term_days';

  select cvp.payment_term_days
  into v_vip_term_days
  from public.client_vip_profiles cvp
  where cvp.client_id = v_sale.client_id
    and v_sale.client_id in (select id from public.clients where is_vip = true)
    and (cvp.valid_until is null or cvp.valid_until > now());

  v_due_at := coalesce(v_sale.due_at, now() + make_interval(days => coalesce(v_vip_term_days, v_default_term_days, 14)));

  update public.sales
  set commercial_state_code = 'RESERVED',
      reserved_at = coalesce(reserved_at, now()),
      sold_at = coalesce(sold_at, now()),
      due_at = v_due_at,
      updated_by = private.current_actor_id()
  where id = p_sale_id;

  perform public.refresh_sale_totals(p_sale_id);

  insert into public.outbox_events (
    event_type, aggregate_type, aggregate_id, payload, deduplication_key
  ) values (
    'SALE_CONFIRMED',
    'SALE',
    p_sale_id,
    jsonb_build_object('sale_id', p_sale_id, 'inventory_movement_id', v_movement_id),
    'sale-confirmed:' || p_idempotency_key
  ) on conflict (deduplication_key) where deduplication_key is not null do nothing;

  update public.idempotency_keys
  set status = 'COMPLETED',
      resource_type = 'SALE',
      resource_id = p_sale_id,
      completed_at = now()
  where scope = 'CONFIRM_SALE' and idempotency_key = p_idempotency_key;

  return p_sale_id;
exception
  when others then
    update public.idempotency_keys
    set status = 'FAILED', completed_at = now()
    where scope = 'CONFIRM_SALE' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

create or replace function public.confirm_payment(
  p_payment_id uuid,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_sale public.sales%rowtype;
  v_sum numeric(14,2);
  v_financial_transaction_id uuid;
  v_sales_category_id uuid;
  v_part record;
  v_existing_resource uuid;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'La clave de idempotencia es obligatoria para confirmar un pago.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('CONFIRM_PAYMENT:' || p_idempotency_key, 0)
  );

  select resource_id into v_existing_resource
  from public.idempotency_keys
  where scope = 'CONFIRM_PAYMENT'
    and idempotency_key = p_idempotency_key
    and status = 'COMPLETED';

  if v_existing_resource is not null then
    return v_existing_resource;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('CONFIRM_PAYMENT', p_idempotency_key, private.current_actor_id())
  on conflict (scope, idempotency_key) do nothing;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Pago no encontrado.';
  end if;

  if v_payment.state_code = 'CONFIRMED' then
    return p_payment_id;
  end if;

  if v_payment.state_code <> 'PENDING' then
    raise exception 'El pago no puede confirmarse desde el estado %.', v_payment.state_code;
  end if;

  select * into v_sale
  from public.sales
  where id = v_payment.sale_id
  for update;

  select coalesce(round(sum(amount), 2), 0)
  into v_sum
  from public.payment_parts
  where payment_id = p_payment_id;

  if v_sum <= 0 then
    raise exception 'El pago no contiene medios de pago válidos.';
  end if;

  if v_sum <> v_payment.declared_amount then
    raise exception 'El importe declarado (%) no coincide con la suma de medios (%).', v_payment.declared_amount, v_sum;
  end if;

  if exists (
    select 1 from public.payment_parts
    where payment_id = p_payment_id
      and currency_code <> v_payment.currency_code
  ) then
    raise exception 'Todos los medios del pago deben usar la misma moneda del pago.';
  end if;

  select id into v_sales_category_id
  from public.financial_categories
  where code = 'SALES' and is_active = true;

  if v_sales_category_id is null then
    raise exception 'No existe la categoría financiera SALES.';
  end if;

  insert into public.financial_transactions (
    code,
    transaction_type_code,
    state_code,
    category_id,
    occurred_at,
    description,
    currency_code,
    total_amount,
    source_type,
    source_id,
    idempotency_key,
    is_system_generated,
    created_by,
    approved_by
  ) values (
    public.next_business_code('FINANCIAL_TRANSACTION'),
    'INCOME',
    'POSTED',
    v_sales_category_id,
    v_payment.received_at,
    'Ingreso por pago ' || v_payment.code || ' de venta ' || v_sale.code,
    v_payment.currency_code,
    v_payment.declared_amount,
    'PAYMENT',
    p_payment_id,
    'payment-income:' || p_idempotency_key,
    true,
    private.current_actor_id(),
    private.current_actor_id()
  ) returning id into v_financial_transaction_id;

  for v_part in
    select * from public.payment_parts where payment_id = p_payment_id
  loop
    insert into public.financial_transaction_entries (
      financial_transaction_id,
      financial_account_id,
      amount_signed,
      description
    ) values (
      v_financial_transaction_id,
      v_part.financial_account_id,
      v_part.amount,
      'Pago mediante ' || v_part.payment_method_code
    );
  end loop;

  update public.payments
  set state_code = 'CONFIRMED',
      confirmed_at = now(),
      confirmed_by = private.current_actor_id(),
      financial_transaction_id = v_financial_transaction_id,
      updated_by = private.current_actor_id()
  where id = p_payment_id;

  perform public.refresh_sale_totals(v_payment.sale_id);

  insert into public.outbox_events (
    event_type, aggregate_type, aggregate_id, payload, deduplication_key
  ) values (
    'PAYMENT_CONFIRMED',
    'PAYMENT',
    p_payment_id,
    jsonb_build_object(
      'payment_id', p_payment_id,
      'sale_id', v_payment.sale_id,
      'amount', v_payment.declared_amount,
      'currency', v_payment.currency_code,
      'financial_transaction_id', v_financial_transaction_id
    ),
    'payment-confirmed:' || p_idempotency_key
  ) on conflict (deduplication_key) where deduplication_key is not null do nothing;

  insert into public.outbox_events (
    event_type, aggregate_type, aggregate_id, payload, deduplication_key
  ) values (
    'RECEIPT_PENDING',
    'PAYMENT',
    p_payment_id,
    jsonb_build_object('payment_id', p_payment_id, 'sale_id', v_payment.sale_id),
    'receipt-pending:' || p_payment_id::text
  ) on conflict (deduplication_key) where deduplication_key is not null do nothing;

  update public.idempotency_keys
  set status = 'COMPLETED',
      resource_type = 'PAYMENT',
      resource_id = p_payment_id,
      completed_at = now()
  where scope = 'CONFIRM_PAYMENT' and idempotency_key = p_idempotency_key;

  return p_payment_id;
exception
  when others then
    update public.idempotency_keys
    set status = 'FAILED', completed_at = now()
    where scope = 'CONFIRM_PAYMENT' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

create or replace function public.reverse_payment(
  p_payment_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_original_transaction public.financial_transactions%rowtype;
  v_reversal_id uuid;
  v_entry record;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if nullif(btrim(p_reason), '') is null then
    raise exception 'La reversión requiere un motivo.';
  end if;

  select * into v_payment
  from public.payments
  where id = p_payment_id
  for update;

  if not found then
    raise exception 'Pago no encontrado.';
  end if;

  if v_payment.state_code = 'REVERSED' then
    return p_payment_id;
  end if;

  if v_payment.state_code <> 'CONFIRMED' or v_payment.financial_transaction_id is null then
    raise exception 'Solo se puede revertir un pago confirmado con movimiento financiero.';
  end if;

  select * into v_original_transaction
  from public.financial_transactions
  where id = v_payment.financial_transaction_id
  for update;

  perform set_config('app.audit_reason', p_reason, true);

  insert into public.financial_transactions (
    code,
    transaction_type_code,
    state_code,
    category_id,
    occurred_at,
    description,
    currency_code,
    total_amount,
    source_type,
    source_id,
    idempotency_key,
    is_system_generated,
    reversal_of_id,
    reason,
    created_by,
    approved_by
  ) values (
    public.next_business_code('FINANCIAL_TRANSACTION'),
    'REVERSAL',
    'POSTED',
    v_original_transaction.category_id,
    now(),
    'Reversión del pago ' || v_payment.code,
    v_original_transaction.currency_code,
    v_original_transaction.total_amount,
    'PAYMENT_REVERSAL',
    p_payment_id,
    'payment-reversal:' || p_idempotency_key,
    true,
    v_original_transaction.id,
    p_reason,
    private.current_actor_id(),
    private.current_actor_id()
  ) returning id into v_reversal_id;

  for v_entry in
    select *
    from public.financial_transaction_entries
    where financial_transaction_id = v_original_transaction.id
  loop
    insert into public.financial_transaction_entries (
      financial_transaction_id,
      financial_account_id,
      amount_signed,
      description
    ) values (
      v_reversal_id,
      v_entry.financial_account_id,
      -v_entry.amount_signed,
      'Reversión: ' || coalesce(v_entry.description, '')
    );
  end loop;

  update public.financial_transactions
  set state_code = 'REVERSED',
      updated_by = private.current_actor_id()
  where id = v_original_transaction.id;

  update public.payments
  set state_code = 'REVERSED',
      reversed_at = now(),
      reversed_by = private.current_actor_id(),
      reversal_reason = p_reason,
      updated_by = private.current_actor_id()
  where id = p_payment_id;

  perform public.refresh_sale_totals(v_payment.sale_id);

  insert into public.outbox_events (
    event_type, aggregate_type, aggregate_id, payload, deduplication_key
  ) values (
    'PAYMENT_REVERSED',
    'PAYMENT',
    p_payment_id,
    jsonb_build_object('payment_id', p_payment_id, 'sale_id', v_payment.sale_id, 'reason', p_reason),
    'payment-reversed:' || p_idempotency_key
  ) on conflict (deduplication_key) where deduplication_key is not null do nothing;

  return p_payment_id;
end;
$$;

-- =========================================================
-- Reglas de integridad adicionales
-- =========================================================

create or replace function private.validate_sale_item_allocation_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sold integer;
  v_allocated integer;
  v_item_variant uuid;
  v_lot_variant uuid;
begin
  select quantity, variant_id into v_sold, v_item_variant
  from public.sale_items
  where id = new.sale_item_id;

  if v_sold is null then
    raise exception 'La línea de venta no existe.';
  end if;

  select variant_id into v_lot_variant
  from public.inventory_lots
  where id = new.lot_id;

  if v_lot_variant is distinct from v_item_variant then
    raise exception 'El lote asignado no corresponde a la variante vendida.';
  end if;

  select coalesce(sum(a.quantity), 0)
  into v_allocated
  from public.sale_item_allocations a
  where a.sale_item_id = new.sale_item_id
    and a.allocation_status in ('RESERVED', 'ACCUMULATED', 'DELIVERED')
    and a.id <> new.id;

  if v_allocated + new.quantity > v_sold then
    raise exception 'La cantidad asignada supera la cantidad vendida.';
  end if;

  return new;
end;
$$;

create or replace function private.validate_delivery_item_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sold integer;
  v_other_delivered integer;
  v_item_sale_id uuid;
  v_delivery_sale_id uuid;
begin
  select quantity, sale_id into v_sold, v_item_sale_id
  from public.sale_items
  where id = new.sale_item_id;

  select sale_id into v_delivery_sale_id
  from public.deliveries
  where id = new.delivery_id;

  if v_item_sale_id is null or v_delivery_sale_id is null or v_item_sale_id <> v_delivery_sale_id then
    raise exception 'El producto entregado debe pertenecer a la misma venta de la entrega.';
  end if;

  select coalesce(sum(di.quantity), 0)
  into v_other_delivered
  from public.delivery_items di
  join public.deliveries d on d.id = di.delivery_id
  where di.sale_item_id = new.sale_item_id
    and d.state_code <> 'CANCELLED'
    and di.id <> new.id;

  if v_other_delivered + new.quantity > v_sold then
    raise exception 'La cantidad total de entregas supera la cantidad vendida.';
  end if;

  return new;
end;
$$;

create or replace function private.validate_preorder_allocation_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_expected integer;
  v_allocated integer;
  v_import_variant uuid;
  v_sale_variant uuid;
  v_fulfillment_type text;
begin
  select expected_quantity, variant_id into v_expected, v_import_variant
  from public.import_box_items
  where id = new.import_box_item_id
  for update;

  select variant_id, fulfillment_type into v_sale_variant, v_fulfillment_type
  from public.sale_items
  where id = new.sale_item_id;

  if v_sale_variant is null or v_import_variant is null or v_sale_variant <> v_import_variant then
    raise exception 'La preventa debe corresponder a la misma variante esperada.';
  end if;

  if v_fulfillment_type <> 'PREORDER' then
    raise exception 'Solo una línea de preventa puede asignarse a una importación.';
  end if;

  select coalesce(sum(pa.quantity), 0)
  into v_allocated
  from public.preorder_allocations pa
  where pa.import_box_item_id = new.import_box_item_id
    and pa.status in ('ALLOCATED', 'RECEIVED')
    and pa.id <> new.id;

  if v_allocated + new.quantity > v_expected then
    raise exception 'La preventa supera las unidades esperadas de la importación.';
  end if;

  return new;
end;
$$;

create or replace function private.validate_receipt_payment_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_sale uuid;
  v_payment_sale uuid;
  v_payment_amount numeric(14,2);
  v_already_allocated numeric(14,2);
begin
  select sale_id into v_receipt_sale
  from public.sales_receipts
  where id = new.receipt_id;

  select sale_id, declared_amount into v_payment_sale, v_payment_amount
  from public.payments
  where id = new.payment_id
    and state_code = 'CONFIRMED';

  if v_receipt_sale is null or v_payment_sale is null or v_receipt_sale <> v_payment_sale then
    raise exception 'La boleta y el pago deben pertenecer a la misma venta, y el pago debe estar confirmado.';
  end if;

  select coalesce(sum(rpa.allocated_amount), 0)
  into v_already_allocated
  from public.receipt_payment_allocations rpa
  where rpa.payment_id = new.payment_id
    and rpa.receipt_id <> new.receipt_id;

  if v_already_allocated + new.allocated_amount > v_payment_amount then
    raise exception 'La suma asignada a boletas supera el importe confirmado del pago.';
  end if;

  return new;
end;
$$;

create or replace function private.refresh_receipt_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_id uuid;
begin
  if tg_op = 'DELETE' then
    v_receipt_id := old.receipt_id;
  else
    v_receipt_id := new.receipt_id;
  end if;

  update public.sales_receipts r
  set amount = coalesce((
        select round(sum(a.allocated_amount), 2)
        from public.receipt_payment_allocations a
        where a.receipt_id = v_receipt_id
      ), 0),
      updated_at = now(),
      version = version + 1
  where r.id = v_receipt_id;

  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

create or replace function private.record_sale_state_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.commercial_state_code is distinct from new.commercial_state_code then
    insert into public.sale_state_history(
      sale_id, state_dimension, previous_state_code, new_state_code, reason, changed_by
    ) values (
      new.id, 'COMMERCIAL', old.commercial_state_code, new.commercial_state_code,
      nullif(current_setting('app.audit_reason', true), ''), private.current_actor_id()
    );
  end if;

  if old.payment_state_code is distinct from new.payment_state_code then
    insert into public.sale_state_history(
      sale_id, state_dimension, previous_state_code, new_state_code, reason, changed_by
    ) values (
      new.id, 'PAYMENT', old.payment_state_code, new.payment_state_code,
      nullif(current_setting('app.audit_reason', true), ''), private.current_actor_id()
    );
  end if;

  if old.delivery_state_code is distinct from new.delivery_state_code then
    insert into public.sale_state_history(
      sale_id, state_dimension, previous_state_code, new_state_code, reason, changed_by
    ) values (
      new.id, 'DELIVERY', old.delivery_state_code, new.delivery_state_code,
      nullif(current_setting('app.audit_reason', true), ''), private.current_actor_id()
    );
  end if;

  return new;
end;
$$;

create or replace function private.record_delivery_state_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.state_code is distinct from new.state_code then
    insert into public.delivery_state_history(
      delivery_id, previous_state_code, new_state_code, reason, changed_by
    ) values (
      new.id, old.state_code, new.state_code,
      nullif(current_setting('app.audit_reason', true), ''), private.current_actor_id()
    );
  end if;
  return new;
end;
$$;

create or replace function private.record_import_state_history()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if old.state_code is distinct from new.state_code then
    if tg_table_name = 'import_shipments' then
      insert into public.import_status_history(
        import_shipment_id, previous_state_code, new_state_code, reason, changed_by
      ) values (
        new.id, old.state_code, new.state_code,
        nullif(current_setting('app.audit_reason', true), ''), private.current_actor_id()
      );
    else
      insert into public.import_status_history(
        import_box_id, previous_state_code, new_state_code, reason, changed_by
      ) values (
        new.id, old.state_code, new.state_code,
        nullif(current_setting('app.audit_reason', true), ''), private.current_actor_id()
      );
    end if;
  end if;
  return new;
end;
$$;

-- =========================================================
-- Triggers de códigos correlativos
-- =========================================================

create trigger trg_clients_code
before insert on public.clients
for each row execute function private.assign_business_code('CLIENT', 'code');

create trigger trg_products_code
before insert on public.products
for each row execute function private.assign_business_code('PRODUCT', 'code');

create trigger trg_product_variants_sku
before insert on public.product_variants
for each row execute function private.assign_business_code('PRODUCT_VARIANT', 'sku');

create trigger trg_inventory_lots_code
before insert on public.inventory_lots
for each row execute function private.assign_business_code('INVENTORY_LOT', 'lot_code');

create trigger trg_inventory_movements_code
before insert on public.inventory_movements
for each row execute function private.assign_business_code('INVENTORY_MOVEMENT', 'code');

create trigger trg_sales_code
before insert on public.sales
for each row execute function private.assign_business_code('SALE', 'code');

create trigger trg_payments_code
before insert on public.payments
for each row execute function private.assign_business_code('PAYMENT', 'code');

create trigger trg_refunds_code
before insert on public.refunds
for each row execute function private.assign_business_code('REFUND', 'code');

create trigger trg_return_cases_code
before insert on public.return_cases
for each row execute function private.assign_business_code('RETURN_CASE', 'code');

create trigger trg_sales_receipts_code
before insert on public.sales_receipts
for each row execute function private.assign_business_code('RECEIPT', 'code');

create trigger trg_credit_notes_code
before insert on public.credit_notes
for each row execute function private.assign_business_code('CREDIT_NOTE', 'code');

create trigger trg_deliveries_code
before insert on public.deliveries
for each row execute function private.assign_business_code('DELIVERY', 'code');

create trigger trg_import_shipments_code
before insert on public.import_shipments
for each row execute function private.assign_business_code('IMPORT', 'code');

create trigger trg_import_boxes_code
before insert on public.import_boxes
for each row execute function private.assign_business_code('IMPORT_BOX', 'code');

create trigger trg_financial_transactions_code
before insert on public.financial_transactions
for each row execute function private.assign_business_code('FINANCIAL_TRANSACTION', 'code');

create trigger trg_loans_code
before insert on public.loans
for each row execute function private.assign_business_code('LOAN', 'code');

create trigger trg_obligations_code
before insert on public.obligations
for each row execute function private.assign_business_code('OBLIGATION', 'code');

create trigger trg_cash_closures_code
before insert on public.cash_closures
for each row execute function private.assign_business_code('CASH_CLOSURE', 'code');

create trigger trg_bank_import_batches_code
before insert on public.bank_import_batches
for each row execute function private.assign_business_code('BANK_IMPORT', 'code');

-- =========================================================
-- Triggers funcionales
-- =========================================================

drop trigger if exists trg_inventory_movement_reason on public.inventory_movements;
create trigger trg_inventory_movement_reason
before insert or update of movement_type_code, reason on public.inventory_movements
for each row execute function private.validate_inventory_movement_reason();

drop trigger if exists trg_apply_inventory_line on public.inventory_movement_lines;
create trigger trg_apply_inventory_line
after insert on public.inventory_movement_lines
for each row execute function private.apply_inventory_movement_line();

drop trigger if exists trg_inventory_line_immutable on public.inventory_movement_lines;
create trigger trg_inventory_line_immutable
before update or delete on public.inventory_movement_lines
for each row execute function private.prevent_inventory_line_mutation();

drop trigger if exists trg_00_sale_snapshot on public.sales;
create trigger trg_00_sale_snapshot
before insert or update of client_id on public.sales
for each row execute function private.populate_sale_snapshot();

drop trigger if exists trg_00_sale_item_snapshot on public.sale_items;
create trigger trg_00_sale_item_snapshot
before insert or update of variant_id, sale_id on public.sale_items
for each row execute function private.populate_sale_item_snapshot();

drop trigger if exists trg_protect_sale_derived_fields on public.sales;
create trigger trg_protect_sale_derived_fields
before update on public.sales
for each row execute function private.protect_sale_derived_fields();

drop trigger if exists trg_protect_payment_declared_amount on public.payments;
create trigger trg_protect_payment_declared_amount
before update on public.payments
for each row execute function private.protect_payment_declared_amount();

drop trigger if exists trg_protect_account_balance on public.financial_accounts;
create trigger trg_protect_account_balance
before update on public.financial_accounts
for each row execute function private.protect_account_balance();

drop trigger if exists trg_payment_part_mutable on public.payment_parts;
create trigger trg_payment_part_mutable
before update or delete on public.payment_parts
for each row execute function private.ensure_payment_part_mutable();

drop trigger if exists trg_payment_part_currency on public.payment_parts;
create trigger trg_payment_part_currency
before insert or update on public.payment_parts
for each row execute function private.validate_payment_part_account_currency();

drop trigger if exists trg_refresh_payment_amount on public.payment_parts;
create trigger trg_refresh_payment_amount
after insert or update or delete on public.payment_parts
for each row execute function private.refresh_payment_declared_amount();

drop trigger if exists trg_financial_entry_currency on public.financial_transaction_entries;
create trigger trg_financial_entry_currency
before insert on public.financial_transaction_entries
for each row execute function private.validate_financial_entry_currency();

drop trigger if exists trg_financial_entry_balance on public.financial_transaction_entries;
create trigger trg_financial_entry_balance
after insert on public.financial_transaction_entries
for each row execute function private.apply_financial_entry();

drop trigger if exists trg_financial_entry_immutable on public.financial_transaction_entries;
create trigger trg_financial_entry_immutable
before update or delete on public.financial_transaction_entries
for each row execute function private.prevent_financial_entry_mutation();

drop trigger if exists trg_sale_item_currency on public.sale_items;
create trigger trg_sale_item_currency
before insert or update on public.sale_items
for each row execute function private.validate_sale_item_currency();

drop trigger if exists trg_sale_item_allocation_quantity on public.sale_item_allocations;
create trigger trg_sale_item_allocation_quantity
before insert or update on public.sale_item_allocations
for each row execute function private.validate_sale_item_allocation_quantity();

drop trigger if exists trg_delivery_item_quantity on public.delivery_items;
create trigger trg_delivery_item_quantity
before insert or update on public.delivery_items
for each row execute function private.validate_delivery_item_quantity();

drop trigger if exists trg_preorder_allocation_quantity on public.preorder_allocations;
create trigger trg_preorder_allocation_quantity
before insert or update on public.preorder_allocations
for each row execute function private.validate_preorder_allocation_quantity();

drop trigger if exists trg_receipt_payment_allocation on public.receipt_payment_allocations;
create trigger trg_receipt_payment_allocation
before insert or update on public.receipt_payment_allocations
for each row execute function private.validate_receipt_payment_allocation();

drop trigger if exists trg_refresh_receipt_amount on public.receipt_payment_allocations;
create trigger trg_refresh_receipt_amount
after insert or update or delete on public.receipt_payment_allocations
for each row execute function private.refresh_receipt_amount();

-- Totales de venta.
do $$
declare
  v_table text;
begin
  foreach v_table in array array['sale_items', 'sale_discounts', 'penalties', 'payments', 'refunds', 'deliveries']
  loop
    execute format('drop trigger if exists trg_refresh_sale_totals on public.%I', v_table);
    execute format(
      'create trigger trg_refresh_sale_totals after insert or update or delete on public.%I for each row execute function private.refresh_sale_totals_from_child()',
      v_table
    );
  end loop;
end;
$$;

-- Historiales de estado.
drop trigger if exists trg_sales_state_history on public.sales;
create trigger trg_sales_state_history
after update on public.sales
for each row execute function private.record_sale_state_history();

drop trigger if exists trg_delivery_state_history on public.deliveries;
create trigger trg_delivery_state_history
after update on public.deliveries
for each row execute function private.record_delivery_state_history();

drop trigger if exists trg_import_shipment_state_history on public.import_shipments;
create trigger trg_import_shipment_state_history
after update on public.import_shipments
for each row execute function private.record_import_state_history();

drop trigger if exists trg_import_box_state_history on public.import_boxes;
create trigger trg_import_box_state_history
after update on public.import_boxes
for each row execute function private.record_import_state_history();

-- Transiciones de estado configurables.
create trigger trg_sales_commercial_transition
before update of commercial_state_code on public.sales
for each row execute function private.validate_workflow_transition('SALE_COMMERCIAL', 'commercial_state_code');

create trigger trg_sales_payment_transition
before update of payment_state_code on public.sales
for each row execute function private.validate_workflow_transition('SALE_PAYMENT', 'payment_state_code');

create trigger trg_sales_delivery_transition
before update of delivery_state_code on public.sales
for each row execute function private.validate_workflow_transition('SALE_DELIVERY', 'delivery_state_code');

create trigger trg_payment_transition
before update of state_code on public.payments
for each row execute function private.validate_workflow_transition('PAYMENT', 'state_code');

create trigger trg_receipt_transition
before update of state_code on public.sales_receipts
for each row execute function private.validate_workflow_transition('RECEIPT', 'state_code');

create trigger trg_release_request_transition
before update of state_code on public.release_requests
for each row execute function private.validate_workflow_transition('RELEASE_REQUEST', 'state_code');

create trigger trg_refund_transition
before update of state_code on public.refunds
for each row execute function private.validate_workflow_transition('REFUND', 'state_code');

create trigger trg_return_case_transition
before update of state_code on public.return_cases
for each row execute function private.validate_workflow_transition('RETURN_CASE', 'state_code');

create trigger trg_delivery_transition
before update of state_code on public.deliveries
for each row execute function private.validate_workflow_transition('DELIVERY', 'state_code');

create trigger trg_import_transition
before update of state_code on public.import_shipments
for each row execute function private.validate_workflow_transition('IMPORT', 'state_code');

create trigger trg_import_box_transition
before update of state_code on public.import_boxes
for each row execute function private.validate_workflow_transition('IMPORT_BOX', 'state_code');

create trigger trg_financial_transaction_transition
before update of state_code on public.financial_transactions
for each row execute function private.validate_workflow_transition('FINANCIAL_TRANSACTION', 'state_code');

-- Updated_at + optimistic version.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'app_roles', 'profiles', 'business_settings', 'partner_types', 'business_partners',
    'workflow_definitions', 'workflow_states', 'clients', 'client_addresses',
    'client_vip_profiles', 'product_categories', 'franchises', 'brands', 'product_lines',
    'product_attribute_definitions', 'products', 'product_variants',
    'product_variant_attribute_values', 'warehouses', 'inventory_bucket_types',
    'inventory_movement_types', 'inventory_lots', 'sales_channels', 'sale_types',
    'discount_types', 'payment_methods', 'sales', 'sale_items', 'payments', 'penalties',
    'release_requests', 'refunds', 'return_cases', 'sales_receipts', 'deliveries',
    'import_shipments', 'import_boxes', 'import_box_items', 'preorder_allocations',
    'import_incidents', 'insurance_claims', 'financial_account_types', 'financial_accounts',
    'financial_categories', 'financial_transaction_types', 'financial_transactions',
    'loans', 'loan_installments', 'obligations', 'cash_closures', 'notification_types',
    'notification_recipients', 'notification_preferences', 'push_subscriptions',
    'scheduled_reminders'
  ]
  loop
    execute format('drop trigger if exists trg_touch_version on public.%I', v_table);
    execute format(
      'create trigger trg_touch_version before update on public.%I for each row execute function private.touch_updated_at_and_version()',
      v_table
    );
  end loop;
end;
$$;

-- Auditoría en entidades relevantes. Se omiten libros derivados y secretos.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'profiles', 'user_roles', 'business_settings', 'business_partners', 'attachments',
    'clients', 'client_addresses', 'client_vip_profiles', 'client_vip_history', 'client_incidents',
    'product_categories', 'franchises', 'brands', 'product_lines', 'products', 'product_variants',
    'product_price_history', 'warehouses', 'warehouse_managers', 'inventory_lots',
    'inventory_movements', 'sales', 'sale_items', 'sale_discounts', 'sale_item_allocations',
    'payments', 'payment_parts', 'penalties', 'release_requests', 'refunds', 'return_cases',
    'return_items', 'sales_receipts', 'credit_notes', 'deliveries', 'delivery_items',
    'import_shipments', 'import_boxes', 'import_box_items', 'preorder_allocations',
    'import_costs', 'import_incidents', 'insurance_claims', 'financial_accounts',
    'financial_categories', 'financial_transactions', 'loans', 'loan_installments',
    'obligations', 'cash_closures', 'bank_import_batches', 'bank_statement_rows',
    'bank_reconciliations', 'notification_preferences', 'scheduled_reminders'
  ]
  loop
    execute format('drop trigger if exists trg_audit_row_change on public.%I', v_table);
    execute format(
      'create trigger trg_audit_row_change after insert or update or delete on public.%I for each row execute function private.audit_row_change()',
      v_table
    );
  end loop;
end;
$$;

-- Protección contra borrado físico en operaciones comerciales.
do $$
declare
  v_table text;
begin
  foreach v_table in array array[
    'clients', 'client_addresses', 'client_vip_profiles', 'client_vip_history', 'client_incidents',
    'products', 'product_variants', 'product_price_history', 'warehouses', 'inventory_lots',
    'inventory_movements', 'inventory_movement_lines', 'sales', 'sale_items', 'sale_discounts',
    'sale_item_allocations', 'payments', 'payment_parts', 'penalties', 'release_requests',
    'refunds', 'return_cases', 'return_items', 'sales_receipts', 'credit_notes',
    'deliveries', 'delivery_items', 'import_shipments', 'import_boxes', 'import_box_items',
    'preorder_allocations', 'import_costs', 'import_incidents', 'insurance_claims',
    'financial_accounts', 'financial_transactions', 'financial_transaction_entries',
    'loans', 'loan_installments', 'obligations', 'cash_closures', 'bank_import_batches',
    'bank_statement_rows', 'bank_reconciliations', 'audit_log'
  ]
  loop
    execute format('drop trigger if exists trg_prevent_hard_delete on public.%I', v_table);
    execute format(
      'create trigger trg_prevent_hard_delete before delete on public.%I for each row execute function private.prevent_hard_delete()',
      v_table
    );
  end loop;
end;
$$;

commit;


-- =========================================================
-- 008_views_and_reporting.sql
-- =========================================================

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


-- =========================================================
-- 009_rls_permissions_and_storage.sql
-- =========================================================

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


-- =========================================================
-- 010_seed_initial_configuration.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 010: datos iniciales, catálogos y reglas configurables

begin;

-- Monedas y roles.
insert into public.currencies(code, name, symbol, decimal_places)
values
  ('PEN', 'Sol peruano', 'S/', 2),
  ('USD', 'Dólar estadounidense', 'US$', 2)
on conflict (code) do update set
  name = excluded.name,
  symbol = excluded.symbol,
  decimal_places = excluded.decimal_places,
  is_active = true;

insert into public.app_roles(code, name, description, is_system)
values ('ADMIN', 'Administradora', 'Acceso completo a la operación de Yukimi Gestión.', true)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true;

-- Contadores visibles. Los UUID siguen siendo los identificadores internos.
insert into public.business_counters(counter_key, prefix, last_value, padding)
values
  ('CLIENT', 'CLI-', 0, 6),
  ('PRODUCT', 'PRD-', 0, 6),
  ('PRODUCT_VARIANT', 'SKU-', 0, 7),
  ('INVENTORY_LOT', 'LOT-', 0, 7),
  ('INVENTORY_MOVEMENT', 'MOV-', 0, 8),
  ('SALE', 'VTA-', 0, 7),
  ('PAYMENT', 'PAG-', 0, 8),
  ('REFUND', 'DEV-', 0, 7),
  ('RETURN_CASE', 'RET-', 0, 7),
  ('RECEIPT', 'CMP-', 0, 8),
  ('CREDIT_NOTE', 'NCR-', 0, 8),
  ('DELIVERY', 'ENT-', 0, 7),
  ('IMPORT', 'IMP-', 0, 6),
  ('IMPORT_BOX', 'CJA-', 0, 7),
  ('FINANCIAL_TRANSACTION', 'FIN-', 0, 8),
  ('LOAN', 'PRE-', 0, 6),
  ('OBLIGATION', 'OBL-', 0, 6),
  ('CASH_CLOSURE', 'CIE-', 0, 7),
  ('BANK_IMPORT', 'BAN-', 0, 7)
on conflict (counter_key) do update set
  prefix = excluded.prefix,
  padding = excluded.padding;

-- Configuración del negocio. Las decisiones pendientes se conservan como datos,
-- para que una confirmación futura no obligue a rediseñar la base.
insert into public.business_settings(setting_key, setting_value, value_type, category, description, is_editable)
values
  ('app.timezone', to_jsonb('America/Lima'::text), 'STRING', 'GENERAL', 'Zona horaria utilizada para mostrar y calcular fechas de negocio.', false),
  ('app.default_currency', to_jsonb('PEN'::text), 'STRING', 'GENERAL', 'Moneda principal del negocio.', false),
  ('sales.default_payment_term_days', '14'::jsonb, 'NUMBER', 'SALES', 'Plazo normal desde la separación.', true),
  ('sales.high_value_payment_term_days', '21'::jsonb, 'NUMBER', 'SALES', 'Plazo excepcional para productos de alto valor.', true),
  ('sales.release_grace_hours', '24'::jsonb, 'DURATION', 'SALES', 'Horas durante las cuales una separación puede cancelarse sin penalidad de liberación.', true),
  ('penalties.late_daily', '{"amount":1,"currency":"PEN","enabled":true}'::jsonb, 'MONEY', 'PENALTIES', 'Penalidad por cada día posterior al vencimiento.', true),
  ('penalties.combine_late_and_release', '{"status":"PENDING_DEFINITION","value":null}'::jsonb, 'JSON', 'PENALTIES', 'Define si la penalidad diaria se acumula con la penalidad de liberación.', true),
  ('refunds.deduct_penalty_from_deposit', '{"status":"PENDING_DEFINITION","value":null}'::jsonb, 'JSON', 'REFUNDS', 'Forma exacta de descontar la penalidad del adelanto.', true),
  ('receipts.required_for_new_sales', '{"status":"PENDING_DEFINITION","value":null}'::jsonb, 'JSON', 'RECEIPTS', 'Obligatoriedad de boleta para todas las ventas nuevas.', true),
  ('receipts.mixed_payment_treatment', '{"status":"PENDING_DEFINITION","value":null}'::jsonb, 'JSON', 'RECEIPTS', 'Tratamiento de boleta cuando un pago combina más de un medio.', true),
  ('imports.unit_cost_allocation', '{"status":"PENDING_DEFINITION","mode":"MANUAL"}'::jsonb, 'JSON', 'IMPORTS', 'Cálculo automático o manual de tarjeta, comisión, flete y aduanas.', true),
  ('dispatch.weekdays_iso', '[1,4]'::jsonb, 'JSON', 'DELIVERIES', 'Días habituales de despacho: lunes y jueves.', true),
  ('notifications.payment_due_days_before', '3'::jsonb, 'NUMBER', 'NOTIFICATIONS', 'Anticipación de alertas de pagos por vencer.', true),
  ('notifications.import_arrival_days_before', '3'::jsonb, 'NUMBER', 'NOTIFICATIONS', 'Anticipación de alertas de llegada de importaciones.', true),
  ('notifications.weekly_email', '{"enabled":false,"day":null,"recipients":[]}'::jsonb, 'JSON', 'NOTIFICATIONS', 'Configuración pendiente del resumen semanal por correo.', true),
  ('files.max_image_bytes', '5242880'::jsonb, 'NUMBER', 'FILES', 'Tamaño máximo inicial de imágenes: 5 MB.', true),
  ('files.max_document_bytes', '10485760'::jsonb, 'NUMBER', 'FILES', 'Tamaño máximo inicial de documentos: 10 MB.', true)
on conflict (setting_key) do update set
  description = excluded.description,
  category = excluded.category;

-- Socios comerciales reutilizables.
insert into public.partner_types(code, name, description)
values
  ('SUPPLIER', 'Proveedor', 'Vendedor o tienda de origen de la mercadería.'),
  ('INTERNATIONAL_OPERATOR', 'Operador internacional', 'Transportista o intermediario internacional.'),
  ('LOCAL_OPERATOR', 'Operador local', 'Operador logístico dentro de Perú.'),
  ('AGENCY', 'Agencia', 'Agencia de envío interprovincial.'),
  ('COURIER', 'Courier o motorizado', 'Servicio de entrega al cliente.'),
  ('LENDER', 'Prestamista', 'Persona o entidad relacionada con préstamos.')
on conflict (code) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.business_partners(code, legal_name, trade_name, country_code, is_active)
values
  ('PART-SHALOM', 'Shalom Empresarial S.A.C.', 'Shalom', 'PE', true),
  ('PART-OLVA', 'Olva Courier S.A.C.', 'Olva', 'PE', true),
  ('PART-AFEXPRESS', 'AF Express', 'AF Express', 'PE', true)
on conflict (code) do update set
  legal_name = excluded.legal_name,
  trade_name = excluded.trade_name,
  is_active = true;

insert into public.business_partner_types(partner_id, partner_type_code)
select bp.id, x.partner_type_code
from public.business_partners bp
join (values
  ('PART-SHALOM', 'AGENCY'),
  ('PART-SHALOM', 'LOCAL_OPERATOR'),
  ('PART-OLVA', 'AGENCY'),
  ('PART-OLVA', 'LOCAL_OPERATOR'),
  ('PART-AFEXPRESS', 'COURIER'),
  ('PART-AFEXPRESS', 'LOCAL_OPERATOR')
) as x(partner_code, partner_type_code) on x.partner_code = bp.code
on conflict do nothing;

-- Catálogo de productos.
insert into public.product_categories(code, name, description, release_penalty_amount, release_penalty_currency, sort_order)
values
  ('PLUSH', 'Peluches', 'Peluches y productos blandos.', 5.00, 'PEN', 10),
  ('FIGURE', 'Figuras', 'Figuras, estatuillas y coleccionables.', 10.00, 'PEN', 20),
  ('ACRYLIC', 'Acrílicos', 'Stands, placas y accesorios acrílicos.', null, 'PEN', 30),
  ('KEYCHAIN', 'Llaveros', 'Llaveros y colgantes.', null, 'PEN', 40),
  ('OTHER', 'Otros', 'Productos que no pertenecen a las categorías principales.', null, 'PEN', 99)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  release_penalty_amount = excluded.release_penalty_amount,
  release_penalty_currency = excluded.release_penalty_currency,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.franchises(code, name, description)
values ('OTHER', 'Otros / Sin franquicia', 'Valor disponible cuando el producto no pertenece a una franquicia definida.')
on conflict (code) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.product_attribute_definitions(code, name, data_type, sort_order)
values
  ('COLOR', 'Color', 'COLOR', 10),
  ('SIZE', 'Tamaño', 'TEXT', 20),
  ('DESIGN', 'Diseño', 'TEXT', 30),
  ('EDITION', 'Edición', 'TEXT', 40)
on conflict (code) do update set name = excluded.name, data_type = excluded.data_type, sort_order = excluded.sort_order, is_active = true;

-- Almacenes visibles y ubicaciones virtuales de importación.
insert into public.warehouses(code, name, warehouse_type, description, is_virtual, is_visible_in_operations)
values
  ('LORENA', 'Almacén Lorena', 'OPERATIONAL', 'Almacén operativo gestionado por Lorena.', false, true),
  ('CAMILA', 'Almacén Camila', 'OPERATIONAL', 'Almacén operativo gestionado por Camila.', false, true),
  ('FOREIGN', 'Almacén en el extranjero', 'FOREIGN', 'Ubicación virtual para mercadería recibida en el almacén extranjero.', true, false),
  ('TRANSIT', 'Tránsito internacional', 'TRANSIT', 'Ubicación virtual para mercadería embarcada o en tránsito.', true, false)
on conflict (code) do update set
  name = excluded.name,
  warehouse_type = excluded.warehouse_type,
  description = excluded.description,
  is_virtual = excluded.is_virtual,
  is_visible_in_operations = excluded.is_visible_in_operations,
  is_active = true;

insert into public.inventory_bucket_types(
  code, name, description, counts_as_on_hand, counts_as_sellable,
  counts_as_reserved, is_terminal, sort_order
)
values
  ('AVAILABLE', 'Disponible', 'Unidades disponibles para venta o separación.', true, true, false, false, 10),
  ('RESERVED', 'Reservado', 'Unidades separadas para clientes.', true, false, true, false, 20),
  ('ACCUMULATED', 'Acumulado para cliente', 'Unidades que permanecen en almacén a nombre del cliente.', true, false, true, false, 30),
  ('DAMAGED', 'Dañado', 'Unidades físicamente presentes pero no vendibles.', true, false, false, false, 40),
  ('LOST', 'Perdido', 'Unidades registradas como perdidas.', false, false, false, true, 50),
  ('IN_TRANSIT', 'En tránsito', 'Unidades que todavía no ingresaron a un almacén operativo.', false, false, false, false, 60),
  ('PREORDER_EXPECTED', 'Preventa esperada', 'Unidades esperadas y asignables a preventa.', false, false, true, false, 70),
  ('GIFTED', 'Regalado', 'Salida por regalo a cliente.', false, false, false, true, 80),
  ('USED_DYNAMIC', 'Utilizado en dinámica', 'Salida por sorteo o dinámica.', false, false, false, true, 90),
  ('DELIVERED', 'Entregado', 'Unidad entregada al cliente.', false, false, false, true, 100)
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  counts_as_on_hand = excluded.counts_as_on_hand,
  counts_as_sellable = excluded.counts_as_sellable,
  counts_as_reserved = excluded.counts_as_reserved,
  is_terminal = excluded.is_terminal,
  sort_order = excluded.sort_order,
  is_active = true;

insert into public.inventory_movement_types(code, name, description, requires_reason)
values
  ('INITIAL_STOCK', 'Stock inicial', 'Carga inicial de existencias.', true),
  ('IMPORT_RECEIPT', 'Ingreso por importación', 'Recepción de mercadería importada.', false),
  ('IMPORT_TRANSFER', 'Movimiento logístico de importación', 'Traslado entre almacén extranjero, tránsito y Perú.', false),
  ('RESERVATION', 'Reserva', 'Traslado de disponible a reservado.', false),
  ('RELEASE', 'Liberación', 'Retorno de reservado a disponible.', true),
  ('SALE', 'Venta', 'Salida comercial de inventario.', false),
  ('DELIVERY', 'Entrega', 'Traslado de reservado o acumulado a entregado.', false),
  ('RETURN', 'Devolución', 'Ingreso por devolución de cliente.', true),
  ('DAMAGE', 'Daño', 'Traslado a estado dañado.', true),
  ('LOSS', 'Pérdida', 'Salida por pérdida.', true),
  ('GIFT', 'Regalo', 'Salida por regalo.', true),
  ('DYNAMIC', 'Dinámica', 'Salida por sorteo o dinámica.', true),
  ('TRANSFER', 'Transferencia entre almacenes', 'Traslado entre almacenes operativos.', true),
  ('ADJUSTMENT', 'Ajuste autorizado', 'Corrección de inventario con motivo obligatorio.', true),
  ('PREORDER_ALLOCATION', 'Asignación de preventa', 'Asignación de una unidad esperada a una preventa.', false),
  ('PREORDER_RELEASE', 'Liberación de preventa', 'Liberación de una unidad esperada.', true),
  ('CANCELLATION', 'Cancelación', 'Movimiento compensatorio por cancelación.', true),
  ('REVERSAL', 'Reversión', 'Movimiento compensatorio de otro movimiento.', true)
on conflict (code) do update set name = excluded.name, description = excluded.description, requires_reason = excluded.requires_reason, is_active = true;

-- Venta y pagos.
insert into public.sales_channels(code, name, description, sort_order)
values
  ('WHATSAPP', 'WhatsApp', 'Venta coordinada por WhatsApp.', 10),
  ('LIVE', 'Live', 'Venta realizada durante una transmisión en vivo.', 20),
  ('FAIR', 'Feria', 'Venta realizada en feria o evento.', 30),
  ('OTHER', 'Otro', 'Canal configurable o excepcional.', 99)
on conflict (code) do update set name = excluded.name, description = excluded.description, sort_order = excluded.sort_order, is_active = true;

insert into public.sale_types(code, name, description)
values
  ('REGULAR', 'Venta regular', 'Venta de productos en stock.'),
  ('PREORDER', 'Preventa', 'Venta de producto asociado a una importación.'),
  ('CUSTOM_ORDER', 'Venta bajo pedido', 'Servicio de búsqueda y compra de un producto específico.')
on conflict (code) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.discount_types(code, name, calculation_mode, description)
values
  ('QUANTITY', 'Descuento por cantidad', 'MANUAL', 'Descuento por llevar dos o más productos.'),
  ('LAST_UNITS', 'Últimas unidades', 'MANUAL', 'Descuento para liquidar las últimas unidades.'),
  ('LIQUIDATION', 'Liquidación', 'MANUAL', 'Descuento por liquidación de temporada.'),
  ('SEASONAL', 'Temporada', 'MANUAL', 'Promoción temporal.'),
  ('PROMOTION', 'Promoción', 'MANUAL', 'Descuento asociado a una promoción.'),
  ('MANUAL', 'Descuento manual autorizado', 'MANUAL', 'Descuento con motivo obligatorio.')
on conflict (code) do update set name = excluded.name, calculation_mode = excluded.calculation_mode, description = excluded.description, is_active = true;

insert into public.payment_methods(code, name, requires_proof)
values
  ('YAPE', 'Yape', true),
  ('TRANSFER', 'Transferencia', true),
  ('CASH', 'Efectivo', false)
on conflict (code) do update set name = excluded.name, requires_proof = excluded.requires_proof, is_active = true;

-- Finanzas.
insert into public.financial_account_types(code, name, description)
values
  ('BANK', 'Cuenta bancaria', 'Cuenta en una entidad bancaria.'),
  ('WALLET', 'Billetera digital', 'Yape u otra billetera digital.'),
  ('CASH', 'Efectivo', 'Caja de efectivo.'),
  ('CREDIT_CARD', 'Tarjeta de crédito', 'Cuenta de obligación o tarjeta utilizada para compras.')
on conflict (code) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.financial_accounts(
  code, name, account_type_code, currency_code, institution_name,
  opening_balance, current_balance, is_active
)
values
  ('BCP-PEN', 'BCP', 'BANK', 'PEN', 'BCP', 0, 0, true),
  ('SCOTIABANK-PEN', 'Scotiabank', 'BANK', 'PEN', 'Scotiabank', 0, 0, true),
  ('YAPE-PEN', 'Yape', 'WALLET', 'PEN', 'Yape', 0, 0, true),
  ('CASH-PEN', 'Efectivo', 'CASH', 'PEN', null, 0, 0, true)
on conflict (code) do update set
  name = excluded.name,
  account_type_code = excluded.account_type_code,
  currency_code = excluded.currency_code,
  institution_name = excluded.institution_name,
  is_active = true;

insert into public.financial_transaction_types(code, name, description)
values
  ('INCOME', 'Ingreso', 'Entrada de dinero.'),
  ('EXPENSE', 'Gasto', 'Salida de dinero.'),
  ('TRANSFER', 'Transferencia', 'Movimiento entre cuentas propias.'),
  ('LOAN_RECEIVED', 'Préstamo recibido', 'Ingreso de dinero por préstamo.'),
  ('LOAN_PAYMENT', 'Pago de préstamo', 'Salida relacionada con una cuota o cancelación de préstamo.'),
  ('ADJUSTMENT', 'Ajuste', 'Corrección documentada de saldo.'),
  ('REFUND', 'Devolución al cliente', 'Salida por reembolso.'),
  ('REVERSAL', 'Reversión', 'Operación compensatoria de una transacción previa.')
on conflict (code) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.financial_categories(code, name, nature, description, sort_order)
values
  ('SALES', 'Ventas', 'INCOME', 'Ingresos confirmados por ventas.', 10),
  ('CUSTOM_ORDER_SALES', 'Venta bajo pedido', 'INCOME', 'Ingreso por servicio de búsqueda y compra bajo pedido.', 20),
  ('PAYROLL', 'Planilla', 'EXPENSE', 'Pagos de planilla.', 100),
  ('SUNAT', 'Pago SUNAT', 'EXPENSE', 'Obligaciones tributarias.', 110),
  ('CUSTOMS', 'Pago aduanas', 'EXPENSE', 'Pagos de aduanas e importación.', 120),
  ('FX', 'Tipo de cambio', 'EXPENSE', 'Diferencias o costos de cambio de moneda.', 130),
  ('MOBILITY', 'Movilidades', 'EXPENSE', 'Movilidad y transporte operativo.', 140),
  ('PACKAGING', 'Compra de embalaje', 'EXPENSE', 'Materiales de embalaje.', 150),
  ('MOTORBIKE', 'Pago motorizado', 'EXPENSE', 'Pago a motorizados o courier.', 160),
  ('AGENCY', 'Pago agencia', 'EXPENSE', 'Pago a agencias de envío.', 170),
  ('LOANS', 'Préstamos', 'LOAN', 'Préstamos recibidos o pagados.', 180),
  ('SERPOST', 'Apoyo Serpost', 'EXPENSE', 'Gastos relacionados con Serpost.', 190),
  ('RETURNS', 'Devoluciones', 'BOTH', 'Devoluciones y reembolsos.', 200),
  ('OTHER', 'Otros', 'BOTH', 'Categoría abierta para operaciones excepcionales.', 999)
on conflict (code) do update set
  name = excluded.name,
  nature = excluded.nature,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

-- Workflows y estados.
insert into public.workflow_definitions(code, name, description)
values
  ('SALE_COMMERCIAL', 'Estado comercial de venta', 'Ciclo comercial independiente del pago y la entrega.'),
  ('SALE_PAYMENT', 'Estado de pago de venta', 'Situación del saldo de la venta.'),
  ('SALE_DELIVERY', 'Estado global de entrega', 'Situación resumida de las entregas de la venta.'),
  ('PAYMENT', 'Pago', 'Registro, confirmación y reversión de pagos.'),
  ('RECEIPT', 'Boleta', 'Registro de boletas y notas de crédito.'),
  ('RELEASE_REQUEST', 'Solicitud de liberación', 'Solicitud, aprobación y ejecución de liberación.'),
  ('REFUND', 'Devolución de dinero', 'Aprobación y procesamiento de reembolsos.'),
  ('RETURN_CASE', 'Devolución o cambio', 'Caso de devolución o cambio de producto.'),
  ('DELIVERY', 'Entrega', 'Flujo logístico de una entrega.'),
  ('IMPORT', 'Importación', 'Flujo general de una compra internacional.'),
  ('IMPORT_BOX', 'Caja de importación', 'Flujo individual de una caja.'),
  ('FINANCIAL_TRANSACTION', 'Transacción financiera', 'Publicación y reversión del libro financiero.')
on conflict (code) do update set name = excluded.name, description = excluded.description, is_active = true;

insert into public.workflow_states(workflow_code, state_code, label, sort_order, is_initial, is_terminal)
values
  ('SALE_COMMERCIAL','DRAFT','Borrador',10,true,false),
  ('SALE_COMMERCIAL','PENDING_CONFIRMATION','Pendiente de confirmación',20,false,false),
  ('SALE_COMMERCIAL','RESERVED','Reservada',30,false,false),
  ('SALE_COMMERCIAL','ACTIVE','Activa',40,false,false),
  ('SALE_COMMERCIAL','COMPLETED','Completada',90,false,true),
  ('SALE_COMMERCIAL','CANCELLED','Cancelada',91,false,true),
  ('SALE_COMMERCIAL','ANNULLED','Anulada',92,false,true),

  ('SALE_PAYMENT','UNPAID','Sin pago confirmado',10,true,false),
  ('SALE_PAYMENT','PARTIAL','Parcialmente pagada',20,false,false),
  ('SALE_PAYMENT','PAID','Pagada',90,false,true),
  ('SALE_PAYMENT','OVERDUE','Vencida',30,false,false),
  ('SALE_PAYMENT','REFUNDED','Reembolsada',91,false,true),

  ('SALE_DELIVERY','PENDING','Pendiente',10,true,false),
  ('SALE_DELIVERY','ACCUMULATED','Acumula almacén',20,false,false),
  ('SALE_DELIVERY','PARTIAL','Parcialmente entregada',30,false,false),
  ('SALE_DELIVERY','DELIVERED','Entregada',90,false,true),
  ('SALE_DELIVERY','CANCELLED','Cancelada',91,false,true),

  ('PAYMENT','PENDING','Pendiente de confirmación',10,true,false),
  ('PAYMENT','CONFIRMED','Confirmado',90,false,true),
  ('PAYMENT','REJECTED','Rechazado',91,false,true),
  ('PAYMENT','REVERSED','Revertido',92,false,true),

  ('RECEIPT','PENDING','Pendiente de emisión',10,true,false),
  ('RECEIPT','ISSUED','Emitida',90,false,false),
  ('RECEIPT','ANNULLED','Anulada',91,false,false),
  ('RECEIPT','CREDIT_NOTE','Con nota de crédito',92,false,true),
  ('RECEIPT','HISTORICAL_WITHOUT_RECEIPT','Venta antigua sin boleta',93,false,true),

  ('RELEASE_REQUEST','REQUESTED','Solicitada',10,true,false),
  ('RELEASE_REQUEST','APPROVED','Aprobada',20,false,false),
  ('RELEASE_REQUEST','REJECTED','Rechazada',90,false,true),
  ('RELEASE_REQUEST','EXECUTED','Ejecutada',91,false,true),
  ('RELEASE_REQUEST','CANCELLED','Cancelada',92,false,true),

  ('REFUND','PENDING','Pendiente',10,true,false),
  ('REFUND','APPROVED','Aprobada',20,false,false),
  ('REFUND','PROCESSED','Procesada',90,false,true),
  ('REFUND','REJECTED','Rechazada',91,false,true),
  ('REFUND','CANCELLED','Cancelada',92,false,true),

  ('RETURN_CASE','OPEN','Abierto',10,true,false),
  ('RETURN_CASE','UNDER_REVIEW','En revisión',20,false,false),
  ('RETURN_CASE','APPROVED','Aprobado',30,false,false),
  ('RETURN_CASE','REJECTED','Rechazado',90,false,true),
  ('RETURN_CASE','COMPLETED','Completado',91,false,true),
  ('RETURN_CASE','CANCELLED','Cancelado',92,false,true),

  ('DELIVERY','PENDING_INSTRUCTIONS','Pendiente de indicaciones',10,true,false),
  ('DELIVERY','ACCUMULATED','Acumula almacén',20,false,false),
  ('DELIVERY','PENDING_AGENCY_DISPATCH','Pendiente de despacho a agencia',30,false,false),
  ('DELIVERY','DELIVERED_TO_AGENCY','Entregado a agencia',40,false,false),
  ('DELIVERY','OUT_FOR_DELIVERY','En reparto',50,false,false),
  ('DELIVERY','PARTIALLY_DELIVERED','Parcialmente entregado',60,false,false),
  ('DELIVERY','DELIVERED_TO_CLIENT','Entregado al cliente',90,false,true),
  ('DELIVERY','CANCELLED','Cancelado',91,false,true),

  ('IMPORT','QUOTATION','Cotización',10,true,false),
  ('IMPORT','PURCHASE_CONFIRMED','Compra confirmada',20,false,false),
  ('IMPORT','FOREIGN_WAREHOUSE','Almacén extranjero',30,false,false),
  ('IMPORT','DISPATCH_CONFIRMED','Confirmación de despacho',40,false,false),
  ('IMPORT','SHIPPED','Embarcado',50,false,false),
  ('IMPORT','IN_TRANSIT','En tránsito',60,false,false),
  ('IMPORT','RECEIVED_PERU','Recibido en Perú',70,false,false),
  ('IMPORT','STOCKED','Ingresado a stock',90,false,true),
  ('IMPORT','CANCELLED','Cancelado',91,false,true),

  ('IMPORT_BOX','REGISTERED','Registrada',10,true,false),
  ('IMPORT_BOX','FOREIGN_WAREHOUSE','Almacén extranjero',20,false,false),
  ('IMPORT_BOX','DISPATCH_CONFIRMED','Confirmación de despacho',30,false,false),
  ('IMPORT_BOX','SHIPPED','Embarcada',40,false,false),
  ('IMPORT_BOX','IN_TRANSIT','En tránsito',50,false,false),
  ('IMPORT_BOX','RECEIVED_PERU','Recibida en Perú',60,false,false),
  ('IMPORT_BOX','STOCKED','Ingresada a stock',90,false,true),
  ('IMPORT_BOX','CANCELLED','Cancelada',91,false,true),

  ('FINANCIAL_TRANSACTION','DRAFT','Borrador',10,true,false),
  ('FINANCIAL_TRANSACTION','POSTED','Publicada',20,false,false),
  ('FINANCIAL_TRANSACTION','REVERSED','Revertida',90,false,true),
  ('FINANCIAL_TRANSACTION','CANCELLED','Cancelada',91,false,true)
on conflict (workflow_code, state_code) do update set
  label = excluded.label,
  sort_order = excluded.sort_order,
  is_initial = excluded.is_initial,
  is_terminal = excluded.is_terminal,
  is_active = true;

-- Transiciones. Requieren motivo cuando la operación es destructiva o compensatoria.
insert into public.workflow_transitions(
  workflow_code, from_state_code, to_state_code, requires_confirmation, requires_reason
)
values
  ('SALE_COMMERCIAL','DRAFT','PENDING_CONFIRMATION',false,false),
  ('SALE_COMMERCIAL','DRAFT','RESERVED',true,false),
  ('SALE_COMMERCIAL','DRAFT','CANCELLED',true,true),
  ('SALE_COMMERCIAL','PENDING_CONFIRMATION','RESERVED',true,false),
  ('SALE_COMMERCIAL','PENDING_CONFIRMATION','CANCELLED',true,true),
  ('SALE_COMMERCIAL','RESERVED','ACTIVE',false,false),
  ('SALE_COMMERCIAL','RESERVED','COMPLETED',true,false),
  ('SALE_COMMERCIAL','RESERVED','CANCELLED',true,true),
  ('SALE_COMMERCIAL','RESERVED','ANNULLED',true,true),
  ('SALE_COMMERCIAL','ACTIVE','COMPLETED',true,false),
  ('SALE_COMMERCIAL','ACTIVE','CANCELLED',true,true),
  ('SALE_COMMERCIAL','ACTIVE','ANNULLED',true,true),

  ('SALE_PAYMENT','UNPAID','PARTIAL',false,false),
  ('SALE_PAYMENT','UNPAID','PAID',false,false),
  ('SALE_PAYMENT','UNPAID','OVERDUE',false,false),
  ('SALE_PAYMENT','PARTIAL','PAID',false,false),
  ('SALE_PAYMENT','PARTIAL','OVERDUE',false,false),
  ('SALE_PAYMENT','PARTIAL','UNPAID',true,true),
  ('SALE_PAYMENT','PAID','PARTIAL',true,true),
  ('SALE_PAYMENT','PAID','OVERDUE',true,true),
  ('SALE_PAYMENT','PAID','UNPAID',true,true),
  ('SALE_PAYMENT','PAID','REFUNDED',true,true),
  ('SALE_PAYMENT','OVERDUE','PARTIAL',false,false),
  ('SALE_PAYMENT','OVERDUE','PAID',false,false),
  ('SALE_PAYMENT','OVERDUE','UNPAID',true,true),
  ('SALE_PAYMENT','REFUNDED','UNPAID',true,true),
  ('SALE_PAYMENT','REFUNDED','PARTIAL',true,true),

  ('SALE_DELIVERY','PENDING','ACCUMULATED',false,false),
  ('SALE_DELIVERY','PENDING','PARTIAL',false,false),
  ('SALE_DELIVERY','PENDING','DELIVERED',false,false),
  ('SALE_DELIVERY','PENDING','CANCELLED',true,true),
  ('SALE_DELIVERY','ACCUMULATED','PARTIAL',false,false),
  ('SALE_DELIVERY','ACCUMULATED','DELIVERED',false,false),
  ('SALE_DELIVERY','ACCUMULATED','CANCELLED',true,true),
  ('SALE_DELIVERY','PARTIAL','DELIVERED',false,false),
  ('SALE_DELIVERY','PARTIAL','ACCUMULATED',false,false),
  ('SALE_DELIVERY','PARTIAL','CANCELLED',true,true),

  ('PAYMENT','PENDING','CONFIRMED',true,false),
  ('PAYMENT','PENDING','REJECTED',true,true),
  ('PAYMENT','CONFIRMED','REVERSED',true,true),

  ('RECEIPT','PENDING','ISSUED',false,false),
  ('RECEIPT','PENDING','HISTORICAL_WITHOUT_RECEIPT',true,true),
  ('RECEIPT','ISSUED','ANNULLED',true,true),
  ('RECEIPT','ANNULLED','CREDIT_NOTE',false,false),

  ('RELEASE_REQUEST','REQUESTED','APPROVED',true,false),
  ('RELEASE_REQUEST','REQUESTED','REJECTED',true,true),
  ('RELEASE_REQUEST','REQUESTED','CANCELLED',true,true),
  ('RELEASE_REQUEST','APPROVED','EXECUTED',true,false),
  ('RELEASE_REQUEST','APPROVED','CANCELLED',true,true),

  ('REFUND','PENDING','APPROVED',true,false),
  ('REFUND','PENDING','REJECTED',true,true),
  ('REFUND','PENDING','CANCELLED',true,true),
  ('REFUND','APPROVED','PROCESSED',true,false),
  ('REFUND','APPROVED','CANCELLED',true,true),

  ('RETURN_CASE','OPEN','UNDER_REVIEW',false,false),
  ('RETURN_CASE','OPEN','CANCELLED',true,true),
  ('RETURN_CASE','UNDER_REVIEW','APPROVED',true,false),
  ('RETURN_CASE','UNDER_REVIEW','REJECTED',true,true),
  ('RETURN_CASE','APPROVED','COMPLETED',true,false),
  ('RETURN_CASE','APPROVED','CANCELLED',true,true),

  ('DELIVERY','PENDING_INSTRUCTIONS','ACCUMULATED',false,false),
  ('DELIVERY','PENDING_INSTRUCTIONS','PENDING_AGENCY_DISPATCH',false,false),
  ('DELIVERY','PENDING_INSTRUCTIONS','OUT_FOR_DELIVERY',false,false),
  ('DELIVERY','PENDING_INSTRUCTIONS','DELIVERED_TO_CLIENT',false,false),
  ('DELIVERY','PENDING_INSTRUCTIONS','CANCELLED',true,true),
  ('DELIVERY','ACCUMULATED','PENDING_AGENCY_DISPATCH',false,false),
  ('DELIVERY','ACCUMULATED','OUT_FOR_DELIVERY',false,false),
  ('DELIVERY','ACCUMULATED','DELIVERED_TO_CLIENT',false,false),
  ('DELIVERY','ACCUMULATED','CANCELLED',true,true),
  ('DELIVERY','PENDING_AGENCY_DISPATCH','DELIVERED_TO_AGENCY',false,false),
  ('DELIVERY','PENDING_AGENCY_DISPATCH','CANCELLED',true,true),
  ('DELIVERY','DELIVERED_TO_AGENCY','DELIVERED_TO_CLIENT',false,false),
  ('DELIVERY','DELIVERED_TO_AGENCY','PARTIALLY_DELIVERED',false,false),
  ('DELIVERY','OUT_FOR_DELIVERY','DELIVERED_TO_CLIENT',false,false),
  ('DELIVERY','OUT_FOR_DELIVERY','PARTIALLY_DELIVERED',false,false),
  ('DELIVERY','PARTIALLY_DELIVERED','DELIVERED_TO_CLIENT',false,false),

  ('IMPORT','QUOTATION','PURCHASE_CONFIRMED',true,false),
  ('IMPORT','QUOTATION','CANCELLED',true,true),
  ('IMPORT','PURCHASE_CONFIRMED','FOREIGN_WAREHOUSE',false,false),
  ('IMPORT','PURCHASE_CONFIRMED','CANCELLED',true,true),
  ('IMPORT','FOREIGN_WAREHOUSE','DISPATCH_CONFIRMED',false,false),
  ('IMPORT','FOREIGN_WAREHOUSE','CANCELLED',true,true),
  ('IMPORT','DISPATCH_CONFIRMED','SHIPPED',false,false),
  ('IMPORT','DISPATCH_CONFIRMED','CANCELLED',true,true),
  ('IMPORT','SHIPPED','IN_TRANSIT',false,false),
  ('IMPORT','IN_TRANSIT','RECEIVED_PERU',false,false),
  ('IMPORT','RECEIVED_PERU','STOCKED',true,false),

  ('IMPORT_BOX','REGISTERED','FOREIGN_WAREHOUSE',false,false),
  ('IMPORT_BOX','REGISTERED','CANCELLED',true,true),
  ('IMPORT_BOX','FOREIGN_WAREHOUSE','DISPATCH_CONFIRMED',false,false),
  ('IMPORT_BOX','FOREIGN_WAREHOUSE','CANCELLED',true,true),
  ('IMPORT_BOX','DISPATCH_CONFIRMED','SHIPPED',false,false),
  ('IMPORT_BOX','DISPATCH_CONFIRMED','CANCELLED',true,true),
  ('IMPORT_BOX','SHIPPED','IN_TRANSIT',false,false),
  ('IMPORT_BOX','IN_TRANSIT','RECEIVED_PERU',false,false),
  ('IMPORT_BOX','RECEIVED_PERU','STOCKED',true,false),

  ('FINANCIAL_TRANSACTION','DRAFT','POSTED',true,false),
  ('FINANCIAL_TRANSACTION','DRAFT','CANCELLED',true,true),
  ('FINANCIAL_TRANSACTION','POSTED','REVERSED',true,true)
on conflict (workflow_code, from_state_code, to_state_code) do update set
  requires_confirmation = excluded.requires_confirmation,
  requires_reason = excluded.requires_reason,
  is_active = true;

-- Tipos de notificación.
insert into public.notification_types(code, name, default_priority, default_channels, description)
values
  ('PAYMENT_DUE_SOON', 'Pago próximo a vencer', 'HIGH', array['IN_APP','PUSH'], 'Aviso anticipado del vencimiento de una venta.'),
  ('PAYMENT_OVERDUE', 'Pago vencido', 'CRITICAL', array['IN_APP','PUSH'], 'Venta con saldo posterior al vencimiento.'),
  ('STOCK_LOW', 'Stock bajo', 'HIGH', array['IN_APP','PUSH'], 'La disponibilidad alcanzó el mínimo configurado.'),
  ('IMPORT_ARRIVAL_SOON', 'Importación próxima a llegar', 'NORMAL', array['IN_APP','PUSH'], 'Fecha estimada próxima.'),
  ('IMPORT_DELAYED', 'Importación retrasada', 'HIGH', array['IN_APP','PUSH'], 'La importación superó la fecha estimada.'),
  ('MERCHANDISE_RECEIVED', 'Ingreso de mercadería', 'HIGH', array['IN_APP','PUSH'], 'Mercadería recibida o ingresada a stock.'),
  ('CARD_PAYMENT_DUE', 'Pago de tarjeta', 'HIGH', array['IN_APP','PUSH'], 'Obligación de tarjeta próxima a vencer.'),
  ('SUNAT_PAYMENT_DUE', 'Pago a SUNAT', 'HIGH', array['IN_APP','PUSH'], 'Obligación tributaria próxima a vencer.'),
  ('DISPATCH_PENDING', 'Despacho pendiente', 'HIGH', array['IN_APP','PUSH'], 'Entrega programada para el próximo día de despacho.'),
  ('RECEIPT_PENDING', 'Boleta pendiente', 'HIGH', array['IN_APP'], 'Pago confirmado sin boleta registrada.'),
  ('SALE_CONFIRMED', 'Venta confirmada', 'NORMAL', array['IN_APP'], 'Venta confirmada y stock reservado.'),
  ('PAYMENT_CONFIRMED', 'Pago confirmado', 'NORMAL', array['IN_APP'], 'Ingreso financiero generado por un pago.'),
  ('PAYMENT_REVERSED', 'Pago revertido', 'CRITICAL', array['IN_APP','PUSH'], 'Pago y movimiento financiero revertidos.'),
  ('WEEKLY_SUMMARY', 'Resumen semanal', 'NORMAL', array['EMAIL'], 'Reporte semanal configurable.')
on conflict (code) do update set
  name = excluded.name,
  default_priority = excluded.default_priority,
  default_channels = excluded.default_channels,
  description = excluded.description,
  is_active = true;

commit;


-- =========================================================
-- 011_catalog_products_api.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 011: RPC atómico de productos, vista de catálogo y permisos

begin;

create or replace view public.v_product_catalog
with (security_invoker = true)
as
select
  p.id as product_id,
  p.code as product_code,
  p.name as product_name,
  p.character_name,
  p.description,
  p.has_variants,
  p.is_active as product_is_active,
  p.version as product_version,
  p.created_at,
  p.updated_at,
  pc.id as category_id,
  pc.code as category_code,
  pc.name as category_name,
  f.id as franchise_id,
  f.code as franchise_code,
  f.name as franchise_name,
  b.id as brand_id,
  b.code as brand_code,
  b.name as brand_name,
  pl.id as product_line_id,
  pl.code as product_line_code,
  pl.name as product_line_name,
  pv.id as variant_id,
  pv.sku,
  pv.variant_name,
  pv.sale_price,
  pv.currency_code,
  pv.minimum_stock,
  pv.barcode,
  pv.qr_payload,
  pv.is_active as variant_is_active,
  pv.version as variant_version,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'AVAILABLE'), 0)::integer as available_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'RESERVED'), 0)::integer as reserved_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'ACCUMULATED'), 0)::integer as accumulated_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'DAMAGED'), 0)::integer as damaged_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'LOST'), 0)::integer as lost_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'IN_TRANSIT'), 0)::integer as in_transit_quantity,
  coalesce(sum(ib.quantity) filter (where ib.bucket_code = 'PREORDER_EXPECTED'), 0)::integer as preorder_expected_quantity
from public.products p
join public.product_categories pc on pc.id = p.category_id
left join public.franchises f on f.id = p.franchise_id
left join public.brands b on b.id = p.brand_id
left join public.product_lines pl on pl.id = p.product_line_id
join public.product_variants pv on pv.product_id = p.id
left join public.inventory_balances ib on ib.variant_id = pv.id
left join public.warehouses w on w.id = ib.warehouse_id and w.is_active = true
group by
  p.id, pc.id, f.id, b.id, pl.id, pv.id;

create or replace function public.create_product_bundle(
  p_payload jsonb,
  p_idempotency_key text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_product_id uuid;
  v_product_code text;
  v_product_line_brand_id uuid;
  v_variants jsonb;
  v_variant jsonb;
  v_variant_id uuid;
  v_variant_sku text;
  v_variant_result jsonb := '[]'::jsonb;
  v_attribute jsonb;
  v_attribute_type text;
  v_stock jsonb;
  v_lot_id uuid;
  v_lines jsonb := '[]'::jsonb;
  v_inventory_movement_id uuid;
  v_response jsonb;
  v_existing jsonb;
  v_existing_hash text;
  v_quantity integer;
  v_original_currency char(3);
  v_original_cost numeric(14,4);
  v_exchange_rate numeric(14,6);
  v_final_cost numeric(14,4);
  v_has_variants boolean;
  v_variant_count integer;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  v_actor := private.current_actor_id();

  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'El producto debe enviarse como un objeto JSON.';
  end if;

  if nullif(btrim(p_payload->>'name'), '') is null then
    raise exception 'El nombre del producto es obligatorio.';
  end if;

  if nullif(p_payload->>'category_id', '') is null then
    raise exception 'La categoría del producto es obligatoria.';
  end if;

  perform 1
  from public.product_categories
  where id = (p_payload->>'category_id')::uuid
    and is_active = true;
  if not found then
    raise exception 'La categoría seleccionada no existe o está inactiva.';
  end if;

  if nullif(p_payload->>'franchise_id', '') is not null then
    perform 1 from public.franchises
    where id = (p_payload->>'franchise_id')::uuid and is_active = true;
    if not found then
      raise exception 'La franquicia seleccionada no existe o está inactiva.';
    end if;
  end if;

  if nullif(p_payload->>'brand_id', '') is not null then
    perform 1 from public.brands
    where id = (p_payload->>'brand_id')::uuid and is_active = true;
    if not found then
      raise exception 'La marca seleccionada no existe o está inactiva.';
    end if;
  end if;

  if nullif(p_payload->>'product_line_id', '') is not null then
    select brand_id into v_product_line_brand_id
    from public.product_lines
    where id = (p_payload->>'product_line_id')::uuid and is_active = true;

    if not found then
      raise exception 'La línea seleccionada no existe o está inactiva.';
    end if;

    if v_product_line_brand_id is not null
      and v_product_line_brand_id is distinct from nullif(p_payload->>'brand_id', '')::uuid then
      raise exception 'La línea seleccionada no pertenece a la marca indicada.';
    end if;
  end if;

  v_variants := coalesce(p_payload->'variants', '[]'::jsonb);
  if jsonb_typeof(v_variants) <> 'array' or jsonb_array_length(v_variants) = 0 then
    raise exception 'Debe registrar al menos una variante, incluso para un producto estándar.';
  end if;

  v_variant_count := jsonb_array_length(v_variants);
  v_has_variants := v_variant_count > 1
    or lower(coalesce(v_variants->0->>'variant_name', 'estándar')) not in ('estándar', 'estandar', 'standard');

  if p_idempotency_key is not null then
    perform pg_catalog.pg_advisory_xact_lock(
      pg_catalog.hashtextextended('CREATE_PRODUCT:' || p_idempotency_key, 0)
    );

    select response_payload, request_hash into v_existing, v_existing_hash
    from public.idempotency_keys
    where scope = 'CREATE_PRODUCT'
      and idempotency_key = p_idempotency_key
      and status = 'COMPLETED';

    if v_existing is not null then
      if v_existing_hash is distinct from pg_catalog.md5(p_payload::text) then
        raise exception 'La clave de idempotencia ya fue utilizada con otros datos.';
      end if;
      return v_existing;
    end if;

    insert into public.idempotency_keys(
      scope, idempotency_key, actor_user_id, request_hash, status, expires_at
    ) values (
      'CREATE_PRODUCT', p_idempotency_key, v_actor,
      pg_catalog.md5(p_payload::text), 'IN_PROGRESS', now() + interval '24 hours'
    )
    on conflict (scope, idempotency_key) do update set
      actor_user_id = excluded.actor_user_id,
      request_hash = excluded.request_hash,
      status = 'IN_PROGRESS',
      locked_at = now(),
      expires_at = excluded.expires_at;
  end if;

  v_product_code := public.next_business_code('PRODUCT');

  insert into public.products(
    code,
    name,
    franchise_id,
    character_name,
    category_id,
    brand_id,
    product_line_id,
    description,
    has_variants,
    is_active,
    created_by,
    updated_by
  ) values (
    v_product_code,
    btrim(p_payload->>'name'),
    nullif(p_payload->>'franchise_id', '')::uuid,
    nullif(btrim(p_payload->>'character_name'), ''),
    (p_payload->>'category_id')::uuid,
    nullif(p_payload->>'brand_id', '')::uuid,
    nullif(p_payload->>'product_line_id', '')::uuid,
    nullif(btrim(p_payload->>'description'), ''),
    v_has_variants,
    coalesce((p_payload->>'is_active')::boolean, true),
    v_actor,
    v_actor
  ) returning id into v_product_id;

  for v_variant in
    select value from jsonb_array_elements(v_variants)
  loop
    if coalesce((v_variant->>'sale_price')::numeric, 0) < 0 then
      raise exception 'El precio de venta no puede ser negativo.';
    end if;

    if coalesce((v_variant->>'minimum_stock')::integer, 0) < 0 then
      raise exception 'El stock mínimo no puede ser negativo.';
    end if;

    v_variant_sku := public.next_business_code('PRODUCT_VARIANT');

    insert into public.product_variants(
      product_id,
      sku,
      variant_name,
      barcode,
      qr_payload,
      sale_price,
      currency_code,
      minimum_stock,
      weight_grams,
      dimensions,
      is_active,
      created_by,
      updated_by
    ) values (
      v_product_id,
      v_variant_sku,
      coalesce(nullif(btrim(v_variant->>'variant_name'), ''), 'Estándar'),
      nullif(btrim(v_variant->>'barcode'), ''),
      coalesce(nullif(btrim(v_variant->>'qr_payload'), ''), v_variant_sku),
      coalesce((v_variant->>'sale_price')::numeric, 0),
      coalesce(nullif(v_variant->>'currency_code', ''), 'PEN')::char(3),
      coalesce((v_variant->>'minimum_stock')::integer, 0),
      nullif(v_variant->>'weight_grams', '')::numeric,
      coalesce(v_variant->'dimensions', '{}'::jsonb),
      coalesce((v_variant->>'is_active')::boolean, true),
      v_actor,
      v_actor
    ) returning id into v_variant_id;

    for v_attribute in
      select value from jsonb_array_elements(coalesce(v_variant->'attributes', '[]'::jsonb))
    loop
      select data_type into v_attribute_type
      from public.product_attribute_definitions
      where id = (v_attribute->>'attribute_id')::uuid
        and is_active = true;
      if not found then
        raise exception 'Se indicó un atributo inexistente o inactivo.';
      end if;

      if v_attribute_type in ('TEXT', 'COLOR') and nullif(v_attribute->>'value_text', '') is null then
        raise exception 'El atributo de texto o color requiere value_text.';
      elsif v_attribute_type = 'NUMBER' and nullif(v_attribute->>'value_number', '') is null then
        raise exception 'El atributo numérico requiere value_number.';
      elsif v_attribute_type = 'BOOLEAN' and nullif(v_attribute->>'value_boolean', '') is null then
        raise exception 'El atributo booleano requiere value_boolean.';
      elsif v_attribute_type = 'DATE' and nullif(v_attribute->>'value_date', '') is null then
        raise exception 'El atributo de fecha requiere value_date.';
      end if;

      insert into public.product_variant_attribute_values(
        variant_id,
        attribute_id,
        value_text,
        value_number,
        value_boolean,
        value_date
      ) values (
        v_variant_id,
        (v_attribute->>'attribute_id')::uuid,
        nullif(v_attribute->>'value_text', ''),
        nullif(v_attribute->>'value_number', '')::numeric,
        nullif(v_attribute->>'value_boolean', '')::boolean,
        nullif(v_attribute->>'value_date', '')::date
      );
    end loop;

    for v_stock in
      select value from jsonb_array_elements(coalesce(v_variant->'initial_stock', '[]'::jsonb))
    loop
      v_quantity := coalesce((v_stock->>'quantity')::integer, 0);
      if v_quantity < 0 then
        raise exception 'La cantidad inicial no puede ser negativa.';
      end if;

      if v_quantity = 0 then
        continue;
      end if;

      perform 1
      from public.warehouses
      where id = (v_stock->>'warehouse_id')::uuid
        and warehouse_type = 'OPERATIONAL'
        and is_active = true;
      if not found then
        raise exception 'El almacén del stock inicial no existe o no es operativo.';
      end if;

      v_original_currency := coalesce(nullif(v_stock->>'original_currency_code', ''), 'PEN')::char(3);
      v_original_cost := coalesce((v_stock->>'original_unit_cost')::numeric, 0);
      v_exchange_rate := coalesce((v_stock->>'exchange_rate_to_pen')::numeric, 1);

      if v_original_cost < 0 or v_exchange_rate <= 0 then
        raise exception 'El costo y el tipo de cambio del stock inicial no son válidos.';
      end if;

      v_final_cost := round(v_original_cost * v_exchange_rate, 4);

      insert into public.inventory_lots(
        lot_code,
        variant_id,
        source_type,
        source_id,
        status,
        original_currency_code,
        original_unit_cost,
        exchange_rate_to_pen,
        final_unit_cost_pen,
        expected_quantity,
        received_quantity,
        acquired_at,
        received_at,
        notes,
        created_by,
        updated_by
      ) values (
        public.next_business_code('INVENTORY_LOT'),
        v_variant_id,
        'INITIAL_STOCK',
        v_product_id,
        'ACTIVE',
        v_original_currency,
        v_original_cost,
        v_exchange_rate,
        v_final_cost,
        v_quantity,
        v_quantity,
        now(),
        now(),
        'Stock inicial registrado al crear el producto.',
        v_actor,
        v_actor
      ) returning id into v_lot_id;

      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'variant_id', v_variant_id,
        'lot_id', v_lot_id,
        'warehouse_id', (v_stock->>'warehouse_id')::uuid,
        'bucket_code', 'AVAILABLE',
        'quantity_delta', v_quantity,
        'unit_cost_pen', v_final_cost
      ));
    end loop;

    v_variant_result := v_variant_result || jsonb_build_array(jsonb_build_object(
      'id', v_variant_id,
      'sku', v_variant_sku,
      'variantName', coalesce(nullif(btrim(v_variant->>'variant_name'), ''), 'Estándar')
    ));
  end loop;

  if jsonb_array_length(v_lines) > 0 then
    v_inventory_movement_id := public.create_inventory_movement(
      'INITIAL_STOCK',
      'PRODUCT',
      v_product_id,
      'Carga inicial al crear el producto.',
      v_lines,
      case when p_idempotency_key is null then null else p_idempotency_key || ':inventory' end,
      null,
      jsonb_build_object('source', 'CREATE_PRODUCT_BUNDLE')
    );
  end if;

  v_response := jsonb_build_object(
    'productId', v_product_id,
    'productCode', v_product_code,
    'variants', v_variant_result,
    'inventoryMovementId', v_inventory_movement_id
  );

  if p_idempotency_key is not null then
    update public.idempotency_keys
    set status = 'COMPLETED',
        resource_type = 'PRODUCT',
        resource_id = v_product_id,
        response_payload = v_response,
        completed_at = now()
    where scope = 'CREATE_PRODUCT'
      and idempotency_key = p_idempotency_key;
  end if;

  return v_response;
end;
$$;

revoke execute on function public.create_product_bundle(jsonb, text) from public, anon;
grant execute on function public.create_product_bundle(jsonb, text) to authenticated, service_role;

grant select on public.v_product_catalog to authenticated, service_role;

commit;


-- =========================================================
-- 012_add_product_attribute_description.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 012: agrega descripción a las definiciones de atributos de producto
-- Corrige la incompatibilidad entre el esquema y el repositorio de catálogos.

begin;

alter table public.product_attribute_definitions
  add column if not exists description text;

comment on column public.product_attribute_definitions.description is
  'Descripción opcional del atributo para formularios, ayudas y mantenimiento del catálogo.';

commit;

-- Fuerza a PostgREST/Supabase a refrescar la caché del esquema.
notify pgrst, 'reload schema';


-- =========================================================
-- 013_clients_vip_api.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 013: operaciones atómicas del módulo de clientes y VIP

begin;

create index if not exists ix_clients_email_active
  on public.clients(email)
  where email is not null and is_active = true;

create index if not exists ix_client_addresses_client_active
  on public.client_addresses(client_id, is_active, is_default desc);

create index if not exists ix_client_incidents_unresolved
  on public.client_incidents(client_id, severity, occurred_at desc)
  where resolved_at is null;

create or replace function public.create_client_v1(
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_client public.clients%rowtype;
  v_address jsonb := p_input -> 'address';
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'La clave de idempotencia es obligatoria.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('CREATE_CLIENT:' || p_idempotency_key, 0)
  );

  select response_payload
    into v_result
  from public.idempotency_keys
  where scope = 'CREATE_CLIENT'
    and idempotency_key = p_idempotency_key
    and status = 'COMPLETED';

  if v_result is not null then
    return v_result;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('CREATE_CLIENT', p_idempotency_key, v_actor)
  on conflict (scope, idempotency_key) do nothing;

  insert into public.clients(
    code,
    full_name,
    document_type,
    document_number,
    phone,
    secondary_phone,
    email,
    notes,
    created_by,
    updated_by
  ) values (
    null,
    btrim(p_input ->> 'fullName'),
    nullif(btrim(p_input ->> 'documentType'), ''),
    nullif(btrim(p_input ->> 'documentNumber'), ''),
    nullif(btrim(p_input ->> 'phone'), ''),
    nullif(btrim(p_input ->> 'secondaryPhone'), ''),
    nullif(btrim(p_input ->> 'email'), '')::extensions.citext,
    nullif(btrim(p_input ->> 'notes'), ''),
    v_actor,
    v_actor
  ) returning * into v_client;

  if v_address is not null and jsonb_typeof(v_address) = 'object' then
    insert into public.client_addresses(
      client_id,
      label,
      address_line,
      district,
      province,
      department,
      reference,
      preferred_partner_id,
      is_default,
      created_by,
      updated_by
    ) values (
      v_client.id,
      coalesce(nullif(btrim(v_address ->> 'label'), ''), 'Principal'),
      btrim(v_address ->> 'addressLine'),
      nullif(btrim(v_address ->> 'district'), ''),
      nullif(btrim(v_address ->> 'province'), ''),
      nullif(btrim(v_address ->> 'department'), ''),
      nullif(btrim(v_address ->> 'reference'), ''),
      nullif(v_address ->> 'preferredPartnerId', '')::uuid,
      coalesce((v_address ->> 'isDefault')::boolean, true),
      v_actor,
      v_actor
    );
  end if;

  v_result := jsonb_build_object(
    'id', v_client.id,
    'code', v_client.code,
    'version', v_client.version
  );

  update public.idempotency_keys
  set status = 'COMPLETED',
      resource_type = 'CLIENT',
      resource_id = v_client.id,
      response_payload = v_result,
      completed_at = now(),
      expires_at = now() + interval '7 days'
  where scope = 'CREATE_CLIENT'
    and idempotency_key = p_idempotency_key;

  return v_result;
end;
$$;

create or replace function public.update_client_v1(
  p_client_id uuid,
  p_expected_version bigint,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_client public.clients%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  perform set_config('app.audit_reason', 'Actualización de datos del cliente', true);

  update public.clients
  set full_name = btrim(p_input ->> 'fullName'),
      document_type = nullif(btrim(p_input ->> 'documentType'), ''),
      document_number = nullif(btrim(p_input ->> 'documentNumber'), ''),
      phone = nullif(btrim(p_input ->> 'phone'), ''),
      secondary_phone = nullif(btrim(p_input ->> 'secondaryPhone'), ''),
      email = nullif(btrim(p_input ->> 'email'), '')::extensions.citext,
      notes = nullif(btrim(p_input ->> 'notes'), ''),
      updated_by = v_actor
  where id = p_client_id
    and version = p_expected_version
  returning * into v_client;

  if not found then
    if exists(select 1 from public.clients where id = p_client_id) then
      raise exception 'El cliente fue modificado por otra administradora.' using errcode = '40001';
    end if;
    raise exception 'Cliente no encontrado.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('id', v_client.id, 'code', v_client.code, 'version', v_client.version);
end;
$$;

create or replace function public.set_client_status_v1(
  p_client_id uuid,
  p_expected_version bigint,
  p_is_active boolean,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_client public.clients%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if nullif(btrim(p_reason), '') is null then
    raise exception 'El motivo es obligatorio.';
  end if;

  perform set_config('app.audit_reason', btrim(p_reason), true);

  update public.clients
  set is_active = p_is_active,
      updated_by = v_actor
  where id = p_client_id
    and version = p_expected_version
  returning * into v_client;

  if not found then
    raise exception 'El cliente fue modificado o no existe.' using errcode = '40001';
  end if;

  return jsonb_build_object('id', v_client.id, 'isActive', v_client.is_active, 'version', v_client.version);
end;
$$;

create or replace function public.set_client_vip_v1(
  p_client_id uuid,
  p_expected_client_version bigint,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_client public.clients%rowtype;
  v_existing_profile public.client_vip_profiles%rowtype;
  v_profile public.client_vip_profiles%rowtype;
  v_previous jsonb;
  v_new jsonb;
  v_is_vip boolean := coalesce((p_input ->> 'isVip')::boolean, false);
  v_reason text := nullif(btrim(p_input ->> 'reason'), '');
  v_action text;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if v_reason is null then
    raise exception 'El motivo de la condición VIP es obligatorio.';
  end if;

  select * into v_client
  from public.clients
  where id = p_client_id
  for update;

  if not found then
    raise exception 'Cliente no encontrado.' using errcode = 'P0002';
  end if;
  if v_client.version <> p_expected_client_version then
    raise exception 'El cliente fue modificado por otra administradora.' using errcode = '40001';
  end if;

  select * into v_existing_profile
  from public.client_vip_profiles
  where client_id = p_client_id;

  v_previous := jsonb_build_object(
    'isVip', v_client.is_vip,
    'canReserveWithoutDeposit', v_existing_profile.can_reserve_without_deposit,
    'separationLimitAmount', v_existing_profile.separation_limit_amount,
    'separationLimitCurrency', v_existing_profile.separation_limit_currency,
    'paymentTermDays', v_existing_profile.payment_term_days,
    'validUntil', v_existing_profile.valid_until
  );

  perform set_config('app.audit_reason', v_reason, true);

  update public.clients
  set is_vip = v_is_vip,
      updated_by = v_actor
  where id = p_client_id
  returning * into v_client;

  if v_is_vip then
    insert into public.client_vip_profiles(
      client_id,
      can_reserve_without_deposit,
      separation_limit_amount,
      separation_limit_currency,
      payment_term_days,
      valid_from,
      valid_until,
      granted_reason,
      granted_by,
      updated_by
    ) values (
      p_client_id,
      coalesce((p_input ->> 'canReserveWithoutDeposit')::boolean, false),
      nullif(p_input ->> 'separationLimitAmount', '')::numeric,
      coalesce(nullif(p_input ->> 'separationLimitCurrency', ''), 'PEN'),
      nullif(p_input ->> 'paymentTermDays', '')::integer,
      now(),
      nullif(p_input ->> 'validUntil', '')::timestamptz,
      v_reason,
      v_actor,
      v_actor
    )
    on conflict (client_id) do update
    set can_reserve_without_deposit = excluded.can_reserve_without_deposit,
        separation_limit_amount = excluded.separation_limit_amount,
        separation_limit_currency = excluded.separation_limit_currency,
        payment_term_days = excluded.payment_term_days,
        valid_until = excluded.valid_until,
        granted_reason = excluded.granted_reason,
        granted_by = excluded.granted_by,
        updated_by = excluded.updated_by
    returning * into v_profile;

    v_action := case when v_previous ->> 'isVip' = 'true' then 'UPDATED' else 'GRANTED' end;
  else
    update public.client_vip_profiles
    set can_reserve_without_deposit = false,
        valid_until = now(),
        updated_by = v_actor
    where client_id = p_client_id
    returning * into v_profile;

    v_action := 'REVOKED';
  end if;

  v_new := jsonb_build_object(
    'isVip', v_client.is_vip,
    'canReserveWithoutDeposit', v_profile.can_reserve_without_deposit,
    'separationLimitAmount', v_profile.separation_limit_amount,
    'separationLimitCurrency', v_profile.separation_limit_currency,
    'paymentTermDays', v_profile.payment_term_days,
    'validUntil', v_profile.valid_until
  );

  insert into public.client_vip_history(
    client_id, action, previous_values, new_values, reason, performed_by
  ) values (
    p_client_id, v_action, v_previous, v_new, v_reason, v_actor
  );

  return jsonb_build_object(
    'id', v_client.id,
    'isVip', v_client.is_vip,
    'version', v_client.version,
    'vipProfileVersion', v_profile.version
  );
end;
$$;

create or replace function public.save_client_address_v1(
  p_client_id uuid,
  p_address_id uuid,
  p_expected_version bigint,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_address public.client_addresses%rowtype;
  v_default_address_id uuid;
  v_is_active boolean := coalesce((p_input ->> 'isActive')::boolean, true);
  v_is_default boolean := coalesce((p_input ->> 'isDefault')::boolean, false);
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if not exists(select 1 from public.clients where id = p_client_id) then
    raise exception 'Cliente no encontrado.' using errcode = 'P0002';
  end if;

  if not v_is_active then
    v_is_default := false;
  end if;

  if v_is_default then
    update public.client_addresses
    set is_default = false,
        updated_by = v_actor
    where client_id = p_client_id
      and is_default = true
      and is_active = true
      and (p_address_id is null or id <> p_address_id);
  end if;

  if p_address_id is null then
    insert into public.client_addresses(
      client_id, label, address_line, district, province, department, reference,
      preferred_partner_id, is_default, is_active, created_by, updated_by
    ) values (
      p_client_id,
      coalesce(nullif(btrim(p_input ->> 'label'), ''), 'Principal'),
      btrim(p_input ->> 'addressLine'),
      nullif(btrim(p_input ->> 'district'), ''),
      nullif(btrim(p_input ->> 'province'), ''),
      nullif(btrim(p_input ->> 'department'), ''),
      nullif(btrim(p_input ->> 'reference'), ''),
      nullif(p_input ->> 'preferredPartnerId', '')::uuid,
      v_is_default,
      v_is_active,
      v_actor,
      v_actor
    ) returning * into v_address;
  else
    update public.client_addresses
    set label = coalesce(nullif(btrim(p_input ->> 'label'), ''), 'Principal'),
        address_line = btrim(p_input ->> 'addressLine'),
        district = nullif(btrim(p_input ->> 'district'), ''),
        province = nullif(btrim(p_input ->> 'province'), ''),
        department = nullif(btrim(p_input ->> 'department'), ''),
        reference = nullif(btrim(p_input ->> 'reference'), ''),
        preferred_partner_id = nullif(p_input ->> 'preferredPartnerId', '')::uuid,
        is_default = v_is_default,
        is_active = v_is_active,
        updated_by = v_actor
    where id = p_address_id
      and client_id = p_client_id
      and version = p_expected_version
    returning * into v_address;

    if not found then
      raise exception 'La dirección fue modificada o no existe.' using errcode = '40001';
    end if;
  end if;

  if not exists (
    select 1 from public.client_addresses
    where client_id = p_client_id and is_default = true and is_active = true
  ) then
    select id into v_default_address_id
    from public.client_addresses
    where client_id = p_client_id and is_active = true
    order by case when id = v_address.id then 0 else 1 end, created_at
    limit 1;

    if v_default_address_id is not null then
      update public.client_addresses
      set is_default = true,
          updated_by = v_actor
      where id = v_default_address_id;

      if v_default_address_id = v_address.id then
        select * into v_address from public.client_addresses where id = v_address.id;
      end if;
    end if;
  end if;

  return jsonb_build_object('id', v_address.id, 'version', v_address.version);
end;
$$;

create or replace function public.create_client_incident_v1(
  p_client_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_incident public.client_incidents%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  insert into public.client_incidents(
    client_id, incident_type, severity, sale_id, description, amount,
    currency_code, occurred_at, created_by
  ) values (
    p_client_id,
    p_input ->> 'incidentType',
    coalesce(nullif(p_input ->> 'severity', ''), 'MEDIUM'),
    nullif(p_input ->> 'saleId', '')::uuid,
    btrim(p_input ->> 'description'),
    nullif(p_input ->> 'amount', '')::numeric,
    nullif(p_input ->> 'currencyCode', ''),
    coalesce(nullif(p_input ->> 'occurredAt', '')::timestamptz, now()),
    v_actor
  ) returning * into v_incident;

  return jsonb_build_object('id', v_incident.id, 'version', v_incident.version);
end;
$$;

create or replace function public.resolve_client_incident_v1(
  p_incident_id uuid,
  p_expected_version bigint,
  p_resolution_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident public.client_incidents%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  update public.client_incidents
  set resolved_at = now(),
      resolution_notes = btrim(p_resolution_notes)
  where id = p_incident_id
    and version = p_expected_version
    and resolved_at is null
  returning * into v_incident;

  if not found then
    raise exception 'El incidente fue modificado, ya estaba resuelto o no existe.' using errcode = '40001';
  end if;

  return jsonb_build_object('id', v_incident.id, 'version', v_incident.version, 'resolvedAt', v_incident.resolved_at);
end;
$$;


create or replace function public.list_clients_v1(
  p_search text default null,
  p_filter text default 'ALL',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  with sale_stats as (
    select
      s.client_id,
      coalesce(sum(s.total_amount) filter (
        where s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
      ), 0)::numeric as total_purchased,
      coalesce(sum(greatest(s.balance_amount, 0)) filter (
        where s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')
      ), 0)::numeric as balance_amount,
      count(*) filter (
        where s.due_at < now()
          and s.balance_amount > 0
          and s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')
      )::integer as overdue_sales,
      max(coalesce(s.sold_at, s.created_at)) filter (
        where s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
      ) as last_purchase_at
    from public.sales s
    group by s.client_id
  ), incident_stats as (
    select ci.client_id, count(*) filter (where ci.resolved_at is null)::integer as incident_count
    from public.client_incidents ci
    group by ci.client_id
  ), base as (
    select
      c.id,
      c.code,
      c.full_name,
      c.document_type,
      c.document_number,
      c.phone,
      c.email::text as email,
      c.is_vip,
      c.is_active,
      c.version,
      coalesce(ss.total_purchased, 0)::numeric as total_purchased,
      coalesce(ss.balance_amount, 0)::numeric as balance_amount,
      coalesce(ss.overdue_sales, 0)::integer as overdue_sales,
      ss.last_purchase_at,
      coalesce(ins.incident_count, 0)::integer as incident_count,
      da.address_line as default_address
    from public.clients c
    left join sale_stats ss on ss.client_id = c.id
    left join incident_stats ins on ins.client_id = c.id
    left join lateral (
      select ca.address_line
      from public.client_addresses ca
      where ca.client_id = c.id and ca.is_active = true
      order by ca.is_default desc, ca.created_at
      limit 1
    ) da on true
    where (
      nullif(btrim(p_search), '') is null
      or c.full_name ilike '%' || btrim(p_search) || '%'
      or c.code ilike '%' || btrim(p_search) || '%'
      or coalesce(c.phone, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(c.document_number, '') ilike '%' || btrim(p_search) || '%'
    )
  ), filtered as (
    select * from base
    where case upper(coalesce(p_filter, 'ALL'))
      when 'VIP' then is_vip = true and is_active = true
      when 'WITH_DEBT' then balance_amount > 0 and is_active = true
      when 'OVERDUE' then overdue_sales > 0 and is_active = true
      when 'INACTIVE' then is_active = false
      when 'ACTIVE' then is_active = true
      else true
    end
  ), paged as (
    select * from filtered
    order by is_active desc, full_name
    offset greatest(p_page - 1, 0) * greatest(p_page_size, 1)
    limit greatest(least(p_page_size, 100), 1)
  ), global_summary as (
    select
      count(distinct c.id) filter (where c.is_active)::integer as active_clients,
      count(distinct c.id) filter (where c.is_active and c.is_vip)::integer as vip_clients,
      coalesce(sum(greatest(s.balance_amount, 0)) filter (
        where c.is_active and s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')
      ), 0)::numeric as pending_balance,
      count(distinct c.id) filter (
        where c.is_active and s.due_at < now() and s.balance_amount > 0
          and s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')
      )::integer as overdue_clients
    from public.clients c
    left join public.sales s on s.client_id = c.id
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'code', p.code,
        'fullName', p.full_name,
        'documentType', p.document_type,
        'documentNumber', p.document_number,
        'phone', p.phone,
        'email', p.email,
        'isVip', p.is_vip,
        'isActive', p.is_active,
        'totalPurchased', p.total_purchased,
        'balanceAmount', p.balance_amount,
        'overdueSales', p.overdue_sales,
        'lastPurchaseAt', p.last_purchase_at,
        'incidentCount', p.incident_count,
        'defaultAddress', p.default_address,
        'version', p.version
      ) order by p.is_active desc, p.full_name) from paged p
    ), '[]'::jsonb),
    'summary', (select jsonb_build_object(
      'activeClients', active_clients,
      'vipClients', vip_clients,
      'pendingBalance', pending_balance,
      'overdueClients', overdue_clients
    ) from global_summary),
    'page', greatest(p_page, 1),
    'pageSize', greatest(least(p_page_size, 100), 1),
    'total', (select count(*)::integer from filtered)
  ) into v_result;

  return v_result;
end;
$$;

create or replace function public.get_client_detail_v1(p_client_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', c.id,
    'code', c.code,
    'fullName', c.full_name,
    'documentType', c.document_type,
    'documentNumber', c.document_number,
    'phone', c.phone,
    'secondaryPhone', c.secondary_phone,
    'email', c.email::text,
    'notes', c.notes,
    'isVip', c.is_vip,
    'isActive', c.is_active,
    'createdAt', c.created_at,
    'version', c.version,
    'stats', jsonb_build_object(
      'totalPurchased', coalesce(stats.total_purchased, 0),
      'purchaseCount', coalesce(stats.purchase_count, 0),
      'balanceAmount', coalesce(stats.balance_amount, 0),
      'overdueSales', coalesce(stats.overdue_sales, 0),
      'unresolvedIncidents', coalesce(stats.unresolved_incidents, 0),
      'accumulatedUnits', coalesce(stats.accumulated_units, 0)
    ),
    'addresses', coalesce(addresses.items, '[]'::jsonb),
    'vipProfile', vip.profile,
    'vipHistory', coalesce(vip_history.items, '[]'::jsonb),
    'incidents', coalesce(incidents.items, '[]'::jsonb),
    'recentSales', coalesce(recent_sales.items, '[]'::jsonb)
  ) into v_result
  from public.clients c
  left join lateral (
    select
      coalesce(sum(s.total_amount) filter (where s.commercial_state_code not in ('CANCELLED', 'ANNULLED')), 0)::numeric as total_purchased,
      count(*) filter (where s.commercial_state_code not in ('CANCELLED', 'ANNULLED'))::integer as purchase_count,
      coalesce(sum(greatest(s.balance_amount, 0)) filter (where s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')), 0)::numeric as balance_amount,
      count(*) filter (
        where s.due_at < now() and s.balance_amount > 0
          and s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')
      )::integer as overdue_sales,
      (select count(*)::integer from public.client_incidents ci where ci.client_id = c.id and ci.resolved_at is null) as unresolved_incidents,
      (select coalesce(sum(sia.quantity), 0)::integer
       from public.sale_item_allocations sia
       join public.sale_items si on si.id = sia.sale_item_id
       join public.sales sx on sx.id = si.sale_id
       where sx.client_id = c.id and sia.allocation_status = 'ACCUMULATED') as accumulated_units
    from public.sales s
    where s.client_id = c.id
  ) stats on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', ca.id,
      'clientId', ca.client_id,
      'label', ca.label,
      'addressLine', ca.address_line,
      'district', ca.district,
      'province', ca.province,
      'department', ca.department,
      'reference', ca.reference,
      'preferredPartnerId', ca.preferred_partner_id,
      'preferredPartnerName', coalesce(bp.trade_name, bp.legal_name),
      'isDefault', ca.is_default,
      'isActive', ca.is_active,
      'version', ca.version
    ) order by ca.is_active desc, ca.is_default desc, ca.created_at) as items
    from public.client_addresses ca
    left join public.business_partners bp on bp.id = ca.preferred_partner_id
    where ca.client_id = c.id
  ) addresses on true
  left join lateral (
    select case when cvp.client_id is null then null else jsonb_build_object(
      'canReserveWithoutDeposit', cvp.can_reserve_without_deposit,
      'separationLimitAmount', cvp.separation_limit_amount,
      'separationLimitCurrency', cvp.separation_limit_currency,
      'paymentTermDays', cvp.payment_term_days,
      'validFrom', cvp.valid_from,
      'validUntil', cvp.valid_until,
      'grantedReason', cvp.granted_reason,
      'grantedByName', gp.display_name,
      'version', cvp.version
    ) end as profile
    from public.client_vip_profiles cvp
    left join public.profiles gp on gp.id = cvp.granted_by
    where cvp.client_id = c.id
  ) vip on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', h.id,
      'action', h.action,
      'previousValues', h.previous_values,
      'newValues', h.new_values,
      'reason', h.reason,
      'performedByName', p.display_name,
      'occurredAt', h.occurred_at
    ) order by h.occurred_at desc) as items
    from public.client_vip_history h
    left join public.profiles p on p.id = h.performed_by
    where h.client_id = c.id
  ) vip_history on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', ci.id,
      'clientId', ci.client_id,
      'incidentType', ci.incident_type,
      'severity', ci.severity,
      'saleId', ci.sale_id,
      'saleCode', s.code,
      'description', ci.description,
      'amount', ci.amount,
      'currencyCode', ci.currency_code,
      'occurredAt', ci.occurred_at,
      'resolvedAt', ci.resolved_at,
      'resolutionNotes', ci.resolution_notes,
      'createdByName', p.display_name,
      'version', ci.version
    ) order by (ci.resolved_at is null) desc, ci.occurred_at desc) as items
    from public.client_incidents ci
    left join public.sales s on s.id = ci.sale_id
    left join public.profiles p on p.id = ci.created_by
    where ci.client_id = c.id
  ) incidents on true
  left join lateral (
    select jsonb_agg(jsonb_build_object(
      'id', x.id,
      'code', x.code,
      'createdAt', x.created_at,
      'totalAmount', x.total_amount,
      'balanceAmount', x.balance_amount,
      'currencyCode', x.currency_code,
      'paymentStateCode', x.payment_state_code,
      'deliveryStateCode', x.delivery_state_code,
      'dueAt', x.due_at
    ) order by x.created_at desc) as items
    from (
      select * from public.sales s
      where s.client_id = c.id
      order by s.created_at desc
      limit 10
    ) x
  ) recent_sales on true
  where c.id = p_client_id;

  if v_result is null then
    raise exception 'Cliente no encontrado.' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

revoke all on function public.list_clients_v1(text, text, integer, integer) from public;
revoke all on function public.get_client_detail_v1(uuid) from public;
revoke all on function public.create_client_v1(jsonb, text) from public;
revoke all on function public.update_client_v1(uuid, bigint, jsonb) from public;
revoke all on function public.set_client_status_v1(uuid, bigint, boolean, text) from public;
revoke all on function public.set_client_vip_v1(uuid, bigint, jsonb) from public;
revoke all on function public.save_client_address_v1(uuid, uuid, bigint, jsonb) from public;
revoke all on function public.create_client_incident_v1(uuid, jsonb) from public;
revoke all on function public.resolve_client_incident_v1(uuid, bigint, text) from public;

grant execute on function public.list_clients_v1(text, text, integer, integer) to authenticated;
grant execute on function public.get_client_detail_v1(uuid) to authenticated;
grant execute on function public.create_client_v1(jsonb, text) to authenticated;
grant execute on function public.update_client_v1(uuid, bigint, jsonb) to authenticated;
grant execute on function public.set_client_status_v1(uuid, bigint, boolean, text) to authenticated;
grant execute on function public.set_client_vip_v1(uuid, bigint, jsonb) to authenticated;
grant execute on function public.save_client_address_v1(uuid, uuid, bigint, jsonb) to authenticated;
grant execute on function public.create_client_incident_v1(uuid, jsonb) to authenticated;
grant execute on function public.resolve_client_incident_v1(uuid, bigint, text) to authenticated;

notify pgrst, 'reload schema';

commit;


-- =========================================================
-- 014_sales_reservations_api.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 014: ventas, reservas y asignación atómica de stock

begin;

create index if not exists ix_sale_items_sale_active
  on public.sale_items(sale_id, item_status);

create index if not exists ix_sale_allocations_sale_lookup
  on public.sale_item_allocations(sale_item_id, allocation_status, warehouse_id);

create index if not exists ix_release_requests_pending
  on public.release_requests(sale_id, state_code)
  where state_code in ('REQUESTED', 'APPROVED');

create or replace function public.get_sale_support_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_default_days integer;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select coalesce((setting_value #>> '{}')::integer, 14)
  into v_default_days
  from public.business_settings
  where setting_key = 'sales.default_payment_term_days';

  return jsonb_build_object(
    'salesChannels', coalesce((
      select jsonb_agg(jsonb_build_object('code', sc.code, 'name', sc.name) order by sc.sort_order, sc.name)
      from public.sales_channels sc
      where sc.is_active = true
    ), '[]'::jsonb),
    'discountTypes', coalesce((
      select jsonb_agg(jsonb_build_object('code', dt.code, 'name', dt.name) order by dt.name)
      from public.discount_types dt
      where dt.is_active = true
    ), '[]'::jsonb),
    'defaultPaymentTermDays', coalesce(v_default_days, 14)
  );
end;
$$;

create or replace function public.list_sales_v1(
  p_search text default null,
  p_filter text default 'ALL',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offset integer := greatest(p_page - 1, 0) * p_page_size;
  v_total integer;
  v_items jsonb;
  v_summary jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if p_filter not in ('ALL', 'RESERVED', 'UNPAID', 'OVERDUE', 'CANCELLED') then
    raise exception 'Filtro de ventas inválido.';
  end if;

  select count(*)::integer into v_total
  from public.v_sales_overview s
  where (
    nullif(btrim(p_search), '') is null
    or s.code ilike '%' || btrim(p_search) || '%'
    or s.client_name_snapshot ilike '%' || btrim(p_search) || '%'
    or coalesce(s.client_phone_snapshot, '') ilike '%' || btrim(p_search) || '%'
    or exists (
      select 1 from public.sale_items si
      where si.sale_id = s.id
        and (si.product_name_snapshot ilike '%' || btrim(p_search) || '%'
          or si.sku_snapshot ilike '%' || btrim(p_search) || '%')
    )
  )
  and case p_filter
    when 'RESERVED' then s.commercial_state_code = 'RESERVED'
    when 'UNPAID' then s.payment_state_code = 'UNPAID' and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
    when 'OVERDUE' then s.payment_state_code = 'OVERDUE' and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
    when 'CANCELLED' then s.commercial_state_code in ('CANCELLED', 'ANNULLED')
    else true
  end;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb)
  into v_items
  from (
    select
      s.created_at,
      jsonb_build_object(
        'id', s.id,
        'code', s.code,
        'clientId', s.client_id,
        'clientName', s.client_name_snapshot,
        'clientPhone', s.client_phone_snapshot,
        'saleTypeCode', s.sale_type_code,
        'salesChannelCode', s.sales_channel_code,
        'commercialStateCode', s.commercial_state_code,
        'paymentStateCode', s.payment_state_code,
        'deliveryStateCode', s.delivery_state_code,
        'currencyCode', s.currency_code,
        'totalAmount', s.total_amount,
        'paidTotal', s.paid_total,
        'balanceAmount', s.balance_amount,
        'itemLines', s.item_lines,
        'totalUnits', s.total_units,
        'dueAt', s.due_at,
        'createdAt', s.created_at,
        'createdByName', s.created_by_name,
        'version', s.version
      ) as row_json
    from public.v_sales_overview s
    where (
      nullif(btrim(p_search), '') is null
      or s.code ilike '%' || btrim(p_search) || '%'
      or s.client_name_snapshot ilike '%' || btrim(p_search) || '%'
      or coalesce(s.client_phone_snapshot, '') ilike '%' || btrim(p_search) || '%'
      or exists (
        select 1 from public.sale_items si
        where si.sale_id = s.id
          and (si.product_name_snapshot ilike '%' || btrim(p_search) || '%'
            or si.sku_snapshot ilike '%' || btrim(p_search) || '%')
      )
    )
    and case p_filter
      when 'RESERVED' then s.commercial_state_code = 'RESERVED'
      when 'UNPAID' then s.payment_state_code = 'UNPAID' and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
      when 'OVERDUE' then s.payment_state_code = 'OVERDUE' and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
      when 'CANCELLED' then s.commercial_state_code in ('CANCELLED', 'ANNULLED')
      else true
    end
    order by s.created_at desc
    limit p_page_size offset v_offset
  ) paged;

  select jsonb_build_object(
    'activeSales', count(*) filter (where commercial_state_code not in ('CANCELLED', 'ANNULLED'))::integer,
    'soldAmount', coalesce(sum(total_amount) filter (where commercial_state_code not in ('CANCELLED', 'ANNULLED')), 0),
    'pendingBalance', coalesce(sum(greatest(balance_amount, 0)) filter (where commercial_state_code not in ('CANCELLED', 'ANNULLED')), 0),
    'overdueSales', count(*) filter (where payment_state_code = 'OVERDUE' and commercial_state_code not in ('CANCELLED', 'ANNULLED'))::integer
  ) into v_summary
  from public.sales;

  return jsonb_build_object(
    'items', v_items,
    'summary', v_summary,
    'page', greatest(p_page, 1),
    'pageSize', p_page_size,
    'total', v_total
  );
end;
$$;

create or replace function public.get_sale_detail_v1(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', s.id,
    'code', s.code,
    'clientId', s.client_id,
    'clientCode', c.code,
    'clientName', s.client_name_snapshot,
    'clientPhone', s.client_phone_snapshot,
    'clientIsVip', c.is_vip,
    'saleTypeCode', s.sale_type_code,
    'salesChannelCode', s.sales_channel_code,
    'commercialStateCode', s.commercial_state_code,
    'paymentStateCode', s.payment_state_code,
    'deliveryStateCode', s.delivery_state_code,
    'currencyCode', s.currency_code,
    'soldAt', s.sold_at,
    'reservedAt', s.reserved_at,
    'dueAt', s.due_at,
    'subtotal', s.subtotal,
    'discountTotal', s.discount_total,
    'penaltyTotal', s.penalty_total,
    'shippingChargeTotal', s.shipping_charge_total,
    'totalAmount', s.total_amount,
    'paidTotal', s.paid_total,
    'balanceAmount', s.balance_amount,
    'notes', s.notes,
    'cancellationReason', s.cancellation_reason,
    'createdByName', creator.display_name,
    'createdAt', s.created_at,
    'version', s.version,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', si.id,
        'variantId', si.variant_id,
        'productName', si.product_name_snapshot,
        'variantName', si.variant_name_snapshot,
        'sku', si.sku_snapshot,
        'categoryName', si.category_name_snapshot,
        'quantity', si.quantity,
        'originalUnitPrice', si.original_unit_price,
        'finalUnitPrice', si.final_unit_price,
        'lineSubtotal', si.line_subtotal,
        'lineDiscountTotal', si.line_discount_total,
        'lineTotal', si.line_total,
        'fulfillmentType', si.fulfillment_type,
        'itemStatus', si.item_status,
        'notes', si.notes,
        'allocations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', sia.id,
            'warehouseId', sia.warehouse_id,
            'warehouseName', w.name,
            'lotId', sia.lot_id,
            'lotCode', il.lot_code,
            'quantity', sia.quantity,
            'status', sia.allocation_status
          ) order by w.name, il.lot_code)
          from public.sale_item_allocations sia
          join public.warehouses w on w.id = sia.warehouse_id
          join public.inventory_lots il on il.id = sia.lot_id
          where sia.sale_item_id = si.id
        ), '[]'::jsonb)
      ) order by si.created_at, si.id)
      from public.sale_items si where si.sale_id = s.id
    ), '[]'::jsonb),
    'releaseRequests', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', rr.id,
        'stateCode', rr.state_code,
        'reason', rr.reason,
        'penaltyAmount', rr.penalty_amount,
        'requestedAt', rr.requested_at,
        'requestedById', rr.requested_by,
        'requestedByName', requester.display_name,
        'reviewedAt', rr.reviewed_at,
        'reviewedByName', reviewer.display_name,
        'reviewNotes', rr.review_notes
      ) order by rr.requested_at desc)
      from public.release_requests rr
      left join public.profiles requester on requester.id = rr.requested_by
      left join public.profiles reviewer on reviewer.id = rr.reviewed_by
      where rr.sale_id = s.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'dimension', h.state_dimension,
        'previousStateCode', h.previous_state_code,
        'newStateCode', h.new_state_code,
        'reason', h.reason,
        'changedByName', hp.display_name,
        'changedAt', h.changed_at
      ) order by h.changed_at desc)
      from public.sale_state_history h
      left join public.profiles hp on hp.id = h.changed_by
      where h.sale_id = s.id
    ), '[]'::jsonb)
  ) into v_result
  from public.sales s
  join public.clients c on c.id = s.client_id
  left join public.profiles creator on creator.id = s.created_by
  where s.id = p_sale_id;

  if v_result is null then
    raise exception 'Venta no encontrada.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

create or replace function public.create_sale_v1(
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_existing jsonb;
  v_existing_hash text;
  v_sale public.sales%rowtype;
  v_client public.clients%rowtype;
  v_item jsonb;
  v_item_row public.sale_items%rowtype;
  v_variant public.product_variants%rowtype;
  v_balance record;
  v_needed integer;
  v_take integer;
  v_movement_id uuid;
  v_due_at timestamptz;
  v_default_days integer;
  v_vip_days integer;
  v_vip_limit numeric(14,2);
  v_current_balance numeric(14,2);
  v_delivery_state text;
  v_discount numeric(14,2);
  v_response jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_input) <> 'object' then
    raise exception 'La venta debe enviarse como un objeto JSON.';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'La clave de idempotencia es obligatoria.';
  end if;
  if jsonb_typeof(p_input -> 'items') <> 'array' or jsonb_array_length(p_input -> 'items') = 0 then
    raise exception 'La venta debe contener al menos un producto.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('CREATE_SALE:' || p_idempotency_key, 0));
  select response_payload, request_hash into v_existing, v_existing_hash
  from public.idempotency_keys
  where scope = 'CREATE_SALE' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_existing is not null then
    if v_existing_hash is distinct from pg_catalog.md5(p_input::text) then
      raise exception 'La clave de idempotencia ya fue utilizada con otros datos.';
    end if;
    return v_existing;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id, request_hash, status, expires_at)
  values ('CREATE_SALE', p_idempotency_key, v_actor, pg_catalog.md5(p_input::text), 'IN_PROGRESS', now() + interval '24 hours')
  on conflict (scope, idempotency_key) do update set
    actor_user_id = excluded.actor_user_id,
    request_hash = excluded.request_hash,
    status = 'IN_PROGRESS',
    locked_at = now(),
    expires_at = excluded.expires_at;

  select * into v_client
  from public.clients
  where id = (p_input ->> 'clientId')::uuid and is_active = true
  for update;
  if not found then
    raise exception 'El cliente no existe o está inactivo.' using errcode = 'P0001';
  end if;

  perform 1 from public.sales_channels
  where code = p_input ->> 'salesChannelCode' and is_active = true;
  if not found then raise exception 'El canal de venta no existe o está inactivo.'; end if;

  select coalesce((setting_value #>> '{}')::integer, 14) into v_default_days
  from public.business_settings where setting_key = 'sales.default_payment_term_days';

  if v_client.is_vip then
    select payment_term_days, separation_limit_amount
    into v_vip_days, v_vip_limit
    from public.client_vip_profiles
    where client_id = v_client.id and (valid_until is null or valid_until > now());
  end if;

  v_due_at := nullif(p_input ->> 'dueAt', '')::timestamptz;
  if v_due_at is null then
    v_due_at := now() + make_interval(days => coalesce(v_vip_days, v_default_days, 14));
  elsif v_due_at < now() then
    raise exception 'La fecha de vencimiento no puede estar en el pasado.';
  end if;

  v_delivery_state := case when p_input ->> 'deliveryMode' = 'ACCUMULATED' then 'ACCUMULATED' else 'PENDING' end;
  perform set_config('app.audit_reason', 'Creación y reserva de venta', true);

  insert into public.sales(
    code, client_id, sale_type_code, sales_channel_code, currency_code,
    commercial_state_code, payment_state_code, delivery_state_code,
    sold_at, reserved_at, due_at, notes, created_by, updated_by
  ) values (
    null, v_client.id, 'REGULAR', p_input ->> 'salesChannelCode', coalesce(nullif(p_input ->> 'currencyCode', ''), 'PEN')::char(3),
    'DRAFT', 'UNPAID', 'PENDING',
    null, null, v_due_at, nullif(btrim(p_input ->> 'notes'), ''), v_actor, v_actor
  ) returning * into v_sale;

  insert into public.inventory_movements(
    code, movement_type_code, reference_type, reference_id, reason, idempotency_key, created_by, metadata
  ) values (
    public.next_business_code('INVENTORY_MOVEMENT'), 'RESERVATION', 'SALE', v_sale.id,
    'Reserva de stock al crear la venta', 'sale-reservation-v1:' || p_idempotency_key,
    v_actor, jsonb_build_object('source', 'create_sale_v1')
  ) returning id into v_movement_id;

  for v_item in select value from jsonb_array_elements(p_input -> 'items')
  loop
    select * into v_variant
    from public.product_variants
    where id = (v_item ->> 'variantId')::uuid and is_active = true;
    if not found then raise exception 'Una variante no existe o está inactiva.'; end if;

    perform 1 from public.products where id = v_variant.product_id and is_active = true;
    if not found then raise exception 'El producto de una variante está inactivo.'; end if;

    perform 1 from public.warehouses
    where id = (v_item ->> 'warehouseId')::uuid
      and warehouse_type = 'OPERATIONAL' and is_active = true;
    if not found then raise exception 'El almacén seleccionado no existe o no está operativo.'; end if;

    if (v_item ->> 'quantity')::integer <= 0 then raise exception 'La cantidad debe ser mayor que cero.'; end if;
    if (v_item ->> 'originalUnitPrice')::numeric < 0 or (v_item ->> 'finalUnitPrice')::numeric < 0 then
      raise exception 'Los precios no pueden ser negativos.';
    end if;
    if (v_item ->> 'finalUnitPrice')::numeric > (v_item ->> 'originalUnitPrice')::numeric then
      raise exception 'El precio final no puede superar el precio original.';
    end if;
    if (v_item ->> 'finalUnitPrice')::numeric < (v_item ->> 'originalUnitPrice')::numeric
       and (nullif(v_item ->> 'discountTypeCode', '') is null or length(btrim(coalesce(v_item ->> 'discountReason', ''))) < 3) then
      raise exception 'Todo descuento requiere tipo y motivo.';
    end if;

    insert into public.sale_items(
      sale_id, variant_id, quantity, original_unit_price, final_unit_price,
      fulfillment_type, notes, created_by, updated_by
    ) values (
      v_sale.id, v_variant.id, (v_item ->> 'quantity')::integer,
      (v_item ->> 'originalUnitPrice')::numeric, (v_item ->> 'finalUnitPrice')::numeric,
      'STOCK', nullif(btrim(v_item ->> 'notes'), ''), v_actor, v_actor
    ) returning * into v_item_row;

    v_discount := round(v_item_row.quantity * (v_item_row.original_unit_price - v_item_row.final_unit_price), 2);
    if v_discount > 0 then
      perform 1 from public.discount_types
      where code = v_item ->> 'discountTypeCode' and is_active = true;
      if not found then raise exception 'El tipo de descuento no existe o está inactivo.'; end if;

      insert into public.sale_discounts(
        sale_id, sale_item_id, discount_type_code, amount, calculated_amount,
        reason, approved_by, created_by
      ) values (
        v_sale.id, v_item_row.id, v_item ->> 'discountTypeCode', v_discount, v_discount,
        btrim(v_item ->> 'discountReason'), v_actor, v_actor
      );
    end if;

    v_needed := v_item_row.quantity;
    for v_balance in
      select ib.lot_id, ib.quantity, il.lot_code
      from public.inventory_balances ib
      join public.inventory_lots il on il.id = ib.lot_id
      where ib.variant_id = v_variant.id
        and ib.warehouse_id = (v_item ->> 'warehouseId')::uuid
        and ib.bucket_code = 'AVAILABLE'
        and ib.quantity > 0
        and il.status = 'ACTIVE'
      order by coalesce(il.received_at, il.acquired_at, il.created_at), il.created_at, il.id
      for update of ib
    loop
      exit when v_needed <= 0;
      v_take := least(v_needed, v_balance.quantity);

      insert into public.sale_item_allocations(
        sale_item_id, lot_id, warehouse_id, quantity, allocation_status, created_by, updated_by
      ) values (
        v_item_row.id, v_balance.lot_id, (v_item ->> 'warehouseId')::uuid,
        v_take, 'RESERVED', v_actor, v_actor
      );

      insert into public.inventory_movement_lines(
        movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta
      ) values
        (v_movement_id, v_variant.id, v_balance.lot_id, (v_item ->> 'warehouseId')::uuid, 'AVAILABLE', -v_take),
        (v_movement_id, v_variant.id, v_balance.lot_id, (v_item ->> 'warehouseId')::uuid, 'RESERVED', v_take);

      v_needed := v_needed - v_take;
    end loop;

    if v_needed > 0 then
      raise exception 'Stock insuficiente para % en el almacén seleccionado. Faltan % unidades.', v_item_row.product_name_snapshot, v_needed
        using errcode = 'P0001';
    end if;
  end loop;

  update public.sales
  set commercial_state_code = 'RESERVED',
      delivery_state_code = v_delivery_state,
      sold_at = now(),
      reserved_at = now(),
      updated_by = v_actor
  where id = v_sale.id
  returning * into v_sale;

  perform public.refresh_sale_totals(v_sale.id);
  select * into v_sale from public.sales where id = v_sale.id;

  if v_client.is_vip and v_vip_limit is not null then
    select coalesce(sum(greatest(balance_amount, 0)), 0)
    into v_current_balance
    from public.sales
    where client_id = v_client.id
      and id <> v_sale.id
      and commercial_state_code not in ('CANCELLED', 'ANNULLED');

    if v_current_balance + greatest(v_sale.balance_amount, 0) > v_vip_limit then
      raise exception 'La reserva supera el límite VIP disponible del cliente.' using errcode = 'P0001';
    end if;
  end if;

  insert into public.outbox_events(event_type, aggregate_type, aggregate_id, payload, deduplication_key)
  values (
    'SALE_CONFIRMED', 'SALE', v_sale.id,
    jsonb_build_object('sale_id', v_sale.id, 'inventory_movement_id', v_movement_id),
    'sale-created-v1:' || p_idempotency_key
  ) on conflict (deduplication_key) where deduplication_key is not null do nothing;

  v_response := jsonb_build_object('id', v_sale.id, 'code', v_sale.code, 'version', v_sale.version);
  update public.idempotency_keys
  set status = 'COMPLETED', resource_type = 'SALE', resource_id = v_sale.id,
      response_payload = v_response, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'CREATE_SALE' and idempotency_key = p_idempotency_key;
  return v_response;
exception
  when others then
    update public.idempotency_keys set status = 'FAILED', completed_at = now()
    where scope = 'CREATE_SALE' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

create or replace function public.request_sale_release_v1(
  p_sale_id uuid,
  p_reason text,
  p_penalty_amount numeric default 0
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_sale public.sales%rowtype;
  v_request public.release_requests%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'El motivo debe tener al menos 5 caracteres.'; end if;
  if coalesce(p_penalty_amount, 0) < 0 then raise exception 'La penalidad no puede ser negativa.'; end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Venta no encontrada.' using errcode = 'P0002'; end if;
  if v_sale.commercial_state_code in ('CANCELLED', 'ANNULLED', 'COMPLETED') then
    raise exception 'La venta ya se encuentra cerrada.';
  end if;
  if exists(select 1 from public.release_requests where sale_id = p_sale_id and state_code in ('REQUESTED', 'APPROVED')) then
    raise exception 'Ya existe una solicitud de liberación pendiente para esta venta.';
  end if;

  perform set_config('app.audit_reason', btrim(p_reason), true);
  insert into public.release_requests(
    sale_id, reason, requested_by, penalty_amount, currency_code
  ) values (
    p_sale_id, btrim(p_reason), v_actor, coalesce(p_penalty_amount, 0), v_sale.currency_code
  ) returning * into v_request;

  return jsonb_build_object('id', v_request.id, 'stateCode', v_request.state_code, 'version', v_request.version);
end;
$$;

create or replace function public.review_sale_release_v1(
  p_request_id uuid,
  p_decision text,
  p_review_notes text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_request public.release_requests%rowtype;
  v_sale public.sales%rowtype;
  v_allocation record;
  v_movement_id uuid;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if p_decision not in ('APPROVE', 'REJECT') then raise exception 'Decisión inválida.'; end if;
  if length(btrim(coalesce(p_review_notes, ''))) < 3 then raise exception 'Las notas de revisión son obligatorias.'; end if;

  select * into v_request from public.release_requests where id = p_request_id for update;
  if not found then raise exception 'Solicitud no encontrada.' using errcode = 'P0002'; end if;
  if v_request.state_code <> 'REQUESTED' then raise exception 'La solicitud ya fue revisada.'; end if;
  if v_request.requested_by = v_actor then
    raise exception 'La solicitud debe ser revisada por otra administradora.' using errcode = 'P0001';
  end if;

  perform set_config('app.audit_reason', btrim(p_review_notes), true);
  if p_decision = 'REJECT' then
    update public.release_requests
    set state_code = 'REJECTED', reviewed_at = now(), reviewed_by = v_actor, review_notes = btrim(p_review_notes)
    where id = p_request_id returning * into v_request;
    return jsonb_build_object('id', v_request.id, 'stateCode', v_request.state_code, 'version', v_request.version);
  end if;

  select * into v_sale from public.sales where id = v_request.sale_id for update;
  if not found then raise exception 'Venta no encontrada.' using errcode = 'P0002'; end if;
  if v_sale.commercial_state_code in ('CANCELLED', 'ANNULLED', 'COMPLETED') then raise exception 'La venta ya está cerrada.'; end if;

  update public.release_requests
  set state_code = 'APPROVED', reviewed_at = now(), reviewed_by = v_actor, review_notes = btrim(p_review_notes)
  where id = p_request_id returning * into v_request;

  insert into public.inventory_movements(
    code, movement_type_code, reference_type, reference_id, reason, created_by, metadata
  ) values (
    public.next_business_code('INVENTORY_MOVEMENT'), 'RELEASE', 'RELEASE_REQUEST', v_request.id,
    v_request.reason, v_actor, jsonb_build_object('sale_id', v_sale.id)
  ) returning id into v_movement_id;

  for v_allocation in
    select sia.*, si.variant_id
    from public.sale_item_allocations sia
    join public.sale_items si on si.id = sia.sale_item_id
    where si.sale_id = v_sale.id and sia.allocation_status in ('RESERVED', 'ACCUMULATED')
    for update of sia
  loop
    insert into public.inventory_movement_lines(
      movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta
    ) values
      (v_movement_id, v_allocation.variant_id, v_allocation.lot_id, v_allocation.warehouse_id,
       case when v_allocation.allocation_status = 'ACCUMULATED' then 'ACCUMULATED' else 'RESERVED' end, -v_allocation.quantity),
      (v_movement_id, v_allocation.variant_id, v_allocation.lot_id, v_allocation.warehouse_id, 'AVAILABLE', v_allocation.quantity);

    update public.sale_item_allocations
    set allocation_status = 'RELEASED', released_at = now(), updated_by = v_actor
    where id = v_allocation.id;
  end loop;

  update public.sale_items set item_status = 'RELEASED', updated_by = v_actor
  where sale_id = v_sale.id and item_status in ('ACTIVE', 'PARTIALLY_RELEASED');

  update public.sales
  set commercial_state_code = 'CANCELLED', delivery_state_code = 'CANCELLED',
      cancelled_at = now(), cancellation_reason = v_request.reason, updated_by = v_actor
  where id = v_sale.id;

  perform public.refresh_sale_totals(v_sale.id);
  update public.release_requests
  set state_code = 'EXECUTED', inventory_movement_id = v_movement_id
  where id = p_request_id returning * into v_request;

  return jsonb_build_object('id', v_request.id, 'stateCode', v_request.state_code, 'version', v_request.version);
end;
$$;

revoke all on function public.get_sale_support_v1() from public;
revoke all on function public.list_sales_v1(text, text, integer, integer) from public;
revoke all on function public.get_sale_detail_v1(uuid) from public;
revoke all on function public.create_sale_v1(jsonb, text) from public;
revoke all on function public.request_sale_release_v1(uuid, text, numeric) from public;
revoke all on function public.review_sale_release_v1(uuid, text, text) from public;

grant execute on function public.get_sale_support_v1() to authenticated;
grant execute on function public.list_sales_v1(text, text, integer, integer) to authenticated;
grant execute on function public.get_sale_detail_v1(uuid) to authenticated;
grant execute on function public.create_sale_v1(jsonb, text) to authenticated;
grant execute on function public.request_sale_release_v1(uuid, text, numeric) to authenticated;
grant execute on function public.review_sale_release_v1(uuid, text, text) to authenticated;

notify pgrst, 'reload schema';
commit;


-- =========================================================
-- 015_payments_receipts_penalties_api.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 015: pagos parciales, boletas, notas de crédito y penalidades

begin;

alter table public.payments
  add column if not exists rejected_at timestamptz,
  add column if not exists rejected_by uuid references public.profiles(id) on delete set null,
  add column if not exists rejection_reason text;

alter table public.sales_receipts
  add column if not exists annulled_at timestamptz,
  add column if not exists annulled_by uuid references public.profiles(id) on delete set null,
  add column if not exists annulment_reason text;

create index if not exists ix_payments_sale_received
  on public.payments(sale_id, received_at desc);

create index if not exists ix_receipts_sale_issue
  on public.sales_receipts(sale_id, issue_date desc, created_at desc);

with duplicate_late_penalties as (
  select id, row_number() over (partition by sale_id order by created_at desc, id desc) as rn
  from public.penalties
  where status = 'ACTIVE' and penalty_type = 'LATE_DAILY'
)
update public.penalties p
set status = 'REVERSED',
    reason = p.reason || E'\nRevertida automáticamente al consolidar penalidades duplicadas.',
    updated_at = now()
from duplicate_late_penalties d
where p.id = d.id and d.rn > 1;

create unique index if not exists ux_penalties_active_late_daily
  on public.penalties(sale_id, penalty_type)
  where status = 'ACTIVE' and penalty_type = 'LATE_DAILY';

create or replace function public.get_payment_support_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_rule jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select setting_value into v_rule
  from public.business_settings
  where setting_key = 'penalties.late_daily';

  return jsonb_build_object(
    'paymentMethods', coalesce((
      select jsonb_agg(jsonb_build_object(
        'code', pm.code,
        'name', pm.name,
        'requiresProof', pm.requires_proof
      ) order by pm.name)
      from public.payment_methods pm
      where pm.is_active = true
    ), '[]'::jsonb),
    'financialAccounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fa.id,
        'code', fa.code,
        'name', fa.name,
        'accountTypeCode', fa.account_type_code,
        'currencyCode', fa.currency_code
      ) order by fa.name)
      from public.financial_accounts fa
      where fa.is_active = true and fa.currency_code = 'PEN'
    ), '[]'::jsonb),
    'latePenalty', jsonb_build_object(
      'enabled', coalesce((v_rule ->> 'enabled')::boolean, true),
      'amountPerDay', coalesce((v_rule ->> 'amount')::numeric, 1),
      'currencyCode', coalesce(v_rule ->> 'currency', 'PEN')
    )
  );
end;
$$;

create or replace function public.get_sale_financial_detail_v1(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'saleId', s.id,
    'saleCode', s.code,
    'currencyCode', s.currency_code,
    'totalAmount', s.total_amount,
    'paidTotal', s.paid_total,
    'balanceAmount', s.balance_amount,
    'paymentStateCode', s.payment_state_code,
    'dueAt', s.due_at,
    'payments', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id,
        'code', p.code,
        'stateCode', p.state_code,
        'declaredAmount', p.declared_amount,
        'currencyCode', p.currency_code,
        'receivedAt', p.received_at,
        'confirmedAt', p.confirmed_at,
        'rejectedAt', p.rejected_at,
        'reversedAt', p.reversed_at,
        'rejectionReason', p.rejection_reason,
        'reversalReason', p.reversal_reason,
        'notes', p.notes,
        'createdByName', creator.display_name,
        'confirmedByName', confirmer.display_name,
        'parts', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', pp.id,
            'paymentMethodCode', pp.payment_method_code,
            'paymentMethodName', pm.name,
            'requiresProof', pm.requires_proof,
            'financialAccountId', pp.financial_account_id,
            'financialAccountName', fa.name,
            'amount', pp.amount,
            'referenceNumber', pp.reference_number,
            'notes', pp.notes
          ) order by pp.created_at, pp.id)
          from public.payment_parts pp
          join public.payment_methods pm on pm.code = pp.payment_method_code
          join public.financial_accounts fa on fa.id = pp.financial_account_id
          where pp.payment_id = p.id
        ), '[]'::jsonb),
        'proofs', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', a.id,
            'bucketId', a.bucket_id,
            'objectPath', a.object_path,
            'originalFilename', a.original_filename,
            'mimeType', a.mime_type,
            'sizeBytes', a.size_bytes,
            'signedUrl', null,
            'createdAt', a.created_at
          ) order by a.created_at)
          from public.attachments a
          where a.entity_type = 'PAYMENT'
            and a.entity_id = p.id
            and a.attachment_type = 'PROOF'
            and a.is_active = true
        ), '[]'::jsonb),
        'receiptAllocatedAmount', coalesce((
          select round(sum(rpa.allocated_amount), 2)
          from public.receipt_payment_allocations rpa
          join public.sales_receipts sr on sr.id = rpa.receipt_id
          where rpa.payment_id = p.id
            and sr.state_code not in ('ANNULLED', 'CREDIT_NOTE')
        ), 0),
        'unreceiptedAmount', greatest(p.declared_amount - coalesce((
          select round(sum(rpa.allocated_amount), 2)
          from public.receipt_payment_allocations rpa
          join public.sales_receipts sr on sr.id = rpa.receipt_id
          where rpa.payment_id = p.id
            and sr.state_code not in ('ANNULLED', 'CREDIT_NOTE')
        ), 0), 0),
        'createdAt', p.created_at,
        'version', p.version
      ) order by p.received_at desc, p.created_at desc)
      from public.payments p
      left join public.profiles creator on creator.id = p.created_by
      left join public.profiles confirmer on confirmer.id = p.confirmed_by
      where p.sale_id = s.id
    ), '[]'::jsonb),
    'receipts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', r.id,
        'code', r.code,
        'stateCode', r.state_code,
        'receiptType', r.receipt_type,
        'series', r.series,
        'receiptNumber', r.receipt_number,
        'fullNumber', r.full_number,
        'issueDate', r.issue_date,
        'amount', r.amount,
        'notes', r.notes,
        'annulledAt', r.annulled_at,
        'annulmentReason', r.annulment_reason,
        'createdByName', receipt_creator.display_name,
        'allocations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'paymentId', rp.payment_id,
            'paymentCode', p2.code,
            'allocatedAmount', rp.allocated_amount
          ) order by p2.received_at)
          from public.receipt_payment_allocations rp
          join public.payments p2 on p2.id = rp.payment_id
          where rp.receipt_id = r.id
        ), '[]'::jsonb),
        'files', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', a.id,
            'bucketId', a.bucket_id,
            'objectPath', a.object_path,
            'originalFilename', a.original_filename,
            'mimeType', a.mime_type,
            'sizeBytes', a.size_bytes,
            'signedUrl', null,
            'createdAt', a.created_at
          ) order by a.created_at)
          from public.attachments a
          where a.entity_type = 'RECEIPT'
            and a.entity_id = r.id
            and a.attachment_type = 'FILE'
            and a.is_active = true
        ), '[]'::jsonb),
        'creditNotes', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', cn.id,
            'code', cn.code,
            'fullNumber', cn.full_number,
            'issueDate', cn.issue_date,
            'amount', cn.amount,
            'reason', cn.reason,
            'createdByName', cnp.display_name,
            'createdAt', cn.created_at
          ) order by cn.issue_date desc, cn.created_at desc)
          from public.credit_notes cn
          left join public.profiles cnp on cnp.id = cn.created_by
          where cn.receipt_id = r.id
        ), '[]'::jsonb),
        'createdAt', r.created_at,
        'version', r.version
      ) order by r.issue_date desc nulls last, r.created_at desc)
      from public.sales_receipts r
      left join public.profiles receipt_creator on receipt_creator.id = r.created_by
      where r.sale_id = s.id
    ), '[]'::jsonb),
    'penalties', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pe.id,
        'penaltyType', pe.penalty_type,
        'amount', pe.amount,
        'unitAmount', pe.unit_amount,
        'daysLate', case when pe.penalty_type = 'LATE_DAILY' then coalesce(pe.quantity_basis, 0)::integer else null end,
        'reason', pe.reason,
        'status', pe.status,
        'calculatedFrom', pe.calculated_from,
        'calculatedTo', pe.calculated_to,
        'createdByName', pep.display_name,
        'createdAt', pe.created_at,
        'version', pe.version
      ) order by pe.created_at desc)
      from public.penalties pe
      left join public.profiles pep on pep.id = pe.created_by
      where pe.sale_id = s.id
    ), '[]'::jsonb)
  ) into v_result
  from public.sales s
  where s.id = p_sale_id;

  if v_result is null then
    raise exception 'Venta no encontrada.' using errcode = 'P0002';
  end if;

  return v_result;
end;
$$;

create or replace function public.create_payment_v1(
  p_sale_id uuid,
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_sale public.sales%rowtype;
  v_payment public.payments%rowtype;
  v_part jsonb;
  v_method public.payment_methods%rowtype;
  v_account public.financial_accounts%rowtype;
  v_total numeric(14,2) := 0;
  v_amount numeric(14,2);
  v_existing jsonb;
  v_existing_hash text;
  v_response jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_input) <> 'object' then
    raise exception 'El pago debe enviarse como un objeto JSON.';
  end if;
  if jsonb_typeof(p_input -> 'parts') <> 'array' or jsonb_array_length(p_input -> 'parts') = 0 then
    raise exception 'El pago debe contener al menos un medio de pago.';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'La clave de idempotencia es obligatoria.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('CREATE_PAYMENT:' || p_idempotency_key, 0));
  select response_payload, request_hash into v_existing, v_existing_hash
  from public.idempotency_keys
  where scope = 'CREATE_PAYMENT' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_existing is not null then
    if v_existing_hash is distinct from pg_catalog.md5((jsonb_build_object('saleId', p_sale_id, 'input', p_input))::text) then
      raise exception 'La clave de idempotencia ya fue utilizada con otros datos.';
    end if;
    return v_existing;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id, request_hash, status, expires_at)
  values (
    'CREATE_PAYMENT', p_idempotency_key, v_actor,
    pg_catalog.md5((jsonb_build_object('saleId', p_sale_id, 'input', p_input))::text),
    'IN_PROGRESS', now() + interval '24 hours'
  )
  on conflict (scope, idempotency_key) do update set
    actor_user_id = excluded.actor_user_id,
    request_hash = excluded.request_hash,
    status = 'IN_PROGRESS',
    locked_at = now(),
    expires_at = excluded.expires_at;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Venta no encontrada.' using errcode = 'P0002'; end if;
  if v_sale.commercial_state_code in ('CANCELLED', 'ANNULLED') then
    raise exception 'No se pueden registrar pagos en una venta cancelada o anulada.';
  end if;
  if v_sale.balance_amount <= 0 then
    raise exception 'La venta no tiene saldo pendiente.';
  end if;

  for v_part in select value from jsonb_array_elements(p_input -> 'parts')
  loop
    v_amount := round((v_part ->> 'amount')::numeric, 2);
    if v_amount <= 0 then raise exception 'Cada medio de pago debe tener un importe mayor que cero.'; end if;

    select * into v_method from public.payment_methods
    where code = v_part ->> 'paymentMethodCode' and is_active = true;
    if not found then raise exception 'El medio de pago no existe o está inactivo.'; end if;

    select * into v_account from public.financial_accounts
    where id = (v_part ->> 'financialAccountId')::uuid and is_active = true for share;
    if not found then raise exception 'La cuenta financiera no existe o está inactiva.'; end if;
    if v_account.currency_code <> v_sale.currency_code then
      raise exception 'La cuenta financiera debe usar la misma moneda de la venta.';
    end if;

    v_total := v_total + v_amount;
  end loop;

  v_total := round(v_total, 2);
  if v_total > v_sale.balance_amount then
    raise exception 'El pago (%) supera el saldo pendiente (%).', v_total, v_sale.balance_amount using errcode = 'P0001';
  end if;

  insert into public.payments(
    code, sale_id, state_code, declared_amount, currency_code, received_at,
    notes, idempotency_key, created_by, updated_by
  ) values (
    public.next_business_code('PAYMENT'), p_sale_id, 'PENDING', 0, v_sale.currency_code,
    coalesce(nullif(p_input ->> 'receivedAt', '')::timestamptz, now()),
    nullif(btrim(p_input ->> 'notes'), ''), p_idempotency_key, v_actor, v_actor
  ) returning * into v_payment;

  for v_part in select value from jsonb_array_elements(p_input -> 'parts')
  loop
    insert into public.payment_parts(
      payment_id, payment_method_code, financial_account_id, amount,
      currency_code, reference_number, notes
    ) values (
      v_payment.id,
      v_part ->> 'paymentMethodCode',
      (v_part ->> 'financialAccountId')::uuid,
      round((v_part ->> 'amount')::numeric, 2),
      v_sale.currency_code,
      nullif(btrim(v_part ->> 'referenceNumber'), ''),
      nullif(btrim(v_part ->> 'notes'), '')
    );
  end loop;

  select * into v_payment from public.payments where id = v_payment.id;
  v_response := jsonb_build_object(
    'id', v_payment.id,
    'code', v_payment.code,
    'stateCode', v_payment.state_code,
    'version', v_payment.version
  );

  update public.idempotency_keys
  set status = 'COMPLETED', resource_type = 'PAYMENT', resource_id = v_payment.id,
      response_payload = v_response, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'CREATE_PAYMENT' and idempotency_key = p_idempotency_key;

  return v_response;
exception
  when others then
    update public.idempotency_keys set status = 'FAILED', completed_at = now()
    where scope = 'CREATE_PAYMENT' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

create or replace function public.confirm_payment_v1(
  p_payment_id uuid,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_sale public.sales%rowtype;
  v_result uuid;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Pago no encontrado.' using errcode = 'P0002'; end if;

  select * into v_sale from public.sales where id = v_payment.sale_id for update;
  if not found then raise exception 'Venta no encontrada.' using errcode = 'P0002'; end if;
  if v_payment.state_code = 'PENDING' and v_payment.declared_amount > v_sale.balance_amount then
    raise exception 'El pago supera el saldo pendiente actualizado de la venta.' using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.payment_parts pp
    join public.payment_methods pm on pm.code = pp.payment_method_code
    where pp.payment_id = p_payment_id and pm.requires_proof = true
  ) and not exists (
    select 1 from public.attachments a
    where a.entity_type = 'PAYMENT' and a.entity_id = p_payment_id
      and a.attachment_type = 'PROOF' and a.is_active = true
  ) then
    raise exception 'Este pago requiere una constancia antes de confirmarse.' using errcode = 'P0001';
  end if;

  v_result := public.confirm_payment(p_payment_id, p_idempotency_key);
  select * into v_payment from public.payments where id = v_result;
  return jsonb_build_object('id', v_payment.id, 'stateCode', v_payment.state_code, 'version', v_payment.version);
end;
$$;

create or replace function public.reject_payment_v1(
  p_payment_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_actor uuid := private.current_actor_id();
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'El rechazo requiere un motivo.'; end if;

  select * into v_payment from public.payments where id = p_payment_id for update;
  if not found then raise exception 'Pago no encontrado.' using errcode = 'P0002'; end if;
  if v_payment.state_code <> 'PENDING' then raise exception 'Solo se puede rechazar un pago pendiente.'; end if;

  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.payments
  set state_code = 'REJECTED', rejected_at = now(), rejected_by = v_actor,
      rejection_reason = btrim(p_reason), updated_by = v_actor
  where id = p_payment_id returning * into v_payment;

  return jsonb_build_object('id', v_payment.id, 'stateCode', v_payment.state_code, 'version', v_payment.version);
end;
$$;

create or replace function public.reverse_payment_v1(
  p_payment_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment public.payments%rowtype;
  v_result uuid;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if exists (
    select 1
    from public.receipt_payment_allocations rpa
    join public.sales_receipts r on r.id = rpa.receipt_id
    where rpa.payment_id = p_payment_id and r.state_code = 'ISSUED'
  ) then
    raise exception 'Primero anula la boleta emitida y registra su nota de crédito.' using errcode = 'P0001';
  end if;
  v_result := public.reverse_payment(p_payment_id, p_reason, p_idempotency_key);
  select * into v_payment from public.payments where id = v_result;
  return jsonb_build_object('id', v_payment.id, 'stateCode', v_payment.state_code, 'version', v_payment.version);
end;
$$;

create or replace function public.create_receipt_v1(
  p_sale_id uuid,
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_sale public.sales%rowtype;
  v_receipt public.sales_receipts%rowtype;
  v_allocation jsonb;
  v_payment public.payments%rowtype;
  v_amount numeric(14,2);
  v_total numeric(14,2) := 0;
  v_full_number text;
  v_existing jsonb;
  v_existing_hash text;
  v_response jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if jsonb_typeof(p_input -> 'allocations') <> 'array' or jsonb_array_length(p_input -> 'allocations') = 0 then
    raise exception 'La boleta debe asociarse al menos a un pago confirmado.';
  end if;
  if nullif(btrim(p_input ->> 'series'), '') is null or nullif(btrim(p_input ->> 'receiptNumber'), '') is null then
    raise exception 'La serie y el número de boleta son obligatorios.';
  end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'La clave de idempotencia es obligatoria.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('CREATE_RECEIPT:' || p_idempotency_key, 0));
  select response_payload, request_hash into v_existing, v_existing_hash
  from public.idempotency_keys
  where scope = 'CREATE_RECEIPT' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_existing is not null then
    if v_existing_hash is distinct from pg_catalog.md5((jsonb_build_object('saleId', p_sale_id, 'input', p_input))::text) then
      raise exception 'La clave de idempotencia ya fue utilizada con otros datos.';
    end if;
    return v_existing;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id, request_hash, status, expires_at)
  values ('CREATE_RECEIPT', p_idempotency_key, v_actor,
    pg_catalog.md5((jsonb_build_object('saleId', p_sale_id, 'input', p_input))::text),
    'IN_PROGRESS', now() + interval '24 hours')
  on conflict (scope, idempotency_key) do update set actor_user_id = excluded.actor_user_id,
    request_hash = excluded.request_hash, status = 'IN_PROGRESS', locked_at = now(), expires_at = excluded.expires_at;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Venta no encontrada.' using errcode = 'P0002'; end if;

  v_full_number := upper(btrim(p_input ->> 'series')) || '-' || btrim(p_input ->> 'receiptNumber');

  insert into public.sales_receipts(
    code, sale_id, state_code, receipt_type, series, receipt_number, full_number,
    issue_date, amount, currency_code, notes, created_by, updated_by
  ) values (
    public.next_business_code('RECEIPT'), p_sale_id, 'PENDING',
    coalesce(nullif(p_input ->> 'receiptType', ''), 'BOLETA'),
    upper(btrim(p_input ->> 'series')), btrim(p_input ->> 'receiptNumber'), v_full_number,
    (p_input ->> 'issueDate')::date, 0, v_sale.currency_code,
    nullif(btrim(p_input ->> 'notes'), ''), v_actor, v_actor
  ) returning * into v_receipt;

  for v_allocation in select value from jsonb_array_elements(p_input -> 'allocations')
  loop
    select * into v_payment from public.payments
    where id = (v_allocation ->> 'paymentId')::uuid and sale_id = p_sale_id and state_code = 'CONFIRMED'
    for update;
    if not found then raise exception 'La boleta solo puede asociarse a pagos confirmados de la misma venta.'; end if;

    v_amount := round((v_allocation ->> 'amount')::numeric, 2);
    if v_amount <= 0 then raise exception 'Cada importe asignado debe ser mayor que cero.'; end if;
    v_total := v_total + v_amount;

    insert into public.receipt_payment_allocations(receipt_id, payment_id, allocated_amount)
    values (v_receipt.id, v_payment.id, v_amount);
  end loop;

  if v_total <= 0 then raise exception 'El importe de la boleta debe ser mayor que cero.'; end if;

  update public.sales_receipts
  set state_code = 'ISSUED', updated_by = v_actor
  where id = v_receipt.id returning * into v_receipt;

  v_response := jsonb_build_object('id', v_receipt.id, 'stateCode', v_receipt.state_code, 'version', v_receipt.version);
  update public.idempotency_keys
  set status = 'COMPLETED', resource_type = 'RECEIPT', resource_id = v_receipt.id,
      response_payload = v_response, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'CREATE_RECEIPT' and idempotency_key = p_idempotency_key;
  return v_response;
exception
  when others then
    update public.idempotency_keys set status = 'FAILED', completed_at = now()
    where scope = 'CREATE_RECEIPT' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

create or replace function public.annul_receipt_v1(
  p_receipt_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.sales_receipts%rowtype;
  v_actor uuid := private.current_actor_id();
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'La anulación requiere un motivo.'; end if;
  select * into v_receipt from public.sales_receipts where id = p_receipt_id for update;
  if not found then raise exception 'Boleta no encontrada.' using errcode = 'P0002'; end if;
  if v_receipt.state_code <> 'ISSUED' then raise exception 'Solo se puede anular una boleta emitida.'; end if;

  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.sales_receipts
  set state_code = 'ANNULLED', annulled_at = now(), annulled_by = v_actor,
      annulment_reason = btrim(p_reason), updated_by = v_actor
  where id = p_receipt_id returning * into v_receipt;

  return jsonb_build_object('id', v_receipt.id, 'stateCode', v_receipt.state_code, 'version', v_receipt.version);
end;
$$;

create or replace function public.create_credit_note_v1(
  p_receipt_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt public.sales_receipts%rowtype;
  v_note public.credit_notes%rowtype;
  v_actor uuid := private.current_actor_id();
  v_amount numeric(14,2);
  v_full_number text;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_input ->> 'reason', ''))) < 5 then raise exception 'La nota de crédito requiere un motivo.'; end if;

  select * into v_receipt from public.sales_receipts where id = p_receipt_id for update;
  if not found then raise exception 'Boleta no encontrada.' using errcode = 'P0002'; end if;
  if v_receipt.state_code <> 'ANNULLED' then raise exception 'Primero debe anularse la boleta.'; end if;
  if exists(select 1 from public.credit_notes where receipt_id = p_receipt_id) then
    raise exception 'La boleta ya tiene una nota de crédito registrada.';
  end if;

  v_amount := round((p_input ->> 'amount')::numeric, 2);
  if v_amount <> v_receipt.amount then
    raise exception 'La nota de crédito debe cubrir el importe completo de la boleta anulada.';
  end if;
  v_full_number := upper(btrim(p_input ->> 'series')) || '-' || btrim(p_input ->> 'noteNumber');

  insert into public.credit_notes(
    code, receipt_id, series, note_number, full_number, issue_date,
    amount, currency_code, reason, created_by
  ) values (
    public.next_business_code('CREDIT_NOTE'), p_receipt_id,
    upper(btrim(p_input ->> 'series')), btrim(p_input ->> 'noteNumber'), v_full_number,
    (p_input ->> 'issueDate')::date, v_amount, v_receipt.currency_code,
    btrim(p_input ->> 'reason'), v_actor
  ) returning * into v_note;

  update public.sales_receipts set state_code = 'CREDIT_NOTE', updated_by = v_actor
  where id = p_receipt_id;

  return jsonb_build_object('id', v_note.id, 'stateCode', 'CREDIT_NOTE', 'version', v_note.version);
end;
$$;

create or replace function public.calculate_late_penalty_v1(p_sale_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_penalty public.penalties%rowtype;
  v_actor uuid := private.current_actor_id();
  v_rule jsonb;
  v_enabled boolean;
  v_unit numeric(14,2);
  v_currency text;
  v_days integer;
  v_amount numeric(14,2);
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Venta no encontrada.' using errcode = 'P0002'; end if;
  if v_sale.due_at is null then raise exception 'La venta no tiene fecha de vencimiento.'; end if;
  if v_sale.balance_amount <= 0 then raise exception 'La venta no tiene saldo pendiente.'; end if;

  select setting_value into v_rule from public.business_settings where setting_key = 'penalties.late_daily';
  v_enabled := coalesce((v_rule ->> 'enabled')::boolean, true);
  v_unit := coalesce((v_rule ->> 'amount')::numeric, 1);
  v_currency := coalesce(v_rule ->> 'currency', 'PEN');
  if not v_enabled then raise exception 'La penalidad diaria está desactivada.'; end if;
  if v_currency <> v_sale.currency_code then raise exception 'La moneda de la regla no coincide con la venta.'; end if;

  v_days := greatest(
    (now() at time zone 'America/Lima')::date - (v_sale.due_at at time zone 'America/Lima')::date,
    0
  );
  if v_days = 0 then raise exception 'La venta todavía no tiene días de retraso.' using errcode = 'P0001'; end if;
  v_amount := round(v_days * v_unit, 2);

  perform set_config('app.audit_reason', 'Actualización de penalidad diaria por atraso', true);
  select * into v_penalty from public.penalties
  where sale_id = p_sale_id and penalty_type = 'LATE_DAILY' and status = 'ACTIVE'
  for update;

  if found then
    update public.penalties
    set client_id = v_sale.client_id,
        quantity_basis = v_days,
        unit_amount = v_unit,
        amount = v_amount,
        currency_code = v_sale.currency_code,
        calculated_from = v_sale.due_at,
        calculated_to = now(),
        rule_snapshot = v_rule,
        reason = format('Penalidad de %s día(s) de retraso a S/%s por día.', v_days, v_unit),
        updated_at = now()
    where id = v_penalty.id returning * into v_penalty;
  else
    insert into public.penalties(
      sale_id, client_id, penalty_type, quantity_basis, unit_amount, amount,
      currency_code, calculated_from, calculated_to, rule_snapshot, reason,
      status, approved_by, created_by
    ) values (
      p_sale_id, v_sale.client_id, 'LATE_DAILY', v_days, v_unit, v_amount,
      v_sale.currency_code, v_sale.due_at, now(), v_rule,
      format('Penalidad de %s día(s) de retraso a S/%s por día.', v_days, v_unit),
      'ACTIVE', v_actor, v_actor
    ) returning * into v_penalty;
  end if;

  perform public.refresh_sale_totals(p_sale_id);
  return jsonb_build_object('id', v_penalty.id, 'stateCode', v_penalty.status, 'version', v_penalty.version);
end;
$$;

create or replace function public.waive_penalty_v1(
  p_penalty_id uuid,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_penalty public.penalties%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'La exoneración requiere un motivo.'; end if;
  select * into v_penalty from public.penalties where id = p_penalty_id for update;
  if not found then raise exception 'Penalidad no encontrada.' using errcode = 'P0002'; end if;
  if v_penalty.status <> 'ACTIVE' then raise exception 'Solo se puede exonerar una penalidad activa.'; end if;

  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.penalties
  set status = 'WAIVED', reason = reason || E'\nExoneración: ' || btrim(p_reason), updated_at = now()
  where id = p_penalty_id returning * into v_penalty;
  perform public.refresh_sale_totals(v_penalty.sale_id);
  return jsonb_build_object('id', v_penalty.id, 'stateCode', v_penalty.status, 'version', v_penalty.version);
end;
$$;

create or replace function private.validate_receipt_payment_allocation()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_receipt_sale uuid;
  v_payment_sale uuid;
  v_payment_amount numeric(14,2);
  v_already_allocated numeric(14,2);
begin
  select sale_id into v_receipt_sale from public.sales_receipts where id = new.receipt_id;
  select sale_id, declared_amount into v_payment_sale, v_payment_amount
  from public.payments where id = new.payment_id and state_code = 'CONFIRMED';

  if v_receipt_sale is null or v_payment_sale is null or v_receipt_sale <> v_payment_sale then
    raise exception 'La boleta y el pago deben pertenecer a la misma venta, y el pago debe estar confirmado.';
  end if;

  select coalesce(sum(rpa.allocated_amount), 0) into v_already_allocated
  from public.receipt_payment_allocations rpa
  join public.sales_receipts r on r.id = rpa.receipt_id
  where rpa.payment_id = new.payment_id
    and rpa.receipt_id <> new.receipt_id
    and r.state_code not in ('ANNULLED', 'CREDIT_NOTE');

  if v_already_allocated + new.allocated_amount > v_payment_amount then
    raise exception 'La suma asignada a boletas supera el importe confirmado del pago.';
  end if;
  return new;
end;
$$;

revoke all on function public.get_payment_support_v1() from public;
revoke all on function public.get_sale_financial_detail_v1(uuid) from public;
revoke all on function public.create_payment_v1(uuid, jsonb, text) from public;
revoke all on function public.confirm_payment_v1(uuid, text) from public;
revoke all on function public.reject_payment_v1(uuid, text) from public;
revoke all on function public.reverse_payment_v1(uuid, text, text) from public;
revoke all on function public.create_receipt_v1(uuid, jsonb, text) from public;
revoke all on function public.annul_receipt_v1(uuid, text) from public;
revoke all on function public.create_credit_note_v1(uuid, jsonb) from public;
revoke all on function public.calculate_late_penalty_v1(uuid) from public;
revoke all on function public.waive_penalty_v1(uuid, text) from public;

grant execute on function public.get_payment_support_v1() to authenticated;
grant execute on function public.get_sale_financial_detail_v1(uuid) to authenticated;
grant execute on function public.create_payment_v1(uuid, jsonb, text) to authenticated;
grant execute on function public.confirm_payment_v1(uuid, text) to authenticated;
grant execute on function public.reject_payment_v1(uuid, text) to authenticated;
grant execute on function public.reverse_payment_v1(uuid, text, text) to authenticated;
grant execute on function public.create_receipt_v1(uuid, jsonb, text) to authenticated;
grant execute on function public.annul_receipt_v1(uuid, text) to authenticated;
grant execute on function public.create_credit_note_v1(uuid, jsonb) to authenticated;
grant execute on function public.calculate_late_penalty_v1(uuid) to authenticated;
grant execute on function public.waive_penalty_v1(uuid, text) to authenticated;

notify pgrst, 'reload schema';
commit;


-- =========================================================
-- 016_fix_payment_declared_amount.sql
-- =========================================================

-- Yukimi Gestión - Migración 016
-- Corrige el recálculo automático del importe total de un pago.
-- El total debe derivarse de payment_parts, pero el trigger protector
-- estaba bloqueando la actualización interna realizada por el propio sistema.

begin;

create or replace function private.refresh_payment_declared_amount()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_payment_id uuid;
  v_previous_setting text;
begin
  if tg_op = 'DELETE' then
    v_payment_id := old.payment_id;
  else
    v_payment_id := new.payment_id;
  end if;

  v_previous_setting := coalesce(
    pg_catalog.current_setting('app.allow_payment_amount_update', true),
    'false'
  );

  perform pg_catalog.set_config(
    'app.allow_payment_amount_update',
    'true',
    true
  );

  update public.payments p
  set declared_amount = coalesce((
        select round(sum(pp.amount), 2)
        from public.payment_parts pp
        where pp.payment_id = v_payment_id
      ), 0),
      updated_at = now(),
      version = version + 1
  where p.id = v_payment_id;

  perform pg_catalog.set_config(
    'app.allow_payment_amount_update',
    v_previous_setting,
    true
  );

  if tg_op = 'DELETE' then
    return old;
  end if;

  return new;
exception
  when others then
    perform pg_catalog.set_config(
      'app.allow_payment_amount_update',
      coalesce(v_previous_setting, 'false'),
      true
    );
    raise;
end;
$$;

commit;

notify pgrst, 'reload schema';


-- =========================================================
-- 017_deliveries_agencies_api.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 017: entregas parciales, agencias, tracking y salida de inventario

begin;

create index if not exists ix_delivery_items_delivery
  on public.delivery_items(delivery_id, sale_item_id);

create index if not exists ix_deliveries_planned_dispatch
  on public.deliveries(planned_dispatch_date, state_code)
  where state_code not in ('DELIVERED_TO_CLIENT', 'CANCELLED');

create or replace function private.ensure_sale_accumulated_inventory_v1(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_movement_id uuid;
  v_allocation record;
  v_has_rows boolean := false;
begin
  for v_allocation in
    select sia.id, sia.sale_item_id, sia.lot_id, sia.warehouse_id, sia.quantity, si.variant_id
    from public.sale_item_allocations sia
    join public.sale_items si on si.id = sia.sale_item_id
    where si.sale_id = p_sale_id
      and sia.allocation_status = 'RESERVED'
    order by sia.created_at, sia.id
    for update of sia
  loop
    if not v_has_rows then
      insert into public.inventory_movements(
        code, movement_type_code, reference_type, reference_id, reason, created_by, metadata
      ) values (
        public.next_business_code('INVENTORY_MOVEMENT'),
        'DELIVERY',
        'SALE_ACCUMULATION',
        p_sale_id,
        'Traslado de stock reservado a acumulado para el cliente',
        v_actor,
        jsonb_build_object('source', 'ensure_sale_accumulated_inventory_v1')
      ) returning id into v_movement_id;
      v_has_rows := true;
    end if;

    insert into public.inventory_movement_lines(
      movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta
    ) values
      (v_movement_id, v_allocation.variant_id, v_allocation.lot_id, v_allocation.warehouse_id, 'RESERVED', -v_allocation.quantity),
      (v_movement_id, v_allocation.variant_id, v_allocation.lot_id, v_allocation.warehouse_id, 'ACCUMULATED', v_allocation.quantity);

    update public.sale_item_allocations
    set allocation_status = 'ACCUMULATED', updated_by = v_actor
    where id = v_allocation.id;
  end loop;
end;
$$;

create or replace function private.sync_sale_accumulated_inventory_v1()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.delivery_state_code = 'ACCUMULATED'
     and old.delivery_state_code is distinct from new.delivery_state_code then
    perform private.ensure_sale_accumulated_inventory_v1(new.id);
  end if;
  return new;
end;
$$;

drop trigger if exists trg_sync_sale_accumulated_inventory on public.sales;
create trigger trg_sync_sale_accumulated_inventory
after update of delivery_state_code on public.sales
for each row execute function private.sync_sale_accumulated_inventory_v1();

-- Corrige ventas acumuladas creadas antes de esta migración.
do $$
declare
  v_sale record;
begin
  for v_sale in
    select id from public.sales where delivery_state_code = 'ACCUMULATED'
  loop
    perform private.ensure_sale_accumulated_inventory_v1(v_sale.id);
  end loop;
end;
$$;

create or replace function private.refresh_sale_delivery_state_v1(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_total integer;
  v_delivered integer;
  v_next text;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then return; end if;

  select coalesce(sum(quantity), 0)::integer into v_total
  from public.sale_items
  where sale_id = p_sale_id and item_status not in ('CANCELLED', 'RELEASED');

  select coalesce(sum(di.quantity), 0)::integer into v_delivered
  from public.delivery_items di
  join public.deliveries d on d.id = di.delivery_id
  where d.sale_id = p_sale_id and d.state_code = 'DELIVERED_TO_CLIENT';

  if v_total > 0 and v_delivered >= v_total then
    v_next := 'DELIVERED';
  elsif v_delivered > 0 then
    v_next := 'PARTIAL';
  elsif v_sale.delivery_state_code = 'ACCUMULATED' then
    v_next := 'ACCUMULATED';
  else
    v_next := 'PENDING';
  end if;

  if v_sale.delivery_state_code is distinct from v_next
     and v_sale.delivery_state_code not in ('CANCELLED', 'DELIVERED') then
    perform pg_catalog.set_config('app.audit_reason', 'Actualización automática por avance de entrega', true);
    update public.sales
    set delivery_state_code = v_next, updated_by = private.current_actor_id()
    where id = p_sale_id;
  end if;
end;
$$;

create or replace function private.finalize_delivery_inventory_v1(p_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_movement_id uuid;
  v_item record;
  v_allocation record;
  v_needed integer;
  v_take integer;
  v_source_bucket text;
begin
  select id into v_movement_id
  from public.inventory_movements
  where movement_type_code = 'DELIVERY'
    and reference_type = 'DELIVERY'
    and reference_id = p_delivery_id
  order by created_at desc
  limit 1;

  if v_movement_id is not null then
    return v_movement_id;
  end if;

  select * into v_delivery from public.deliveries where id = p_delivery_id for update;
  if not found then raise exception 'Entrega no encontrada.' using errcode = 'P0002'; end if;

  insert into public.inventory_movements(
    code, movement_type_code, reference_type, reference_id, reason, created_by, metadata
  ) values (
    public.next_business_code('INVENTORY_MOVEMENT'),
    'DELIVERY',
    'DELIVERY',
    p_delivery_id,
    'Entrega confirmada al cliente',
    private.current_actor_id(),
    jsonb_build_object('sale_id', v_delivery.sale_id)
  ) returning id into v_movement_id;

  for v_item in
    select di.sale_item_id, di.quantity, si.variant_id
    from public.delivery_items di
    join public.sale_items si on si.id = di.sale_item_id
    where di.delivery_id = p_delivery_id
    order by di.id
  loop
    v_needed := v_item.quantity;

    for v_allocation in
      select sia.*
      from public.sale_item_allocations sia
      where sia.sale_item_id = v_item.sale_item_id
        and sia.allocation_status in ('RESERVED', 'ACCUMULATED')
      order by sia.created_at, sia.id
      for update
    loop
      exit when v_needed <= 0;
      v_take := least(v_needed, v_allocation.quantity);
      v_source_bucket := case when v_allocation.allocation_status = 'ACCUMULATED' then 'ACCUMULATED' else 'RESERVED' end;

      insert into public.inventory_movement_lines(
        movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta
      ) values
        (v_movement_id, v_item.variant_id, v_allocation.lot_id, v_allocation.warehouse_id, v_source_bucket, -v_take),
        (v_movement_id, v_item.variant_id, v_allocation.lot_id, v_allocation.warehouse_id, 'DELIVERED', v_take);

      if v_take = v_allocation.quantity then
        update public.sale_item_allocations
        set allocation_status = 'DELIVERED', delivered_at = coalesce(v_delivery.delivered_at, now()),
            updated_by = private.current_actor_id()
        where id = v_allocation.id;
      else
        update public.sale_item_allocations
        set quantity = quantity - v_take, updated_by = private.current_actor_id()
        where id = v_allocation.id;

        insert into public.sale_item_allocations(
          sale_item_id, lot_id, warehouse_id, quantity, allocation_status,
          reserved_at, delivered_at, created_by, updated_by
        ) values (
          v_allocation.sale_item_id, v_allocation.lot_id, v_allocation.warehouse_id,
          v_take, 'DELIVERED', v_allocation.reserved_at, coalesce(v_delivery.delivered_at, now()),
          private.current_actor_id(), private.current_actor_id()
        );
      end if;

      v_needed := v_needed - v_take;
    end loop;

    if v_needed > 0 then
      raise exception 'No hay suficiente stock reservado o acumulado para completar la entrega.' using errcode = 'P0001';
    end if;
  end loop;

  return v_movement_id;
end;
$$;

create or replace function public.get_delivery_support_v1(p_sale_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_selected jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if p_sale_id is not null then
    select jsonb_build_object(
      'id', s.id,
      'code', s.code,
      'clientId', s.client_id,
      'clientName', s.client_name_snapshot,
      'clientPhone', s.client_phone_snapshot,
      'deliveryStateCode', s.delivery_state_code,
      'addresses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ca.id,
          'label', ca.label,
          'addressLine', ca.address_line,
          'district', ca.district,
          'province', ca.province,
          'department', ca.department,
          'reference', ca.reference,
          'isPrimary', ca.is_default
        ) order by ca.is_default desc, ca.label)
        from public.client_addresses ca
        where ca.client_id = s.client_id and ca.is_active = true
      ), '[]'::jsonb),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'saleItemId', si.id,
          'productName', si.product_name_snapshot,
          'variantName', si.variant_name_snapshot,
          'sku', si.sku_snapshot,
          'quantity', si.quantity,
          'assignedQuantity', coalesce((
            select sum(di.quantity)::integer
            from public.delivery_items di
            join public.deliveries d2 on d2.id = di.delivery_id
            where di.sale_item_id = si.id and d2.state_code <> 'CANCELLED'
          ), 0),
          'remainingQuantity', greatest(si.quantity - coalesce((
            select sum(di.quantity)::integer
            from public.delivery_items di
            join public.deliveries d2 on d2.id = di.delivery_id
            where di.sale_item_id = si.id and d2.state_code <> 'CANCELLED'
          ), 0), 0),
          'allocations', coalesce((
            select jsonb_agg(jsonb_build_object(
              'warehouseName', w.name,
              'quantity', sia.quantity,
              'status', sia.allocation_status
            ) order by w.name, sia.created_at)
            from public.sale_item_allocations sia
            join public.warehouses w on w.id = sia.warehouse_id
            where sia.sale_item_id = si.id
              and sia.allocation_status in ('RESERVED', 'ACCUMULATED')
          ), '[]'::jsonb)
        ) order by si.created_at, si.id)
        from public.sale_items si
        where si.sale_id = s.id
          and si.item_status not in ('CANCELLED', 'RELEASED')
          and si.quantity > coalesce((
            select sum(di.quantity)::integer
            from public.delivery_items di
            join public.deliveries d2 on d2.id = di.delivery_id
            where di.sale_item_id = si.id and d2.state_code <> 'CANCELLED'
          ), 0)
      ), '[]'::jsonb)
    ) into v_selected
    from public.sales s
    where s.id = p_sale_id
      and s.commercial_state_code not in ('CANCELLED', 'ANNULLED');

    if v_selected is null then
      raise exception 'La venta no existe o no admite entregas.' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object(
    'operators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'code', bp.code,
        'name', coalesce(bp.trade_name, bp.legal_name),
        'types', coalesce((
          select jsonb_agg(bpt.partner_type_code order by bpt.partner_type_code)
          from public.business_partner_types bpt
          where bpt.partner_id = bp.id
            and bpt.partner_type_code in ('AGENCY', 'COURIER', 'LOCAL_OPERATOR')
        ), '[]'::jsonb)
      ) order by coalesce(bp.trade_name, bp.legal_name))
      from public.business_partners bp
      where bp.is_active = true
        and exists (
          select 1 from public.business_partner_types bpt
          where bpt.partner_id = bp.id
            and bpt.partner_type_code in ('AGENCY', 'COURIER')
        )
    ), '[]'::jsonb),
    'eligibleSales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id,
        'code', x.code,
        'clientName', x.client_name_snapshot,
        'clientPhone', x.client_phone_snapshot,
        'deliveryStateCode', x.delivery_state_code,
        'remainingUnits', x.remaining_units
      ) order by x.created_at desc)
      from (
        select s.id, s.code, s.client_name_snapshot, s.client_phone_snapshot,
               s.delivery_state_code, s.created_at,
               sum(greatest(si.quantity - coalesce(assigned.qty, 0), 0))::integer as remaining_units
        from public.sales s
        join public.sale_items si on si.sale_id = s.id and si.item_status not in ('CANCELLED', 'RELEASED')
        left join lateral (
          select sum(di.quantity)::integer as qty
          from public.delivery_items di
          join public.deliveries d on d.id = di.delivery_id
          where di.sale_item_id = si.id and d.state_code <> 'CANCELLED'
        ) assigned on true
        where s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
          and s.delivery_state_code <> 'DELIVERED'
        group by s.id
        having sum(greatest(si.quantity - coalesce(assigned.qty, 0), 0)) > 0
        order by s.created_at desc
        limit 100
      ) x
    ), '[]'::jsonb),
    'selectedSale', v_selected
  );
end;
$$;

create or replace function public.list_deliveries_v1(
  p_search text default null,
  p_filter text default 'ALL',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offset integer := greatest(p_page - 1, 0) * p_page_size;
  v_total integer;
  v_items jsonb;
  v_summary jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if p_filter not in ('ALL', 'PENDING_AGENCY', 'ACCUMULATED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED') then
    raise exception 'Filtro de entregas inválido.';
  end if;

  select count(*)::integer into v_total
  from public.deliveries d
  join public.sales s on s.id = d.sale_id
  left join public.business_partners bp on bp.id = d.operator_partner_id
  where (
    nullif(btrim(p_search), '') is null
    or d.code ilike '%' || btrim(p_search) || '%'
    or s.code ilike '%' || btrim(p_search) || '%'
    or s.client_name_snapshot ilike '%' || btrim(p_search) || '%'
    or coalesce(s.client_phone_snapshot, '') ilike '%' || btrim(p_search) || '%'
    or coalesce(d.tracking_number, '') ilike '%' || btrim(p_search) || '%'
    or coalesce(bp.trade_name, bp.legal_name, '') ilike '%' || btrim(p_search) || '%'
  )
  and case p_filter
    when 'PENDING_AGENCY' then d.state_code = 'PENDING_AGENCY_DISPATCH'
    when 'ACCUMULATED' then d.state_code = 'ACCUMULATED'
    when 'IN_TRANSIT' then d.state_code in ('DELIVERED_TO_AGENCY', 'OUT_FOR_DELIVERY', 'PARTIALLY_DELIVERED')
    when 'DELIVERED' then d.state_code = 'DELIVERED_TO_CLIENT'
    when 'CANCELLED' then d.state_code = 'CANCELLED'
    else true
  end;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb) into v_items
  from (
    select d.created_at,
      jsonb_build_object(
        'id', d.id,
        'code', d.code,
        'saleId', s.id,
        'saleCode', s.code,
        'clientId', s.client_id,
        'clientName', s.client_name_snapshot,
        'clientPhone', s.client_phone_snapshot,
        'deliveryMethod', d.delivery_method,
        'stateCode', d.state_code,
        'operatorName', coalesce(bp.trade_name, bp.legal_name),
        'trackingNumber', d.tracking_number,
        'plannedDispatchDate', d.planned_dispatch_date,
        'dispatchedAt', d.dispatched_at,
        'deliveredAt', d.delivered_at,
        'shippingCost', d.shipping_cost,
        'currencyCode', d.currency_code,
        'itemLines', (select count(*)::integer from public.delivery_items di where di.delivery_id = d.id),
        'totalUnits', (select coalesce(sum(di.quantity), 0)::integer from public.delivery_items di where di.delivery_id = d.id),
        'createdAt', d.created_at,
        'version', d.version
      ) as row_json
    from public.deliveries d
    join public.sales s on s.id = d.sale_id
    left join public.business_partners bp on bp.id = d.operator_partner_id
    where (
      nullif(btrim(p_search), '') is null
      or d.code ilike '%' || btrim(p_search) || '%'
      or s.code ilike '%' || btrim(p_search) || '%'
      or s.client_name_snapshot ilike '%' || btrim(p_search) || '%'
      or coalesce(s.client_phone_snapshot, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(d.tracking_number, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(bp.trade_name, bp.legal_name, '') ilike '%' || btrim(p_search) || '%'
    )
    and case p_filter
      when 'PENDING_AGENCY' then d.state_code = 'PENDING_AGENCY_DISPATCH'
      when 'ACCUMULATED' then d.state_code = 'ACCUMULATED'
      when 'IN_TRANSIT' then d.state_code in ('DELIVERED_TO_AGENCY', 'OUT_FOR_DELIVERY', 'PARTIALLY_DELIVERED')
      when 'DELIVERED' then d.state_code = 'DELIVERED_TO_CLIENT'
      when 'CANCELLED' then d.state_code = 'CANCELLED'
      else true
    end
    order by d.created_at desc
    limit p_page_size offset v_offset
  ) paged;

  select jsonb_build_object(
    'pending', count(*) filter (where state_code in ('PENDING_INSTRUCTIONS', 'PENDING_AGENCY_DISPATCH'))::integer,
    'accumulated', (select count(*)::integer from public.sales where delivery_state_code = 'ACCUMULATED' and commercial_state_code not in ('CANCELLED', 'ANNULLED')),
    'inTransit', count(*) filter (where state_code in ('DELIVERED_TO_AGENCY', 'OUT_FOR_DELIVERY', 'PARTIALLY_DELIVERED'))::integer,
    'deliveredThisMonth', count(*) filter (
      where state_code = 'DELIVERED_TO_CLIENT'
        and delivered_at >= date_trunc('month', now())
    )::integer
  ) into v_summary
  from public.deliveries;

  return jsonb_build_object(
    'items', v_items,
    'summary', v_summary,
    'page', greatest(p_page, 1),
    'pageSize', p_page_size,
    'total', v_total
  );
end;
$$;

create or replace function public.get_delivery_detail_v1(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', d.id,
    'code', d.code,
    'saleId', s.id,
    'saleCode', s.code,
    'clientId', s.client_id,
    'clientName', s.client_name_snapshot,
    'clientPhone', s.client_phone_snapshot,
    'deliveryMethod', d.delivery_method,
    'stateCode', d.state_code,
    'operatorPartnerId', d.operator_partner_id,
    'operatorName', coalesce(bp.trade_name, bp.legal_name),
    'destinationAddressId', d.destination_address_id,
    'destinationLabel', ca.label,
    'destinationAddress', case when ca.id is null then null else concat_ws(', ', ca.address_line, ca.district, ca.province, ca.department) end,
    'trackingNumber', d.tracking_number,
    'shippingCost', d.shipping_cost,
    'currencyCode', d.currency_code,
    'costPayer', d.cost_payer,
    'plannedDispatchDate', d.planned_dispatch_date,
    'dispatchedAt', d.dispatched_at,
    'agencyReceivedAt', d.agency_received_at,
    'deliveredAt', d.delivered_at,
    'notes', d.notes,
    'createdByName', creator.display_name,
    'createdAt', d.created_at,
    'version', d.version,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', di.id,
        'saleItemId', si.id,
        'productName', si.product_name_snapshot,
        'variantName', si.variant_name_snapshot,
        'sku', si.sku_snapshot,
        'quantity', di.quantity
      ) order by si.created_at, si.id)
      from public.delivery_items di
      join public.sale_items si on si.id = di.sale_item_id
      where di.delivery_id = d.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'previousStateCode', h.previous_state_code,
        'newStateCode', h.new_state_code,
        'reason', h.reason,
        'changedByName', hp.display_name,
        'changedAt', h.changed_at
      ) order by h.changed_at desc)
      from public.delivery_state_history h
      left join public.profiles hp on hp.id = h.changed_by
      where h.delivery_id = d.id
    ), '[]'::jsonb),
    'allowedTransitions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stateCode', wt.to_state_code,
        'name', ws.label,
        'requiresReason', wt.requires_reason
      ) order by ws.sort_order)
      from public.workflow_transitions wt
      join public.workflow_states ws
        on ws.workflow_code = wt.workflow_code and ws.state_code = wt.to_state_code
      where wt.workflow_code = 'DELIVERY'
        and wt.from_state_code = d.state_code
        and wt.is_active = true
        and wt.to_state_code <> 'PARTIALLY_DELIVERED'
    ), '[]'::jsonb)
  ) into v_result
  from public.deliveries d
  join public.sales s on s.id = d.sale_id
  left join public.business_partners bp on bp.id = d.operator_partner_id
  left join public.client_addresses ca on ca.id = d.destination_address_id
  left join public.profiles creator on creator.id = d.created_by
  where d.id = p_delivery_id;

  if v_result is null then
    raise exception 'Entrega no encontrada.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

create or replace function public.create_delivery_v1(
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_existing jsonb;
  v_existing_hash text;
  v_sale public.sales%rowtype;
  v_delivery public.deliveries%rowtype;
  v_item jsonb;
  v_method text;
  v_state text;
  v_operator uuid;
  v_address uuid;
  v_response jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_input) <> 'object' then raise exception 'La entrega debe enviarse como un objeto JSON.'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'La clave de idempotencia es obligatoria.'; end if;
  if jsonb_typeof(p_input -> 'items') <> 'array' or jsonb_array_length(p_input -> 'items') = 0 then
    raise exception 'La entrega debe contener al menos un producto.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('CREATE_DELIVERY:' || p_idempotency_key, 0));
  select response_payload, request_hash into v_existing, v_existing_hash
  from public.idempotency_keys
  where scope = 'CREATE_DELIVERY' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_existing is not null then
    if v_existing_hash is distinct from pg_catalog.md5(p_input::text) then
      raise exception 'La clave de idempotencia ya fue utilizada con otros datos.';
    end if;
    return v_existing;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id, request_hash, status, expires_at)
  values ('CREATE_DELIVERY', p_idempotency_key, v_actor, pg_catalog.md5(p_input::text), 'IN_PROGRESS', now() + interval '24 hours')
  on conflict (scope, idempotency_key) do update set
    actor_user_id = excluded.actor_user_id,
    request_hash = excluded.request_hash,
    status = 'IN_PROGRESS',
    locked_at = now(),
    expires_at = excluded.expires_at;

  select * into v_sale from public.sales
  where id = (p_input ->> 'saleId')::uuid
  for update;
  if not found or v_sale.commercial_state_code in ('CANCELLED', 'ANNULLED') then
    raise exception 'La venta no existe o está cancelada.' using errcode = 'P0001';
  end if;
  if v_sale.delivery_state_code = 'DELIVERED' then
    raise exception 'La venta ya fue entregada por completo.' using errcode = 'P0001';
  end if;

  v_method := p_input ->> 'deliveryMethod';
  if v_method not in ('AGENCY', 'MOTORBIKE', 'IN_PERSON', 'WAREHOUSE_ACCUMULATION', 'OTHER') then
    raise exception 'Método de entrega inválido.';
  end if;
  v_operator := nullif(p_input ->> 'operatorPartnerId', '')::uuid;
  v_address := nullif(p_input ->> 'destinationAddressId', '')::uuid;

  if v_method = 'AGENCY' then
    if v_operator is null or not exists (
      select 1 from public.business_partner_types
      where partner_id = v_operator and partner_type_code = 'AGENCY'
    ) then raise exception 'Selecciona una agencia válida.'; end if;
  elsif v_method = 'MOTORBIKE' then
    if v_operator is null or not exists (
      select 1 from public.business_partner_types
      where partner_id = v_operator and partner_type_code = 'COURIER'
    ) then raise exception 'Selecciona un courier o motorizado válido.'; end if;
  end if;

  if v_address is not null and not exists (
    select 1 from public.client_addresses
    where id = v_address and client_id = v_sale.client_id and is_active = true
  ) then raise exception 'La dirección no pertenece al cliente de la venta.'; end if;

  -- Bloqueo determinista para impedir entregas concurrentes por encima de lo vendido.
  perform 1
  from public.sale_items si
  where si.id in (
    select (x.value ->> 'saleItemId')::uuid from jsonb_array_elements(p_input -> 'items') x
  )
  order by si.id
  for update;

  v_state := case
    when v_method = 'AGENCY' then 'PENDING_AGENCY_DISPATCH'
    when v_method = 'WAREHOUSE_ACCUMULATION' then 'ACCUMULATED'
    else 'PENDING_INSTRUCTIONS'
  end;

  perform pg_catalog.set_config('app.audit_reason', 'Creación de entrega', true);
  insert into public.deliveries(
    code, sale_id, state_code, delivery_method, operator_partner_id,
    destination_address_id, tracking_number, shipping_cost, currency_code,
    cost_payer, planned_dispatch_date, notes, created_by, updated_by
  ) values (
    null, v_sale.id, v_state, v_method, v_operator,
    v_address, nullif(btrim(p_input ->> 'trackingNumber'), ''),
    coalesce((p_input ->> 'shippingCost')::numeric, 0), v_sale.currency_code,
    coalesce(nullif(p_input ->> 'costPayer', ''), 'CLIENT'),
    nullif(p_input ->> 'plannedDispatchDate', '')::date,
    nullif(btrim(p_input ->> 'notes'), ''), v_actor, v_actor
  ) returning * into v_delivery;

  for v_item in select value from jsonb_array_elements(p_input -> 'items')
  loop
    if coalesce((v_item ->> 'quantity')::integer, 0) <= 0 then
      raise exception 'Cada producto debe tener una cantidad mayor que cero.';
    end if;
    if not exists (
      select 1 from public.sale_items si
      where si.id = (v_item ->> 'saleItemId')::uuid
        and si.sale_id = v_sale.id
        and si.item_status not in ('CANCELLED', 'RELEASED')
    ) then raise exception 'Un producto no pertenece a la venta o ya fue liberado.'; end if;

    insert into public.delivery_items(delivery_id, sale_item_id, quantity)
    values (v_delivery.id, (v_item ->> 'saleItemId')::uuid, (v_item ->> 'quantity')::integer);
  end loop;

  insert into public.delivery_state_history(
    delivery_id, previous_state_code, new_state_code, reason, changed_by
  ) values (
    v_delivery.id, null, v_state, 'Entrega creada', v_actor
  );

  if v_method = 'WAREHOUSE_ACCUMULATION' then
    if v_sale.delivery_state_code = 'PENDING' then
      perform pg_catalog.set_config('app.audit_reason', 'Cliente acumula productos en almacén', true);
      update public.sales
      set delivery_state_code = 'ACCUMULATED', updated_by = v_actor
      where id = v_sale.id;
    else
      perform private.ensure_sale_accumulated_inventory_v1(v_sale.id);
    end if;
  elsif v_sale.delivery_state_code = 'ACCUMULATED' then
    perform private.ensure_sale_accumulated_inventory_v1(v_sale.id);
  end if;

  perform public.refresh_sale_totals(v_sale.id);

  insert into public.outbox_events(event_type, aggregate_type, aggregate_id, payload, deduplication_key)
  values (
    'DELIVERY_CREATED', 'DELIVERY', v_delivery.id,
    jsonb_build_object('delivery_id', v_delivery.id, 'sale_id', v_sale.id, 'method', v_method),
    'delivery-created:' || p_idempotency_key
  ) on conflict (deduplication_key) where deduplication_key is not null do nothing;

  select * into v_delivery from public.deliveries where id = v_delivery.id;
  v_response := jsonb_build_object(
    'id', v_delivery.id,
    'code', v_delivery.code,
    'stateCode', v_delivery.state_code,
    'version', v_delivery.version
  );
  update public.idempotency_keys
  set status = 'COMPLETED', resource_type = 'DELIVERY', resource_id = v_delivery.id,
      response_payload = v_response, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'CREATE_DELIVERY' and idempotency_key = p_idempotency_key;
  return v_response;
exception
  when others then
    update public.idempotency_keys set status = 'FAILED', completed_at = now()
    where scope = 'CREATE_DELIVERY' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

create or replace function public.advance_delivery_v1(
  p_delivery_id uuid,
  p_next_state_code text,
  p_reason text,
  p_occurred_at timestamptz default null,
  p_tracking_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_when timestamptz := coalesce(p_occurred_at, now());
  v_tracking text;
  v_movement_id uuid;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if length(btrim(coalesce(p_reason, ''))) < 3 then
    raise exception 'Indica el motivo o detalle del cambio.';
  end if;

  select * into v_delivery from public.deliveries where id = p_delivery_id for update;
  if not found then raise exception 'Entrega no encontrada.' using errcode = 'P0002'; end if;
  if v_delivery.state_code = p_next_state_code then
    return jsonb_build_object('id', v_delivery.id, 'code', v_delivery.code, 'stateCode', v_delivery.state_code, 'version', v_delivery.version);
  end if;

  v_tracking := coalesce(nullif(btrim(p_tracking_number), ''), v_delivery.tracking_number);
  if p_next_state_code = 'DELIVERED_TO_AGENCY' and (v_delivery.delivery_method <> 'AGENCY' or v_tracking is null) then
    raise exception 'Para registrar la entrega a la agencia debes indicar el número de seguimiento.';
  end if;
  if p_next_state_code = 'OUT_FOR_DELIVERY' and v_delivery.delivery_method not in ('MOTORBIKE', 'OTHER') then
    raise exception 'El estado En reparto corresponde a motorizado, courier u otro operador.';
  end if;

  perform pg_catalog.set_config('app.audit_reason', btrim(p_reason), true);
  update public.deliveries
  set state_code = p_next_state_code,
      tracking_number = v_tracking,
      dispatched_at = case
        when p_next_state_code in ('DELIVERED_TO_AGENCY', 'OUT_FOR_DELIVERY') then coalesce(dispatched_at, v_when)
        else dispatched_at end,
      agency_received_at = case
        when p_next_state_code = 'DELIVERED_TO_AGENCY' then coalesce(agency_received_at, v_when)
        else agency_received_at end,
      delivered_at = case
        when p_next_state_code = 'DELIVERED_TO_CLIENT' then coalesce(delivered_at, v_when)
        else delivered_at end,
      updated_by = private.current_actor_id()
  where id = p_delivery_id
  returning * into v_delivery;

  if p_next_state_code = 'DELIVERED_TO_CLIENT' then
    v_movement_id := private.finalize_delivery_inventory_v1(p_delivery_id);
  end if;

  perform private.refresh_sale_delivery_state_v1(v_delivery.sale_id);
  perform public.refresh_sale_totals(v_delivery.sale_id);

  insert into public.outbox_events(event_type, aggregate_type, aggregate_id, payload, deduplication_key)
  values (
    case
      when p_next_state_code = 'DELIVERED_TO_AGENCY' then 'DELIVERY_DISPATCHED_TO_AGENCY'
      when p_next_state_code = 'DELIVERED_TO_CLIENT' then 'DELIVERY_COMPLETED'
      when p_next_state_code = 'CANCELLED' then 'DELIVERY_CANCELLED'
      else 'DELIVERY_STATE_CHANGED'
    end,
    'DELIVERY', p_delivery_id,
    jsonb_build_object(
      'delivery_id', p_delivery_id,
      'sale_id', v_delivery.sale_id,
      'state_code', p_next_state_code,
      'tracking_number', v_tracking,
      'inventory_movement_id', v_movement_id
    ),
    'delivery-state:' || p_delivery_id::text || ':' || p_next_state_code || ':' || v_delivery.version::text
  ) on conflict (deduplication_key) where deduplication_key is not null do nothing;

  return jsonb_build_object(
    'id', v_delivery.id,
    'code', v_delivery.code,
    'stateCode', v_delivery.state_code,
    'version', v_delivery.version
  );
end;
$$;

revoke all on function public.get_delivery_support_v1(uuid) from public;
revoke all on function public.list_deliveries_v1(text, text, integer, integer) from public;
revoke all on function public.get_delivery_detail_v1(uuid) from public;
revoke all on function public.create_delivery_v1(jsonb, text) from public;
revoke all on function public.advance_delivery_v1(uuid, text, text, timestamptz, text) from public;

grant execute on function public.get_delivery_support_v1(uuid) to authenticated;
grant execute on function public.list_deliveries_v1(text, text, integer, integer) to authenticated;
grant execute on function public.get_delivery_detail_v1(uuid) to authenticated;
grant execute on function public.create_delivery_v1(jsonb, text) to authenticated;
grant execute on function public.advance_delivery_v1(uuid, text, text, timestamptz, text) to authenticated;

notify pgrst, 'reload schema';
commit;


-- =========================================================
-- 018_edit_pending_deliveries.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 018: edición auditada de entregas pendientes

begin;

alter table public.delivery_items
  add column if not exists is_active boolean not null default true;

create index if not exists ix_delivery_items_active
  on public.delivery_items(delivery_id, sale_item_id)
  where is_active = true;

-- Permite corregir el método antes del despacho, conservando el cambio en el flujo.
insert into public.workflow_transitions(
  workflow_code, from_state_code, to_state_code, requires_confirmation, requires_reason, is_active
) values
  ('DELIVERY','ACCUMULATED','PENDING_INSTRUCTIONS',false,true,true),
  ('DELIVERY','PENDING_AGENCY_DISPATCH','PENDING_INSTRUCTIONS',false,true,true),
  ('DELIVERY','PENDING_AGENCY_DISPATCH','ACCUMULATED',false,true,true)
on conflict (workflow_code, from_state_code, to_state_code) do update set
  requires_confirmation = excluded.requires_confirmation,
  requires_reason = excluded.requires_reason,
  is_active = true;

create or replace function private.validate_delivery_item_quantity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sold integer;
  v_other_delivered integer;
  v_item_sale_id uuid;
  v_delivery_sale_id uuid;
begin
  if new.is_active = false then
    return new;
  end if;

  select quantity, sale_id into v_sold, v_item_sale_id
  from public.sale_items
  where id = new.sale_item_id;

  select sale_id into v_delivery_sale_id
  from public.deliveries
  where id = new.delivery_id;

  if v_item_sale_id is null or v_delivery_sale_id is null or v_item_sale_id <> v_delivery_sale_id then
    raise exception 'El producto entregado debe pertenecer a la misma venta de la entrega.';
  end if;

  select coalesce(sum(di.quantity), 0)
  into v_other_delivered
  from public.delivery_items di
  join public.deliveries d on d.id = di.delivery_id
  where di.sale_item_id = new.sale_item_id
    and di.is_active = true
    and d.state_code <> 'CANCELLED'
    and di.id <> new.id;

  if v_other_delivered + new.quantity > v_sold then
    raise exception 'La cantidad total de entregas supera la cantidad vendida.';
  end if;

  return new;
end;
$$;

create or replace function private.refresh_sale_delivery_state_v1(p_sale_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_sale public.sales%rowtype;
  v_total integer;
  v_delivered integer;
  v_next text;
begin
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then return; end if;

  select coalesce(sum(quantity), 0)::integer into v_total
  from public.sale_items
  where sale_id = p_sale_id and item_status not in ('CANCELLED', 'RELEASED');

  select coalesce(sum(di.quantity), 0)::integer into v_delivered
  from public.delivery_items di
  join public.deliveries d on d.id = di.delivery_id
  where d.sale_id = p_sale_id
    and d.state_code = 'DELIVERED_TO_CLIENT'
    and di.is_active = true;

  if v_total > 0 and v_delivered >= v_total then
    v_next := 'DELIVERED';
  elsif v_delivered > 0 then
    v_next := 'PARTIAL';
  elsif v_sale.delivery_state_code = 'ACCUMULATED' then
    v_next := 'ACCUMULATED';
  else
    v_next := 'PENDING';
  end if;

  if v_sale.delivery_state_code is distinct from v_next
     and v_sale.delivery_state_code not in ('CANCELLED', 'DELIVERED') then
    perform pg_catalog.set_config('app.audit_reason', 'Actualización automática por avance de entrega', true);
    update public.sales
    set delivery_state_code = v_next, updated_by = private.current_actor_id()
    where id = p_sale_id;
  end if;
end;
$$;

create or replace function private.finalize_delivery_inventory_v1(p_delivery_id uuid)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_movement_id uuid;
  v_item record;
  v_allocation record;
  v_needed integer;
  v_take integer;
  v_source_bucket text;
begin
  select id into v_movement_id
  from public.inventory_movements
  where movement_type_code = 'DELIVERY'
    and reference_type = 'DELIVERY'
    and reference_id = p_delivery_id
  order by created_at desc
  limit 1;

  if v_movement_id is not null then
    return v_movement_id;
  end if;

  select * into v_delivery from public.deliveries where id = p_delivery_id for update;
  if not found then raise exception 'Entrega no encontrada.' using errcode = 'P0002'; end if;

  insert into public.inventory_movements(
    code, movement_type_code, reference_type, reference_id, reason, created_by, metadata
  ) values (
    public.next_business_code('INVENTORY_MOVEMENT'),
    'DELIVERY',
    'DELIVERY',
    p_delivery_id,
    'Entrega confirmada al cliente',
    private.current_actor_id(),
    jsonb_build_object('sale_id', v_delivery.sale_id)
  ) returning id into v_movement_id;

  for v_item in
    select di.sale_item_id, di.quantity, si.variant_id
    from public.delivery_items di
    join public.sale_items si on si.id = di.sale_item_id
    where di.delivery_id = p_delivery_id
      and di.is_active = true
    order by di.id
  loop
    v_needed := v_item.quantity;

    for v_allocation in
      select sia.*
      from public.sale_item_allocations sia
      where sia.sale_item_id = v_item.sale_item_id
        and sia.allocation_status in ('RESERVED', 'ACCUMULATED')
      order by sia.created_at, sia.id
      for update
    loop
      exit when v_needed <= 0;
      v_take := least(v_needed, v_allocation.quantity);
      v_source_bucket := case when v_allocation.allocation_status = 'ACCUMULATED' then 'ACCUMULATED' else 'RESERVED' end;

      insert into public.inventory_movement_lines(
        movement_id, variant_id, lot_id, warehouse_id, bucket_code, quantity_delta
      ) values
        (v_movement_id, v_item.variant_id, v_allocation.lot_id, v_allocation.warehouse_id, v_source_bucket, -v_take),
        (v_movement_id, v_item.variant_id, v_allocation.lot_id, v_allocation.warehouse_id, 'DELIVERED', v_take);

      if v_take = v_allocation.quantity then
        update public.sale_item_allocations
        set allocation_status = 'DELIVERED', delivered_at = coalesce(v_delivery.delivered_at, now()),
            updated_by = private.current_actor_id()
        where id = v_allocation.id;
      else
        update public.sale_item_allocations
        set quantity = quantity - v_take, updated_by = private.current_actor_id()
        where id = v_allocation.id;

        insert into public.sale_item_allocations(
          sale_item_id, lot_id, warehouse_id, quantity, allocation_status,
          reserved_at, delivered_at, created_by, updated_by
        ) values (
          v_allocation.sale_item_id, v_allocation.lot_id, v_allocation.warehouse_id,
          v_take, 'DELIVERED', v_allocation.reserved_at, coalesce(v_delivery.delivered_at, now()),
          private.current_actor_id(), private.current_actor_id()
        );
      end if;

      v_needed := v_needed - v_take;
    end loop;

    if v_needed > 0 then
      raise exception 'No hay suficiente stock reservado o acumulado para completar la entrega.' using errcode = 'P0001';
    end if;
  end loop;

  return v_movement_id;
end;
$$;

create or replace function public.get_delivery_support_v1(p_sale_id uuid default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_selected jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if p_sale_id is not null then
    select jsonb_build_object(
      'id', s.id,
      'code', s.code,
      'clientId', s.client_id,
      'clientName', s.client_name_snapshot,
      'clientPhone', s.client_phone_snapshot,
      'deliveryStateCode', s.delivery_state_code,
      'addresses', coalesce((
        select jsonb_agg(jsonb_build_object(
          'id', ca.id,
          'label', ca.label,
          'addressLine', ca.address_line,
          'district', ca.district,
          'province', ca.province,
          'department', ca.department,
          'reference', ca.reference,
          'isPrimary', ca.is_default
        ) order by ca.is_default desc, ca.label)
        from public.client_addresses ca
        where ca.client_id = s.client_id and ca.is_active = true
      ), '[]'::jsonb),
      'items', coalesce((
        select jsonb_agg(jsonb_build_object(
          'saleItemId', si.id,
          'productName', si.product_name_snapshot,
          'variantName', si.variant_name_snapshot,
          'sku', si.sku_snapshot,
          'quantity', si.quantity,
          'assignedQuantity', coalesce((
            select sum(di.quantity)::integer
            from public.delivery_items di
            join public.deliveries d2 on d2.id = di.delivery_id
            where di.sale_item_id = si.id and d2.state_code <> 'CANCELLED' and di.is_active = true
          ), 0),
          'remainingQuantity', greatest(si.quantity - coalesce((
            select sum(di.quantity)::integer
            from public.delivery_items di
            join public.deliveries d2 on d2.id = di.delivery_id
            where di.sale_item_id = si.id and d2.state_code <> 'CANCELLED' and di.is_active = true
          ), 0), 0),
          'allocations', coalesce((
            select jsonb_agg(jsonb_build_object(
              'warehouseName', w.name,
              'quantity', sia.quantity,
              'status', sia.allocation_status
            ) order by w.name, sia.created_at)
            from public.sale_item_allocations sia
            join public.warehouses w on w.id = sia.warehouse_id
            where sia.sale_item_id = si.id
              and sia.allocation_status in ('RESERVED', 'ACCUMULATED')
          ), '[]'::jsonb)
        ) order by si.created_at, si.id)
        from public.sale_items si
        where si.sale_id = s.id
          and si.item_status not in ('CANCELLED', 'RELEASED')
          and si.quantity > coalesce((
            select sum(di.quantity)::integer
            from public.delivery_items di
            join public.deliveries d2 on d2.id = di.delivery_id
            where di.sale_item_id = si.id and d2.state_code <> 'CANCELLED' and di.is_active = true
          ), 0)
      ), '[]'::jsonb)
    ) into v_selected
    from public.sales s
    where s.id = p_sale_id
      and s.commercial_state_code not in ('CANCELLED', 'ANNULLED');

    if v_selected is null then
      raise exception 'La venta no existe o no admite entregas.' using errcode = 'P0002';
    end if;
  end if;

  return jsonb_build_object(
    'operators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'code', bp.code,
        'name', coalesce(bp.trade_name, bp.legal_name),
        'types', coalesce((
          select jsonb_agg(bpt.partner_type_code order by bpt.partner_type_code)
          from public.business_partner_types bpt
          where bpt.partner_id = bp.id
            and bpt.partner_type_code in ('AGENCY', 'COURIER', 'LOCAL_OPERATOR')
        ), '[]'::jsonb)
      ) order by coalesce(bp.trade_name, bp.legal_name))
      from public.business_partners bp
      where bp.is_active = true
        and exists (
          select 1 from public.business_partner_types bpt
          where bpt.partner_id = bp.id
            and bpt.partner_type_code in ('AGENCY', 'COURIER')
        )
    ), '[]'::jsonb),
    'eligibleSales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', x.id,
        'code', x.code,
        'clientName', x.client_name_snapshot,
        'clientPhone', x.client_phone_snapshot,
        'deliveryStateCode', x.delivery_state_code,
        'remainingUnits', x.remaining_units
      ) order by x.created_at desc)
      from (
        select s.id, s.code, s.client_name_snapshot, s.client_phone_snapshot,
               s.delivery_state_code, s.created_at,
               sum(greatest(si.quantity - coalesce(assigned.qty, 0), 0))::integer as remaining_units
        from public.sales s
        join public.sale_items si on si.sale_id = s.id and si.item_status not in ('CANCELLED', 'RELEASED')
        left join lateral (
          select sum(di.quantity)::integer as qty
          from public.delivery_items di
          join public.deliveries d on d.id = di.delivery_id
          where di.sale_item_id = si.id and d.state_code <> 'CANCELLED' and di.is_active = true
        ) assigned on true
        where s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
          and s.delivery_state_code <> 'DELIVERED'
        group by s.id
        having sum(greatest(si.quantity - coalesce(assigned.qty, 0), 0)) > 0
        order by s.created_at desc
        limit 100
      ) x
    ), '[]'::jsonb),
    'selectedSale', v_selected
  );
end;
$$;

create or replace function public.list_deliveries_v1(
  p_search text default null,
  p_filter text default 'ALL',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offset integer := greatest(p_page - 1, 0) * p_page_size;
  v_total integer;
  v_items jsonb;
  v_summary jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if p_filter not in ('ALL', 'PENDING_AGENCY', 'ACCUMULATED', 'IN_TRANSIT', 'DELIVERED', 'CANCELLED') then
    raise exception 'Filtro de entregas inválido.';
  end if;

  select count(*)::integer into v_total
  from public.deliveries d
  join public.sales s on s.id = d.sale_id
  left join public.business_partners bp on bp.id = d.operator_partner_id
  where (
    nullif(btrim(p_search), '') is null
    or d.code ilike '%' || btrim(p_search) || '%'
    or s.code ilike '%' || btrim(p_search) || '%'
    or s.client_name_snapshot ilike '%' || btrim(p_search) || '%'
    or coalesce(s.client_phone_snapshot, '') ilike '%' || btrim(p_search) || '%'
    or coalesce(d.tracking_number, '') ilike '%' || btrim(p_search) || '%'
    or coalesce(bp.trade_name, bp.legal_name, '') ilike '%' || btrim(p_search) || '%'
  )
  and case p_filter
    when 'PENDING_AGENCY' then d.state_code = 'PENDING_AGENCY_DISPATCH'
    when 'ACCUMULATED' then d.state_code = 'ACCUMULATED'
    when 'IN_TRANSIT' then d.state_code in ('DELIVERED_TO_AGENCY', 'OUT_FOR_DELIVERY', 'PARTIALLY_DELIVERED')
    when 'DELIVERED' then d.state_code = 'DELIVERED_TO_CLIENT'
    when 'CANCELLED' then d.state_code = 'CANCELLED'
    else true
  end;

  select coalesce(jsonb_agg(row_json order by created_at desc), '[]'::jsonb) into v_items
  from (
    select d.created_at,
      jsonb_build_object(
        'id', d.id,
        'code', d.code,
        'saleId', s.id,
        'saleCode', s.code,
        'clientId', s.client_id,
        'clientName', s.client_name_snapshot,
        'clientPhone', s.client_phone_snapshot,
        'deliveryMethod', d.delivery_method,
        'stateCode', d.state_code,
        'operatorName', coalesce(bp.trade_name, bp.legal_name),
        'trackingNumber', d.tracking_number,
        'plannedDispatchDate', d.planned_dispatch_date,
        'dispatchedAt', d.dispatched_at,
        'deliveredAt', d.delivered_at,
        'shippingCost', d.shipping_cost,
        'currencyCode', d.currency_code,
        'itemLines', (select count(*)::integer from public.delivery_items di where di.delivery_id = d.id and di.is_active = true),
        'totalUnits', (select coalesce(sum(di.quantity), 0)::integer from public.delivery_items di where di.delivery_id = d.id and di.is_active = true),
        'createdAt', d.created_at,
        'version', d.version
      ) as row_json
    from public.deliveries d
    join public.sales s on s.id = d.sale_id
    left join public.business_partners bp on bp.id = d.operator_partner_id
    where (
      nullif(btrim(p_search), '') is null
      or d.code ilike '%' || btrim(p_search) || '%'
      or s.code ilike '%' || btrim(p_search) || '%'
      or s.client_name_snapshot ilike '%' || btrim(p_search) || '%'
      or coalesce(s.client_phone_snapshot, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(d.tracking_number, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(bp.trade_name, bp.legal_name, '') ilike '%' || btrim(p_search) || '%'
    )
    and case p_filter
      when 'PENDING_AGENCY' then d.state_code = 'PENDING_AGENCY_DISPATCH'
      when 'ACCUMULATED' then d.state_code = 'ACCUMULATED'
      when 'IN_TRANSIT' then d.state_code in ('DELIVERED_TO_AGENCY', 'OUT_FOR_DELIVERY', 'PARTIALLY_DELIVERED')
      when 'DELIVERED' then d.state_code = 'DELIVERED_TO_CLIENT'
      when 'CANCELLED' then d.state_code = 'CANCELLED'
      else true
    end
    order by d.created_at desc
    limit p_page_size offset v_offset
  ) paged;

  select jsonb_build_object(
    'pending', count(*) filter (where state_code in ('PENDING_INSTRUCTIONS', 'PENDING_AGENCY_DISPATCH'))::integer,
    'accumulated', (select count(*)::integer from public.sales where delivery_state_code = 'ACCUMULATED' and commercial_state_code not in ('CANCELLED', 'ANNULLED')),
    'inTransit', count(*) filter (where state_code in ('DELIVERED_TO_AGENCY', 'OUT_FOR_DELIVERY', 'PARTIALLY_DELIVERED'))::integer,
    'deliveredThisMonth', count(*) filter (
      where state_code = 'DELIVERED_TO_CLIENT'
        and delivered_at >= date_trunc('month', now())
    )::integer
  ) into v_summary
  from public.deliveries;

  return jsonb_build_object(
    'items', v_items,
    'summary', v_summary,
    'page', greatest(p_page, 1),
    'pageSize', p_page_size,
    'total', v_total
  );
end;
$$;

create or replace function public.get_delivery_detail_v1(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select jsonb_build_object(
    'id', d.id,
    'code', d.code,
    'saleId', s.id,
    'saleCode', s.code,
    'clientId', s.client_id,
    'clientName', s.client_name_snapshot,
    'clientPhone', s.client_phone_snapshot,
    'deliveryMethod', d.delivery_method,
    'stateCode', d.state_code,
    'canEdit', d.state_code in ('PENDING_INSTRUCTIONS', 'ACCUMULATED', 'PENDING_AGENCY_DISPATCH'),
    'operatorPartnerId', d.operator_partner_id,
    'operatorName', coalesce(bp.trade_name, bp.legal_name),
    'destinationAddressId', d.destination_address_id,
    'destinationLabel', ca.label,
    'destinationAddress', case when ca.id is null then null else concat_ws(', ', ca.address_line, ca.district, ca.province, ca.department) end,
    'trackingNumber', d.tracking_number,
    'shippingCost', d.shipping_cost,
    'currencyCode', d.currency_code,
    'costPayer', d.cost_payer,
    'plannedDispatchDate', d.planned_dispatch_date,
    'dispatchedAt', d.dispatched_at,
    'agencyReceivedAt', d.agency_received_at,
    'deliveredAt', d.delivered_at,
    'notes', d.notes,
    'createdByName', creator.display_name,
    'createdAt', d.created_at,
    'version', d.version,
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', di.id,
        'saleItemId', si.id,
        'productName', si.product_name_snapshot,
        'variantName', si.variant_name_snapshot,
        'sku', si.sku_snapshot,
        'quantity', di.quantity
      ) order by si.created_at, si.id)
      from public.delivery_items di
      join public.sale_items si on si.id = di.sale_item_id
      where di.delivery_id = d.id
        and di.is_active = true
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', h.id,
        'previousStateCode', h.previous_state_code,
        'newStateCode', h.new_state_code,
        'reason', h.reason,
        'changedByName', hp.display_name,
        'changedAt', h.changed_at
      ) order by h.changed_at desc)
      from public.delivery_state_history h
      left join public.profiles hp on hp.id = h.changed_by
      where h.delivery_id = d.id
    ), '[]'::jsonb),
    'allowedTransitions', coalesce((
      select jsonb_agg(jsonb_build_object(
        'stateCode', wt.to_state_code,
        'name', ws.label,
        'requiresReason', wt.requires_reason
      ) order by ws.sort_order)
      from public.workflow_transitions wt
      join public.workflow_states ws
        on ws.workflow_code = wt.workflow_code and ws.state_code = wt.to_state_code
      where wt.workflow_code = 'DELIVERY'
        and wt.from_state_code = d.state_code
        and wt.is_active = true
        and wt.to_state_code <> 'PARTIALLY_DELIVERED'
    ), '[]'::jsonb)
  ) into v_result
  from public.deliveries d
  join public.sales s on s.id = d.sale_id
  left join public.business_partners bp on bp.id = d.operator_partner_id
  left join public.client_addresses ca on ca.id = d.destination_address_id
  left join public.profiles creator on creator.id = d.created_by
  where d.id = p_delivery_id;

  if v_result is null then
    raise exception 'Entrega no encontrada.' using errcode = 'P0002';
  end if;
  return v_result;
end;
$$;

create or replace function public.get_delivery_edit_support_v1(p_delivery_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_delivery public.deliveries%rowtype;
  v_selected jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select * into v_delivery
  from public.deliveries
  where id = p_delivery_id;

  if not found then
    raise exception 'Entrega no encontrada.' using errcode = 'P0002';
  end if;

  select jsonb_build_object(
    'id', s.id,
    'code', s.code,
    'clientId', s.client_id,
    'clientName', s.client_name_snapshot,
    'clientPhone', s.client_phone_snapshot,
    'deliveryStateCode', s.delivery_state_code,
    'addresses', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ca.id,
        'label', ca.label,
        'addressLine', ca.address_line,
        'district', ca.district,
        'province', ca.province,
        'department', ca.department,
        'reference', ca.reference,
        'isPrimary', ca.is_default
      ) order by ca.is_default desc, ca.label)
      from public.client_addresses ca
      where ca.client_id = s.client_id and ca.is_active = true
    ), '[]'::jsonb),
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'saleItemId', si.id,
        'productName', si.product_name_snapshot,
        'variantName', si.variant_name_snapshot,
        'sku', si.sku_snapshot,
        'quantity', si.quantity,
        'assignedQuantity', coalesce((
          select sum(di.quantity)::integer
          from public.delivery_items di
          join public.deliveries d2 on d2.id = di.delivery_id
          where di.sale_item_id = si.id
            and di.delivery_id <> p_delivery_id
            and di.is_active = true
            and d2.state_code <> 'CANCELLED'
        ), 0),
        'remainingQuantity', greatest(si.quantity - coalesce((
          select sum(di.quantity)::integer
          from public.delivery_items di
          join public.deliveries d2 on d2.id = di.delivery_id
          where di.sale_item_id = si.id
            and di.delivery_id <> p_delivery_id
            and di.is_active = true
            and d2.state_code <> 'CANCELLED'
        ), 0), 0),
        'allocations', coalesce((
          select jsonb_agg(jsonb_build_object(
            'warehouseName', w.name,
            'quantity', sia.quantity,
            'status', sia.allocation_status
          ) order by w.name, sia.created_at)
          from public.sale_item_allocations sia
          join public.warehouses w on w.id = sia.warehouse_id
          where sia.sale_item_id = si.id
            and sia.allocation_status in ('RESERVED', 'ACCUMULATED')
        ), '[]'::jsonb)
      ) order by si.created_at, si.id)
      from public.sale_items si
      where si.sale_id = s.id
        and si.item_status not in ('CANCELLED', 'RELEASED')
        and si.quantity > coalesce((
          select sum(di.quantity)::integer
          from public.delivery_items di
          join public.deliveries d2 on d2.id = di.delivery_id
          where di.sale_item_id = si.id
            and di.delivery_id <> p_delivery_id
            and di.is_active = true
            and d2.state_code <> 'CANCELLED'
        ), 0)
    ), '[]'::jsonb)
  ) into v_selected
  from public.sales s
  where s.id = v_delivery.sale_id;

  return jsonb_build_object(
    'operators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'code', bp.code,
        'name', coalesce(bp.trade_name, bp.legal_name),
        'types', coalesce((
          select jsonb_agg(bpt.partner_type_code order by bpt.partner_type_code)
          from public.business_partner_types bpt
          where bpt.partner_id = bp.id
            and bpt.partner_type_code in ('AGENCY', 'COURIER', 'LOCAL_OPERATOR')
        ), '[]'::jsonb)
      ) order by coalesce(bp.trade_name, bp.legal_name))
      from public.business_partners bp
      where bp.is_active = true
        and exists (
          select 1 from public.business_partner_types bpt
          where bpt.partner_id = bp.id
            and bpt.partner_type_code in ('AGENCY', 'COURIER')
        )
    ), '[]'::jsonb),
    'eligibleSales', '[]'::jsonb,
    'selectedSale', v_selected
  );
end;
$$;

create or replace function public.update_delivery_v1(
  p_delivery_id uuid,
  p_input jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_delivery public.deliveries%rowtype;
  v_sale public.sales%rowtype;
  v_item jsonb;
  v_method text;
  v_next_state text;
  v_previous_state text;
  v_operator uuid;
  v_address uuid;
  v_sold integer;
  v_assigned_other integer;
  v_sale_item_id uuid;
  v_quantity integer;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if jsonb_typeof(p_input) <> 'object' then
    raise exception 'La corrección debe enviarse como un objeto JSON.';
  end if;
  if length(btrim(coalesce(p_input ->> 'reason', ''))) < 3 then
    raise exception 'Indica el motivo de la corrección.';
  end if;
  if jsonb_typeof(p_input -> 'items') <> 'array' or jsonb_array_length(p_input -> 'items') = 0 then
    raise exception 'La entrega debe conservar al menos un producto.';
  end if;
  if exists (
    select 1
    from jsonb_array_elements(p_input -> 'items') x
    group by x.value ->> 'saleItemId'
    having count(*) > 1
  ) then
    raise exception 'Un producto no puede repetirse en la misma entrega.';
  end if;

  select * into v_delivery
  from public.deliveries
  where id = p_delivery_id
  for update;

  if not found then
    raise exception 'Entrega no encontrada.' using errcode = 'P0002';
  end if;
  if v_delivery.state_code not in ('PENDING_INSTRUCTIONS', 'ACCUMULATED', 'PENDING_AGENCY_DISPATCH') then
    raise exception 'La entrega ya fue despachada, entregada o cancelada y no puede editarse.' using errcode = 'P0001';
  end if;
  if v_delivery.version <> (p_input ->> 'version')::bigint then
    raise exception 'La entrega fue modificada por otra administradora. Recarga la página antes de guardar.' using errcode = '40001';
  end if;

  select * into v_sale
  from public.sales
  where id = v_delivery.sale_id
  for update;

  v_method := p_input ->> 'deliveryMethod';
  if v_method not in ('AGENCY', 'MOTORBIKE', 'IN_PERSON', 'WAREHOUSE_ACCUMULATION', 'OTHER') then
    raise exception 'Método de entrega inválido.';
  end if;
  v_operator := nullif(p_input ->> 'operatorPartnerId', '')::uuid;
  v_address := nullif(p_input ->> 'destinationAddressId', '')::uuid;

  if v_method = 'AGENCY' then
    if v_operator is null or not exists (
      select 1 from public.business_partner_types
      where partner_id = v_operator and partner_type_code = 'AGENCY'
    ) then raise exception 'Selecciona una agencia válida.'; end if;
  elsif v_method = 'MOTORBIKE' then
    if v_operator is null or not exists (
      select 1 from public.business_partner_types
      where partner_id = v_operator and partner_type_code = 'COURIER'
    ) then raise exception 'Selecciona un courier o motorizado válido.'; end if;
  else
    v_operator := null;
  end if;

  if v_address is not null and not exists (
    select 1 from public.client_addresses
    where id = v_address and client_id = v_sale.client_id and is_active = true
  ) then raise exception 'La dirección no pertenece al cliente de la venta.'; end if;

  perform 1
  from public.sale_items si
  where si.id in (
    select (x.value ->> 'saleItemId')::uuid from jsonb_array_elements(p_input -> 'items') x
    union
    select di.sale_item_id from public.delivery_items di
    where di.delivery_id = p_delivery_id and di.is_active = true
  )
  order by si.id
  for update;

  for v_item in select value from jsonb_array_elements(p_input -> 'items')
  loop
    v_sale_item_id := (v_item ->> 'saleItemId')::uuid;
    v_quantity := coalesce((v_item ->> 'quantity')::integer, 0);
    if v_quantity <= 0 then
      raise exception 'Cada producto debe tener una cantidad mayor que cero.';
    end if;

    select si.quantity into v_sold
    from public.sale_items si
    where si.id = v_sale_item_id
      and si.sale_id = v_sale.id
      and si.item_status not in ('CANCELLED', 'RELEASED');
    if not found then
      raise exception 'Un producto no pertenece a la venta o ya fue liberado.';
    end if;

    select coalesce(sum(di.quantity), 0)::integer into v_assigned_other
    from public.delivery_items di
    join public.deliveries d2 on d2.id = di.delivery_id
    where di.sale_item_id = v_sale_item_id
      and di.delivery_id <> p_delivery_id
      and di.is_active = true
      and d2.state_code <> 'CANCELLED';

    if v_assigned_other + v_quantity > v_sold then
      raise exception 'La cantidad total de entregas supera la cantidad vendida.' using errcode = 'P0001';
    end if;
  end loop;

  v_previous_state := v_delivery.state_code;
  v_next_state := case
    when v_method = 'AGENCY' then 'PENDING_AGENCY_DISPATCH'
    when v_method = 'WAREHOUSE_ACCUMULATION' then 'ACCUMULATED'
    else 'PENDING_INSTRUCTIONS'
  end;

  perform pg_catalog.set_config('app.audit_reason', btrim(p_input ->> 'reason'), true);
  update public.deliveries
  set state_code = v_next_state,
      delivery_method = v_method,
      operator_partner_id = v_operator,
      destination_address_id = v_address,
      tracking_number = nullif(btrim(p_input ->> 'trackingNumber'), ''),
      shipping_cost = coalesce((p_input ->> 'shippingCost')::numeric, 0),
      cost_payer = coalesce(nullif(p_input ->> 'costPayer', ''), 'CLIENT'),
      planned_dispatch_date = nullif(p_input ->> 'plannedDispatchDate', '')::date,
      notes = nullif(btrim(p_input ->> 'notes'), ''),
      updated_by = v_actor
  where id = p_delivery_id
  returning * into v_delivery;

  update public.delivery_items
  set is_active = false
  where delivery_id = p_delivery_id
    and is_active = true;

  for v_item in select value from jsonb_array_elements(p_input -> 'items')
  loop
    insert into public.delivery_items(delivery_id, sale_item_id, quantity, is_active)
    values (
      p_delivery_id,
      (v_item ->> 'saleItemId')::uuid,
      (v_item ->> 'quantity')::integer,
      true
    )
    on conflict (delivery_id, sale_item_id) do update
    set quantity = excluded.quantity,
        is_active = true;
  end loop;

  if v_previous_state is distinct from v_next_state then
    insert into public.delivery_state_history(
      delivery_id, previous_state_code, new_state_code, reason, changed_by,
      metadata
    ) values (
      p_delivery_id, v_previous_state, v_next_state,
      btrim(p_input ->> 'reason'), v_actor,
      jsonb_build_object('source', 'delivery_correction')
    );
  end if;

  if v_method = 'WAREHOUSE_ACCUMULATION' then
    perform private.ensure_sale_accumulated_inventory_v1(v_sale.id);
  end if;

  perform private.refresh_sale_delivery_state_v1(v_sale.id);
  perform public.refresh_sale_totals(v_sale.id);

  insert into public.outbox_events(event_type, aggregate_type, aggregate_id, payload, deduplication_key)
  values (
    'DELIVERY_CORRECTED', 'DELIVERY', p_delivery_id,
    jsonb_build_object(
      'delivery_id', p_delivery_id,
      'sale_id', v_sale.id,
      'reason', btrim(p_input ->> 'reason'),
      'state_code', v_delivery.state_code
    ),
    'delivery-corrected:' || p_delivery_id::text || ':' || v_delivery.version::text
  ) on conflict (deduplication_key) where deduplication_key is not null do nothing;

  return jsonb_build_object(
    'id', v_delivery.id,
    'code', v_delivery.code,
    'stateCode', v_delivery.state_code,
    'version', v_delivery.version
  );
end;
$$;

revoke all on function public.get_delivery_edit_support_v1(uuid) from public;
revoke all on function public.update_delivery_v1(uuid, jsonb) from public;
grant execute on function public.get_delivery_edit_support_v1(uuid) to authenticated;
grant execute on function public.update_delivery_v1(uuid, jsonb) to authenticated;

notify pgrst, 'reload schema';
commit;


-- =========================================================
-- 019_imports_preorders_api.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 019: importaciones, cajas, costos, recepción y preventas

begin;

create index if not exists ix_import_box_items_receive_lookup
  on public.import_box_items(import_box_id, received_quantity, expected_quantity);

create index if not exists ix_import_tracking_events_entity_date
  on public.import_tracking_events(import_shipment_id, import_box_id, event_at desc);

create index if not exists ix_preorder_allocations_sale_item_status
  on public.preorder_allocations(sale_item_id, status);

create or replace function public.get_import_support_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'suppliers', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'code', bp.code,
        'name', coalesce(bp.trade_name, bp.legal_name),
        'types', coalesce((select jsonb_agg(bpt.partner_type_code order by bpt.partner_type_code) from public.business_partner_types bpt where bpt.partner_id = bp.id), '[]'::jsonb),
        'countryCode', bp.country_code
      ) order by coalesce(bp.trade_name, bp.legal_name))
      from public.business_partners bp
      where bp.is_active = true
        and exists (select 1 from public.business_partner_types bpt where bpt.partner_id = bp.id and bpt.partner_type_code = 'SUPPLIER')
    ), '[]'::jsonb),
    'internationalOperators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'code', bp.code,
        'name', coalesce(bp.trade_name, bp.legal_name),
        'types', coalesce((select jsonb_agg(bpt.partner_type_code order by bpt.partner_type_code) from public.business_partner_types bpt where bpt.partner_id = bp.id), '[]'::jsonb),
        'countryCode', bp.country_code
      ) order by coalesce(bp.trade_name, bp.legal_name))
      from public.business_partners bp
      where bp.is_active = true
        and exists (select 1 from public.business_partner_types bpt where bpt.partner_id = bp.id and bpt.partner_type_code = 'INTERNATIONAL_OPERATOR')
    ), '[]'::jsonb),
    'localOperators', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', bp.id,
        'code', bp.code,
        'name', coalesce(bp.trade_name, bp.legal_name),
        'types', coalesce((select jsonb_agg(bpt.partner_type_code order by bpt.partner_type_code) from public.business_partner_types bpt where bpt.partner_id = bp.id), '[]'::jsonb),
        'countryCode', bp.country_code
      ) order by coalesce(bp.trade_name, bp.legal_name))
      from public.business_partners bp
      where bp.is_active = true
        and exists (select 1 from public.business_partner_types bpt where bpt.partner_id = bp.id and bpt.partner_type_code = 'LOCAL_OPERATOR')
    ), '[]'::jsonb),
    'currencies', coalesce((
      select jsonb_agg(jsonb_build_object('code', c.code, 'name', c.name, 'symbol', c.symbol) order by c.code)
      from public.currencies c where c.is_active = true
    ), '[]'::jsonb),
    'warehouses', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'code', w.code, 'name', w.name) order by w.name)
      from public.warehouses w
      where w.is_active = true and w.warehouse_type = 'OPERATIONAL'
    ), '[]'::jsonb),
    'variants', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pv.id,
        'productId', p.id,
        'productCode', p.code,
        'productName', p.name,
        'variantName', pv.variant_name,
        'sku', pv.sku,
        'salePrice', pv.sale_price,
        'currencyCode', pv.currency_code
      ) order by p.name, pv.variant_name)
      from public.product_variants pv
      join public.products p on p.id = pv.product_id
      where pv.is_active = true and p.is_active = true
    ), '[]'::jsonb),
    'activeClients', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', c.id,
        'code', c.code,
        'fullName', c.full_name,
        'phone', c.phone,
        'isVip', c.is_vip
      ) order by c.full_name)
      from public.clients c
      where c.is_active = true
    ), '[]'::jsonb),
    'salesChannels', coalesce((
      select jsonb_agg(jsonb_build_object('code', sc.code, 'name', sc.name) order by sc.sort_order, sc.name)
      from public.sales_channels sc where sc.is_active = true
    ), '[]'::jsonb),
    'discountTypes', coalesce((
      select jsonb_agg(jsonb_build_object('code', dt.code, 'name', dt.name) order by dt.name)
      from public.discount_types dt where dt.is_active = true
    ), '[]'::jsonb),
    'defaultPaymentTermDays', coalesce((
      select (bs.setting_value #>> '{}')::integer from public.business_settings bs where bs.setting_key = 'sales.default_payment_term_days'
    ), 14),
    'preorderCandidates', coalesce((
      select jsonb_agg(jsonb_build_object(
        'saleItemId', x.sale_item_id,
        'saleId', x.sale_id,
        'saleCode', x.sale_code,
        'clientName', x.client_name,
        'variantId', x.variant_id,
        'productName', x.product_name,
        'variantName', x.variant_name,
        'sku', x.sku,
        'quantity', x.quantity,
        'allocatedQuantity', x.allocated_quantity,
        'remainingQuantity', x.quantity - x.allocated_quantity
      ) order by x.sale_code, x.product_name)
      from (
        select
          si.id as sale_item_id,
          s.id as sale_id,
          s.code as sale_code,
          s.client_name_snapshot as client_name,
          si.variant_id,
          si.product_name_snapshot as product_name,
          si.variant_name_snapshot as variant_name,
          si.sku_snapshot as sku,
          si.quantity,
          coalesce(sum(pa.quantity) filter (where pa.status in ('ALLOCATED', 'RECEIVED')), 0)::integer as allocated_quantity
        from public.sale_items si
        join public.sales s on s.id = si.sale_id
        left join public.preorder_allocations pa on pa.sale_item_id = si.id
        where si.fulfillment_type = 'PREORDER'
          and si.item_status = 'ACTIVE'
          and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
        group by si.id, s.id
        having si.quantity > coalesce(sum(pa.quantity) filter (where pa.status in ('ALLOCATED', 'RECEIVED')), 0)
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.create_import_partner_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_partner public.business_partners%rowtype;
  v_type text := p_input ->> 'partnerTypeCode';
  v_code text;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if v_type not in ('SUPPLIER', 'INTERNATIONAL_OPERATOR', 'LOCAL_OPERATOR') then
    raise exception 'Tipo de socio comercial inválido.';
  end if;
  if nullif(btrim(p_input ->> 'legalName'), '') is null then
    raise exception 'El nombre legal es obligatorio.';
  end if;

  v_code := 'PART-' || upper(substr(regexp_replace(p_input ->> 'legalName', '[^A-Za-z0-9]+', '', 'g'), 1, 8)) || '-' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 6));
  perform pg_catalog.set_config('app.audit_reason', 'Creación de proveedor u operador de importación', true);

  insert into public.business_partners(
    code, legal_name, trade_name, contact_name, phone, email, country_code, notes,
    created_by, updated_by
  ) values (
    v_code,
    btrim(p_input ->> 'legalName'),
    nullif(btrim(p_input ->> 'tradeName'), ''),
    nullif(btrim(p_input ->> 'contactName'), ''),
    nullif(btrim(p_input ->> 'phone'), ''),
    nullif(btrim(p_input ->> 'email'), '')::extensions.citext,
    upper(nullif(btrim(p_input ->> 'countryCode'), ''))::char(2),
    nullif(btrim(p_input ->> 'notes'), ''),
    v_actor, v_actor
  ) returning * into v_partner;

  insert into public.business_partner_types(partner_id, partner_type_code)
  values (v_partner.id, v_type);

  return jsonb_build_object('id', v_partner.id, 'code', v_partner.code);
end;
$$;

create or replace function public.list_imports_v1(
  p_search text default null,
  p_filter text default 'ALL',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offset integer := greatest(p_page - 1, 0) * p_page_size;
  v_total integer;
  v_items jsonb;
  v_summary jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if p_filter not in ('ALL', 'ACTIVE', 'ARRIVING', 'DELAYED', 'STOCKED', 'CANCELLED') then
    raise exception 'Filtro de importaciones inválido.';
  end if;

  with base as (
    select
      ish.id,
      ish.code,
      coalesce(bp.trade_name, bp.legal_name) as supplier_name,
      ish.transport_mode,
      ish.state_code,
      ish.purchase_currency_code,
      ish.purchase_date,
      ish.estimated_arrival_date,
      ish.actual_arrival_at,
      ish.master_tracking_number,
      ish.created_at,
      creator.display_name as created_by_name,
      ish.version,
      count(distinct ib.id)::integer as box_count,
      coalesce(sum(ibi.expected_quantity), 0)::integer as total_expected_units,
      coalesce(sum(ibi.received_quantity), 0)::integer as total_received_units,
      coalesce((select sum(ic.amount_pen) from public.import_costs ic where ic.import_shipment_id = ish.id), 0)::numeric as total_cost_pen,
      coalesce((select count(*) from public.import_incidents ii where ii.import_shipment_id = ish.id and ii.status in ('OPEN', 'UNDER_REVIEW')), 0)::integer as open_incidents,
      (ish.estimated_arrival_date is not null and ish.estimated_arrival_date < current_date and ish.state_code not in ('RECEIVED_PERU', 'STOCKED', 'CANCELLED')) as is_delayed
    from public.import_shipments ish
    left join public.business_partners bp on bp.id = ish.supplier_partner_id
    left join public.profiles creator on creator.id = ish.created_by
    left join public.import_boxes ib on ib.import_shipment_id = ish.id
    left join public.import_box_items ibi on ibi.import_box_id = ib.id
    group by ish.id, bp.id, creator.id
  ), filtered as (
    select * from base b
    where (
      nullif(btrim(p_search), '') is null
      or b.code ilike '%' || btrim(p_search) || '%'
      or coalesce(b.supplier_name, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(b.master_tracking_number, '') ilike '%' || btrim(p_search) || '%'
      or exists (
        select 1 from public.import_boxes bx
        where bx.import_shipment_id = b.id
          and (bx.code ilike '%' || btrim(p_search) || '%' or coalesce(bx.tracking_number, '') ilike '%' || btrim(p_search) || '%')
      )
      or exists (
        select 1
        from public.import_boxes bx
        join public.import_box_items bi on bi.import_box_id = bx.id
        join public.product_variants pv on pv.id = bi.variant_id
        join public.products p on p.id = pv.product_id
        where bx.import_shipment_id = b.id
          and (p.name ilike '%' || btrim(p_search) || '%' or pv.sku ilike '%' || btrim(p_search) || '%')
      )
    )
    and case p_filter
      when 'ACTIVE' then b.state_code not in ('STOCKED', 'CANCELLED')
      when 'ARRIVING' then b.state_code not in ('STOCKED', 'CANCELLED') and b.estimated_arrival_date between current_date and current_date + 14
      when 'DELAYED' then b.is_delayed
      when 'STOCKED' then b.state_code = 'STOCKED'
      when 'CANCELLED' then b.state_code = 'CANCELLED'
      else true
    end
  )
  select count(*)::integer into v_total from filtered;

  with base as (
    select
      ish.id,
      ish.code,
      coalesce(bp.trade_name, bp.legal_name) as supplier_name,
      ish.transport_mode,
      ish.state_code,
      ish.purchase_currency_code,
      ish.purchase_date,
      ish.estimated_arrival_date,
      ish.actual_arrival_at,
      ish.master_tracking_number,
      ish.created_at,
      creator.display_name as created_by_name,
      ish.version,
      count(distinct ib.id)::integer as box_count,
      coalesce(sum(ibi.expected_quantity), 0)::integer as total_expected_units,
      coalesce(sum(ibi.received_quantity), 0)::integer as total_received_units,
      coalesce((select sum(ic.amount_pen) from public.import_costs ic where ic.import_shipment_id = ish.id), 0)::numeric as total_cost_pen,
      coalesce((select count(*) from public.import_incidents ii where ii.import_shipment_id = ish.id and ii.status in ('OPEN', 'UNDER_REVIEW')), 0)::integer as open_incidents,
      (ish.estimated_arrival_date is not null and ish.estimated_arrival_date < current_date and ish.state_code not in ('RECEIVED_PERU', 'STOCKED', 'CANCELLED')) as is_delayed
    from public.import_shipments ish
    left join public.business_partners bp on bp.id = ish.supplier_partner_id
    left join public.profiles creator on creator.id = ish.created_by
    left join public.import_boxes ib on ib.import_shipment_id = ish.id
    left join public.import_box_items ibi on ibi.import_box_id = ib.id
    group by ish.id, bp.id, creator.id
  ), filtered as (
    select * from base b
    where (
      nullif(btrim(p_search), '') is null
      or b.code ilike '%' || btrim(p_search) || '%'
      or coalesce(b.supplier_name, '') ilike '%' || btrim(p_search) || '%'
      or coalesce(b.master_tracking_number, '') ilike '%' || btrim(p_search) || '%'
      or exists (select 1 from public.import_boxes bx where bx.import_shipment_id = b.id and (bx.code ilike '%' || btrim(p_search) || '%' or coalesce(bx.tracking_number, '') ilike '%' || btrim(p_search) || '%'))
      or exists (
        select 1 from public.import_boxes bx
        join public.import_box_items bi on bi.import_box_id = bx.id
        join public.product_variants pv on pv.id = bi.variant_id
        join public.products p on p.id = pv.product_id
        where bx.import_shipment_id = b.id and (p.name ilike '%' || btrim(p_search) || '%' or pv.sku ilike '%' || btrim(p_search) || '%')
      )
    )
    and case p_filter
      when 'ACTIVE' then b.state_code not in ('STOCKED', 'CANCELLED')
      when 'ARRIVING' then b.state_code not in ('STOCKED', 'CANCELLED') and b.estimated_arrival_date between current_date and current_date + 14
      when 'DELAYED' then b.is_delayed
      when 'STOCKED' then b.state_code = 'STOCKED'
      when 'CANCELLED' then b.state_code = 'CANCELLED'
      else true
    end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', f.id,
    'code', f.code,
    'supplierName', f.supplier_name,
    'transportMode', f.transport_mode,
    'stateCode', f.state_code,
    'purchaseCurrencyCode', f.purchase_currency_code,
    'purchaseDate', f.purchase_date,
    'estimatedArrivalDate', f.estimated_arrival_date,
    'actualArrivalAt', f.actual_arrival_at,
    'masterTrackingNumber', f.master_tracking_number,
    'boxCount', f.box_count,
    'totalExpectedUnits', f.total_expected_units,
    'totalReceivedUnits', f.total_received_units,
    'totalCostPen', f.total_cost_pen,
    'openIncidents', f.open_incidents,
    'isDelayed', f.is_delayed,
    'createdAt', f.created_at,
    'createdByName', f.created_by_name,
    'version', f.version
  ) order by f.created_at desc), '[]'::jsonb)
  into v_items
  from (select * from filtered order by created_at desc limit p_page_size offset v_offset) f;

  select jsonb_build_object(
    'activeImports', count(*) filter (where state_code not in ('STOCKED', 'CANCELLED')),
    'boxesInTransit', (select count(*) from public.import_boxes where state_code in ('SHIPPED', 'IN_TRANSIT')),
    'expectedUnits', coalesce((
      select sum(ibi.expected_quantity - ibi.received_quantity)
      from public.import_box_items ibi
      join public.import_boxes ib on ib.id = ibi.import_box_id
      join public.import_shipments ish2 on ish2.id = ib.import_shipment_id
      where ish2.state_code not in ('STOCKED', 'CANCELLED') and ib.state_code <> 'CANCELLED'
    ), 0),
    'delayedImports', count(*) filter (where estimated_arrival_date < current_date and state_code not in ('RECEIVED_PERU', 'STOCKED', 'CANCELLED'))
  ) into v_summary
  from public.import_shipments;

  return jsonb_build_object('items', v_items, 'summary', v_summary, 'page', greatest(p_page, 1), 'pageSize', p_page_size, 'total', v_total);
end;
$$;

create or replace function public.create_import_v1(p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_existing jsonb;
  v_existing_hash text;
  v_import public.import_shipments%rowtype;
  v_box public.import_boxes%rowtype;
  v_box_json jsonb;
  v_item_json jsonb;
  v_response jsonb;
  v_supplier uuid := nullif(p_input ->> 'supplierPartnerId', '')::uuid;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if jsonb_typeof(p_input) <> 'object' then raise exception 'La importación debe enviarse como un objeto JSON.'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'La clave de idempotencia es obligatoria.'; end if;
  if jsonb_typeof(p_input -> 'boxes') <> 'array' or jsonb_array_length(p_input -> 'boxes') = 0 then raise exception 'Agrega al menos una caja.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('CREATE_IMPORT:' || p_idempotency_key, 0));
  select response_payload, request_hash into v_existing, v_existing_hash
  from public.idempotency_keys where scope = 'CREATE_IMPORT' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_existing is not null then
    if v_existing_hash is distinct from pg_catalog.md5(p_input::text) then raise exception 'La clave de idempotencia ya fue utilizada con otros datos.'; end if;
    return v_existing;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id, request_hash, status, expires_at)
  values ('CREATE_IMPORT', p_idempotency_key, v_actor, pg_catalog.md5(p_input::text), 'IN_PROGRESS', now() + interval '24 hours')
  on conflict (scope, idempotency_key) do update set actor_user_id = excluded.actor_user_id, request_hash = excluded.request_hash, status = 'IN_PROGRESS', locked_at = now(), expires_at = excluded.expires_at;

  if v_supplier is not null and not exists (
    select 1 from public.business_partners bp
    join public.business_partner_types bpt on bpt.partner_id = bp.id and bpt.partner_type_code = 'SUPPLIER'
    where bp.id = v_supplier and bp.is_active = true
  ) then raise exception 'Selecciona un proveedor activo.'; end if;

  if not exists (select 1 from public.currencies where code = (p_input ->> 'purchaseCurrencyCode')::char(3) and is_active = true) then
    raise exception 'La moneda de compra no es válida.';
  end if;
  if coalesce((p_input ->> 'sunatExchangeRate')::numeric, 0) <= 0 then raise exception 'El tipo de cambio debe ser mayor que cero.'; end if;

  perform pg_catalog.set_config('app.audit_reason', 'Creación de importación y cajas', true);
  insert into public.import_shipments(
    code, supplier_partner_id, state_code, transport_mode, purchase_currency_code,
    sunat_exchange_rate, purchase_date, estimated_arrival_date, master_tracking_number,
    notes, created_by, updated_by
  ) values (
    null, v_supplier, 'QUOTATION', p_input ->> 'transportMode', (p_input ->> 'purchaseCurrencyCode')::char(3),
    (p_input ->> 'sunatExchangeRate')::numeric, nullif(p_input ->> 'purchaseDate', '')::date,
    nullif(p_input ->> 'estimatedArrivalDate', '')::date, nullif(btrim(p_input ->> 'masterTrackingNumber'), ''),
    nullif(btrim(p_input ->> 'notes'), ''), v_actor, v_actor
  ) returning * into v_import;

  insert into public.import_status_history(import_shipment_id, previous_state_code, new_state_code, reason, changed_by)
  values (v_import.id, null, 'QUOTATION', 'Importación creada', v_actor);

  for v_box_json in select value from jsonb_array_elements(p_input -> 'boxes')
  loop
    if jsonb_typeof(v_box_json -> 'items') <> 'array' or jsonb_array_length(v_box_json -> 'items') = 0 then raise exception 'Cada caja debe tener al menos un producto.'; end if;

    insert into public.import_boxes(
      code, import_shipment_id, state_code, international_operator_id, local_operator_id,
      tracking_number, estimated_arrival_date, weight_grams, notes, created_by, updated_by
    ) values (
      null, v_import.id, 'REGISTERED', nullif(v_box_json ->> 'internationalOperatorId', '')::uuid,
      nullif(v_box_json ->> 'localOperatorId', '')::uuid, nullif(btrim(v_box_json ->> 'trackingNumber'), ''),
      nullif(v_box_json ->> 'estimatedArrivalDate', '')::date, nullif(v_box_json ->> 'weightGrams', '')::numeric,
      nullif(btrim(v_box_json ->> 'notes'), ''), v_actor, v_actor
    ) returning * into v_box;

    insert into public.import_status_history(import_box_id, previous_state_code, new_state_code, reason, changed_by)
    values (v_box.id, null, 'REGISTERED', 'Caja registrada', v_actor);

    for v_item_json in select value from jsonb_array_elements(v_box_json -> 'items')
    loop
      if coalesce((v_item_json ->> 'expectedQuantity')::integer, 0) <= 0 then raise exception 'La cantidad esperada debe ser mayor que cero.'; end if;
      if coalesce((v_item_json ->> 'originalUnitCost')::numeric, -1) < 0 then raise exception 'El costo unitario no puede ser negativo.'; end if;
      if coalesce((v_item_json ->> 'exchangeRateToPen')::numeric, 0) <= 0 then raise exception 'El tipo de cambio del producto debe ser mayor que cero.'; end if;
      if not exists (select 1 from public.product_variants pv join public.products p on p.id = pv.product_id where pv.id = (v_item_json ->> 'variantId')::uuid and pv.is_active and p.is_active) then raise exception 'Una variante no existe o está inactiva.'; end if;
      if not exists (select 1 from public.warehouses where id = (v_item_json ->> 'destinationWarehouseId')::uuid and is_active and warehouse_type = 'OPERATIONAL') then raise exception 'El almacén de destino no es válido.'; end if;

      insert into public.import_box_items(
        import_box_id, variant_id, destination_warehouse_id, expected_quantity,
        original_unit_cost, original_currency_code, exchange_rate_to_pen, notes,
        created_by, updated_by
      ) values (
        v_box.id, (v_item_json ->> 'variantId')::uuid, (v_item_json ->> 'destinationWarehouseId')::uuid,
        (v_item_json ->> 'expectedQuantity')::integer, (v_item_json ->> 'originalUnitCost')::numeric,
        (v_item_json ->> 'originalCurrencyCode')::char(3), (v_item_json ->> 'exchangeRateToPen')::numeric,
        nullif(btrim(v_item_json ->> 'notes'), ''), v_actor, v_actor
      );
    end loop;
  end loop;

  v_response := jsonb_build_object('id', v_import.id, 'code', v_import.code, 'stateCode', v_import.state_code, 'version', v_import.version);
  update public.idempotency_keys
  set status = 'COMPLETED', resource_type = 'IMPORT', resource_id = v_import.id, response_payload = v_response, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'CREATE_IMPORT' and idempotency_key = p_idempotency_key;
  return v_response;
exception
  when others then
    update public.idempotency_keys set status = 'FAILED', completed_at = now() where scope = 'CREATE_IMPORT' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

create or replace function public.get_import_detail_v1(p_import_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;

  select jsonb_build_object(
    'id', ish.id,
    'code', ish.code,
    'supplierPartnerId', ish.supplier_partner_id,
    'supplierName', coalesce(bp.trade_name, bp.legal_name),
    'stateCode', ish.state_code,
    'transportMode', ish.transport_mode,
    'purchaseCurrencyCode', ish.purchase_currency_code,
    'sunatExchangeRate', ish.sunat_exchange_rate,
    'purchaseDate', ish.purchase_date,
    'estimatedArrivalDate', ish.estimated_arrival_date,
    'actualArrivalAt', ish.actual_arrival_at,
    'stockEntryCompletedAt', ish.stock_entry_completed_at,
    'masterTrackingNumber', ish.master_tracking_number,
    'notes', ish.notes,
    'createdAt', ish.created_at,
    'createdByName', creator.display_name,
    'version', ish.version,
    'totals', jsonb_build_object(
      'expectedUnits', coalesce((select sum(ibi.expected_quantity) from public.import_box_items ibi join public.import_boxes ib on ib.id = ibi.import_box_id where ib.import_shipment_id = ish.id and ib.state_code <> 'CANCELLED'), 0),
      'receivedUnits', coalesce((select sum(ibi.received_quantity) from public.import_box_items ibi join public.import_boxes ib on ib.id = ibi.import_box_id where ib.import_shipment_id = ish.id and ib.state_code <> 'CANCELLED'), 0),
      'purchaseValuePen', coalesce((select sum(ibi.expected_quantity * ibi.original_unit_cost * ibi.exchange_rate_to_pen) from public.import_box_items ibi join public.import_boxes ib on ib.id = ibi.import_box_id where ib.import_shipment_id = ish.id and ib.state_code <> 'CANCELLED'), 0),
      'extraCostsPen', coalesce((select sum(ic.amount_pen) from public.import_costs ic where ic.import_shipment_id = ish.id), 0),
      'allocatedPreorders', coalesce((select sum(pa.quantity) from public.preorder_allocations pa join public.import_box_items ibi on ibi.id = pa.import_box_item_id join public.import_boxes ib on ib.id = ibi.import_box_id where ib.import_shipment_id = ish.id and pa.status in ('ALLOCATED', 'RECEIVED')), 0)
    ),
    'boxes', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ib.id,
        'code', ib.code,
        'stateCode', ib.state_code,
        'internationalOperatorId', ib.international_operator_id,
        'internationalOperatorName', coalesce(iop.trade_name, iop.legal_name),
        'localOperatorId', ib.local_operator_id,
        'localOperatorName', coalesce(lop.trade_name, lop.legal_name),
        'trackingNumber', ib.tracking_number,
        'estimatedArrivalDate', ib.estimated_arrival_date,
        'actualArrivalAt', ib.actual_arrival_at,
        'weightGrams', ib.weight_grams,
        'notes', ib.notes,
        'version', ib.version,
        'canReceive', ib.state_code = 'RECEIVED_PERU' and exists (select 1 from public.import_box_items r where r.import_box_id = ib.id and r.received_quantity < r.expected_quantity),
        'items', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', ibi.id,
            'variantId', ibi.variant_id,
            'productName', p.name,
            'variantName', pv.variant_name,
            'sku', pv.sku,
            'destinationWarehouseId', ibi.destination_warehouse_id,
            'destinationWarehouseName', w.name,
            'expectedQuantity', ibi.expected_quantity,
            'receivedQuantity', ibi.received_quantity,
            'missingQuantity', ibi.missing_quantity,
            'originalUnitCost', ibi.original_unit_cost,
            'originalCurrencyCode', ibi.original_currency_code,
            'exchangeRateToPen', ibi.exchange_rate_to_pen,
            'finalUnitCostPen', ibi.final_unit_cost_pen,
            'preorderAllocatedQuantity', coalesce((select sum(pa.quantity) from public.preorder_allocations pa where pa.import_box_item_id = ibi.id and pa.status in ('ALLOCATED', 'RECEIVED')), 0),
            'inventoryLotId', ibi.inventory_lot_id,
            'notes', ibi.notes
          ) order by p.name, pv.variant_name)
          from public.import_box_items ibi
          join public.product_variants pv on pv.id = ibi.variant_id
          join public.products p on p.id = pv.product_id
          left join public.warehouses w on w.id = ibi.destination_warehouse_id
          where ibi.import_box_id = ib.id
        ), '[]'::jsonb),
        'allowedTransitions', coalesce((
          select jsonb_agg(jsonb_build_object('stateCode', wt.to_state_code, 'name', ws.label, 'requiresReason', wt.requires_reason) order by ws.sort_order)
          from public.workflow_transitions wt
          join public.workflow_states ws on ws.workflow_code = wt.workflow_code and ws.state_code = wt.to_state_code
          where wt.workflow_code = 'IMPORT_BOX' and wt.from_state_code = ib.state_code and wt.is_active = true
        ), '[]'::jsonb)
      ) order by ib.created_at, ib.code)
      from public.import_boxes ib
      left join public.business_partners iop on iop.id = ib.international_operator_id
      left join public.business_partners lop on lop.id = ib.local_operator_id
      where ib.import_shipment_id = ish.id
    ), '[]'::jsonb),
    'costs', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ic.id,
        'importBoxId', ic.import_box_id,
        'boxCode', ib.code,
        'costType', ic.cost_type,
        'description', ic.description,
        'amount', ic.amount,
        'currencyCode', ic.currency_code,
        'exchangeRateToPen', ic.exchange_rate_to_pen,
        'amountPen', ic.amount_pen,
        'allocationMethod', ic.allocation_method,
        'isIncludedInUnitCost', ic.is_included_in_unit_cost,
        'occurredAt', ic.occurred_at
      ) order by ic.occurred_at desc)
      from public.import_costs ic
      left join public.import_boxes ib on ib.id = ic.import_box_id
      where ic.import_shipment_id = ish.id
    ), '[]'::jsonb),
    'incidents', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', ii.id,
        'importBoxId', ii.import_box_id,
        'boxCode', ib.code,
        'importBoxItemId', ii.import_box_item_id,
        'itemLabel', case when p.id is null then null else p.name || ' · ' || pv.variant_name end,
        'incidentType', ii.incident_type,
        'affectedQuantity', ii.affected_quantity,
        'description', ii.description,
        'status', ii.status,
        'occurredAt', ii.occurred_at,
        'resolvedAt', ii.resolved_at,
        'resolutionNotes', ii.resolution_notes,
        'insuranceClaims', coalesce((
          select jsonb_agg(jsonb_build_object(
            'id', icl.id,
            'claimNumber', icl.claim_number,
            'claimedAmount', icl.claimed_amount,
            'approvedAmount', icl.approved_amount,
            'currencyCode', icl.currency_code,
            'status', icl.status,
            'submittedAt', icl.submitted_at,
            'resolvedAt', icl.resolved_at,
            'notes', icl.notes
          ) order by icl.created_at desc)
          from public.insurance_claims icl
          where icl.import_incident_id = ii.id
        ), '[]'::jsonb)
      ) order by ii.occurred_at desc)
      from public.import_incidents ii
      left join public.import_boxes ib on ib.id = ii.import_box_id
      left join public.import_box_items ibi on ibi.id = ii.import_box_item_id
      left join public.product_variants pv on pv.id = ibi.variant_id
      left join public.products p on p.id = pv.product_id
      where ii.import_shipment_id = ish.id
    ), '[]'::jsonb),
    'preorderAllocations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', pa.id,
        'saleItemId', pa.sale_item_id,
        'saleId', s.id,
        'saleCode', s.code,
        'clientName', s.client_name_snapshot,
        'importBoxItemId', pa.import_box_item_id,
        'itemLabel', p.name || ' · ' || pv.variant_name,
        'quantity', pa.quantity,
        'status', pa.status,
        'allocatedAt', pa.allocated_at
      ) order by pa.allocated_at desc)
      from public.preorder_allocations pa
      join public.sale_items si on si.id = pa.sale_item_id
      join public.sales s on s.id = si.sale_id
      join public.import_box_items ibi on ibi.id = pa.import_box_item_id
      join public.import_boxes ib on ib.id = ibi.import_box_id
      join public.product_variants pv on pv.id = ibi.variant_id
      join public.products p on p.id = pv.product_id
      where ib.import_shipment_id = ish.id
    ), '[]'::jsonb),
    'history', coalesce((
      select jsonb_agg(h.row_json order by h.changed_at desc)
      from (
        select ih.changed_at, jsonb_build_object(
          'id', ih.id,
          'entityType', case when ih.import_shipment_id is not null then 'SHIPMENT' else 'BOX' end,
          'entityCode', coalesce(hs.code, hb.code),
          'previousStateCode', ih.previous_state_code,
          'newStateCode', ih.new_state_code,
          'reason', ih.reason,
          'changedByName', hp.display_name,
          'changedAt', ih.changed_at
        ) as row_json
        from public.import_status_history ih
        left join public.import_shipments hs on hs.id = ih.import_shipment_id
        left join public.import_boxes hb on hb.id = ih.import_box_id
        left join public.profiles hp on hp.id = ih.changed_by
        where ih.import_shipment_id = ish.id or ih.import_box_id in (select id from public.import_boxes where import_shipment_id = ish.id)
      ) h
    ), '[]'::jsonb),
    'allowedTransitions', coalesce((
      select jsonb_agg(jsonb_build_object('stateCode', wt.to_state_code, 'name', ws.label, 'requiresReason', wt.requires_reason) order by ws.sort_order)
      from public.workflow_transitions wt
      join public.workflow_states ws on ws.workflow_code = wt.workflow_code and ws.state_code = wt.to_state_code
      where wt.workflow_code = 'IMPORT' and wt.from_state_code = ish.state_code and wt.is_active = true
    ), '[]'::jsonb)
  ) into v_result
  from public.import_shipments ish
  left join public.business_partners bp on bp.id = ish.supplier_partner_id
  left join public.profiles creator on creator.id = ish.created_by
  where ish.id = p_import_id;

  if v_result is null then raise exception 'Importación no encontrada.' using errcode = 'P0002'; end if;
  return v_result;
end;
$$;

create or replace function public.advance_import_v1(
  p_import_id uuid,
  p_next_state_code text,
  p_reason text,
  p_occurred_at timestamptz default null,
  p_master_tracking_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_import public.import_shipments%rowtype;
  v_when timestamptz := coalesce(p_occurred_at, now());
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Indica el motivo o detalle del cambio.'; end if;
  select * into v_import from public.import_shipments where id = p_import_id for update;
  if not found then raise exception 'Importación no encontrada.' using errcode = 'P0002'; end if;

  perform pg_catalog.set_config('app.audit_reason', btrim(p_reason), true);
  update public.import_shipments
  set state_code = p_next_state_code,
      purchase_date = case when p_next_state_code = 'PURCHASE_CONFIRMED' then coalesce(purchase_date, v_when::date) else purchase_date end,
      foreign_warehouse_arrival_at = case when p_next_state_code = 'FOREIGN_WAREHOUSE' then v_when else foreign_warehouse_arrival_at end,
      dispatch_confirmation_at = case when p_next_state_code = 'DISPATCH_CONFIRMED' then v_when else dispatch_confirmation_at end,
      shipped_at = case when p_next_state_code in ('SHIPPED', 'IN_TRANSIT') then coalesce(shipped_at, v_when) else shipped_at end,
      actual_arrival_at = case when p_next_state_code = 'RECEIVED_PERU' then v_when else actual_arrival_at end,
      stock_entry_completed_at = case when p_next_state_code = 'STOCKED' then v_when else stock_entry_completed_at end,
      master_tracking_number = coalesce(nullif(btrim(p_master_tracking_number), ''), master_tracking_number),
      updated_by = private.current_actor_id()
  where id = p_import_id
  returning * into v_import;

  insert into public.import_tracking_events(import_shipment_id, event_at, description, source, external_status, created_by)
  values (v_import.id, v_when, btrim(p_reason), 'YUKIMI', p_next_state_code, private.current_actor_id());

  return jsonb_build_object('id', v_import.id, 'code', v_import.code, 'stateCode', v_import.state_code, 'version', v_import.version);
end;
$$;

create or replace function public.advance_import_box_v1(
  p_box_id uuid,
  p_next_state_code text,
  p_reason text,
  p_occurred_at timestamptz default null,
  p_tracking_number text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_box public.import_boxes%rowtype;
  v_when timestamptz := coalesce(p_occurred_at, now());
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if nullif(btrim(p_reason), '') is null then raise exception 'Indica el motivo o detalle del cambio.'; end if;
  select * into v_box from public.import_boxes where id = p_box_id for update;
  if not found then raise exception 'Caja no encontrada.' using errcode = 'P0002'; end if;

  perform pg_catalog.set_config('app.audit_reason', btrim(p_reason), true);
  update public.import_boxes
  set state_code = p_next_state_code,
      actual_arrival_at = case when p_next_state_code = 'RECEIVED_PERU' then v_when else actual_arrival_at end,
      tracking_number = coalesce(nullif(btrim(p_tracking_number), ''), tracking_number),
      updated_by = private.current_actor_id()
  where id = p_box_id
  returning * into v_box;

  insert into public.import_tracking_events(import_box_id, event_at, description, source, external_status, created_by)
  values (v_box.id, v_when, btrim(p_reason), 'YUKIMI', p_next_state_code, private.current_actor_id());

  return jsonb_build_object('id', v_box.id, 'code', v_box.code, 'stateCode', v_box.state_code, 'version', v_box.version);
end;
$$;

create or replace function public.add_import_cost_v1(p_import_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_cost public.import_costs%rowtype;
  v_box_id uuid := nullif(p_input ->> 'importBoxId', '')::uuid;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if not exists (select 1 from public.import_shipments where id = p_import_id and state_code <> 'CANCELLED') then raise exception 'La importación no existe o está cancelada.'; end if;
  if v_box_id is not null and not exists (select 1 from public.import_boxes where id = v_box_id and import_shipment_id = p_import_id) then raise exception 'La caja no pertenece a la importación.'; end if;
  if coalesce((p_input ->> 'amount')::numeric, -1) < 0 then raise exception 'El importe no puede ser negativo.'; end if;
  if coalesce((p_input ->> 'exchangeRateToPen')::numeric, 0) <= 0 then raise exception 'El tipo de cambio debe ser mayor que cero.'; end if;

  perform pg_catalog.set_config('app.audit_reason', 'Registro de costo de importación', true);
  insert into public.import_costs(
    import_shipment_id, import_box_id, cost_type, description, amount, currency_code,
    exchange_rate_to_pen, allocation_method, is_included_in_unit_cost, occurred_at, created_by
  ) values (
    p_import_id, v_box_id, p_input ->> 'costType', nullif(btrim(p_input ->> 'description'), ''),
    (p_input ->> 'amount')::numeric, (p_input ->> 'currencyCode')::char(3),
    (p_input ->> 'exchangeRateToPen')::numeric, p_input ->> 'allocationMethod',
    coalesce((p_input ->> 'isIncludedInUnitCost')::boolean, false),
    coalesce(nullif(p_input ->> 'occurredAt', '')::timestamptz, now()), private.current_actor_id()
  ) returning * into v_cost;
  return jsonb_build_object('id', v_cost.id, 'code', null);
end;
$$;

create or replace function public.create_import_incident_v1(p_import_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_incident public.import_incidents%rowtype;
  v_box_id uuid := nullif(p_input ->> 'importBoxId', '')::uuid;
  v_item_id uuid := nullif(p_input ->> 'importBoxItemId', '')::uuid;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if not exists (select 1 from public.import_shipments where id = p_import_id) then raise exception 'Importación no encontrada.'; end if;
  if v_box_id is not null and not exists (select 1 from public.import_boxes where id = v_box_id and import_shipment_id = p_import_id) then raise exception 'La caja no pertenece a la importación.'; end if;
  if v_item_id is not null and not exists (select 1 from public.import_box_items ibi join public.import_boxes ib on ib.id = ibi.import_box_id where ibi.id = v_item_id and ib.import_shipment_id = p_import_id) then raise exception 'El producto no pertenece a la importación.'; end if;

  perform pg_catalog.set_config('app.audit_reason', 'Registro de incidencia de importación', true);
  insert into public.import_incidents(
    import_shipment_id, import_box_id, import_box_item_id, incident_type, affected_quantity,
    description, occurred_at, created_by, updated_by
  ) values (
    p_import_id, v_box_id, v_item_id, p_input ->> 'incidentType', nullif(p_input ->> 'affectedQuantity', '')::integer,
    btrim(p_input ->> 'description'), coalesce(nullif(p_input ->> 'occurredAt', '')::timestamptz, now()),
    private.current_actor_id(), private.current_actor_id()
  ) returning * into v_incident;
  return jsonb_build_object('id', v_incident.id, 'code', null);
end;
$$;


create or replace function public.create_insurance_claim_v1(p_import_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_incident public.import_incidents%rowtype;
  v_claim public.insurance_claims%rowtype;
  v_status text := coalesce(nullif(p_input ->> 'status', ''), 'SUBMITTED');
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;

  select * into v_incident
  from public.import_incidents
  where id = (p_input ->> 'importIncidentId')::uuid
    and import_shipment_id = p_import_id
  for update;
  if not found then raise exception 'La incidencia no pertenece a esta importación.'; end if;
  if v_incident.incident_type not in ('MISSING', 'DAMAGED') then
    raise exception 'El seguro solo puede asociarse a faltantes o productos dañados.';
  end if;
  if v_status not in ('PENDING', 'SUBMITTED') then raise exception 'Estado inicial del reclamo inválido.'; end if;
  if coalesce((p_input ->> 'claimedAmount')::numeric, -1) < 0 then raise exception 'El importe reclamado no puede ser negativo.'; end if;
  if not exists (select 1 from public.currencies where code = (p_input ->> 'currencyCode')::char(3) and is_active = true) then
    raise exception 'La moneda del reclamo no es válida.';
  end if;
  if exists (
    select 1 from public.insurance_claims
    where import_incident_id = v_incident.id and status not in ('REJECTED', 'CLOSED')
  ) then raise exception 'La incidencia ya tiene un reclamo de seguro activo.'; end if;

  perform pg_catalog.set_config('app.audit_reason', 'Registro de reclamo al seguro', true);
  insert into public.insurance_claims(
    import_incident_id, claim_number, claimed_amount, currency_code, status,
    submitted_at, notes, created_by, updated_by
  ) values (
    v_incident.id, nullif(btrim(p_input ->> 'claimNumber'), ''),
    (p_input ->> 'claimedAmount')::numeric, (p_input ->> 'currencyCode')::char(3), v_status,
    case when v_status = 'SUBMITTED' then coalesce(nullif(p_input ->> 'submittedAt', '')::timestamptz, now()) else null end,
    nullif(btrim(p_input ->> 'notes'), ''), v_actor, v_actor
  ) returning * into v_claim;

  update public.import_incidents
  set status = 'UNDER_REVIEW', updated_by = v_actor
  where id = v_incident.id;

  return jsonb_build_object('id', v_claim.id, 'code', v_claim.claim_number);
end;
$$;

create or replace function public.update_insurance_claim_v1(p_claim_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_claim public.insurance_claims%rowtype;
  v_status text := p_input ->> 'status';
  v_approved numeric(14,2) := nullif(p_input ->> 'approvedAmount', '')::numeric;
  v_notes text := btrim(p_input ->> 'resolutionNotes');
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if v_status not in ('PENDING', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'CLOSED') then
    raise exception 'Estado del reclamo inválido.';
  end if;
  if nullif(v_notes, '') is null then raise exception 'Indica el detalle de la actualización.'; end if;

  select * into v_claim from public.insurance_claims where id = p_claim_id for update;
  if not found then raise exception 'Reclamo de seguro no encontrado.' using errcode = 'P0002'; end if;
  if v_approved is not null and (v_approved < 0 or (v_claim.claimed_amount is not null and v_approved > v_claim.claimed_amount)) then
    raise exception 'El importe aprobado no puede superar el importe reclamado.';
  end if;

  perform pg_catalog.set_config('app.audit_reason', v_notes, true);
  update public.insurance_claims
  set status = v_status,
      approved_amount = coalesce(v_approved, approved_amount),
      submitted_at = case when v_status = 'SUBMITTED' then coalesce(submitted_at, now()) else submitted_at end,
      resolved_at = case when v_status in ('APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'CLOSED') then now() else null end,
      notes = case when notes is null then v_notes else notes || E'\n' || v_notes end,
      updated_by = v_actor
  where id = p_claim_id
  returning * into v_claim;

  update public.import_incidents
  set status = case
        when v_status in ('APPROVED', 'PARTIALLY_APPROVED', 'PAID', 'CLOSED') then 'COVERED'
        when v_status = 'REJECTED' then 'REJECTED'
        else 'UNDER_REVIEW'
      end,
      resolved_at = case when v_status in ('APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'CLOSED') then now() else null end,
      resolution_notes = v_notes,
      updated_by = v_actor
  where id = v_claim.import_incident_id;

  return jsonb_build_object('id', v_claim.id, 'code', v_claim.claim_number);
end;
$$;


create or replace function public.create_preorder_sale_v1(p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_existing jsonb;
  v_existing_hash text;
  v_import_item public.import_box_items%rowtype;
  v_sale public.sales%rowtype;
  v_sale_item public.sale_items%rowtype;
  v_client public.clients%rowtype;
  v_quantity integer := coalesce((p_input ->> 'quantity')::integer, 0);
  v_allocated integer;
  v_default_days integer;
  v_vip_days integer;
  v_due_at timestamptz;
  v_original_price numeric(14,2) := coalesce((p_input ->> 'originalUnitPrice')::numeric, -1);
  v_final_price numeric(14,2) := coalesce((p_input ->> 'finalUnitPrice')::numeric, -1);
  v_discount numeric(14,2);
  v_response jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if jsonb_typeof(p_input) <> 'object' then raise exception 'La preventa debe enviarse como un objeto JSON.'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'La clave de idempotencia es obligatoria.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('CREATE_PREORDER_SALE:' || p_idempotency_key, 0));
  select response_payload, request_hash into v_existing, v_existing_hash
  from public.idempotency_keys
  where scope = 'CREATE_PREORDER_SALE' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_existing is not null then
    if v_existing_hash is distinct from pg_catalog.md5(p_input::text) then raise exception 'La clave de idempotencia ya fue utilizada con otros datos.'; end if;
    return v_existing;
  end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id, request_hash, status, expires_at)
  values ('CREATE_PREORDER_SALE', p_idempotency_key, v_actor, pg_catalog.md5(p_input::text), 'IN_PROGRESS', now() + interval '24 hours')
  on conflict (scope, idempotency_key) do update set
    actor_user_id = excluded.actor_user_id,
    request_hash = excluded.request_hash,
    status = 'IN_PROGRESS',
    locked_at = now(),
    expires_at = excluded.expires_at;

  select * into v_client from public.clients where id = (p_input ->> 'clientId')::uuid and is_active = true for update;
  if not found then raise exception 'El cliente no existe o está inactivo.' using errcode = 'P0001'; end if;

  select ibi.* into v_import_item
  from public.import_box_items ibi
  join public.import_boxes ib on ib.id = ibi.import_box_id
  join public.import_shipments ish on ish.id = ib.import_shipment_id
  where ibi.id = (p_input ->> 'importBoxItemId')::uuid
    and ib.state_code <> 'CANCELLED'
    and ish.state_code not in ('CANCELLED', 'STOCKED')
  for update of ibi;
  if not found then raise exception 'El producto importado no existe o ya no admite preventas.' using errcode = 'P0001'; end if;

  if v_quantity <= 0 then raise exception 'La cantidad de preventa debe ser mayor que cero.'; end if;
  select coalesce(sum(pa.quantity), 0)::integer into v_allocated
  from public.preorder_allocations pa
  where pa.import_box_item_id = v_import_item.id and pa.status in ('ALLOCATED', 'RECEIVED');
  if v_allocated + v_quantity > v_import_item.expected_quantity then raise exception 'La cantidad supera las unidades disponibles para preventa.'; end if;

  if v_original_price < 0 or v_final_price < 0 or v_final_price > v_original_price then raise exception 'Revisa los precios de la preventa.'; end if;
  if not exists (select 1 from public.sales_channels where code = p_input ->> 'salesChannelCode' and is_active = true) then raise exception 'El canal de venta no es válido.'; end if;
  if v_final_price < v_original_price then
    if nullif(btrim(p_input ->> 'discountTypeCode'), '') is null or nullif(btrim(p_input ->> 'discountReason'), '') is null then
      raise exception 'Todo descuento requiere tipo y motivo.';
    end if;
    if not exists (select 1 from public.discount_types where code = p_input ->> 'discountTypeCode' and is_active = true) then raise exception 'El tipo de descuento no es válido.'; end if;
  end if;

  select coalesce((setting_value #>> '{}')::integer, 14) into v_default_days
  from public.business_settings where setting_key = 'sales.default_payment_term_days';
  if v_client.is_vip then
    select payment_term_days into v_vip_days
    from public.client_vip_profiles
    where client_id = v_client.id and (valid_until is null or valid_until > now());
  end if;
  v_due_at := nullif(p_input ->> 'dueAt', '')::timestamptz;
  if v_due_at is null then v_due_at := now() + make_interval(days => coalesce(v_vip_days, v_default_days, 14)); end if;
  if v_due_at < now() then raise exception 'La fecha de vencimiento no puede estar en el pasado.'; end if;

  perform pg_catalog.set_config('app.audit_reason', 'Creación de preventa vinculada a importación', true);
  insert into public.sales(
    code, client_id, sale_type_code, sales_channel_code, currency_code,
    commercial_state_code, payment_state_code, delivery_state_code,
    due_at, notes, created_by, updated_by
  ) values (
    null, v_client.id, 'PREORDER', p_input ->> 'salesChannelCode', 'PEN',
    'DRAFT', 'UNPAID', case when p_input ->> 'deliveryMode' = 'ACCUMULATED' then 'ACCUMULATED' else 'PENDING' end,
    v_due_at, nullif(btrim(p_input ->> 'notes'), ''), v_actor, v_actor
  ) returning * into v_sale;

  insert into public.sale_items(
    sale_id, variant_id, quantity, original_unit_price, final_unit_price,
    currency_code, fulfillment_type, item_status, notes, created_by, updated_by
  ) values (
    v_sale.id, v_import_item.variant_id, v_quantity, v_original_price, v_final_price,
    'PEN', 'PREORDER', 'ACTIVE', nullif(btrim(p_input ->> 'notes'), ''), v_actor, v_actor
  ) returning * into v_sale_item;

  if v_final_price < v_original_price then
    v_discount := round(v_quantity * (v_original_price - v_final_price), 2);
    insert into public.sale_discounts(
      sale_id, sale_item_id, discount_type_code, description, amount,
      calculated_amount, reason, approved_by, created_by
    ) values (
      v_sale.id, v_sale_item.id, p_input ->> 'discountTypeCode', 'Descuento de preventa', v_discount,
      v_discount, btrim(p_input ->> 'discountReason'), v_actor, v_actor
    );
  end if;

  insert into public.preorder_allocations(
    sale_item_id, import_box_item_id, quantity, status, created_by, updated_by
  ) values (
    v_sale_item.id, v_import_item.id, v_quantity, 'ALLOCATED', v_actor, v_actor
  );

  perform public.refresh_sale_totals(v_sale.id);
  update public.sales
  set commercial_state_code = 'RESERVED', reserved_at = now(), sold_at = now(), updated_by = v_actor
  where id = v_sale.id
  returning * into v_sale;

  v_response := jsonb_build_object('id', v_sale.id, 'code', v_sale.code, 'version', v_sale.version);
  update public.idempotency_keys
  set status = 'COMPLETED', resource_type = 'SALE', resource_id = v_sale.id,
      response_payload = v_response, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'CREATE_PREORDER_SALE' and idempotency_key = p_idempotency_key;
  return v_response;
exception
  when others then
    update public.idempotency_keys set status = 'FAILED', completed_at = now()
    where scope = 'CREATE_PREORDER_SALE' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

create or replace function public.allocate_preorder_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_allocation public.preorder_allocations%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  perform pg_catalog.set_config('app.audit_reason', 'Asignación de preventa a importación', true);
  insert into public.preorder_allocations(sale_item_id, import_box_item_id, quantity, created_by, updated_by)
  values ((p_input ->> 'saleItemId')::uuid, (p_input ->> 'importBoxItemId')::uuid, (p_input ->> 'quantity')::integer, private.current_actor_id(), private.current_actor_id())
  returning * into v_allocation;
  return jsonb_build_object('id', v_allocation.id, 'code', null);
end;
$$;

create or replace function public.receive_import_box_v1(p_box_id uuid, p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_box public.import_boxes%rowtype;
  v_import public.import_shipments%rowtype;
  v_item_input jsonb;
  v_item public.import_box_items%rowtype;
  v_lot public.inventory_lots%rowtype;
  v_received integer;
  v_final_cost numeric(14,4);
  v_allocated integer;
  v_available integer;
  v_preorder record;
  v_target_bucket text;
  v_lines jsonb := '[]'::jsonb;
  v_movement_id uuid;
  v_response jsonb;
  v_existing jsonb;
  v_existing_hash text;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if jsonb_typeof(p_input -> 'items') <> 'array' or jsonb_array_length(p_input -> 'items') = 0 then raise exception 'Registra las cantidades recibidas.'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'La clave de idempotencia es obligatoria.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('RECEIVE_IMPORT_BOX:' || p_idempotency_key, 0));
  select response_payload, request_hash into v_existing, v_existing_hash
  from public.idempotency_keys where scope = 'RECEIVE_IMPORT_BOX' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_existing is not null then
    if v_existing_hash is distinct from pg_catalog.md5((p_box_id::text || p_input::text)) then raise exception 'La clave de idempotencia ya fue utilizada con otros datos.'; end if;
    return v_existing;
  end if;
  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id, request_hash, status, expires_at)
  values ('RECEIVE_IMPORT_BOX', p_idempotency_key, v_actor, pg_catalog.md5((p_box_id::text || p_input::text)), 'IN_PROGRESS', now() + interval '24 hours')
  on conflict (scope, idempotency_key) do update set actor_user_id = excluded.actor_user_id, request_hash = excluded.request_hash, status = 'IN_PROGRESS', locked_at = now(), expires_at = excluded.expires_at;

  select * into v_box from public.import_boxes where id = p_box_id for update;
  if not found then raise exception 'Caja no encontrada.' using errcode = 'P0002'; end if;
  if v_box.state_code <> 'RECEIVED_PERU' then raise exception 'La caja debe estar marcada como recibida en Perú antes de ingresar stock.'; end if;
  select * into v_import from public.import_shipments where id = v_box.import_shipment_id for update;
  if v_import.state_code <> 'RECEIVED_PERU' then
    raise exception 'La importación general debe estar marcada como recibida en Perú antes de ingresar una caja a stock.';
  end if;

  perform 1 from public.import_box_items where import_box_id = p_box_id order by id for update;
  perform pg_catalog.set_config('app.audit_reason', btrim(p_input ->> 'reason'), true);

  for v_item_input in select value from jsonb_array_elements(p_input -> 'items')
  loop
    select * into v_item from public.import_box_items where id = (v_item_input ->> 'importBoxItemId')::uuid and import_box_id = p_box_id for update;
    if not found then raise exception 'Un producto no pertenece a la caja.'; end if;
    if v_item.inventory_lot_id is not null then raise exception 'Una línea de la caja ya fue ingresada a stock.'; end if;

    v_received := coalesce((v_item_input ->> 'receivedQuantity')::integer, 0);
    v_final_cost := coalesce((v_item_input ->> 'finalUnitCostPen')::numeric, v_item.original_unit_cost * v_item.exchange_rate_to_pen);
    if v_received < 0 or v_received > v_item.expected_quantity then raise exception 'La cantidad recibida no puede superar la esperada.'; end if;

    select coalesce(sum(pa.quantity), 0)::integer into v_allocated
    from public.preorder_allocations pa where pa.import_box_item_id = v_item.id and pa.status = 'ALLOCATED';
    if v_allocated > v_received then raise exception 'La cantidad recibida es menor que las preventas asignadas para %.', v_item.id; end if;

    insert into public.inventory_lots(
      lot_code, variant_id, source_type, source_id, status, original_currency_code,
      original_unit_cost, exchange_rate_to_pen, final_unit_cost_pen, expected_quantity,
      received_quantity, acquired_at, received_at, notes, created_by, updated_by
    ) values (
      'LOT-' || v_box.code || '-' || upper(substr(replace(v_item.id::text, '-', ''), 1, 6)),
      v_item.variant_id, 'IMPORT', v_item.id, 'ACTIVE', v_item.original_currency_code,
      v_item.original_unit_cost, v_item.exchange_rate_to_pen, v_final_cost, v_item.expected_quantity,
      v_received, v_import.purchase_date::timestamptz, coalesce(nullif(p_input ->> 'occurredAt', '')::timestamptz, now()),
      nullif(btrim(v_item_input ->> 'notes'), ''), v_actor, v_actor
    ) returning * into v_lot;

    update public.import_box_items
    set received_quantity = v_received, final_unit_cost_pen = v_final_cost, inventory_lot_id = v_lot.id,
        notes = coalesce(nullif(btrim(v_item_input ->> 'notes'), ''), notes), updated_by = v_actor
    where id = v_item.id;

    v_available := v_received - v_allocated;
    if v_available > 0 then
      v_lines := v_lines || jsonb_build_array(jsonb_build_object(
        'variant_id', v_item.variant_id, 'lot_id', v_lot.id, 'warehouse_id', v_item.destination_warehouse_id,
        'bucket_code', 'AVAILABLE', 'quantity_delta', v_available, 'unit_cost_pen', v_final_cost
      ));
    end if;
    if v_allocated > 0 then
      for v_preorder in
        select
          pa.id as preorder_allocation_id,
          pa.sale_item_id,
          pa.quantity,
          case when s.delivery_state_code = 'ACCUMULATED' then 'ACCUMULATED' else 'RESERVED' end as target_bucket
        from public.preorder_allocations pa
        join public.sale_items si on si.id = pa.sale_item_id
        join public.sales s on s.id = si.sale_id
        where pa.import_box_item_id = v_item.id
          and pa.status = 'ALLOCATED'
        order by pa.created_at, pa.id
      loop
        v_target_bucket := v_preorder.target_bucket;
        v_lines := v_lines || jsonb_build_array(jsonb_build_object(
          'variant_id', v_item.variant_id,
          'lot_id', v_lot.id,
          'warehouse_id', v_item.destination_warehouse_id,
          'bucket_code', v_target_bucket,
          'quantity_delta', v_preorder.quantity,
          'unit_cost_pen', v_final_cost
        ));

        insert into public.sale_item_allocations(
          sale_item_id, lot_id, warehouse_id, quantity, allocation_status, created_by, updated_by
        ) values (
          v_preorder.sale_item_id, v_lot.id, v_item.destination_warehouse_id,
          v_preorder.quantity, v_target_bucket, v_actor, v_actor
        );

        update public.preorder_allocations
        set status = 'RECEIVED', updated_by = v_actor
        where id = v_preorder.preorder_allocation_id;
      end loop;
    end if;

    if v_received < v_item.expected_quantity then
      insert into public.import_incidents(
        import_shipment_id, import_box_id, import_box_item_id, incident_type, affected_quantity,
        description, status, occurred_at, created_by, updated_by
      ) values (
        v_import.id, v_box.id, v_item.id, 'MISSING', v_item.expected_quantity - v_received,
        'Faltante detectado durante la recepción de la caja ' || v_box.code, 'OPEN',
        coalesce(nullif(p_input ->> 'occurredAt', '')::timestamptz, now()), v_actor, v_actor
      );
    end if;
  end loop;

  if jsonb_array_length(v_lines) > 0 then
    v_movement_id := public.create_inventory_movement(
      'IMPORT_RECEIPT', 'IMPORT_BOX', v_box.id, btrim(p_input ->> 'reason'), v_lines,
      'import-receipt-v1:' || p_idempotency_key, 'Ingreso de caja importada ' || v_box.code,
      jsonb_build_object('import_id', v_import.id, 'box_id', v_box.id)
    );
  end if;

  update public.import_boxes
  set state_code = 'STOCKED', actual_arrival_at = coalesce(actual_arrival_at, coalesce(nullif(p_input ->> 'occurredAt', '')::timestamptz, now())), updated_by = v_actor
  where id = v_box.id returning * into v_box;

  if not exists (select 1 from public.import_boxes where import_shipment_id = v_import.id and state_code not in ('STOCKED', 'CANCELLED')) then
    update public.import_shipments
    set state_code = 'STOCKED', stock_entry_completed_at = coalesce(nullif(p_input ->> 'occurredAt', '')::timestamptz, now()), updated_by = v_actor
    where id = v_import.id;
  end if;

  v_response := jsonb_build_object('id', v_box.id, 'code', v_box.code, 'stateCode', v_box.state_code, 'version', v_box.version);
  update public.idempotency_keys
  set status = 'COMPLETED', resource_type = 'IMPORT_BOX', resource_id = v_box.id, response_payload = v_response, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'RECEIVE_IMPORT_BOX' and idempotency_key = p_idempotency_key;
  return v_response;
exception
  when others then
    update public.idempotency_keys set status = 'FAILED', completed_at = now() where scope = 'RECEIVE_IMPORT_BOX' and idempotency_key = p_idempotency_key;
    raise;
end;
$$;

revoke execute on function public.get_import_support_v1() from public, anon;
revoke execute on function public.create_import_partner_v1(jsonb) from public, anon;
revoke execute on function public.list_imports_v1(text, text, integer, integer) from public, anon;
revoke execute on function public.create_import_v1(jsonb, text) from public, anon;
revoke execute on function public.get_import_detail_v1(uuid) from public, anon;
revoke execute on function public.advance_import_v1(uuid, text, text, timestamptz, text) from public, anon;
revoke execute on function public.advance_import_box_v1(uuid, text, text, timestamptz, text) from public, anon;
revoke execute on function public.add_import_cost_v1(uuid, jsonb) from public, anon;
revoke execute on function public.create_import_incident_v1(uuid, jsonb) from public, anon;
revoke execute on function public.create_insurance_claim_v1(uuid, jsonb) from public, anon;
revoke execute on function public.update_insurance_claim_v1(uuid, jsonb) from public, anon;
revoke execute on function public.create_preorder_sale_v1(jsonb, text) from public, anon;
revoke execute on function public.allocate_preorder_v1(jsonb) from public, anon;
revoke execute on function public.receive_import_box_v1(uuid, jsonb, text) from public, anon;

grant execute on function public.get_import_support_v1() to authenticated, service_role;
grant execute on function public.create_import_partner_v1(jsonb) to authenticated, service_role;
grant execute on function public.list_imports_v1(text, text, integer, integer) to authenticated, service_role;
grant execute on function public.create_import_v1(jsonb, text) to authenticated, service_role;
grant execute on function public.get_import_detail_v1(uuid) to authenticated, service_role;
grant execute on function public.advance_import_v1(uuid, text, text, timestamptz, text) to authenticated, service_role;
grant execute on function public.advance_import_box_v1(uuid, text, text, timestamptz, text) to authenticated, service_role;
grant execute on function public.add_import_cost_v1(uuid, jsonb) to authenticated, service_role;
grant execute on function public.create_import_incident_v1(uuid, jsonb) to authenticated, service_role;
grant execute on function public.create_insurance_claim_v1(uuid, jsonb) to authenticated, service_role;
grant execute on function public.update_insurance_claim_v1(uuid, jsonb) to authenticated, service_role;
grant execute on function public.create_preorder_sale_v1(jsonb, text) to authenticated, service_role;
grant execute on function public.allocate_preorder_v1(jsonb) to authenticated, service_role;
grant execute on function public.receive_import_box_v1(uuid, jsonb, text) to authenticated, service_role;

commit;

notify pgrst, 'reload schema';


-- =========================================================
-- 020_partner_dedup_and_import_currencies.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 020 CORREGIDA: proveedores sin duplicados y monedas internacionales para importaciones

begin;

-- Monedas habituales para compras internacionales de merchandising.
insert into public.currencies(code, name, symbol, decimal_places, is_active)
values
  ('PEN', 'Sol peruano', 'S/', 2, true),
  ('USD', 'Dólar estadounidense', 'US$', 2, true),
  ('JPY', 'Yen japonés', '¥', 0, true),
  ('CNY', 'Yuan chino', 'CN¥', 2, true),
  ('KRW', 'Won surcoreano', '₩', 0, true),
  ('EUR', 'Euro', '€', 2, true),
  ('GBP', 'Libra esterlina', '£', 2, true),
  ('HKD', 'Dólar de Hong Kong', 'HK$', 2, true),
  ('CAD', 'Dólar canadiense', 'C$', 2, true),
  ('AUD', 'Dólar australiano', 'A$', 2, true)
on conflict (code) do update set
  name = excluded.name,
  symbol = excluded.symbol,
  decimal_places = excluded.decimal_places,
  is_active = true;

create or replace function private.normalize_business_partner_name(p_value text)
returns text
language sql
stable
set search_path = ''
as $$
  select pg_catalog.regexp_replace(
    pg_catalog.lower(extensions.unaccent(coalesce(pg_catalog.btrim(p_value), ''))),
    '[^a-z0-9]+',
    '',
    'g'
  );
$$;

comment on function private.normalize_business_partner_name(text) is
  'Normaliza nombres de socios comerciales para impedir duplicados por mayúsculas, espacios, signos o tildes.';

-- Consolida proveedores activos repetidos que pudieran haberse creado antes de esta corrección.
do $$
declare
  v_duplicate record;
begin
  perform pg_catalog.set_config('app.audit_reason', 'Consolidación de proveedores duplicados previa a la migración 020', true);

  for v_duplicate in
    with supplier_partners as (
      select
        bp.id,
        bp.created_at,
        private.normalize_business_partner_name(coalesce(bp.trade_name, bp.legal_name)) as normalized_name
      from public.business_partners bp
      where bp.is_active = true
        and exists (
          select 1
          from public.business_partner_types bpt
          where bpt.partner_id = bp.id
            and bpt.partner_type_code = 'SUPPLIER'
        )
    ), ranked as (
      select
        sp.*,
        pg_catalog.first_value(sp.id) over (
          partition by sp.normalized_name
          order by sp.created_at, sp.id
        ) as keeper_id,
        pg_catalog.row_number() over (
          partition by sp.normalized_name
          order by sp.created_at, sp.id
        ) as duplicate_order
      from supplier_partners sp
      where sp.normalized_name <> ''
    )
    select id as duplicate_id, keeper_id
    from ranked
    where duplicate_order > 1
  loop
    insert into public.business_partner_types(partner_id, partner_type_code)
    select v_duplicate.keeper_id, bpt.partner_type_code
    from public.business_partner_types bpt
    where bpt.partner_id = v_duplicate.duplicate_id
    on conflict do nothing;

    update public.client_addresses
       set preferred_partner_id = v_duplicate.keeper_id
     where preferred_partner_id = v_duplicate.duplicate_id;

    update public.deliveries
       set operator_partner_id = v_duplicate.keeper_id
     where operator_partner_id = v_duplicate.duplicate_id;

    update public.import_shipments
       set supplier_partner_id = v_duplicate.keeper_id
     where supplier_partner_id = v_duplicate.duplicate_id;

    update public.import_boxes
       set international_operator_id = v_duplicate.keeper_id
     where international_operator_id = v_duplicate.duplicate_id;

    update public.import_boxes
       set local_operator_id = v_duplicate.keeper_id
     where local_operator_id = v_duplicate.duplicate_id;

    update public.loans
       set lender_partner_id = v_duplicate.keeper_id
     where lender_partner_id = v_duplicate.duplicate_id;

    update public.business_partners
       set is_active = false,
           metadata = metadata || jsonb_build_object(
             'mergedIntoPartnerId', v_duplicate.keeper_id,
             'mergedAt', pg_catalog.now(),
             'mergedByMigration', '020'
           ),
           notes = pg_catalog.concat_ws(E'\n', notes, 'Registro duplicado consolidado por la migración 020.'),
           updated_at = pg_catalog.now(),
           version = version + 1
     where id = v_duplicate.duplicate_id;
  end loop;
end;
$$;

create or replace function public.create_import_partner_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_partner public.business_partners%rowtype;
  v_existing public.business_partners%rowtype;
  v_type text := p_input ->> 'partnerTypeCode';
  v_legal_name text := pg_catalog.btrim(p_input ->> 'legalName');
  v_trade_name text := nullif(pg_catalog.btrim(p_input ->> 'tradeName'), '');
  v_normalized_name text;
  v_code text;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if v_type not in ('SUPPLIER', 'INTERNATIONAL_OPERATOR', 'LOCAL_OPERATOR') then
    raise exception 'Tipo de socio comercial inválido.';
  end if;
  if nullif(v_legal_name, '') is null then
    raise exception 'El nombre legal es obligatorio.';
  end if;

  v_normalized_name := private.normalize_business_partner_name(coalesce(v_trade_name, v_legal_name));
  if v_normalized_name = '' then
    raise exception 'El nombre del proveedor u operador no es válido.';
  end if;

  -- Serializa altas del mismo nombre para impedir duplicados incluso con dos administradoras.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtext('IMPORT_PARTNER:' || v_normalized_name));

  select bp.*
    into v_existing
    from public.business_partners bp
   where private.normalize_business_partner_name(coalesce(bp.trade_name, bp.legal_name)) = v_normalized_name
      or private.normalize_business_partner_name(bp.legal_name) = v_normalized_name
   order by bp.is_active desc, bp.created_at, bp.id
   limit 1
   for update;

  if found then
    perform pg_catalog.set_config('app.audit_reason', 'Reutilización de proveedor u operador existente', true);

    if not v_existing.is_active then
      update public.business_partners
         set is_active = true,
             updated_by = v_actor,
             updated_at = pg_catalog.now(),
             version = version + 1
       where id = v_existing.id
       returning * into v_existing;
    end if;

    insert into public.business_partner_types(partner_id, partner_type_code)
    values (v_existing.id, v_type)
    on conflict do nothing;

    return jsonb_build_object(
      'id', v_existing.id,
      'code', v_existing.code,
      'reused', true
    );
  end if;

  v_code := 'PART-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.regexp_replace(v_legal_name, '[^A-Za-z0-9]+', '', 'g'), 1, 8))
    || '-' || pg_catalog.upper(pg_catalog.substr(pg_catalog.replace(extensions.gen_random_uuid()::text, '-', ''), 1, 6));
  perform pg_catalog.set_config('app.audit_reason', 'Creación de proveedor u operador de importación', true);

  insert into public.business_partners(
    code, legal_name, trade_name, contact_name, phone, email, country_code, notes,
    created_by, updated_by
  ) values (
    v_code,
    v_legal_name,
    v_trade_name,
    nullif(pg_catalog.btrim(p_input ->> 'contactName'), ''),
    nullif(pg_catalog.btrim(p_input ->> 'phone'), ''),
    nullif(pg_catalog.btrim(p_input ->> 'email'), '')::extensions.citext,
    pg_catalog.upper(nullif(pg_catalog.btrim(p_input ->> 'countryCode'), ''))::char(2),
    nullif(pg_catalog.btrim(p_input ->> 'notes'), ''),
    v_actor, v_actor
  ) returning * into v_partner;

  insert into public.business_partner_types(partner_id, partner_type_code)
  values (v_partner.id, v_type);

  return jsonb_build_object(
    'id', v_partner.id,
    'code', v_partner.code,
    'reused', false
  );
end;
$$;

notify pgrst, 'reload schema';

commit;


-- =========================================================
-- 021_finance_banking_reconciliation_api.sql
-- =========================================================

-- Yukimi Gestión
-- Migración 021: finanzas, cuentas, obligaciones, préstamos, caja y conciliación bancaria

begin;

insert into public.financial_transaction_types(code, name, description)
values
  ('LOAN_GRANTED', 'Préstamo otorgado', 'Salida de dinero por un préstamo concedido a un tercero.'),
  ('LOAN_COLLECTION', 'Cobro de préstamo', 'Ingreso por devolución de un préstamo concedido.')
on conflict (code) do update set
  name = excluded.name,
  description = excluded.description,
  is_active = true;

insert into public.financial_categories(code, name, nature, description, sort_order)
values
  ('BANK_FEES', 'Comisiones bancarias', 'EXPENSE', 'Comisiones y cargos de entidades financieras.', 175),
  ('SERVICES', 'Servicios', 'EXPENSE', 'Servicios operativos y administrativos.', 176),
  ('CASH_DIFFERENCE', 'Diferencia de caja', 'ADJUSTMENT', 'Diferencias documentadas durante el cierre de caja.', 910),
  ('TRANSFERS', 'Transferencias internas', 'TRANSFER', 'Movimientos entre cuentas propias.', 920)
on conflict (code) do update set
  name = excluded.name,
  nature = excluded.nature,
  description = excluded.description,
  sort_order = excluded.sort_order,
  is_active = true;

insert into storage.buckets(id, name, public, file_size_limit, allowed_mime_types)
values (
  'financial-files',
  'financial-files',
  false,
  10485760,
  array['image/jpeg','image/png','image/webp','application/pdf','text/csv','application/vnd.openxmlformats-officedocument.spreadsheetml.sheet']
)
on conflict (id) do update set
  public = false,
  file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

create index if not exists ix_financial_transactions_manual_search
  on public.financial_transactions(occurred_at desc, state_code, transaction_type_code);

create index if not exists ix_obligations_open_due
  on public.obligations(due_date, obligation_type)
  where status in ('PENDING','OVERDUE');

create index if not exists ix_bank_rows_batch_status
  on public.bank_statement_rows(batch_id, reconciliation_status, transaction_date desc);

create or replace function private.finance_category_code(p_name text)
returns text
language sql
immutable
set search_path = ''
as $$
  select left(
    trim(both '_' from regexp_replace(
      upper(extensions.unaccent(coalesce(p_name, ''))),
      '[^A-Z0-9]+', '_', 'g'
    )),
    50
  );
$$;

create or replace function public.get_finance_support_v1()
returns jsonb
language sql
stable
security definer
set search_path = ''
as $$
  select jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fa.id,
        'code', fa.code,
        'name', fa.name,
        'accountTypeCode', fa.account_type_code,
        'currencyCode', trim(fa.currency_code),
        'institutionName', fa.institution_name,
        'currentBalance', fa.current_balance,
        'version', fa.version
      ) order by fa.account_type_code, fa.name)
      from public.financial_accounts fa
      where fa.is_active = true
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fc.id,
        'code', fc.code,
        'name', fc.name,
        'nature', fc.nature,
        'description', fc.description
      ) order by fc.sort_order, fc.name)
      from public.financial_categories fc
      where fc.is_active = true
    ), '[]'::jsonb),
    'currencies', coalesce((
      select jsonb_agg(jsonb_build_object('code', trim(c.code), 'name', c.name) order by c.code)
      from public.currencies c
      where c.is_active = true
    ), '[]'::jsonb),
    'obligationTypes', jsonb_build_array(
      jsonb_build_object('code','CREDIT_CARD','name','Tarjeta de crédito'),
      jsonb_build_object('code','SUNAT','name','SUNAT'),
      jsonb_build_object('code','CUSTOMS','name','Aduanas'),
      jsonb_build_object('code','SERVICE','name','Servicio'),
      jsonb_build_object('code','OTHER','name','Otro')
    )
  )
  where private.is_active_admin();
$$;

create or replace function public.get_finance_dashboard_v1()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_start date := date_trunc('month', timezone('America/Lima', now()))::date;
  v_end date := (date_trunc('month', timezone('America/Lima', now())) + interval '1 month')::date;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', fa.id,
        'code', fa.code,
        'name', fa.name,
        'accountTypeCode', fa.account_type_code,
        'currencyCode', trim(fa.currency_code),
        'currentBalance', fa.current_balance,
        'balanceAsOf', fa.balance_as_of
      ) order by case fa.account_type_code when 'BANK' then 1 when 'WALLET' then 2 when 'CASH' then 3 else 4 end, fa.name)
      from public.financial_accounts fa
      where fa.is_active = true
    ), '[]'::jsonb),
    'monthIncome', coalesce((
      select round(sum(ft.total_amount), 2)
      from public.financial_transactions ft
      where ft.state_code = 'POSTED'
        and (ft.occurred_at at time zone 'America/Lima')::date >= v_start
        and (ft.occurred_at at time zone 'America/Lima')::date < v_end
        and ft.transaction_type_code in ('INCOME','LOAN_RECEIVED','LOAN_COLLECTION')
    ), 0),
    'monthExpense', coalesce((
      select round(sum(ft.total_amount), 2)
      from public.financial_transactions ft
      where ft.state_code = 'POSTED'
        and (ft.occurred_at at time zone 'America/Lima')::date >= v_start
        and (ft.occurred_at at time zone 'America/Lima')::date < v_end
        and ft.transaction_type_code in ('EXPENSE','LOAN_PAYMENT','LOAN_GRANTED','REFUND')
    ), 0),
    'monthlySummary', coalesce((
      select jsonb_agg(jsonb_build_object(
        'month', to_char(m.month_start, 'YYYY-MM'),
        'label', to_char(m.month_start, 'Mon'),
        'income', coalesce(s.income, 0),
        'expense', coalesce(s.expense, 0)
      ) order by m.month_start)
      from (
        select generate_series(
          date_trunc('month', timezone('America/Lima', now())) - interval '5 months',
          date_trunc('month', timezone('America/Lima', now())),
          interval '1 month'
        )::date as month_start
      ) m
      left join lateral (
        select
          round(coalesce(sum(ft.total_amount) filter (where ft.transaction_type_code in ('INCOME','LOAN_RECEIVED','LOAN_COLLECTION')), 0), 2) as income,
          round(coalesce(sum(ft.total_amount) filter (where ft.transaction_type_code in ('EXPENSE','LOAN_PAYMENT','LOAN_GRANTED','REFUND')), 0), 2) as expense
        from public.financial_transactions ft
        where ft.state_code = 'POSTED'
          and (ft.occurred_at at time zone 'America/Lima')::date >= m.month_start
          and (ft.occurred_at at time zone 'America/Lima')::date < m.month_start + interval '1 month'
      ) s on true
    ), '[]'::jsonb),
    'obligations', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', o.id,
        'code', o.code,
        'obligationType', o.obligation_type,
        'title', o.title,
        'amount', o.amount,
        'currencyCode', trim(o.currency_code),
        'dueDate', o.due_date,
        'daysRemaining', o.due_date - timezone('America/Lima', now())::date,
        'status', case when o.status = 'PENDING' and o.due_date < timezone('America/Lima', now())::date then 'OVERDUE' else o.status end,
        'version', o.version
      ) order by o.due_date, o.title)
      from (
        select * from public.obligations
        where status in ('PENDING','OVERDUE')
        order by due_date, title
        limit 10
      ) o
    ), '[]'::jsonb),
    'loans', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', l.id,
        'code', l.code,
        'lenderName', l.lender_name_snapshot,
        'principalAmount', l.principal_amount,
        'outstandingPrincipal', l.outstanding_principal,
        'currencyCode', trim(l.currency_code),
        'status', l.status,
        'nextDueDate', (
          select min(li.due_date) from public.loan_installments li
          where li.loan_id = l.id and li.status in ('PENDING','PARTIAL','OVERDUE')
        ),
        'nextInstallmentId', (
          select li.id from public.loan_installments li
          where li.loan_id = l.id and li.status in ('PENDING','PARTIAL','OVERDUE')
          order by li.due_date, li.installment_number limit 1
        ),
        'nextInstallmentAmount', (
          select round(li.total_amount - li.paid_amount, 2) from public.loan_installments li
          where li.loan_id = l.id and li.status in ('PENDING','PARTIAL','OVERDUE')
          order by li.due_date, li.installment_number limit 1
        )
      ) order by l.created_at desc)
      from public.loans l
      where l.status in ('ACTIVE','DEFAULTED')
    ), '[]'::jsonb),
    'recentTransactions', coalesce((
      select jsonb_agg(row_payload order by occurred_at desc)
      from (
        select
          ft.occurred_at,
          jsonb_build_object(
            'id', ft.id,
            'code', ft.code,
            'transactionTypeCode', ft.transaction_type_code,
            'stateCode', ft.state_code,
            'description', ft.description,
            'categoryName', fc.name,
            'occurredAt', ft.occurred_at,
            'currencyCode', trim(ft.currency_code),
            'totalAmount', ft.total_amount,
            'sourceType', ft.source_type,
            'isSystemGenerated', ft.is_system_generated,
            'createdByName', p.display_name,
            'accountNames', coalesce((
              select string_agg(distinct fa.name, ', ' order by fa.name)
              from public.financial_transaction_entries e
              join public.financial_accounts fa on fa.id = e.financial_account_id
              where e.financial_transaction_id = ft.id
            ), '')
          ) as row_payload
        from public.financial_transactions ft
        left join public.financial_categories fc on fc.id = ft.category_id
        left join public.profiles p on p.id = ft.created_by
        order by ft.occurred_at desc
        limit 12
      ) q
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.list_financial_transactions_v1(
  p_search text default null,
  p_type text default 'ALL',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_page integer := greatest(coalesce(p_page, 1), 1);
  v_page_size integer := least(greatest(coalesce(p_page_size, 20), 1), 100);
  v_search text := nullif(btrim(p_search), '');
  v_total bigint;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select count(*) into v_total
  from public.financial_transactions ft
  left join public.financial_categories fc on fc.id = ft.category_id
  where (p_type = 'ALL' or ft.transaction_type_code = p_type)
    and (
      v_search is null
      or ft.code ilike '%' || v_search || '%'
      or ft.description ilike '%' || v_search || '%'
      or fc.name ilike '%' || v_search || '%'
      or exists (
        select 1
        from public.financial_transaction_entries e
        join public.financial_accounts fa on fa.id = e.financial_account_id
        where e.financial_transaction_id = ft.id
          and fa.name ilike '%' || v_search || '%'
      )
    );

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', q.id,
        'code', q.code,
        'transactionTypeCode', q.transaction_type_code,
        'stateCode', q.state_code,
        'description', q.description,
        'categoryName', q.category_name,
        'occurredAt', q.occurred_at,
        'currencyCode', trim(q.currency_code),
        'totalAmount', q.total_amount,
        'sourceType', q.source_type,
        'isSystemGenerated', q.is_system_generated,
        'createdByName', q.created_by_name,
        'accountNames', q.account_names,
        'reason', q.reason,
        'version', q.version
      ) order by q.occurred_at desc)
      from (
        select
          ft.*,
          fc.name as category_name,
          p.display_name as created_by_name,
          coalesce((
            select string_agg(distinct fa.name, ', ' order by fa.name)
            from public.financial_transaction_entries e
            join public.financial_accounts fa on fa.id = e.financial_account_id
            where e.financial_transaction_id = ft.id
          ), '') as account_names
        from public.financial_transactions ft
        left join public.financial_categories fc on fc.id = ft.category_id
        left join public.profiles p on p.id = ft.created_by
        where (p_type = 'ALL' or ft.transaction_type_code = p_type)
          and (
            v_search is null
            or ft.code ilike '%' || v_search || '%'
            or ft.description ilike '%' || v_search || '%'
            or fc.name ilike '%' || v_search || '%'
            or exists (
              select 1
              from public.financial_transaction_entries e
              join public.financial_accounts fa on fa.id = e.financial_account_id
              where e.financial_transaction_id = ft.id
                and fa.name ilike '%' || v_search || '%'
            )
          )
        order by ft.occurred_at desc
        limit v_page_size offset (v_page - 1) * v_page_size
      ) q
    ), '[]'::jsonb),
    'total', v_total,
    'page', v_page,
    'pageSize', v_page_size
  );
end;
$$;

create or replace function public.create_financial_category_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_name text := btrim(p_input ->> 'name');
  v_nature text := upper(btrim(p_input ->> 'nature'));
  v_code text;
  v_category public.financial_categories%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if v_name is null or length(v_name) < 2 then
    raise exception 'El nombre de la categoría es obligatorio.';
  end if;
  if v_nature not in ('INCOME','EXPENSE','BOTH') then
    raise exception 'Naturaleza de categoría inválida.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('FIN_CATEGORY:' || lower(extensions.unaccent(v_name)), 0));

  select * into v_category
  from public.financial_categories
  where lower(extensions.unaccent(name)) = lower(extensions.unaccent(v_name))
    and is_active = true
  limit 1;

  if found then
    return jsonb_build_object('id', v_category.id, 'code', v_category.code, 'name', v_category.name, 'reused', true);
  end if;

  v_code := private.finance_category_code(v_name);
  if v_code = '' then v_code := 'CATEGORY'; end if;
  if exists(select 1 from public.financial_categories where code = v_code) then
    v_code := left(v_code, 42) || '_' || upper(substr(replace(extensions.gen_random_uuid()::text, '-', ''), 1, 7));
  end if;

  insert into public.financial_categories(code, name, nature, description, sort_order, created_by, updated_by)
  values (
    v_code,
    v_name,
    v_nature,
    nullif(btrim(p_input ->> 'description'), ''),
    500,
    v_actor,
    v_actor
  ) returning * into v_category;

  return jsonb_build_object('id', v_category.id, 'code', v_category.code, 'name', v_category.name, 'reused', false);
end;
$$;

create or replace function public.create_manual_financial_transaction_v1(
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_account public.financial_accounts%rowtype;
  v_category public.financial_categories%rowtype;
  v_type text := upper(btrim(p_input ->> 'transactionTypeCode'));
  v_amount numeric(14,2) := round((p_input ->> 'amount')::numeric, 2);
  v_entry numeric(14,2);
  v_transaction public.financial_transactions%rowtype;
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if v_type not in ('INCOME','EXPENSE') then
    raise exception 'Solo se admiten ingresos o gastos manuales.';
  end if;
  if v_amount <= 0 then raise exception 'El importe debe ser mayor que cero.'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'La clave de idempotencia es obligatoria.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('FIN_MANUAL:' || p_idempotency_key, 0));
  select response_payload into v_result from public.idempotency_keys
  where scope = 'FIN_MANUAL' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_result is not null then return v_result; end if;

  select * into v_account from public.financial_accounts
  where id = (p_input ->> 'accountId')::uuid and is_active = true
  for update;
  if not found then raise exception 'La cuenta financiera no existe o está inactiva.' using errcode = 'P0002'; end if;

  select * into v_category from public.financial_categories
  where id = (p_input ->> 'categoryId')::uuid and is_active = true;
  if not found then raise exception 'La categoría financiera no existe o está inactiva.' using errcode = 'P0002'; end if;
  if v_type = 'INCOME' and v_category.nature not in ('INCOME','BOTH') then raise exception 'La categoría no admite ingresos.'; end if;
  if v_type = 'EXPENSE' and v_category.nature not in ('EXPENSE','BOTH') then raise exception 'La categoría no admite gastos.'; end if;
  if v_type = 'EXPENSE' and v_account.current_balance < v_amount then raise exception 'Saldo insuficiente en la cuenta seleccionada.' using errcode = 'P0001'; end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('FIN_MANUAL', p_idempotency_key, v_actor)
  on conflict (scope, idempotency_key) do nothing;

  insert into public.financial_transactions(
    code, transaction_type_code, state_code, category_id, occurred_at, description,
    currency_code, total_amount, idempotency_key, is_system_generated, reason, metadata, created_by
  ) values (
    null,
    v_type,
    'POSTED',
    v_category.id,
    (p_input ->> 'occurredAt')::timestamptz,
    btrim(p_input ->> 'description'),
    v_account.currency_code,
    v_amount,
    p_idempotency_key,
    false,
    nullif(btrim(p_input ->> 'reason'), ''),
    jsonb_strip_nulls(jsonb_build_object(
      'reference', nullif(btrim(p_input ->> 'reference'), ''),
      'notes', nullif(btrim(p_input ->> 'notes'), '')
    )),
    v_actor
  ) returning * into v_transaction;

  v_entry := case when v_type = 'INCOME' then v_amount else -v_amount end;
  insert into public.financial_transaction_entries(financial_transaction_id, financial_account_id, amount_signed, description)
  values (v_transaction.id, v_account.id, v_entry, v_transaction.description);

  v_result := jsonb_build_object('id', v_transaction.id, 'code', v_transaction.code, 'stateCode', v_transaction.state_code, 'version', v_transaction.version);
  update public.idempotency_keys set status = 'COMPLETED', resource_type = 'FINANCIAL_TRANSACTION', resource_id = v_transaction.id,
    response_payload = v_result, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'FIN_MANUAL' and idempotency_key = p_idempotency_key;

  return v_result;
end;
$$;

create or replace function public.create_financial_transfer_v1(
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_source public.financial_accounts%rowtype;
  v_destination public.financial_accounts%rowtype;
  v_category_id uuid;
  v_amount numeric(14,2) := round((p_input ->> 'amount')::numeric, 2);
  v_transaction public.financial_transactions%rowtype;
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if v_amount <= 0 then raise exception 'El importe debe ser mayor que cero.'; end if;
  if (p_input ->> 'sourceAccountId') = (p_input ->> 'destinationAccountId') then raise exception 'Las cuentas de origen y destino deben ser diferentes.'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'La clave de idempotencia es obligatoria.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('FIN_TRANSFER:' || p_idempotency_key, 0));
  select response_payload into v_result from public.idempotency_keys
  where scope = 'FIN_TRANSFER' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_result is not null then return v_result; end if;

  perform 1 from public.financial_accounts
  where id in ((p_input ->> 'sourceAccountId')::uuid, (p_input ->> 'destinationAccountId')::uuid)
  order by id for update;

  select * into v_source from public.financial_accounts where id = (p_input ->> 'sourceAccountId')::uuid and is_active = true;
  select * into v_destination from public.financial_accounts where id = (p_input ->> 'destinationAccountId')::uuid and is_active = true;
  if v_source.id is null or v_destination.id is null then raise exception 'Una de las cuentas no existe o está inactiva.' using errcode = 'P0002'; end if;
  if v_source.currency_code <> v_destination.currency_code then raise exception 'La transferencia directa solo admite cuentas de la misma moneda.'; end if;
  if v_source.current_balance < v_amount then raise exception 'Saldo insuficiente en la cuenta de origen.'; end if;

  select id into v_category_id from public.financial_categories where code = 'TRANSFERS';
  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('FIN_TRANSFER', p_idempotency_key, v_actor) on conflict (scope, idempotency_key) do nothing;

  insert into public.financial_transactions(
    code, transaction_type_code, state_code, category_id, occurred_at, description,
    currency_code, total_amount, idempotency_key, is_system_generated, reason, metadata, created_by
  ) values (
    null, 'TRANSFER', 'POSTED', v_category_id, (p_input ->> 'occurredAt')::timestamptz,
    coalesce(nullif(btrim(p_input ->> 'description'), ''), 'Transferencia de ' || v_source.name || ' a ' || v_destination.name),
    v_source.currency_code, v_amount, p_idempotency_key, false,
    nullif(btrim(p_input ->> 'reason'), ''),
    jsonb_build_object('sourceAccountId', v_source.id, 'destinationAccountId', v_destination.id, 'reference', nullif(btrim(p_input ->> 'reference'), '')),
    v_actor
  ) returning * into v_transaction;

  insert into public.financial_transaction_entries(financial_transaction_id, financial_account_id, amount_signed, description)
  values
    (v_transaction.id, v_source.id, -v_amount, 'Salida por transferencia'),
    (v_transaction.id, v_destination.id, v_amount, 'Ingreso por transferencia');

  v_result := jsonb_build_object('id', v_transaction.id, 'code', v_transaction.code, 'stateCode', v_transaction.state_code, 'version', v_transaction.version);
  update public.idempotency_keys set status = 'COMPLETED', resource_type = 'FINANCIAL_TRANSACTION', resource_id = v_transaction.id,
    response_payload = v_result, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'FIN_TRANSFER' and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

create or replace function public.reverse_financial_transaction_v1(
  p_transaction_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_original public.financial_transactions%rowtype;
  v_reversal public.financial_transactions%rowtype;
  v_entry record;
  v_account public.financial_accounts%rowtype;
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason, ''))) < 5 then raise exception 'El motivo de reversión debe tener al menos 5 caracteres.'; end if;
  if nullif(btrim(p_idempotency_key), '') is null then raise exception 'La clave de idempotencia es obligatoria.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('FIN_REVERSAL:' || p_idempotency_key, 0));
  select response_payload into v_result from public.idempotency_keys
  where scope = 'FIN_REVERSAL' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_result is not null then return v_result; end if;

  select * into v_original from public.financial_transactions where id = p_transaction_id for update;
  if not found then raise exception 'Movimiento financiero no encontrado.' using errcode = 'P0002'; end if;
  if v_original.state_code <> 'POSTED' then raise exception 'Solo se puede revertir un movimiento publicado.'; end if;
  if v_original.is_system_generated or v_original.source_type is not null then
    raise exception 'Este movimiento fue generado por otro módulo y debe revertirse desde su operación de origen.';
  end if;
  if v_original.transaction_type_code = 'REVERSAL' then raise exception 'Una reversión no puede revertirse directamente.'; end if;

  for v_entry in select * from public.financial_transaction_entries where financial_transaction_id = v_original.id order by financial_account_id loop
    select * into v_account from public.financial_accounts where id = v_entry.financial_account_id for update;
    if (-v_entry.amount_signed) < 0 and v_account.current_balance < abs(v_entry.amount_signed) then
      raise exception 'La cuenta % no tiene saldo suficiente para revertir el movimiento.', v_account.name;
    end if;
  end loop;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('FIN_REVERSAL', p_idempotency_key, v_actor) on conflict (scope, idempotency_key) do nothing;

  insert into public.financial_transactions(
    code, transaction_type_code, state_code, category_id, occurred_at, description,
    currency_code, total_amount, idempotency_key, is_system_generated, reversal_of, reason, metadata, created_by
  ) values (
    null, 'REVERSAL', 'POSTED', v_original.category_id, now(), 'Reversión de ' || v_original.code || ': ' || v_original.description,
    v_original.currency_code, v_original.total_amount, p_idempotency_key, false, v_original.id, btrim(p_reason),
    jsonb_build_object('originalTransactionId', v_original.id), v_actor
  ) returning * into v_reversal;

  insert into public.financial_transaction_entries(financial_transaction_id, financial_account_id, amount_signed, description)
  select v_reversal.id, e.financial_account_id, -e.amount_signed, 'Reversión de ' || v_original.code
  from public.financial_transaction_entries e
  where e.financial_transaction_id = v_original.id;

  perform set_config('app.audit_reason', btrim(p_reason), true);
  update public.financial_transactions
  set state_code = 'REVERSED', reason = btrim(p_reason), updated_at = now(), version = version + 1
  where id = v_original.id;

  v_result := jsonb_build_object('id', v_reversal.id, 'code', v_reversal.code, 'stateCode', v_reversal.state_code, 'version', v_reversal.version);
  update public.idempotency_keys set status = 'COMPLETED', resource_type = 'FINANCIAL_TRANSACTION', resource_id = v_reversal.id,
    response_payload = v_result, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'FIN_REVERSAL' and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

create or replace function public.create_obligation_v1(p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_obligation public.obligations%rowtype;
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if upper(btrim(p_input ->> 'obligationType')) not in ('CREDIT_CARD','SUNAT','CUSTOMS','SERVICE','OTHER') then raise exception 'Tipo de obligación inválido.'; end if;
  if (p_input ->> 'amount')::numeric <= 0 then raise exception 'El importe debe ser mayor que cero.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('OBLIGATION:' || p_idempotency_key, 0));
  select response_payload into v_result from public.idempotency_keys
  where scope = 'OBLIGATION' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_result is not null then return v_result; end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('OBLIGATION', p_idempotency_key, v_actor) on conflict (scope, idempotency_key) do nothing;

  insert into public.obligations(
    code, obligation_type, title, description, amount, currency_code, due_date,
    alert_days_before, status, recurrence_rule, metadata, created_by, updated_by
  ) values (
    null, upper(btrim(p_input ->> 'obligationType')), btrim(p_input ->> 'title'),
    nullif(btrim(p_input ->> 'description'), ''), round((p_input ->> 'amount')::numeric, 2),
    (p_input ->> 'currencyCode')::char(3), (p_input ->> 'dueDate')::date,
    coalesce((p_input ->> 'alertDaysBefore')::integer, 3), 'PENDING',
    nullif(btrim(p_input ->> 'recurrenceRule'), ''), '{}'::jsonb, v_actor, v_actor
  ) returning * into v_obligation;

  v_result := jsonb_build_object('id', v_obligation.id, 'code', v_obligation.code, 'stateCode', v_obligation.status, 'version', v_obligation.version);
  update public.idempotency_keys set status = 'COMPLETED', resource_type = 'OBLIGATION', resource_id = v_obligation.id,
    response_payload = v_result, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'OBLIGATION' and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

create or replace function public.pay_obligation_v1(p_obligation_id uuid, p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_obligation public.obligations%rowtype;
  v_category_id uuid;
  v_fin_result jsonb;
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  select * into v_obligation from public.obligations where id = p_obligation_id for update;
  if not found then raise exception 'Obligación no encontrada.' using errcode = 'P0002'; end if;
  if v_obligation.status not in ('PENDING','OVERDUE') then raise exception 'La obligación ya no está pendiente.'; end if;
  if round((p_input ->> 'amount')::numeric, 2) <> round(v_obligation.amount, 2) then
    raise exception 'El pago debe coincidir con el importe total de la obligación.';
  end if;
  if not exists(
    select 1 from public.financial_accounts fa
    where fa.id = (p_input ->> 'accountId')::uuid
      and fa.is_active = true
      and trim(fa.currency_code) = trim(v_obligation.currency_code)
  ) then
    raise exception 'La cuenta seleccionada no usa la moneda de la obligación.';
  end if;

  select id into v_category_id from public.financial_categories
  where code = case v_obligation.obligation_type
    when 'SUNAT' then 'SUNAT'
    when 'CUSTOMS' then 'CUSTOMS'
    when 'CREDIT_CARD' then 'BANK_FEES'
    when 'SERVICE' then 'SERVICES'
    else 'OTHER' end;

  v_fin_result := public.create_manual_financial_transaction_v1(
    jsonb_build_object(
      'transactionTypeCode','EXPENSE',
      'accountId',p_input ->> 'accountId',
      'categoryId',coalesce(nullif(p_input ->> 'categoryId',''),v_category_id::text),
      'amount',coalesce((p_input ->> 'amount')::numeric,v_obligation.amount),
      'occurredAt',p_input ->> 'occurredAt',
      'description','Pago de ' || v_obligation.title || ' (' || v_obligation.code || ')',
      'reference',p_input ->> 'reference',
      'notes',p_input ->> 'notes',
      'reason','Pago de obligación registrada'
    ),
    'OBLIGATION_PAY:' || p_idempotency_key
  );

  update public.obligations
  set status = 'PAID', paid_at = (p_input ->> 'occurredAt')::timestamptz,
      financial_transaction_id = (v_fin_result ->> 'id')::uuid,
      updated_by = v_actor, updated_at = now(), version = version + 1
  where id = v_obligation.id
  returning * into v_obligation;

  return jsonb_build_object('id', v_obligation.id, 'code', v_obligation.code, 'stateCode', v_obligation.status, 'version', v_obligation.version);
end;
$$;

create or replace function public.create_received_loan_v1(p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_account public.financial_accounts%rowtype;
  v_loan public.loans%rowtype;
  v_transaction public.financial_transactions%rowtype;
  v_category_id uuid;
  v_principal numeric(14,2) := round((p_input ->> 'principalAmount')::numeric, 2);
  v_interest_rate numeric(9,6) := coalesce((p_input ->> 'interestRate')::numeric, 0);
  v_count integer := coalesce((p_input ->> 'installmentCount')::integer, 1);
  v_principal_part numeric(14,2);
  v_interest_total numeric(14,2);
  v_interest_part numeric(14,2);
  v_i integer;
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if v_principal <= 0 or v_count <= 0 then raise exception 'Importe y número de cuotas inválidos.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('LOAN_CREATE:' || p_idempotency_key, 0));
  select response_payload into v_result from public.idempotency_keys
  where scope = 'LOAN_CREATE' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_result is not null then return v_result; end if;

  select * into v_account from public.financial_accounts where id = (p_input ->> 'accountId')::uuid and is_active = true for update;
  if not found then raise exception 'Cuenta financiera no encontrada.' using errcode = 'P0002'; end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('LOAN_CREATE', p_idempotency_key, v_actor) on conflict (scope, idempotency_key) do nothing;

  insert into public.loans(
    code, lender_name_snapshot, direction, principal_amount, currency_code, interest_rate,
    installment_count, disbursed_at, first_due_date, status, outstanding_principal, notes,
    created_by, updated_by
  ) values (
    null, btrim(p_input ->> 'lenderName'), 'RECEIVED', v_principal, v_account.currency_code,
    v_interest_rate, v_count, (p_input ->> 'receivedAt')::timestamptz,
    (p_input ->> 'firstDueDate')::date, 'ACTIVE', v_principal,
    nullif(btrim(p_input ->> 'notes'), ''), v_actor, v_actor
  ) returning * into v_loan;

  v_principal_part := round(v_principal / v_count, 2);
  v_interest_total := round(v_principal * v_interest_rate / 100, 2);
  v_interest_part := round(v_interest_total / v_count, 2);
  for v_i in 1..v_count loop
    insert into public.loan_installments(loan_id, installment_number, due_date, principal_amount, interest_amount, fee_amount)
    values (
      v_loan.id,
      v_i,
      ((p_input ->> 'firstDueDate')::date + ((v_i - 1) || ' months')::interval)::date,
      case when v_i = v_count then round(v_principal - v_principal_part * (v_count - 1), 2) else v_principal_part end,
      case when v_i = v_count then round(v_interest_total - v_interest_part * (v_count - 1), 2) else v_interest_part end,
      0
    );
  end loop;

  select id into v_category_id from public.financial_categories where code = 'LOANS';
  insert into public.financial_transactions(
    code, transaction_type_code, state_code, category_id, occurred_at, description,
    currency_code, total_amount, idempotency_key, is_system_generated, source_type, source_id, metadata, created_by
  ) values (
    null, 'LOAN_RECEIVED', 'POSTED', v_category_id, (p_input ->> 'receivedAt')::timestamptz,
    'Préstamo recibido de ' || v_loan.lender_name_snapshot,
    v_account.currency_code, v_principal, 'LOAN_TX:' || p_idempotency_key, true, 'LOAN', v_loan.id,
    jsonb_build_object('loanId',v_loan.id), v_actor
  ) returning * into v_transaction;
  insert into public.financial_transaction_entries(financial_transaction_id, financial_account_id, amount_signed, description)
  values (v_transaction.id, v_account.id, v_principal, 'Desembolso del préstamo ' || v_loan.code);

  v_result := jsonb_build_object('id', v_loan.id, 'code', v_loan.code, 'stateCode', v_loan.status, 'version', v_loan.version);
  update public.idempotency_keys set status = 'COMPLETED', resource_type = 'LOAN', resource_id = v_loan.id,
    response_payload = v_result, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'LOAN_CREATE' and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

create or replace function public.pay_loan_installment_v1(p_installment_id uuid, p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_installment public.loan_installments%rowtype;
  v_loan public.loans%rowtype;
  v_account public.financial_accounts%rowtype;
  v_amount numeric(14,2) := round((p_input ->> 'amount')::numeric, 2);
  v_remaining numeric(14,2);
  v_old_principal_paid numeric(14,2);
  v_new_principal_paid numeric(14,2);
  v_category_id uuid;
  v_transaction public.financial_transactions%rowtype;
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('LOAN_PAY:' || p_idempotency_key, 0));
  select response_payload into v_result from public.idempotency_keys
  where scope = 'LOAN_PAY' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_result is not null then return v_result; end if;

  select * into v_installment from public.loan_installments where id = p_installment_id for update;
  if not found then raise exception 'Cuota no encontrada.' using errcode = 'P0002'; end if;
  if v_installment.status in ('PAID','CANCELLED') then raise exception 'La cuota ya no admite pagos.'; end if;
  select * into v_loan from public.loans where id = v_installment.loan_id for update;
  select * into v_account from public.financial_accounts where id = (p_input ->> 'accountId')::uuid and is_active = true for update;
  if not found then raise exception 'Cuenta financiera no encontrada.' using errcode = 'P0002'; end if;
  if v_account.currency_code <> v_loan.currency_code then raise exception 'La moneda de la cuenta no coincide con la del préstamo.'; end if;
  v_remaining := round(v_installment.total_amount - v_installment.paid_amount, 2);
  if v_amount <= 0 or v_amount > v_remaining then raise exception 'El importe supera el saldo de la cuota.'; end if;
  if v_account.current_balance < v_amount then raise exception 'Saldo insuficiente en la cuenta seleccionada.'; end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('LOAN_PAY', p_idempotency_key, v_actor) on conflict (scope, idempotency_key) do nothing;

  select id into v_category_id from public.financial_categories where code = 'LOANS';
  insert into public.financial_transactions(
    code, transaction_type_code, state_code, category_id, occurred_at, description,
    currency_code, total_amount, idempotency_key, is_system_generated, source_type, source_id, metadata, created_by
  ) values (
    null, 'LOAN_PAYMENT', 'POSTED', v_category_id, (p_input ->> 'occurredAt')::timestamptz,
    'Pago de cuota ' || v_installment.installment_number || ' del préstamo ' || v_loan.code,
    v_loan.currency_code, v_amount, 'LOAN_PAY_TX:' || p_idempotency_key, true, 'LOAN_INSTALLMENT', v_installment.id,
    jsonb_build_object('loanId',v_loan.id,'installmentId',v_installment.id,'reference',nullif(btrim(p_input ->> 'reference'),'')), v_actor
  ) returning * into v_transaction;
  insert into public.financial_transaction_entries(financial_transaction_id, financial_account_id, amount_signed, description)
  values (v_transaction.id, v_account.id, -v_amount, v_transaction.description);

  v_old_principal_paid := greatest(least(v_installment.paid_amount - v_installment.interest_amount - v_installment.fee_amount, v_installment.principal_amount), 0);
  v_new_principal_paid := greatest(least(v_installment.paid_amount + v_amount - v_installment.interest_amount - v_installment.fee_amount, v_installment.principal_amount), 0);

  update public.loan_installments
  set paid_amount = round(paid_amount + v_amount, 2),
      paid_at = case when round(paid_amount + v_amount, 2) >= total_amount then (p_input ->> 'occurredAt')::timestamptz else paid_at end,
      status = case when round(paid_amount + v_amount, 2) >= total_amount then 'PAID' else 'PARTIAL' end,
      financial_transaction_id = v_transaction.id,
      updated_at = now(), version = version + 1
  where id = v_installment.id
  returning * into v_installment;

  update public.loans
  set outstanding_principal = greatest(round(outstanding_principal - (v_new_principal_paid - v_old_principal_paid), 2), 0),
      status = case when not exists(
        select 1 from public.loan_installments li where li.loan_id = v_loan.id and li.id <> v_installment.id and li.status <> 'PAID'
      ) and v_installment.status = 'PAID' then 'PAID' else status end,
      updated_by = v_actor, updated_at = now(), version = version + 1
  where id = v_loan.id
  returning * into v_loan;

  return jsonb_build_object('id', v_loan.id, 'code', v_loan.code, 'stateCode', v_loan.status, 'version', v_loan.version);
end;
$$;

create or replace function public.create_cash_closure_v1(p_input jsonb, p_idempotency_key text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_account public.financial_accounts%rowtype;
  v_closure public.cash_closures%rowtype;
  v_difference numeric(14,2);
  v_category_id uuid;
  v_transaction public.financial_transactions%rowtype;
  v_result jsonb;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('CASH_CLOSE:' || p_idempotency_key, 0));
  select response_payload into v_result from public.idempotency_keys
  where scope = 'CASH_CLOSE' and idempotency_key = p_idempotency_key and status = 'COMPLETED';
  if v_result is not null then return v_result; end if;

  select * into v_account from public.financial_accounts
  where id = (p_input ->> 'accountId')::uuid and is_active = true and account_type_code = 'CASH'
  for update;
  if not found then raise exception 'La cuenta seleccionada no es una caja de efectivo activa.' using errcode = 'P0002'; end if;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('CASH_CLOSE', p_idempotency_key, v_actor) on conflict (scope, idempotency_key) do nothing;

  insert into public.cash_closures(code, financial_account_id, closure_date, expected_amount, counted_amount, status, notes, closed_by)
  values (null, v_account.id, (p_input ->> 'closureDate')::date, v_account.current_balance,
    round((p_input ->> 'countedAmount')::numeric, 2), 'CLOSED', nullif(btrim(p_input ->> 'notes'), ''), v_actor)
  returning * into v_closure;

  v_difference := v_closure.difference_amount;
  if v_difference <> 0 then
    if length(btrim(coalesce(p_input ->> 'reason',''))) < 5 then
      raise exception 'El motivo es obligatorio cuando existe diferencia de caja.';
    end if;
    select id into v_category_id from public.financial_categories where code = 'CASH_DIFFERENCE';
    insert into public.financial_transactions(
      code, transaction_type_code, state_code, category_id, occurred_at, description,
      currency_code, total_amount, idempotency_key, is_system_generated, source_type, source_id, reason, metadata, created_by
    ) values (
      null, 'ADJUSTMENT', 'POSTED', v_category_id, now(), 'Ajuste por cierre de caja ' || v_closure.code,
      v_account.currency_code, abs(v_difference), 'CASH_ADJ:' || p_idempotency_key, true,
      'CASH_CLOSURE', v_closure.id, btrim(p_input ->> 'reason'), jsonb_build_object('difference',v_difference), v_actor
    ) returning * into v_transaction;
    insert into public.financial_transaction_entries(financial_transaction_id, financial_account_id, amount_signed, description)
    values (v_transaction.id, v_account.id, v_difference, 'Diferencia de cierre de caja');
  end if;

  v_result := jsonb_build_object(
    'id', v_closure.id, 'code', v_closure.code, 'stateCode', v_closure.status,
    'version', v_closure.version, 'expectedAmount', v_closure.expected_amount,
    'countedAmount', v_closure.counted_amount, 'differenceAmount', v_closure.difference_amount
  );
  update public.idempotency_keys set status = 'COMPLETED', resource_type = 'CASH_CLOSURE', resource_id = v_closure.id,
    response_payload = v_result, completed_at = now(), expires_at = now() + interval '7 days'
  where scope = 'CASH_CLOSE' and idempotency_key = p_idempotency_key;
  return v_result;
end;
$$;

create or replace function public.register_financial_attachment_v1(p_transaction_id uuid, p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_attachment public.attachments%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if not exists(select 1 from public.financial_transactions where id = p_transaction_id) then
    raise exception 'Movimiento financiero no encontrado.' using errcode = 'P0002';
  end if;
  insert into public.attachments(entity_type, entity_id, attachment_type, bucket_id, object_path, original_filename, mime_type, size_bytes, uploaded_by)
  values ('FINANCIAL_TRANSACTION', p_transaction_id, 'PROOF', 'financial-files', btrim(p_input ->> 'objectPath'),
    btrim(p_input ->> 'originalFilename'), btrim(p_input ->> 'mimeType'), (p_input ->> 'sizeBytes')::bigint, v_actor)
  returning * into v_attachment;
  return jsonb_build_object('id',v_attachment.id);
end;
$$;

create or replace function public.import_bank_statement_v1(
  p_account_id uuid,
  p_original_filename text,
  p_file_checksum text,
  p_rows jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_account public.financial_accounts%rowtype;
  v_batch public.bank_import_batches%rowtype;
  v_row jsonb;
  v_ordinal bigint;
  v_statement public.bank_statement_rows%rowtype;
  v_valid integer := 0;
  v_invalid integer := 0;
  v_total integer := jsonb_array_length(coalesce(p_rows,'[]'::jsonb));
  v_fingerprint text;
  v_min_date date;
  v_max_date date;
  v_existing public.bank_import_batches%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if jsonb_typeof(p_rows) <> 'array' or v_total = 0 then raise exception 'El extracto no contiene filas.'; end if;
  if v_total > 5000 then raise exception 'El archivo supera el máximo de 5000 filas por importación.'; end if;

  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended('BANK_IMPORT:' || p_account_id::text || ':' || p_file_checksum, 0));
  select * into v_existing from public.bank_import_batches
  where financial_account_id = p_account_id and file_checksum_sha256 = p_file_checksum;
  if found then
    return jsonb_build_object('id',v_existing.id,'code',v_existing.code,'stateCode',v_existing.status,
      'totalRows',v_existing.total_rows,'validRows',v_existing.valid_rows,'invalidRows',v_existing.invalid_rows,'reused',true);
  end if;

  select * into v_account from public.financial_accounts
  where id = p_account_id and is_active = true and account_type_code in ('BANK','WALLET')
  for update;
  if not found then raise exception 'Selecciona una cuenta bancaria o billetera activa.' using errcode = 'P0002'; end if;

  insert into public.bank_import_batches(code, financial_account_id, original_filename, file_checksum_sha256, total_rows, status, imported_by)
  values (null, v_account.id, btrim(p_original_filename), btrim(p_file_checksum), v_total, 'PROCESSING', v_actor)
  returning * into v_batch;

  for v_row, v_ordinal in select value, ordinality from jsonb_array_elements(p_rows) with ordinality loop
    begin
      if round((v_row ->> 'amountSigned')::numeric,2) = 0 then raise exception 'Importe cero'; end if;
      v_fingerprint := encode(extensions.digest(
        concat_ws('|',v_account.id::text,v_row ->> 'transactionDate',lower(btrim(v_row ->> 'description')),
          coalesce(v_row ->> 'reference',''),round((v_row ->> 'amountSigned')::numeric,2)::text), 'sha256'
      ), 'hex');
      insert into public.bank_statement_rows(
        batch_id, financial_account_id, row_number, transaction_date, posted_at, description,
        reference, amount_signed, currency_code, balance_after, fingerprint, raw_payload
      ) values (
        v_batch.id, v_account.id, v_ordinal::integer, (v_row ->> 'transactionDate')::date,
        nullif(v_row ->> 'postedAt','')::timestamptz, btrim(v_row ->> 'description'),
        nullif(btrim(v_row ->> 'reference'), ''), round((v_row ->> 'amountSigned')::numeric,2),
        coalesce(nullif(v_row ->> 'currencyCode',''),trim(v_account.currency_code))::char(3),
        nullif(v_row ->> 'balanceAfter','')::numeric, v_fingerprint, v_row
      ) on conflict (financial_account_id, fingerprint) do nothing
      returning * into v_statement;
      if found then
        v_valid := v_valid + 1;
        v_min_date := least(coalesce(v_min_date,v_statement.transaction_date),v_statement.transaction_date);
        v_max_date := greatest(coalesce(v_max_date,v_statement.transaction_date),v_statement.transaction_date);
      else
        v_invalid := v_invalid + 1;
      end if;
    exception when others then
      v_invalid := v_invalid + 1;
    end;
  end loop;

  insert into public.bank_reconciliation_candidates(bank_statement_row_id,candidate_type,candidate_id,confidence_score,reason)
  select distinct
    bsr.id,
    'PAYMENT',
    p.id,
    case
      when (p.received_at at time zone 'America/Lima')::date = bsr.transaction_date and coalesce(pp.reference_number,'') <> '' and lower(coalesce(pp.reference_number,'')) = lower(coalesce(bsr.reference,'')) then 0.99
      when (p.received_at at time zone 'America/Lima')::date = bsr.transaction_date then 0.94
      else 0.82
    end,
    jsonb_build_object('amount',pp.amount,'paymentCode',p.code,'dateDifference',abs((p.received_at at time zone 'America/Lima')::date - bsr.transaction_date))
  from public.bank_statement_rows bsr
  join public.payment_parts pp on pp.financial_account_id = bsr.financial_account_id and round(pp.amount,2) = round(bsr.amount_signed,2)
  join public.payments p on p.id = pp.payment_id and p.state_code = 'CONFIRMED'
  where bsr.batch_id = v_batch.id
    and bsr.amount_signed > 0
    and abs((p.received_at at time zone 'America/Lima')::date - bsr.transaction_date) <= 3
  on conflict (bank_statement_row_id,candidate_type,candidate_id) do nothing;

  insert into public.bank_reconciliation_candidates(bank_statement_row_id,candidate_type,candidate_id,confidence_score,reason)
  select distinct
    bsr.id,
    'FINANCIAL_TRANSACTION',
    ft.id,
    case when (ft.occurred_at at time zone 'America/Lima')::date = bsr.transaction_date then 0.92 else 0.80 end,
    jsonb_build_object('amount',e.amount_signed,'transactionCode',ft.code,'dateDifference',abs((ft.occurred_at at time zone 'America/Lima')::date - bsr.transaction_date))
  from public.bank_statement_rows bsr
  join public.financial_transaction_entries e on e.financial_account_id = bsr.financial_account_id and round(e.amount_signed,2) = round(bsr.amount_signed,2)
  join public.financial_transactions ft on ft.id = e.financial_transaction_id and ft.state_code = 'POSTED'
  where bsr.batch_id = v_batch.id
    and coalesce(ft.source_type, '') <> 'PAYMENT'
    and abs((ft.occurred_at at time zone 'America/Lima')::date - bsr.transaction_date) <= 3
  on conflict (bank_statement_row_id,candidate_type,candidate_id) do nothing;

  update public.bank_statement_rows bsr
  set reconciliation_status = 'SUGGESTED'
  where bsr.batch_id = v_batch.id
    and exists(select 1 from public.bank_reconciliation_candidates c where c.bank_statement_row_id = bsr.id and c.dismissed_at is null);

  update public.bank_import_batches
  set imported_from = v_min_date, imported_to = v_max_date,
      valid_rows = v_valid, invalid_rows = v_invalid,
      status = case when v_valid = 0 then 'FAILED' when v_invalid > 0 then 'PARTIAL' else 'IMPORTED' end
  where id = v_batch.id
  returning * into v_batch;

  return jsonb_build_object('id',v_batch.id,'code',v_batch.code,'stateCode',v_batch.status,
    'totalRows',v_batch.total_rows,'validRows',v_batch.valid_rows,'invalidRows',v_batch.invalid_rows,'reused',false);
end;
$$;

create or replace function public.get_bank_reconciliation_v1(p_account_id uuid default null, p_batch_id uuid default null)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_account_id uuid := p_account_id;
  v_batch_id uuid := p_batch_id;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if v_account_id is null then
    select id into v_account_id from public.financial_accounts where is_active and account_type_code in ('BANK','WALLET') order by name limit 1;
  end if;
  if v_batch_id is null and v_account_id is not null then
    select id into v_batch_id from public.bank_import_batches where financial_account_id = v_account_id order by imported_at desc limit 1;
  end if;

  return jsonb_build_object(
    'accounts', coalesce((select jsonb_agg(jsonb_build_object(
      'id',fa.id,'code',fa.code,'name',fa.name,'currencyCode',trim(fa.currency_code),'currentBalance',fa.current_balance
    ) order by fa.name) from public.financial_accounts fa where fa.is_active and fa.account_type_code in ('BANK','WALLET')), '[]'::jsonb),
    'selectedAccountId', v_account_id,
    'selectedBatchId', v_batch_id,
    'batches', coalesce((select jsonb_agg(jsonb_build_object(
      'id',b.id,'code',b.code,'originalFilename',b.original_filename,'importedFrom',b.imported_from,'importedTo',b.imported_to,
      'totalRows',b.total_rows,'validRows',b.valid_rows,'invalidRows',b.invalid_rows,'status',b.status,'importedAt',b.imported_at
    ) order by b.imported_at desc) from public.bank_import_batches b where b.financial_account_id = v_account_id), '[]'::jsonb),
    'summary', jsonb_build_object(
      'total', coalesce((select count(*) from public.bank_statement_rows where batch_id = v_batch_id),0),
      'suggested', coalesce((select count(*) from public.bank_statement_rows where batch_id = v_batch_id and reconciliation_status = 'SUGGESTED'),0),
      'reconciled', coalesce((select count(*) from public.bank_statement_rows where batch_id = v_batch_id and reconciliation_status = 'RECONCILED'),0),
      'unmatched', coalesce((select count(*) from public.bank_statement_rows where batch_id = v_batch_id and reconciliation_status = 'UNMATCHED'),0),
      'ignored', coalesce((select count(*) from public.bank_statement_rows where batch_id = v_batch_id and reconciliation_status = 'IGNORED'),0)
    ),
    'rows', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id',bsr.id,'rowNumber',bsr.row_number,'transactionDate',bsr.transaction_date,'description',bsr.description,
        'reference',bsr.reference,'amountSigned',bsr.amount_signed,'currencyCode',trim(bsr.currency_code),
        'balanceAfter',bsr.balance_after,'reconciliationStatus',bsr.reconciliation_status,
        'candidates',coalesce((
          select jsonb_agg(jsonb_build_object(
            'id',c.id,'candidateType',c.candidate_type,'candidateId',c.candidate_id,'confidenceScore',c.confidence_score,
            'label',case when c.candidate_type = 'PAYMENT' then
              coalesce((select p.code || ' · ' || s.code || ' · ' || s.client_name_snapshot from public.payments p join public.sales s on s.id = p.sale_id where p.id = c.candidate_id),'Pago')
            else coalesce((select ft.code || ' · ' || ft.description from public.financial_transactions ft where ft.id = c.candidate_id),'Movimiento') end,
            'reason',c.reason
          ) order by c.confidence_score desc)
          from public.bank_reconciliation_candidates c
          where c.bank_statement_row_id = bsr.id and c.dismissed_at is null
        ),'[]'::jsonb),
        'activeReconciliation',(
          select jsonb_build_object('id',br.id,'matchedType',br.matched_type,'matchedId',br.matched_id,'matchedAmount',br.matched_amount,
            'notes',br.notes,'reconciledAt',br.reconciled_at)
          from public.bank_reconciliations br where br.bank_statement_row_id = bsr.id and br.status = 'ACTIVE' limit 1
        )
      ) order by bsr.transaction_date desc, bsr.row_number desc)
      from public.bank_statement_rows bsr where bsr.batch_id = v_batch_id
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.confirm_bank_reconciliation_v1(p_row_id uuid, p_candidate_type text, p_candidate_id uuid, p_notes text default null)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_row public.bank_statement_rows%rowtype;
  v_amount numeric(14,2);
  v_reconciliation public.bank_reconciliations%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  select * into v_row from public.bank_statement_rows where id = p_row_id for update;
  if not found then raise exception 'Movimiento bancario no encontrado.' using errcode = 'P0002'; end if;
  if v_row.reconciliation_status = 'RECONCILED' then raise exception 'El movimiento ya está conciliado.'; end if;
  if upper(p_candidate_type) not in ('PAYMENT','FINANCIAL_TRANSACTION') then raise exception 'Tipo de coincidencia inválido.'; end if;
  if not exists(select 1 from public.bank_reconciliation_candidates c where c.bank_statement_row_id = v_row.id and c.candidate_type = upper(p_candidate_type) and c.candidate_id = p_candidate_id and c.dismissed_at is null) then
    raise exception 'La coincidencia seleccionada no está disponible.';
  end if;

  if upper(p_candidate_type) = 'PAYMENT' then
    select coalesce(sum(pp.amount),0) into v_amount from public.payment_parts pp
    where pp.payment_id = p_candidate_id and pp.financial_account_id = v_row.financial_account_id;
  else
    select coalesce(sum(e.amount_signed),0) into v_amount from public.financial_transaction_entries e
    where e.financial_transaction_id = p_candidate_id and e.financial_account_id = v_row.financial_account_id;
  end if;
  if round(v_amount,2) <> round(v_row.amount_signed,2) then raise exception 'El importe del registro no coincide con el movimiento bancario.'; end if;

  insert into public.bank_reconciliations(bank_statement_row_id,matched_type,matched_id,matched_amount,status,notes,reconciled_by)
  values (v_row.id,upper(p_candidate_type),p_candidate_id,abs(v_row.amount_signed),'ACTIVE',nullif(btrim(p_notes),''),v_actor)
  returning * into v_reconciliation;
  update public.bank_statement_rows set reconciliation_status = 'RECONCILED' where id = v_row.id;
  return jsonb_build_object('id',v_reconciliation.id,'stateCode',v_reconciliation.status,'version',v_reconciliation.version);
end;
$$;

create or replace function public.dismiss_bank_candidate_v1(p_candidate_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_candidate public.bank_reconciliation_candidates%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  update public.bank_reconciliation_candidates
  set dismissed_at = now(), dismissed_by = v_actor,
      reason = reason || jsonb_build_object('dismissalReason',nullif(btrim(p_reason),''))
  where id = p_candidate_id and dismissed_at is null
  returning * into v_candidate;
  if not found then raise exception 'Coincidencia no encontrada.' using errcode = 'P0002'; end if;
  if not exists(select 1 from public.bank_reconciliation_candidates c where c.bank_statement_row_id = v_candidate.bank_statement_row_id and c.dismissed_at is null) then
    update public.bank_statement_rows set reconciliation_status = 'UNMATCHED'
    where id = v_candidate.bank_statement_row_id and reconciliation_status = 'SUGGESTED';
  end if;
  return jsonb_build_object('id',v_candidate.id,'stateCode','DISMISSED','version',1);
end;
$$;

create or replace function public.ignore_bank_row_v1(p_row_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_row public.bank_statement_rows%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason,''))) < 5 then raise exception 'Indica un motivo para ignorar el movimiento.'; end if;
  update public.bank_statement_rows
  set reconciliation_status = 'IGNORED', raw_payload = raw_payload || jsonb_build_object('ignoreReason',btrim(p_reason))
  where id = p_row_id and reconciliation_status <> 'RECONCILED'
  returning * into v_row;
  if not found then raise exception 'Movimiento no encontrado o ya conciliado.' using errcode = 'P0002'; end if;
  return jsonb_build_object('id',v_row.id,'stateCode',v_row.reconciliation_status,'version',1);
end;
$$;

create or replace function public.reverse_bank_reconciliation_v1(p_reconciliation_id uuid, p_reason text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_rec public.bank_reconciliations%rowtype;
begin
  if not private.is_active_admin() then raise exception 'Usuario no autorizado.' using errcode = '42501'; end if;
  if length(btrim(coalesce(p_reason,''))) < 5 then raise exception 'El motivo de reversión es obligatorio.'; end if;
  update public.bank_reconciliations
  set status = 'REVERSED', reversed_by = v_actor, reversed_at = now(), reversal_reason = btrim(p_reason), version = version + 1
  where id = p_reconciliation_id and status = 'ACTIVE'
  returning * into v_rec;
  if not found then raise exception 'Conciliación activa no encontrada.' using errcode = 'P0002'; end if;
  update public.bank_statement_rows
  set reconciliation_status = case when exists(select 1 from public.bank_reconciliation_candidates c where c.bank_statement_row_id = v_rec.bank_statement_row_id and c.dismissed_at is null) then 'SUGGESTED' else 'UNMATCHED' end
  where id = v_rec.bank_statement_row_id;
  return jsonb_build_object('id',v_rec.id,'stateCode',v_rec.status,'version',v_rec.version);
end;
$$;

-- Permisos RPC.
grant execute on function public.get_finance_support_v1() to authenticated;
grant execute on function public.get_finance_dashboard_v1() to authenticated;
grant execute on function public.list_financial_transactions_v1(text,text,integer,integer) to authenticated;
grant execute on function public.create_financial_category_v1(jsonb) to authenticated;
grant execute on function public.create_manual_financial_transaction_v1(jsonb,text) to authenticated;
grant execute on function public.create_financial_transfer_v1(jsonb,text) to authenticated;
grant execute on function public.reverse_financial_transaction_v1(uuid,text,text) to authenticated;
grant execute on function public.create_obligation_v1(jsonb,text) to authenticated;
grant execute on function public.pay_obligation_v1(uuid,jsonb,text) to authenticated;
grant execute on function public.create_received_loan_v1(jsonb,text) to authenticated;
grant execute on function public.pay_loan_installment_v1(uuid,jsonb,text) to authenticated;
grant execute on function public.create_cash_closure_v1(jsonb,text) to authenticated;
grant execute on function public.register_financial_attachment_v1(uuid,jsonb) to authenticated;
grant execute on function public.import_bank_statement_v1(uuid,text,text,jsonb,text) to authenticated;
grant execute on function public.get_bank_reconciliation_v1(uuid,uuid) to authenticated;
grant execute on function public.confirm_bank_reconciliation_v1(uuid,text,uuid,text) to authenticated;
grant execute on function public.dismiss_bank_candidate_v1(uuid,text) to authenticated;
grant execute on function public.ignore_bank_row_v1(uuid,text) to authenticated;
grant execute on function public.reverse_bank_reconciliation_v1(uuid,text) to authenticated;

-- Storage privado para comprobantes financieros y extractos.
drop policy if exists financial_files_select_admin on storage.objects;
create policy financial_files_select_admin on storage.objects for select to authenticated
using (bucket_id = 'financial-files' and private.is_active_admin());
drop policy if exists financial_files_insert_admin on storage.objects;
create policy financial_files_insert_admin on storage.objects for insert to authenticated
with check (bucket_id = 'financial-files' and private.is_active_admin());
drop policy if exists financial_files_update_admin on storage.objects;
create policy financial_files_update_admin on storage.objects for update to authenticated
using (bucket_id = 'financial-files' and private.is_active_admin())
with check (bucket_id = 'financial-files' and private.is_active_admin());
drop policy if exists financial_files_delete_admin on storage.objects;
create policy financial_files_delete_admin on storage.objects for delete to authenticated
using (bucket_id = 'financial-files' and private.is_active_admin());

notify pgrst, 'reload schema';
commit;

-- =========================================================
-- 022_fix_financial_reversal.sql
-- =========================================================
-- Yukimi Gestión
-- Migración 022: corregir reversión de movimientos financieros
-- Corrige el nombre de la columna reversal_of -> reversal_of_id.

begin;

create or replace function public.reverse_financial_transaction_v1(
  p_transaction_id uuid,
  p_reason text,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_original public.financial_transactions%rowtype;
  v_reversal public.financial_transactions%rowtype;
  v_entry record;
  v_account public.financial_accounts%rowtype;
  v_result jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if length(btrim(coalesce(p_reason, ''))) < 5 then
    raise exception 'El motivo de reversión debe tener al menos 5 caracteres.';
  end if;

  if nullif(btrim(p_idempotency_key), '') is null then
    raise exception 'La clave de idempotencia es obligatoria.';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended('FIN_REVERSAL:' || p_idempotency_key, 0)
  );

  select response_payload
    into v_result
    from public.idempotency_keys
   where scope = 'FIN_REVERSAL'
     and idempotency_key = p_idempotency_key
     and status = 'COMPLETED';

  if v_result is not null then
    return v_result;
  end if;

  select *
    into v_original
    from public.financial_transactions
   where id = p_transaction_id
   for update;

  if not found then
    raise exception 'Movimiento financiero no encontrado.' using errcode = 'P0002';
  end if;

  if v_original.state_code <> 'POSTED' then
    raise exception 'Solo se puede revertir un movimiento publicado.';
  end if;

  if v_original.is_system_generated or v_original.source_type is not null then
    raise exception 'Este movimiento fue generado por otro módulo y debe revertirse desde su operación de origen.';
  end if;

  if v_original.transaction_type_code = 'REVERSAL' then
    raise exception 'Una reversión no puede revertirse directamente.';
  end if;

  for v_entry in
    select *
      from public.financial_transaction_entries
     where financial_transaction_id = v_original.id
     order by financial_account_id
  loop
    select *
      into v_account
      from public.financial_accounts
     where id = v_entry.financial_account_id
     for update;

    if (-v_entry.amount_signed) < 0
       and v_account.current_balance < abs(v_entry.amount_signed) then
      raise exception 'La cuenta % no tiene saldo suficiente para revertir el movimiento.', v_account.name;
    end if;
  end loop;

  insert into public.idempotency_keys(scope, idempotency_key, actor_user_id)
  values ('FIN_REVERSAL', p_idempotency_key, v_actor)
  on conflict (scope, idempotency_key) do nothing;

  insert into public.financial_transactions(
    code,
    transaction_type_code,
    state_code,
    category_id,
    occurred_at,
    description,
    currency_code,
    total_amount,
    idempotency_key,
    is_system_generated,
    reversal_of_id,
    reason,
    metadata,
    created_by
  ) values (
    null,
    'REVERSAL',
    'POSTED',
    v_original.category_id,
    now(),
    'Reversión de ' || v_original.code || ': ' || v_original.description,
    v_original.currency_code,
    v_original.total_amount,
    p_idempotency_key,
    false,
    v_original.id,
    btrim(p_reason),
    jsonb_build_object('originalTransactionId', v_original.id),
    v_actor
  )
  returning * into v_reversal;

  insert into public.financial_transaction_entries(
    financial_transaction_id,
    financial_account_id,
    amount_signed,
    description
  )
  select
    v_reversal.id,
    e.financial_account_id,
    -e.amount_signed,
    'Reversión de ' || v_original.code
  from public.financial_transaction_entries e
  where e.financial_transaction_id = v_original.id;

  perform set_config('app.audit_reason', btrim(p_reason), true);

  update public.financial_transactions
     set state_code = 'REVERSED',
         reason = btrim(p_reason),
         updated_at = now(),
         version = version + 1
   where id = v_original.id;

  v_result := jsonb_build_object(
    'id', v_reversal.id,
    'code', v_reversal.code,
    'stateCode', v_reversal.state_code,
    'version', v_reversal.version
  );

  update public.idempotency_keys
     set status = 'COMPLETED',
         resource_type = 'FINANCIAL_TRANSACTION',
         resource_id = v_reversal.id,
         response_payload = v_result,
         completed_at = now(),
         expires_at = now() + interval '7 days'
   where scope = 'FIN_REVERSAL'
     and idempotency_key = p_idempotency_key;

  return v_result;
end;
$$;

notify pgrst, 'reload schema';

commit;

-- =========================================================
-- 023_reports_notifications_audit_release.sql
-- =========================================================
-- Yukimi Gestión
-- Migración 023: panel real, reportes, alertas, auditoría y registro de exportaciones

begin;

alter table public.notifications
  add column if not exists deduplication_key text;

create unique index if not exists ux_notifications_deduplication_key
  on public.notifications(deduplication_key)
  where deduplication_key is not null;

create table if not exists public.report_exports (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  report_type text not null,
  export_format text not null check (export_format in ('CSV', 'PDF_PRINT')),
  period_start date,
  period_end date,
  filters jsonb not null default '{}'::jsonb,
  filename text not null,
  object_path text,
  generated_by uuid references public.profiles(id) on delete set null,
  generated_at timestamptz not null default now()
);

create index if not exists ix_report_exports_generated_at
  on public.report_exports(generated_at desc);

alter table public.report_exports enable row level security;

drop policy if exists report_exports_admin_select on public.report_exports;
create policy report_exports_admin_select
  on public.report_exports for select to authenticated
  using (private.is_active_admin());

drop policy if exists report_exports_admin_insert on public.report_exports;
create policy report_exports_admin_insert
  on public.report_exports for insert to authenticated
  with check (private.is_active_admin());

grant select, insert on public.report_exports to authenticated;

create or replace function private.emit_notification_v1(
  p_type text,
  p_title text,
  p_body text,
  p_priority text,
  p_entity_type text,
  p_entity_id uuid,
  p_action_url text,
  p_deduplication_key text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_notification_id uuid;
begin
  insert into public.notifications(
    notification_type_code,
    title,
    body,
    priority,
    related_entity_type,
    related_entity_id,
    action_url,
    expires_at,
    metadata,
    deduplication_key,
    created_by
  )
  values (
    p_type,
    p_title,
    p_body,
    p_priority,
    p_entity_type,
    p_entity_id,
    p_action_url,
    now() + interval '90 days',
    coalesce(p_metadata, '{}'::jsonb),
    p_deduplication_key,
    private.current_actor_id()
  )
  on conflict (deduplication_key) where deduplication_key is not null
  do update set
    title = excluded.title,
    body = excluded.body,
    priority = excluded.priority,
    action_url = excluded.action_url,
    metadata = excluded.metadata,
    expires_at = excluded.expires_at
  returning id into v_notification_id;

  insert into public.notification_recipients(notification_id, user_id)
  select v_notification_id, p.id
  from public.profiles p
  join public.user_roles ur
    on ur.user_id = p.id
   and ur.role_code = 'ADMIN'
   and ur.revoked_at is null
  where p.is_active = true
  on conflict (notification_id, user_id) do nothing;

  return v_notification_id;
end;
$$;

create or replace function public.refresh_operational_notifications_v1()
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_due_days integer := 3;
  v_import_days integer := 3;
  v_created integer := 0;
  v_row record;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  select coalesce((sc.setting_value #>> '{}')::integer, 3)
    into v_due_days
  from public.business_settings sc
  where sc.setting_key = 'notifications.payment_due_days_before';

  select coalesce((sc.setting_value #>> '{}')::integer, 3)
    into v_import_days
  from public.business_settings sc
  where sc.setting_key = 'notifications.import_arrival_days_before';

  v_due_days := coalesce(v_due_days, 3);
  v_import_days := coalesce(v_import_days, 3);

  -- Cierra automáticamente avisos que dejaron de aplicar.
  update public.notification_recipients nr
     set status = 'RESOLVED',
         resolved_at = coalesce(nr.resolved_at, now()),
         updated_at = now(),
         version = nr.version + 1
  from public.notifications n
  where n.id = nr.notification_id
    and nr.status in ('NEW', 'READ')
    and (
      (n.notification_type_code = 'PAYMENT_DUE_SOON' and not exists (
        select 1 from public.sales s
        where s.id = n.related_entity_id
          and s.balance_amount > 0
          and s.due_at >= now()
          and s.due_at <= now() + make_interval(days => v_due_days)
          and s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')
      ))
      or (n.notification_type_code = 'PAYMENT_OVERDUE' and not exists (
        select 1 from public.sales s
        where s.id = n.related_entity_id
          and s.balance_amount > 0
          and s.due_at < now()
          and s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')
      ))
      or (n.notification_type_code = 'STOCK_LOW' and not exists (
        select 1
        from public.v_inventory_summary inv
        where inv.variant_id = n.related_entity_id
          and inv.is_visible_in_operations = true
          and inv.is_active = true
        group by inv.variant_id
        having sum(inv.available_quantity) <= max(inv.minimum_stock)
           and max(inv.minimum_stock) > 0
      ))
      or (n.notification_type_code = 'IMPORT_ARRIVAL_SOON' and not exists (
        select 1 from public.import_shipments i
        where i.id = n.related_entity_id
          and i.state_code not in ('STOCKED', 'CANCELLED')
          and i.actual_arrival_at is null
          and i.estimated_arrival_date between timezone('America/Lima', now())::date
              and timezone('America/Lima', now())::date + v_import_days
      ))
      or (n.notification_type_code = 'IMPORT_DELAYED' and not exists (
        select 1 from public.import_shipments i
        where i.id = n.related_entity_id
          and i.state_code not in ('STOCKED', 'CANCELLED')
          and i.actual_arrival_at is null
          and i.estimated_arrival_date < timezone('America/Lima', now())::date
      ))
      or (n.notification_type_code = 'DISPATCH_PENDING' and not exists (
        select 1 from public.deliveries d
        where d.id = n.related_entity_id
          and d.state_code in ('PENDING_INSTRUCTIONS', 'PENDING_AGENCY_DISPATCH')
      ))
      or (n.notification_type_code in ('CARD_PAYMENT_DUE', 'SUNAT_PAYMENT_DUE') and not exists (
        select 1 from public.obligations o
        where o.id = n.related_entity_id
          and o.status in ('PENDING', 'OVERDUE')
      ))
      or (n.notification_type_code = 'RECEIPT_PENDING' and not exists (
        select 1
        from public.payments p
        where p.id = n.related_entity_id
          and p.state_code = 'CONFIRMED'
          and p.declared_amount > coalesce((
            select sum(rpa.allocated_amount)
            from public.receipt_payment_allocations rpa
            join public.sales_receipts sr on sr.id = rpa.receipt_id
            where rpa.payment_id = p.id
              and sr.state_code not in ('CANCELLED', 'CREDIT_NOTE')
          ), 0)
      ))
    );

  for v_row in
    select s.id, s.code, s.client_name_snapshot, s.balance_amount, s.due_at,
           greatest(0, ceil(extract(epoch from (s.due_at - now())) / 86400.0))::integer as days_left
    from public.sales s
    where s.balance_amount > 0
      and s.due_at >= now()
      and s.due_at <= now() + make_interval(days => v_due_days)
      and s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')
  loop
    perform private.emit_notification_v1(
      'PAYMENT_DUE_SOON',
      'Pago próximo a vencer · ' || v_row.code,
      v_row.client_name_snapshot || ' mantiene un saldo de S/ ' || to_char(v_row.balance_amount, 'FM999999990.00') ||
        ' y vence en ' || v_row.days_left || case when v_row.days_left = 1 then ' día.' else ' días.' end,
      'HIGH', 'SALE', v_row.id, '/ventas/' || v_row.id,
      'PAYMENT_DUE_SOON:' || v_row.id::text || ':' || v_row.due_at::date::text,
      jsonb_build_object('saleCode', v_row.code, 'balance', v_row.balance_amount, 'dueAt', v_row.due_at)
    );
    v_created := v_created + 1;
  end loop;

  for v_row in
    select s.id, s.code, s.client_name_snapshot, s.balance_amount, s.due_at,
           greatest(1, (timezone('America/Lima', now())::date - timezone('America/Lima', s.due_at)::date))::integer as overdue_days
    from public.sales s
    where s.balance_amount > 0
      and s.due_at < now()
      and s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')
  loop
    perform private.emit_notification_v1(
      'PAYMENT_OVERDUE',
      'Pago vencido · ' || v_row.code,
      v_row.client_name_snapshot || ' debe S/ ' || to_char(v_row.balance_amount, 'FM999999990.00') ||
        ' desde hace ' || v_row.overdue_days || case when v_row.overdue_days = 1 then ' día.' else ' días.' end,
      'CRITICAL', 'SALE', v_row.id, '/ventas/' || v_row.id,
      'PAYMENT_OVERDUE:' || v_row.id::text,
      jsonb_build_object('saleCode', v_row.code, 'balance', v_row.balance_amount, 'overdueDays', v_row.overdue_days)
    );
    v_created := v_created + 1;
  end loop;

  for v_row in
    select inv.variant_id, inv.product_name, inv.variant_name, inv.sku,
           sum(inv.available_quantity)::integer as available_quantity,
           max(inv.minimum_stock)::integer as minimum_stock
    from public.v_inventory_summary inv
    where inv.is_visible_in_operations = true
      and inv.is_active = true
    group by inv.variant_id, inv.product_name, inv.variant_name, inv.sku
    having sum(inv.available_quantity) <= max(inv.minimum_stock)
       and max(inv.minimum_stock) > 0
  loop
    perform private.emit_notification_v1(
      'STOCK_LOW',
      'Stock bajo · ' || v_row.product_name,
      v_row.variant_name || ' (' || v_row.sku || ') tiene ' || v_row.available_quantity ||
        ' disponibles; mínimo configurado: ' || v_row.minimum_stock || '.',
      'HIGH', 'PRODUCT_VARIANT', v_row.variant_id, '/inventario',
      'STOCK_LOW:' || v_row.variant_id::text,
      jsonb_build_object('sku', v_row.sku, 'available', v_row.available_quantity, 'minimum', v_row.minimum_stock)
    );
    v_created := v_created + 1;
  end loop;

  for v_row in
    select i.id, i.code, i.estimated_arrival_date,
           (i.estimated_arrival_date - timezone('America/Lima', now())::date)::integer as days_left
    from public.import_shipments i
    where i.state_code not in ('STOCKED', 'CANCELLED')
      and i.actual_arrival_at is null
      and i.estimated_arrival_date between timezone('America/Lima', now())::date
          and timezone('America/Lima', now())::date + v_import_days
  loop
    perform private.emit_notification_v1(
      'IMPORT_ARRIVAL_SOON',
      'Importación próxima · ' || v_row.code,
      'La llegada estimada es el ' || to_char(v_row.estimated_arrival_date, 'DD/MM/YYYY') || '.',
      'NORMAL', 'IMPORT', v_row.id, '/importaciones/' || v_row.id,
      'IMPORT_ARRIVAL_SOON:' || v_row.id::text || ':' || v_row.estimated_arrival_date::text,
      jsonb_build_object('importCode', v_row.code, 'estimatedArrivalDate', v_row.estimated_arrival_date)
    );
    v_created := v_created + 1;
  end loop;

  for v_row in
    select i.id, i.code, i.estimated_arrival_date,
           (timezone('America/Lima', now())::date - i.estimated_arrival_date)::integer as delay_days
    from public.import_shipments i
    where i.state_code not in ('STOCKED', 'CANCELLED')
      and i.actual_arrival_at is null
      and i.estimated_arrival_date < timezone('America/Lima', now())::date
  loop
    perform private.emit_notification_v1(
      'IMPORT_DELAYED',
      'Importación retrasada · ' || v_row.code,
      'Superó la fecha estimada por ' || v_row.delay_days || case when v_row.delay_days = 1 then ' día.' else ' días.' end,
      'HIGH', 'IMPORT', v_row.id, '/importaciones/' || v_row.id,
      'IMPORT_DELAYED:' || v_row.id::text,
      jsonb_build_object('importCode', v_row.code, 'delayDays', v_row.delay_days)
    );
    v_created := v_created + 1;
  end loop;

  for v_row in
    select d.id, d.code, d.planned_dispatch_date, s.code as sale_code, s.client_name_snapshot
    from public.deliveries d
    join public.sales s on s.id = d.sale_id
    where d.state_code in ('PENDING_INSTRUCTIONS', 'PENDING_AGENCY_DISPATCH')
      and (d.planned_dispatch_date is null or d.planned_dispatch_date <= timezone('America/Lima', now())::date + 1)
  loop
    perform private.emit_notification_v1(
      'DISPATCH_PENDING',
      'Despacho pendiente · ' || v_row.code,
      'Entrega de ' || v_row.client_name_snapshot || ' para la venta ' || v_row.sale_code || '.',
      'HIGH', 'DELIVERY', v_row.id, '/entregas/' || v_row.id,
      'DISPATCH_PENDING:' || v_row.id::text,
      jsonb_build_object('deliveryCode', v_row.code, 'saleCode', v_row.sale_code)
    );
    v_created := v_created + 1;
  end loop;

  for v_row in
    select p.id, p.code, p.sale_id, s.code as sale_code,
           p.declared_amount - coalesce(sum(rpa.allocated_amount) filter (
             where sr.state_code not in ('CANCELLED', 'CREDIT_NOTE')
           ), 0) as pending_amount
    from public.payments p
    join public.sales s on s.id = p.sale_id
    left join public.receipt_payment_allocations rpa on rpa.payment_id = p.id
    left join public.sales_receipts sr on sr.id = rpa.receipt_id
    where p.state_code = 'CONFIRMED'
    group by p.id, s.code
    having p.declared_amount - coalesce(sum(rpa.allocated_amount) filter (
      where sr.state_code not in ('CANCELLED', 'CREDIT_NOTE')
    ), 0) > 0
  loop
    perform private.emit_notification_v1(
      'RECEIPT_PENDING',
      'Boleta pendiente · ' || v_row.code,
      'Queda S/ ' || to_char(v_row.pending_amount, 'FM999999990.00') || ' por asociar a una boleta en ' || v_row.sale_code || '.',
      'HIGH', 'PAYMENT', v_row.id, '/ventas/' || v_row.sale_id,
      'RECEIPT_PENDING:' || v_row.id::text,
      jsonb_build_object('paymentCode', v_row.code, 'saleCode', v_row.sale_code, 'pendingAmount', v_row.pending_amount)
    );
    v_created := v_created + 1;
  end loop;

  for v_row in
    select o.id, o.code, o.title, o.amount, trim(o.currency_code) as currency_code,
           o.due_date, o.obligation_type
    from public.obligations o
    where o.status in ('PENDING', 'OVERDUE')
      and o.due_date <= timezone('America/Lima', now())::date + greatest(o.alert_days_before, 0)
      and o.obligation_type in ('CREDIT_CARD', 'SUNAT')
  loop
    perform private.emit_notification_v1(
      case when v_row.obligation_type = 'SUNAT' then 'SUNAT_PAYMENT_DUE' else 'CARD_PAYMENT_DUE' end,
      v_row.title,
      'Vence el ' || to_char(v_row.due_date, 'DD/MM/YYYY') ||
        case when v_row.amount is not null then ' por ' || v_row.currency_code || ' ' || to_char(v_row.amount, 'FM999999990.00') || '.' else '.' end,
      'HIGH', 'OBLIGATION', v_row.id, '/finanzas',
      v_row.obligation_type || '_DUE:' || v_row.id::text || ':' || v_row.due_date::text,
      jsonb_build_object('obligationCode', v_row.code, 'dueDate', v_row.due_date)
    );
    v_created := v_created + 1;
  end loop;

  return jsonb_build_object('processed', v_created, 'refreshedAt', now());
end;
$$;

create or replace function public.get_notifications_v1(
  p_limit integer default 30,
  p_status text default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'typeCode', n.notification_type_code,
        'typeName', nt.name,
        'title', n.title,
        'body', n.body,
        'priority', n.priority,
        'status', nr.status,
        'actionUrl', n.action_url,
        'relatedEntityType', n.related_entity_type,
        'relatedEntityId', n.related_entity_id,
        'metadata', n.metadata,
        'createdAt', n.created_at,
        'readAt', nr.read_at
      ) order by
        case n.priority when 'CRITICAL' then 1 when 'HIGH' then 2 when 'NORMAL' then 3 else 4 end,
        n.created_at desc)
      from (
        select n1.*
        from public.notifications n1
        join public.notification_recipients nr1
          on nr1.notification_id = n1.id
         and nr1.user_id = v_actor
        where (p_status is null or nr1.status = p_status)
          and (n1.expires_at is null or n1.expires_at > now())
        order by
          case n1.priority when 'CRITICAL' then 1 when 'HIGH' then 2 when 'NORMAL' then 3 else 4 end,
          n1.created_at desc
        limit greatest(1, least(coalesce(p_limit, 30), 100))
      ) n
      join public.notification_types nt on nt.code = n.notification_type_code
      join public.notification_recipients nr
        on nr.notification_id = n.id
       and nr.user_id = v_actor
    ), '[]'::jsonb),
    'unreadCount', (
      select count(*)::integer
      from public.notification_recipients nr
      join public.notifications n on n.id = nr.notification_id
      where nr.user_id = v_actor
        and nr.status = 'NEW'
        and (n.expires_at is null or n.expires_at > now())
    )
  );
end;
$$;

create or replace function public.set_notification_status_v1(
  p_notification_id uuid,
  p_status text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_row public.notification_recipients%rowtype;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if p_status not in ('READ', 'RESOLVED', 'DISMISSED') then
    raise exception 'Estado de notificación no válido.' using errcode = '22023';
  end if;

  update public.notification_recipients
     set status = p_status,
         read_at = case when p_status = 'READ' then coalesce(read_at, now()) else read_at end,
         resolved_at = case when p_status = 'RESOLVED' then now() else resolved_at end,
         dismissed_at = case when p_status = 'DISMISSED' then now() else dismissed_at end,
         updated_at = now(),
         version = version + 1
   where notification_id = p_notification_id
     and user_id = v_actor
  returning * into v_row;

  if not found then
    raise exception 'Notificación no encontrada.' using errcode = 'P0002';
  end if;

  return jsonb_build_object('id', p_notification_id, 'status', v_row.status, 'version', v_row.version);
end;
$$;

create or replace function public.get_dashboard_v2()
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_today date := timezone('America/Lima', now())::date;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'businessDate', v_today,
    'summary', (
      select jsonb_build_object(
        'salesTodayCount', d.sales_count,
        'salesTodayAmount', d.sales_amount,
        'confirmedPaymentsToday', d.confirmed_payments_amount,
        'paymentsDueSoon', d.payments_due_soon,
        'overduePayments', d.overdue_payments,
        'pendingDeliveries', d.pending_deliveries,
        'pendingReceipts', d.pending_receipts,
        'lowStockVariants', d.low_stock_variants,
        'activeImports', (select count(*)::integer from public.import_shipments i where i.state_code not in ('STOCKED', 'CANCELLED')),
        'transitBoxes', (select count(*)::integer from public.import_boxes b where b.state_code in ('SHIPPED', 'IN_TRANSIT')),
        'delayedImports', (select count(*)::integer from public.v_import_overview i where i.delay_days > 0 and i.state_code not in ('STOCKED', 'CANCELLED'))
      )
      from public.v_dashboard_today d
    ),
    'weekly', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', days.day,
        'salesAmount', coalesce(s.sales_amount, 0),
        'collectionsAmount', coalesce(p.collections_amount, 0)
      ) order by days.day)
      from generate_series(v_today - 6, v_today, interval '1 day') days(day)
      left join lateral (
        select sum(sa.total_amount)::numeric(14,2) as sales_amount
        from public.sales sa
        where timezone('America/Lima', coalesce(sa.sold_at, sa.created_at))::date = days.day::date
          and sa.commercial_state_code not in ('CANCELLED', 'ANNULLED')
      ) s on true
      left join lateral (
        select sum(pa.declared_amount)::numeric(14,2) as collections_amount
        from public.payments pa
        where pa.state_code = 'CONFIRMED'
          and timezone('America/Lima', pa.confirmed_at)::date = days.day::date
      ) p on true
    ), '[]'::jsonb),
    'accounts', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'code', a.code,
        'name', a.name,
        'currencyCode', trim(a.currency_code),
        'currentBalance', a.current_balance,
        'monthInflows', a.month_inflows,
        'monthOutflows', a.month_outflows,
        'balanceAsOf', a.balance_as_of
      ) order by a.account_type_code, a.name)
      from public.v_financial_account_balances a
      where a.is_active = true
    ), '[]'::jsonb),
    'priorities', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', n.id,
        'typeCode', n.notification_type_code,
        'title', n.title,
        'body', n.body,
        'priority', n.priority,
        'status', nr.status,
        'actionUrl', n.action_url,
        'createdAt', n.created_at
      ) order by
        case n.priority when 'CRITICAL' then 1 when 'HIGH' then 2 when 'NORMAL' then 3 else 4 end,
        n.created_at desc)
      from (
        select n1.*
        from public.notifications n1
        join public.notification_recipients nr1 on nr1.notification_id = n1.id and nr1.user_id = v_actor
        where nr1.status in ('NEW', 'READ')
          and (n1.expires_at is null or n1.expires_at > now())
        order by case n1.priority when 'CRITICAL' then 1 when 'HIGH' then 2 when 'NORMAL' then 3 else 4 end, n1.created_at desc
        limit 5
      ) n
      join public.notification_recipients nr on nr.notification_id = n.id and nr.user_id = v_actor
    ), '[]'::jsonb),
    'recentActivity', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', a.id,
        'occurredAt', a.occurred_at,
        'actorName', coalesce(p.display_name, 'Sistema'),
        'module', case
          when a.table_name like 'sale%' or a.table_name = 'payments' then 'Ventas y pagos'
          when a.table_name like 'inventory%' or a.table_name like 'product%' then 'Inventario'
          when a.table_name like 'import%' then 'Importaciones'
          when a.table_name like 'financial%' or a.table_name like 'bank_%' or a.table_name in ('obligations','loans','cash_closures') then 'Finanzas'
          when a.table_name like 'deliver%' then 'Entregas'
          when a.table_name like 'client%' then 'Clientes'
          else 'Sistema'
        end,
        'action', a.action,
        'entityId', a.entity_id,
        'reason', a.reason
      ) order by a.occurred_at desc)
      from (
        select * from public.audit_log order by occurred_at desc limit 8
      ) a
      left join public.profiles p on p.id = a.actor_user_id
    ), '[]'::jsonb),
    'recentSales', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', s.id,
        'code', s.code,
        'clientName', s.client_name_snapshot,
        'totalAmount', s.total_amount,
        'paidTotal', s.paid_total,
        'balanceAmount', s.balance_amount,
        'paymentStateCode', s.payment_state_code,
        'deliveryStateCode', s.delivery_state_code,
        'createdAt', s.created_at
      ) order by s.created_at desc)
      from (
        select * from public.v_sales_overview order by created_at desc limit 5
      ) s
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_reports_v1(
  p_start_date date,
  p_end_date date,
  p_warehouse_id uuid default null
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_days integer;
  v_previous_start date;
  v_previous_end date;
  v_net_sales numeric(14,2);
  v_previous_sales numeric(14,2);
  v_collected numeric(14,2);
  v_cogs numeric(14,2);
  v_sales_count integer;
  v_units integer;
  v_outstanding numeric(14,2);
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if p_start_date is null or p_end_date is null or p_end_date < p_start_date then
    raise exception 'El periodo del reporte no es válido.' using errcode = '22023';
  end if;
  if p_end_date - p_start_date > 366 then
    raise exception 'El periodo máximo es de 367 días.' using errcode = '22023';
  end if;

  v_days := p_end_date - p_start_date + 1;
  v_previous_end := p_start_date - 1;
  v_previous_start := v_previous_end - (v_days - 1);

  with scoped_sales as (
    select s.*
    from public.sales s
    where timezone('America/Lima', coalesce(s.sold_at, s.created_at))::date between p_start_date and p_end_date
      and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
      and (p_warehouse_id is null or exists (
        select 1
        from public.sale_items si
        join public.sale_item_allocations sia on sia.sale_item_id = si.id
        where si.sale_id = s.id and sia.warehouse_id = p_warehouse_id
      ))
  ), item_costs as (
    select si.sale_id,
           sum(sia.quantity * il.final_unit_cost_pen)::numeric(14,2) as cost
    from public.sale_items si
    join scoped_sales ss on ss.id = si.sale_id
    left join public.sale_item_allocations sia on sia.sale_item_id = si.id
    left join public.inventory_lots il on il.id = sia.lot_id
    where si.item_status not in ('CANCELLED', 'RELEASED')
      and (p_warehouse_id is null or sia.warehouse_id = p_warehouse_id)
    group by si.sale_id
  ), sale_units as (
    select si.sale_id, sum(si.quantity)::integer as units
    from public.sale_items si
    join scoped_sales ss on ss.id = si.sale_id
    where si.item_status not in ('CANCELLED', 'RELEASED')
      and (p_warehouse_id is null or exists (
        select 1 from public.sale_item_allocations sia
        where sia.sale_item_id = si.id and sia.warehouse_id = p_warehouse_id
      ))
    group by si.sale_id
  )
  select coalesce(sum(ss.total_amount),0), count(*)::integer,
         coalesce(sum(su.units),0)::integer,
         coalesce(sum(ss.balance_amount),0), coalesce(sum(ic.cost),0)
    into v_net_sales, v_sales_count, v_units, v_outstanding, v_cogs
  from scoped_sales ss
  left join item_costs ic on ic.sale_id = ss.id
  left join sale_units su on su.sale_id = ss.id;

  select coalesce(sum(p.declared_amount),0)::numeric(14,2)
    into v_collected
  from public.payments p
  join public.sales s on s.id = p.sale_id
  where p.state_code = 'CONFIRMED'
    and timezone('America/Lima', p.confirmed_at)::date between p_start_date and p_end_date
    and (p_warehouse_id is null or exists (
      select 1 from public.sale_items si
      join public.sale_item_allocations sia on sia.sale_item_id = si.id
      where si.sale_id = s.id and sia.warehouse_id = p_warehouse_id
    ));

  select coalesce(sum(s.total_amount),0)::numeric(14,2)
    into v_previous_sales
  from public.sales s
  where timezone('America/Lima', coalesce(s.sold_at, s.created_at))::date between v_previous_start and v_previous_end
    and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
    and (p_warehouse_id is null or exists (
      select 1 from public.sale_items si
      join public.sale_item_allocations sia on sia.sale_item_id = si.id
      where si.sale_id = s.id and sia.warehouse_id = p_warehouse_id
    ));

  return jsonb_build_object(
    'generatedAt', now(),
    'period', jsonb_build_object('startDate', p_start_date, 'endDate', p_end_date, 'previousStartDate', v_previous_start, 'previousEndDate', v_previous_end),
    'warehouses', coalesce((
      select jsonb_agg(jsonb_build_object('id', w.id, 'code', w.code, 'name', w.name) order by w.name)
      from public.warehouses w
      where w.is_active = true and w.is_visible_in_operations = true
    ), '[]'::jsonb),
    'summary', jsonb_build_object(
      'netSales', v_net_sales,
      'collected', v_collected,
      'estimatedCost', v_cogs,
      'estimatedProfit', v_net_sales - v_cogs,
      'averageTicket', case when v_sales_count > 0 then round(v_net_sales / v_sales_count, 2) else 0 end,
      'outstandingBalance', v_outstanding,
      'salesCount', v_sales_count,
      'unitsSold', v_units,
      'previousNetSales', v_previous_sales,
      'salesChangePercent', case when v_previous_sales > 0 then round(((v_net_sales - v_previous_sales) / v_previous_sales) * 100, 2) else null end
    ),
    'daily', coalesce((
      select jsonb_agg(jsonb_build_object(
        'date', d.day,
        'salesAmount', coalesce(sa.amount,0),
        'collectionsAmount', coalesce(pa.amount,0),
        'salesCount', coalesce(sa.sales_count,0)
      ) order by d.day)
      from generate_series(p_start_date, p_end_date, interval '1 day') d(day)
      left join lateral (
        select sum(s.total_amount)::numeric(14,2) amount, count(*)::integer sales_count
        from public.sales s
        where timezone('America/Lima', coalesce(s.sold_at, s.created_at))::date = d.day::date
          and s.commercial_state_code not in ('CANCELLED','ANNULLED')
          and (p_warehouse_id is null or exists (
            select 1 from public.sale_items si
            join public.sale_item_allocations sia on sia.sale_item_id = si.id
            where si.sale_id = s.id and sia.warehouse_id = p_warehouse_id
          ))
      ) sa on true
      left join lateral (
        select sum(p.declared_amount)::numeric(14,2) amount
        from public.payments p
        join public.sales s on s.id = p.sale_id
        where p.state_code = 'CONFIRMED'
          and timezone('America/Lima', p.confirmed_at)::date = d.day::date
          and (p_warehouse_id is null or exists (
            select 1 from public.sale_items si
            join public.sale_item_allocations sia on sia.sale_item_id = si.id
            where si.sale_id = s.id and sia.warehouse_id = p_warehouse_id
          ))
      ) pa on true
    ), '[]'::jsonb),
    'topProducts', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.revenue desc)
      from (
        select si.variant_id as "variantId", si.product_name_snapshot as "productName", si.variant_name_snapshot as "variantName",
               si.sku_snapshot as sku, sum(si.quantity)::integer as units,
               sum(si.line_total)::numeric(14,2) as revenue,
               coalesce(sum(costs.cost),0)::numeric(14,2) as cost,
               (sum(si.line_total) - coalesce(sum(costs.cost),0))::numeric(14,2) as profit
        from public.sale_items si
        join public.sales s on s.id = si.sale_id
        left join lateral (
          select sum(sia.quantity * il.final_unit_cost_pen)::numeric(14,2) as cost
          from public.sale_item_allocations sia
          join public.inventory_lots il on il.id = sia.lot_id
          where sia.sale_item_id = si.id
            and (p_warehouse_id is null or sia.warehouse_id = p_warehouse_id)
        ) costs on true
        where timezone('America/Lima', coalesce(s.sold_at, s.created_at))::date between p_start_date and p_end_date
          and s.commercial_state_code not in ('CANCELLED','ANNULLED')
          and si.item_status not in ('CANCELLED','RELEASED')
          and (p_warehouse_id is null or exists (
            select 1 from public.sale_item_allocations sia where sia.sale_item_id = si.id and sia.warehouse_id = p_warehouse_id
          ))
        group by si.variant_id, si.product_name_snapshot, si.variant_name_snapshot, si.sku_snapshot
        order by revenue desc
        limit 10
      ) x
    ), '[]'::jsonb),
    'categories', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.revenue desc)
      from (
        select si.category_name_snapshot as name, sum(si.quantity)::integer as units, sum(si.line_total)::numeric(14,2) as revenue
        from public.sale_items si
        join public.sales s on s.id = si.sale_id
        where timezone('America/Lima', coalesce(s.sold_at, s.created_at))::date between p_start_date and p_end_date
          and s.commercial_state_code not in ('CANCELLED','ANNULLED')
          and si.item_status not in ('CANCELLED','RELEASED')
          and (p_warehouse_id is null or exists (
            select 1 from public.sale_item_allocations sia where sia.sale_item_id = si.id and sia.warehouse_id = p_warehouse_id
          ))
        group by si.category_name_snapshot
        order by revenue desc
      ) x
    ), '[]'::jsonb),
    'topClients', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.purchased desc)
      from (
        select s.client_id as "clientId", s.client_name_snapshot as "clientName", count(*)::integer as "salesCount",
               sum(s.total_amount)::numeric(14,2) as purchased, sum(s.balance_amount)::numeric(14,2) as outstanding
        from public.sales s
        where timezone('America/Lima', coalesce(s.sold_at, s.created_at))::date between p_start_date and p_end_date
          and s.commercial_state_code not in ('CANCELLED','ANNULLED')
          and (p_warehouse_id is null or exists (
            select 1 from public.sale_items si join public.sale_item_allocations sia on sia.sale_item_id = si.id
            where si.sale_id = s.id and sia.warehouse_id = p_warehouse_id
          ))
        group by s.client_id, s.client_name_snapshot
        order by purchased desc
        limit 10
      ) x
    ), '[]'::jsonb),
    'inventory', jsonb_build_object(
      'availableUnits', coalesce((select sum(i.available_quantity)::integer from public.v_inventory_summary i where i.is_visible_in_operations = true and (p_warehouse_id is null or i.warehouse_id = p_warehouse_id)),0),
      'reservedUnits', coalesce((select sum(i.reserved_quantity + i.accumulated_quantity)::integer from public.v_inventory_summary i where i.is_visible_in_operations = true and (p_warehouse_id is null or i.warehouse_id = p_warehouse_id)),0),
      'lowStockVariants', coalesce((select count(distinct i.variant_id)::integer from public.v_inventory_summary i where i.is_visible_in_operations = true and i.is_active = true and i.available_quantity <= i.minimum_stock and i.minimum_stock > 0 and (p_warehouse_id is null or i.warehouse_id = p_warehouse_id)),0),
      'valuationPen', coalesce((
        select sum(ib.quantity * il.final_unit_cost_pen)::numeric(14,2)
        from public.inventory_balances ib
        join public.inventory_lots il on il.id = ib.lot_id
        join public.warehouses w on w.id = ib.warehouse_id
        where ib.bucket_code in ('AVAILABLE','RESERVED','ACCUMULATED')
          and w.is_visible_in_operations = true
          and (p_warehouse_id is null or ib.warehouse_id = p_warehouse_id)
      ),0)
    ),
    'lowStock', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.available asc, x."productName")
      from (
        select i.variant_id as "variantId", i.product_name as "productName", i.variant_name as "variantName", i.sku,
               sum(i.available_quantity)::integer as available, max(i.minimum_stock)::integer as minimum
        from public.v_inventory_summary i
        where i.is_visible_in_operations = true and i.is_active = true
          and (p_warehouse_id is null or i.warehouse_id = p_warehouse_id)
        group by i.variant_id, i.product_name, i.variant_name, i.sku
        having sum(i.available_quantity) <= max(i.minimum_stock) and max(i.minimum_stock) > 0
        limit 20
      ) x
    ), '[]'::jsonb),
    'channels', coalesce((
      select jsonb_agg(to_jsonb(x) order by x.amount desc)
      from (
        select s.sales_channel_code as code, coalesce(sc.name, s.sales_channel_code) as name,
               count(*)::integer as "salesCount", sum(s.total_amount)::numeric(14,2) as amount
        from public.sales s
        left join public.sales_channels sc on sc.code = s.sales_channel_code
        where timezone('America/Lima', coalesce(s.sold_at, s.created_at))::date between p_start_date and p_end_date
          and s.commercial_state_code not in ('CANCELLED','ANNULLED')
          and (p_warehouse_id is null or exists (
            select 1 from public.sale_items si join public.sale_item_allocations sia on sia.sale_item_id = si.id
            where si.sale_id = s.id and sia.warehouse_id = p_warehouse_id
          ))
        group by s.sales_channel_code, sc.name
      ) x
    ), '[]'::jsonb)
  );
end;
$$;

create or replace function public.get_audit_log_v1(
  p_search text default null,
  p_action text default null,
  p_module text default null,
  p_date_from date default null,
  p_date_to date default null,
  p_page integer default 1,
  p_page_size integer default 25
)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_offset integer := (greatest(coalesce(p_page,1),1) - 1) * greatest(1,least(coalesce(p_page_size,25),100));
  v_page_size integer := greatest(1,least(coalesce(p_page_size,25),100));
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  return jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(to_jsonb(x) order by x."occurredAt" desc)
      from (
        select a.id,
               a.occurred_at as "occurredAt",
               coalesce(p.display_name, 'Sistema') as "actorName",
               a.actor_user_id as "actorId",
               case
                 when a.table_name like 'sale%' or a.table_name = 'payments' then 'Ventas y pagos'
                 when a.table_name like 'inventory%' or a.table_name like 'product%' then 'Inventario'
                 when a.table_name like 'import%' then 'Importaciones'
                 when a.table_name like 'financial%' or a.table_name like 'bank_%' or a.table_name in ('obligations','loans','cash_closures') then 'Finanzas'
                 when a.table_name like 'deliver%' then 'Entregas'
                 when a.table_name like 'client%' then 'Clientes'
                 when a.table_name like 'notification%' or a.table_name = 'report_exports' then 'Sistema'
                 else 'Configuración'
               end as module,
               a.table_name as "tableName",
               a.action,
               a.entity_id as "entityId",
               a.reason,
               a.old_values as "oldValues",
               a.new_values as "newValues",
               a.metadata,
               a.request_id as "requestId"
        from public.audit_log a
        left join public.profiles p on p.id = a.actor_user_id
        where (p_search is null or p_search = '' or
          coalesce(p.display_name,'') ilike '%' || p_search || '%' or
          a.table_name ilike '%' || p_search || '%' or
          coalesce(a.entity_id,'') ilike '%' || p_search || '%' or
          coalesce(a.reason,'') ilike '%' || p_search || '%')
          and (p_action is null or p_action = '' or a.action = p_action)
          and (p_module is null or p_module = '' or
            (p_module = 'SALES' and (a.table_name like 'sale%' or a.table_name = 'payments')) or
            (p_module = 'INVENTORY' and (a.table_name like 'inventory%' or a.table_name like 'product%')) or
            (p_module = 'IMPORTS' and a.table_name like 'import%') or
            (p_module = 'FINANCE' and (a.table_name like 'financial%' or a.table_name like 'bank_%' or a.table_name in ('obligations','loans','cash_closures'))) or
            (p_module = 'DELIVERIES' and a.table_name like 'deliver%') or
            (p_module = 'CLIENTS' and a.table_name like 'client%') or
            (p_module = 'SYSTEM' and (a.table_name like 'notification%' or a.table_name = 'report_exports')))
          and (p_date_from is null or timezone('America/Lima', a.occurred_at)::date >= p_date_from)
          and (p_date_to is null or timezone('America/Lima', a.occurred_at)::date <= p_date_to)
        order by a.occurred_at desc
        limit v_page_size offset v_offset
      ) x
    ), '[]'::jsonb),
    'page', greatest(coalesce(p_page,1),1),
    'pageSize', v_page_size,
    'total', (
      select count(*)::integer
      from public.audit_log a
      left join public.profiles p on p.id = a.actor_user_id
      where (p_search is null or p_search = '' or coalesce(p.display_name,'') ilike '%' || p_search || '%' or a.table_name ilike '%' || p_search || '%' or coalesce(a.entity_id,'') ilike '%' || p_search || '%' or coalesce(a.reason,'') ilike '%' || p_search || '%')
        and (p_action is null or p_action = '' or a.action = p_action)
        and (p_module is null or p_module = '' or
          (p_module = 'SALES' and (a.table_name like 'sale%' or a.table_name = 'payments')) or
          (p_module = 'INVENTORY' and (a.table_name like 'inventory%' or a.table_name like 'product%')) or
          (p_module = 'IMPORTS' and a.table_name like 'import%') or
          (p_module = 'FINANCE' and (a.table_name like 'financial%' or a.table_name like 'bank_%' or a.table_name in ('obligations','loans','cash_closures'))) or
          (p_module = 'DELIVERIES' and a.table_name like 'deliver%') or
          (p_module = 'CLIENTS' and a.table_name like 'client%') or
          (p_module = 'SYSTEM' and (a.table_name like 'notification%' or a.table_name = 'report_exports')))
        and (p_date_from is null or timezone('America/Lima', a.occurred_at)::date >= p_date_from)
        and (p_date_to is null or timezone('America/Lima', a.occurred_at)::date <= p_date_to)
    ),
    'summary', jsonb_build_object(
      'last30Days', (select count(*)::integer from public.audit_log where occurred_at >= now() - interval '30 days'),
      'sensitiveActions', (select count(*)::integer from public.audit_log where occurred_at >= now() - interval '30 days' and action in ('REVERSE','DELETE','STATE_CHANGE','CONFIRM')),
      'actors', coalesce((
        select jsonb_agg(jsonb_build_object('actorName', x.actor_name, 'count', x.total) order by x.total desc)
        from (
          select coalesce(p.display_name,'Sistema') actor_name, count(*)::integer total
          from public.audit_log a left join public.profiles p on p.id = a.actor_user_id
          where a.occurred_at >= now() - interval '30 days'
          group by coalesce(p.display_name,'Sistema')
          limit 10
        ) x
      ), '[]'::jsonb)
    )
  );
end;
$$;

create or replace function public.register_report_export_v1(p_input jsonb)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid := private.current_actor_id();
  v_id uuid := extensions.gen_random_uuid();
  v_code text := 'RPT-' || to_char(timezone('America/Lima', now()), 'YYYYMMDD-HH24MISS') || '-' || upper(left(replace(v_id::text,'-',''),6));
  v_type text := coalesce(nullif(p_input ->> 'reportType',''), 'GENERAL');
  v_format text := p_input ->> 'format';
  v_filename text := p_input ->> 'filename';
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if v_format not in ('CSV','PDF_PRINT') then
    raise exception 'Formato de exportación no válido.' using errcode = '22023';
  end if;
  if coalesce(v_filename,'') = '' then
    raise exception 'El nombre del archivo es obligatorio.' using errcode = '22023';
  end if;

  insert into public.report_exports(id, code, report_type, export_format, period_start, period_end, filters, filename, object_path, generated_by)
  values (
    v_id, v_code, v_type, v_format,
    nullif(p_input ->> 'startDate','')::date,
    nullif(p_input ->> 'endDate','')::date,
    coalesce(p_input -> 'filters','{}'::jsonb),
    v_filename,
    nullif(p_input ->> 'objectPath',''),
    v_actor
  );

  insert into public.audit_log(schema_name, table_name, entity_id, action, new_values, reason, actor_user_id, actor_role, metadata)
  values ('public','report_exports',v_id::text,'OTHER',jsonb_build_object('code',v_code,'format',v_format,'filename',v_filename),'Exportación de reporte',v_actor,'ADMIN',jsonb_build_object('reportType',v_type));

  return jsonb_build_object('id',v_id,'code',v_code,'generatedAt',now());
end;
$$;

revoke all on function private.emit_notification_v1(text,text,text,text,text,uuid,text,text,jsonb) from public, anon, authenticated;

grant execute on function public.refresh_operational_notifications_v1() to authenticated;
grant execute on function public.get_notifications_v1(integer,text) to authenticated;
grant execute on function public.set_notification_status_v1(uuid,text) to authenticated;
grant execute on function public.get_dashboard_v2() to authenticated;
grant execute on function public.get_reports_v1(date,date,uuid) to authenticated;
grant execute on function public.get_audit_log_v1(text,text,text,date,date,integer,integer) to authenticated;
grant execute on function public.register_report_export_v1(jsonb) to authenticated;

notify pgrst, 'reload schema';

commit;
