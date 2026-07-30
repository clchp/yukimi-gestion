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
