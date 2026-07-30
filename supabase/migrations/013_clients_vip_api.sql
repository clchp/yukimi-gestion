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
