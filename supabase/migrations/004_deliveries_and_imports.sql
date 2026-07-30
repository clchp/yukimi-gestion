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
