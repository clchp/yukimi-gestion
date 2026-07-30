-- Yukimi Gestión
-- Migración 031: preparación para dos emisores RUC sin inventar datos fiscales

begin;

create table if not exists public.business_entities (
  id uuid primary key default extensions.gen_random_uuid(),
  code text not null unique,
  legal_name text not null,
  trade_name text,
  ruc char(11) not null unique check (ruc ~ '^[0-9]{11}$'),
  owner_reference text,
  tax_address text,
  is_default boolean not null default false,
  is_active boolean not null default true,
  created_by uuid references public.profiles(id) on delete set null,
  updated_by uuid references public.profiles(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version bigint not null default 1
);

create unique index if not exists ux_business_entities_single_default
  on public.business_entities(is_default)
  where is_default = true and is_active = true;

alter table public.sales_receipts
  add column if not exists business_entity_id uuid
    references public.business_entities(id) on delete restrict;

alter table public.business_entities enable row level security;
alter table public.business_entities force row level security;
grant select, insert, update on public.business_entities to authenticated;

drop policy if exists admin_select on public.business_entities;
drop policy if exists admin_insert on public.business_entities;
drop policy if exists admin_update on public.business_entities;
create policy admin_select on public.business_entities
for select to authenticated using (private.is_active_admin());
create policy admin_insert on public.business_entities
for insert to authenticated with check (private.is_active_admin());
create policy admin_update on public.business_entities
for update to authenticated
using (private.is_active_admin())
with check (private.is_active_admin());

drop trigger if exists trg_touch_version on public.business_entities;
create trigger trg_touch_version
before update on public.business_entities
for each row execute function private.touch_updated_at_and_version();

drop trigger if exists trg_audit_row_change on public.business_entities;
create trigger trg_audit_row_change
after insert or update or delete on public.business_entities
for each row execute function private.audit_row_change();

insert into public.business_settings(
  setting_key,
  setting_value,
  description,
  value_type,
  is_sensitive
)
values
  (
    'receipts.business_entities',
    jsonb_build_object(
      'status', 'AWAITING_LEGAL_NAMES_AND_RUCS',
      'expectedEntities', 2,
      'knownOwners', jsonb_build_array('MADRE', 'ABUELO'),
      'defaultEntityId', null
    ),
    'Yukimi opera con dos RUC. No se crean emisores hasta recibir nombres legales y números exactos.',
    'JSON',
    true
  ),
  (
    'receipts.required_for_new_sales',
    jsonb_build_object(
      'status', 'LEGAL_REVIEW_REQUIRED',
      'states', jsonb_build_array(
        'PENDING',
        'ISSUED',
        'ANNULLED',
        'HISTORICAL_WITHOUT_RECEIPT'
      ),
      'allowUndeclaredIncomeAutomation', false
    ),
    'La política de ventas nuevas sin comprobante requiere validación tributaria. El sistema no automatiza ocultamiento de ingresos.',
    'JSON',
    true
  )
on conflict (setting_key) do update
set setting_value = excluded.setting_value,
    description = excluded.description,
    value_type = excluded.value_type,
    is_sensitive = excluded.is_sensitive,
    updated_at = now();

commit;
