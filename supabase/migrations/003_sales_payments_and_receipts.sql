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
