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
