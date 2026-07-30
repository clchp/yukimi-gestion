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
