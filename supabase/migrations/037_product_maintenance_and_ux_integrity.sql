-- Yukimi Gestión
-- Migración 037: mantenimiento seguro de productos y variantes

begin;

create or replace function public.update_product_bundle_v1(
  p_product_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_actor uuid;
  v_product public.products%rowtype;
  v_old_product jsonb;
  v_line_brand_id uuid;
  v_variant_payload jsonb;
  v_variant public.product_variants%rowtype;
  v_variant_count integer;
  v_payload_count integer;
  v_updated integer := 0;
  v_new_product_version bigint;
  v_reason text;
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  if jsonb_typeof(p_payload) <> 'object' then
    raise exception 'La edición del producto debe enviarse como un objeto JSON.';
  end if;

  v_actor := private.current_actor_id();
  v_reason := nullif(btrim(p_payload->>'reason'), '');
  if v_reason is null or length(v_reason) < 5 then
    raise exception 'El motivo del cambio debe tener al menos 5 caracteres.';
  end if;

  select * into v_product
  from public.products
  where id = p_product_id
  for update;

  if not found then
    raise exception 'El producto no existe.' using errcode = 'P0002';
  end if;

  if v_product.version <> (p_payload->>'version')::bigint then
    raise exception 'El producto cambió desde que abriste la pantalla. Recarga y vuelve a intentarlo.'
      using errcode = '40001';
  end if;

  if nullif(btrim(p_payload->>'name'), '') is null then
    raise exception 'El nombre del producto es obligatorio.';
  end if;

  perform 1 from public.product_categories
  where id = (p_payload->>'category_id')::uuid and is_active = true;
  if not found then
    raise exception 'La categoría seleccionada no existe o está inactiva.';
  end if;

  if nullif(p_payload->>'franchise_id', '') is not null then
    perform 1 from public.franchises
    where id = (p_payload->>'franchise_id')::uuid and is_active = true;
    if not found then
      raise exception 'La franquicia seleccionada no existe o está inactiva.';
    end if;
  end if;

  if nullif(p_payload->>'brand_id', '') is not null then
    perform 1 from public.brands
    where id = (p_payload->>'brand_id')::uuid and is_active = true;
    if not found then
      raise exception 'La marca seleccionada no existe o está inactiva.';
    end if;
  end if;

  if nullif(p_payload->>'product_line_id', '') is not null then
    select brand_id into v_line_brand_id
    from public.product_lines
    where id = (p_payload->>'product_line_id')::uuid and is_active = true;
    if not found then
      raise exception 'La línea seleccionada no existe o está inactiva.';
    end if;
    if v_line_brand_id is not null
      and v_line_brand_id is distinct from nullif(p_payload->>'brand_id', '')::uuid then
      raise exception 'La línea seleccionada no pertenece a la marca indicada.';
    end if;
  end if;

  if jsonb_typeof(coalesce(p_payload->'variants', '[]'::jsonb)) <> 'array' then
    raise exception 'Las variantes deben enviarse como una lista.';
  end if;

  select count(*)::integer into v_variant_count
  from public.product_variants
  where product_id = p_product_id;
  v_payload_count := jsonb_array_length(coalesce(p_payload->'variants', '[]'::jsonb));
  if v_payload_count <> v_variant_count then
    raise exception 'Debes enviar todas las variantes existentes para evitar una edición incompleta.';
  end if;

  perform pg_catalog.set_config('app.audit_reason', v_reason, true);

  v_old_product := to_jsonb(v_product);

  update public.products
  set name = btrim(p_payload->>'name'),
      franchise_id = nullif(p_payload->>'franchise_id', '')::uuid,
      character_name = nullif(btrim(p_payload->>'character_name'), ''),
      category_id = (p_payload->>'category_id')::uuid,
      brand_id = nullif(p_payload->>'brand_id', '')::uuid,
      product_line_id = nullif(p_payload->>'product_line_id', '')::uuid,
      description = nullif(btrim(p_payload->>'description'), ''),
      is_active = coalesce((p_payload->>'is_active')::boolean, true),
      updated_by = v_actor,
      updated_at = now(),
      version = version + 1
  where id = p_product_id
  returning version into v_new_product_version;

  for v_variant_payload in
    select value from jsonb_array_elements(p_payload->'variants')
  loop
    select * into v_variant
    from public.product_variants
    where id = (v_variant_payload->>'id')::uuid
      and product_id = p_product_id
    for update;

    if not found then
      raise exception 'Una de las variantes no pertenece al producto.';
    end if;

    if v_variant.version <> (v_variant_payload->>'version')::bigint then
      raise exception 'La variante % cambió desde que abriste la pantalla. Recarga y vuelve a intentarlo.', v_variant.sku
        using errcode = '40001';
    end if;

    if nullif(btrim(v_variant_payload->>'variant_name'), '') is null then
      raise exception 'El nombre de cada variante es obligatorio.';
    end if;
    if coalesce((v_variant_payload->>'sale_price')::numeric, -1) < 0 then
      raise exception 'El precio de venta no puede ser negativo.';
    end if;
    if coalesce((v_variant_payload->>'minimum_stock')::integer, -1) < 0 then
      raise exception 'El stock mínimo no puede ser negativo.';
    end if;

    if v_variant.sale_price is distinct from (v_variant_payload->>'sale_price')::numeric
      or v_variant.currency_code is distinct from (v_variant_payload->>'currency_code')::char(3) then
      insert into public.product_price_history(
        variant_id,
        previous_price,
        new_price,
        currency_code,
        reason,
        changed_by
      ) values (
        v_variant.id,
        v_variant.sale_price,
        (v_variant_payload->>'sale_price')::numeric,
        (v_variant_payload->>'currency_code')::char(3),
        v_reason,
        v_actor
      );
    end if;

    update public.product_variants
    set variant_name = btrim(v_variant_payload->>'variant_name'),
        barcode = nullif(btrim(v_variant_payload->>'barcode'), ''),
        sale_price = (v_variant_payload->>'sale_price')::numeric,
        currency_code = (v_variant_payload->>'currency_code')::char(3),
        minimum_stock = (v_variant_payload->>'minimum_stock')::integer,
        weight_grams = nullif(v_variant_payload->>'weight_grams', '')::numeric,
        dimensions = coalesce(v_variant_payload->'dimensions', '{}'::jsonb),
        is_active = coalesce((v_variant_payload->>'is_active')::boolean, true),
        updated_by = v_actor,
        updated_at = now(),
        version = version + 1
    where id = v_variant.id;

    v_updated := v_updated + 1;
  end loop;

  insert into public.audit_log(
    actor_user_id,
    schema_name,
    table_name,
    entity_id,
    action,
    old_values,
    new_values,
    reason,
    metadata
  ) values (
    v_actor,
    'public',
    'products',
    p_product_id::text,
    'UPDATE',
    v_old_product,
    jsonb_build_object(
      'name', btrim(p_payload->>'name'),
      'categoryId', p_payload->>'category_id',
      'franchiseId', nullif(p_payload->>'franchise_id', ''),
      'brandId', nullif(p_payload->>'brand_id', ''),
      'productLineId', nullif(p_payload->>'product_line_id', ''),
      'isActive', coalesce((p_payload->>'is_active')::boolean, true),
      'version', v_new_product_version,
      'updatedVariants', v_updated
    ),
    v_reason,
    jsonb_build_object('source', 'update_product_bundle_v1')
  );

  return jsonb_build_object(
    'productId', p_product_id,
    'version', v_new_product_version,
    'updatedVariants', v_updated,
    'updatedAt', now()
  );
end;
$$;

revoke execute on function public.update_product_bundle_v1(uuid, jsonb) from public, anon;
grant execute on function public.update_product_bundle_v1(uuid, jsonb) to authenticated, service_role;

notify pgrst, 'reload schema';

commit;
