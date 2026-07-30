-- Yukimi Gestión
-- Migración 032: búsqueda global conectada a datos reales

begin;

create or replace function public.global_search_v1(
  p_query text,
  p_limit integer default 12
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_query text := btrim(coalesce(p_query, ''));
  v_limit integer := least(greatest(coalesce(p_limit, 12), 1), 30);
  v_items jsonb;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if length(v_query) < 2 then
    return jsonb_build_object('items', '[]'::jsonb, 'query', v_query);
  end if;

  with candidates as (
    select
      'CLIENT'::text as entity_type,
      c.id,
      c.full_name as label,
      concat_ws(' · ', c.code, c.phone) as secondary,
      '/clientes/' || c.id::text as route,
      case
        when lower(c.full_name) = lower(v_query) then 100
        when c.code ilike v_query || '%' then 90
        when c.full_name ilike v_query || '%' then 80
        else 50
      end as relevance
    from public.clients c
    where c.is_active = true
      and (
        c.full_name ilike '%' || v_query || '%'
        or c.code ilike '%' || v_query || '%'
        or coalesce(c.phone, '') ilike '%' || v_query || '%'
        or coalesce(c.document_number, '') ilike '%' || v_query || '%'
      )

    union all

    select
      'SALE',
      s.id,
      s.code || ' · ' || s.client_name_snapshot,
      concat_ws(' · ', s.commercial_state_code, 'Saldo S/' || s.balance_amount),
      '/ventas/' || s.id::text,
      case when s.code ilike v_query || '%' then 95 else 55 end
    from public.sales s
    where s.code ilike '%' || v_query || '%'
       or s.client_name_snapshot ilike '%' || v_query || '%'
       or coalesce(s.client_phone_snapshot, '') ilike '%' || v_query || '%'

    union all

    select
      'IMPORT',
      ish.id,
      ish.code || coalesce(' · ' || bp.trade_name, ' · ' || bp.legal_name, ''),
      concat_ws(' · ', ish.state_code, ish.master_tracking_number),
      '/importaciones/' || ish.id::text,
      case
        when ish.code ilike v_query || '%' then 95
        when ish.master_tracking_number ilike v_query || '%' then 85
        else 50
      end
    from public.import_shipments ish
    left join public.business_partners bp on bp.id = ish.supplier_partner_id
    where ish.code ilike '%' || v_query || '%'
       or coalesce(ish.master_tracking_number, '') ilike '%' || v_query || '%'
       or coalesce(bp.trade_name, '') ilike '%' || v_query || '%'
       or coalesce(bp.legal_name, '') ilike '%' || v_query || '%'

    union all

    select
      'DELIVERY',
      d.id,
      d.code || ' · ' || s.client_name_snapshot,
      concat_ws(' · ', d.state_code, d.tracking_number),
      '/entregas/' || d.id::text,
      case
        when d.code ilike v_query || '%' then 95
        when d.tracking_number ilike v_query || '%' then 85
        else 50
      end
    from public.deliveries d
    join public.sales s on s.id = d.sale_id
    where d.code ilike '%' || v_query || '%'
       or coalesce(d.tracking_number, '') ilike '%' || v_query || '%'
       or s.client_name_snapshot ilike '%' || v_query || '%'

    union all

    select
      'PRODUCT',
      pv.id,
      p.name || ' · ' || pv.variant_name,
      pv.sku || ' · ' || p.code,
      '/inventario?search=' || replace(pv.sku, ' ', '%20'),
      case
        when pv.sku ilike v_query || '%' then 92
        when p.code ilike v_query || '%' then 88
        when p.name ilike v_query || '%' then 75
        else 45
      end
    from public.product_variants pv
    join public.products p on p.id = pv.product_id
    where p.is_active = true
      and pv.is_active = true
      and (
        p.name ilike '%' || v_query || '%'
        or p.code ilike '%' || v_query || '%'
        or pv.sku ilike '%' || v_query || '%'
        or pv.variant_name ilike '%' || v_query || '%'
      )
  ),
  ranked as (
    select *
    from candidates
    order by relevance desc, label
    limit v_limit
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'entityType', entity_type,
    'id', id,
    'label', label,
    'secondary', secondary,
    'route', route
  ) order by relevance desc, label), '[]'::jsonb)
    into v_items
  from ranked;

  return jsonb_build_object('items', v_items, 'query', v_query);
end;
$$;

revoke all on function public.global_search_v1(text, integer) from public, anon;
grant execute on function public.global_search_v1(text, integer) to authenticated, service_role;

notify pgrst, 'reload schema';
commit;
