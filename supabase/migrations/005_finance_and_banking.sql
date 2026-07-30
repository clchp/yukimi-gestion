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
