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
