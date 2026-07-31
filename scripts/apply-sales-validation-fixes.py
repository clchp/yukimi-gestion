from pathlib import Path


def read(path: str) -> str:
    return Path(path).read_text(encoding="utf-8")


def write(path: str, content: str) -> None:
    Path(path).parent.mkdir(parents=True, exist_ok=True)
    Path(path).write_text(content, encoding="utf-8")


def replace_once(path: str, old: str, new: str) -> None:
    content = read(path)
    if old not in content:
        raise RuntimeError(f"No se encontró el bloque esperado en {path}: {old[:100]!r}")
    write(path, content.replace(old, new, 1))


# Fechas ISO con zona horaria de Perú.
path = "packages/shared/src/sales.ts"
content = read(path)
count = content.count("z.string().datetime().nullable().optional()")
if count != 2:
    raise RuntimeError(f"Se esperaban 2 fechas de venta; se encontraron {count}")
content = content.replace(
    "z.string().datetime().nullable().optional()",
    "z.string().datetime({ offset: true }).nullable().optional()",
)
write(path, content)

# Documento obligatorio tanto al crear como al editar.
replace_once(
    "packages/shared/src/clients.ts",
    "  documentType: z.enum(['DNI', 'CE', 'PASSPORT', 'RUC', 'OTHER']).nullable().optional(),\n  documentNumber: nullableText(30),",
    "  documentType: z.enum(['DNI', 'CE', 'PASSPORT', 'RUC', 'OTHER']),\n  documentNumber: z.string().trim().min(1, 'El número de documento es obligatorio.').max(30),",
)

# Formulario de clientes: retorno al flujo de venta y documento obligatorio.
replace_once(
    "apps/web/src/pages/client-form-page.tsx",
    "import { useNavigate, useParams } from 'react-router';",
    "import { useNavigate, useParams, useSearchParams } from 'react-router';",
)
replace_once(
    "apps/web/src/pages/client-form-page.tsx",
    "  const { clientId } = useParams();\n  const isEditing = Boolean(clientId);",
    "  const { clientId } = useParams();\n  const [searchParams] = useSearchParams();\n  const isEditing = Boolean(clientId);\n  const rawReturnTo = searchParams.get('returnTo');\n  const returnTo =\n    rawReturnTo?.startsWith('/') && !rawReturnTo.startsWith('//') ? rawReturnTo : null;",
)
replace_once(
    "apps/web/src/pages/client-form-page.tsx",
    "      if (documentNumber.trim() && !documentType)\n        throw new Error('Selecciona el tipo de documento.');\n      const base = {\n        fullName: fullName.trim(),\n        documentType: documentNumber.trim()\n          ? (documentType as 'DNI' | 'CE' | 'PASSPORT' | 'RUC' | 'OTHER')\n          : null,\n        documentNumber: documentNumber.trim() || null,",
    "      if (!documentType) throw new Error('Selecciona el tipo de documento.');\n      if (!documentNumber.trim()) throw new Error('El número de documento es obligatorio.');\n      const base = {\n        fullName: fullName.trim(),\n        documentType: documentType as 'DNI' | 'CE' | 'PASSPORT' | 'RUC' | 'OTHER',\n        documentNumber: documentNumber.trim(),",
)
replace_once(
    "apps/web/src/pages/client-form-page.tsx",
    "      navigate(`/clientes/${result.id}`);",
    "      if (!isEditing && returnTo) {\n        const separator = returnTo.includes('?') ? '&' : '?';\n        navigate(`${returnTo}${separator}clientId=${result.id}`, { replace: true });\n      } else {\n        navigate(`/clientes/${result.id}`);\n      }",
)
replace_once(
    "apps/web/src/pages/client-form-page.tsx",
    "        onClick={() => navigate(isEditing && clientId ? `/clientes/${clientId}` : '/clientes')}",
    "        onClick={() =>\n          navigate(isEditing && clientId ? `/clientes/${clientId}` : returnTo ?? '/clientes')\n        }",
)
replace_once(
    "apps/web/src/pages/client-form-page.tsx",
    "                    placeholder=\"Ej. María López\"\n                  />",
    "                    placeholder=\"Ej. María López\"\n                    required\n                  />",
)
replace_once(
    "apps/web/src/pages/client-form-page.tsx",
    "                  <span>Tipo de documento</span>",
    "                  <span>Tipo de documento *</span>",
)
replace_once(
    "apps/web/src/pages/client-form-page.tsx",
    "                    onChange={(event) => setDocumentType(event.target.value)}\n                  >",
    "                    onChange={(event) => setDocumentType(event.target.value)}\n                    required\n                  >",
)
replace_once(
    "apps/web/src/pages/client-form-page.tsx",
    "                  <span>Número de documento</span>",
    "                  <span>Número de documento *</span>",
)
replace_once(
    "apps/web/src/pages/client-form-page.tsx",
    "                    maxLength={30}\n                  />",
    "                    maxLength={30}\n                    required\n                  />",
)

# Clientes VIP existentes se editan; revocar queda como acción independiente.
replace_once(
    "apps/web/src/pages/client-detail-page.tsx",
    "            onSubmit={(event) => {\n              event.preventDefault();\n              setError(null);\n              vipMutation.mutate(!data.isVip);\n            }}",
    "            onSubmit={(event) => {\n              event.preventDefault();\n              setError(null);\n              vipMutation.mutate(true);\n            }}",
)
replace_once(
    "apps/web/src/pages/client-detail-page.tsx",
    "                <h2>{data.isVip ? 'Retirar condición VIP' : 'Convertir en cliente VIP'}</h2>",
    "                <h2>{data.isVip ? 'Editar condición VIP' : 'Convertir en cliente VIP'}</h2>",
)
old_vip_block = """            {!data.isVip ? (
              <div className=\"form-grid form-grid-2\">
                <div className=\"alert alert-info field-span-2\">
                  El adelanto mínimo no usa un límite fijo: se acordará según los productos de cada
                  venta.
                </div>
                <label className=\"field field-span-2 checkbox-field\">
                  <input
                    type=\"checkbox\"
                    checked={vipCanReserve}
                    onChange={(event) => setVipCanReserve(event.target.checked)}
                  />
                  <span>Puede negociarse una separación sin adelanto</span>
                </label>
                <label className=\"field\">
                  <span>Plazo especial (días)</span>
                  <input
                    type=\"number\"
                    min=\"1\"
                    max=\"365\"
                    value={vipTerm}
                    onChange={(event) => setVipTerm(event.target.value)}
                  />
                </label>
              </div>
            ) : (
              <div className=\"alert alert-warning\">
                <AlertTriangle size={17} /> El historial VIP se conservará aunque retires el
                beneficio.
              </div>
            )}"""
new_vip_block = """            <div className=\"form-grid form-grid-2\">
              <div className=\"alert alert-info field-span-2\">
                El adelanto mínimo se acuerda en cada venta. Aquí defines si puede ser S/ 0 y el
                plazo especial que se propondrá automáticamente.
              </div>
              <label className=\"field field-span-2 checkbox-field\">
                <input
                  type=\"checkbox\"
                  checked={vipCanReserve}
                  onChange={(event) => setVipCanReserve(event.target.checked)}
                />
                <span>Puede negociarse una separación sin adelanto</span>
              </label>
              <label className=\"field\">
                <span>Plazo especial (días)</span>
                <input
                  type=\"number\"
                  min=\"1\"
                  max=\"365\"
                  value={vipTerm}
                  onChange={(event) => setVipTerm(event.target.value)}
                />
              </label>
            </div>"""
replace_once("apps/web/src/pages/client-detail-page.tsx", old_vip_block, new_vip_block)
replace_once(
    "apps/web/src/pages/client-detail-page.tsx",
    "              <button\n                className=\"button button-primary\"\n                type=\"submit\"\n                disabled={vipMutation.isPending}\n              >\n                {vipMutation.isPending ? 'Guardando…' : 'Confirmar'}\n              </button>",
    "              {data.isVip ? (\n                <button\n                  className=\"button button-danger-soft\"\n                  type=\"button\"\n                  disabled={vipMutation.isPending}\n                  onClick={() => vipMutation.mutate(false)}\n                >\n                  <AlertTriangle size={16} /> Retirar condición VIP\n                </button>\n              ) : null}\n              <button\n                className=\"button button-primary\"\n                type=\"submit\"\n                disabled={vipMutation.isPending}\n              >\n                {vipMutation.isPending\n                  ? 'Guardando…'\n                  : data.isVip\n                    ? 'Guardar cambios VIP'\n                    : 'Confirmar condición VIP'}\n              </button>",
)
replace_once(
    "apps/web/src/pages/client-detail-page.tsx",
    "                <strong>Se negocia en cada venta</strong>",
    "                <strong>\n                  {data.vipProfile?.canReserveWithoutDeposit\n                    ? 'Puede acordarse desde S/ 0'\n                    : 'Requiere adelanto mayor que S/ 0'}\n                </strong>",
)

# Pago pendiente: adjuntar constancia después y mostrar el error en su tarjeta.
replace_once(
    "apps/web/src/features/payments/sale-payments-section.tsx",
    "  const [creditNoteReason, setCreditNoteReason] = useState('');",
    "  const [creditNoteReason, setCreditNoteReason] = useState('');\n  const [proofTargetId, setProofTargetId] = useState<string | null>(null);\n  const [proofEditFile, setProofEditFile] = useState<File | null>(null);\n  const [paymentActionError, setPaymentActionError] = useState<{ id: string; message: string } | null>(null);",
)
replace_once(
    "apps/web/src/features/payments/sale-payments-section.tsx",
    "      if (type === 'CONFIRM') return confirmPayment(id);",
    "      if (type === 'CONFIRM') {\n        const payment = financials.data?.payments.find((item) => item.id === id);\n        const requiresProof = payment?.parts.some((part) => part.requiresProof) ?? false;\n        if (requiresProof && payment?.proofs.length === 0) {\n          setProofTargetId(id);\n          throw new Error('Este pago requiere constancia. Usa Editar para adjuntarla antes de confirmar.');\n        }\n        return confirmPayment(id);\n      }",
)
replace_once(
    "apps/web/src/features/payments/sale-payments-section.tsx",
    "    onSuccess: async () => {\n      await invalidate();\n      setSensitiveAction(null);\n      setActionReason('');\n    },\n  });",
    "    onSuccess: async () => {\n      await invalidate();\n      setSensitiveAction(null);\n      setActionReason('');\n      setPaymentActionError(null);\n    },\n    onError: (error, variables) => {\n      if (variables.type === 'CONFIRM') {\n        setPaymentActionError({\n          id: variables.id,\n          message: error instanceof Error ? error.message : 'No se pudo confirmar el pago.',\n        });\n      }\n    },\n  });\n\n  const proofUploadMutation = useMutation({\n    mutationFn: async () => {\n      if (!proofTargetId || !proofEditFile) throw new Error('Selecciona una constancia.');\n      await uploadPaymentProof(proofTargetId, proofEditFile);\n    },\n    onSuccess: async () => {\n      await invalidate();\n      setProofTargetId(null);\n      setProofEditFile(null);\n      setPaymentActionError(null);\n    },\n    onError: (error) => {\n      if (proofTargetId) {\n        setPaymentActionError({\n          id: proofTargetId,\n          message: error instanceof Error ? error.message : 'No se pudo adjuntar la constancia.',\n        });\n      }\n    },\n  });",
)
replace_once(
    "apps/web/src/features/payments/sale-payments-section.tsx",
    "    paymentMutation.error ??\n    actionMutation.error ??\n    penaltyMutation.error ??",
    "    paymentMutation.error ??\n    penaltyMutation.error ??",
)
replace_once(
    "apps/web/src/features/payments/sale-payments-section.tsx",
    "                  {payment.rejectionReason ? (",
    "                  {payment.stateCode === 'PENDING' &&\n                  payment.parts.some((part) => part.requiresProof) &&\n                  payment.proofs.length === 0 ? (\n                    <div className=\"payment-proof-warning\">\n                      <span>Este pago requiere una constancia antes de confirmarse.</span>\n                      <button\n                        type=\"button\"\n                        className=\"button button-secondary button-compact\"\n                        onClick={() => {\n                          setProofTargetId(payment.id);\n                          setPaymentActionError(null);\n                        }}\n                      >\n                        <Upload size={14} /> Editar / adjuntar constancia\n                      </button>\n                    </div>\n                  ) : null}\n                  {proofTargetId === payment.id ? (\n                    <div className=\"payment-proof-editor\">\n                      <input\n                        type=\"file\"\n                        accept=\"image/jpeg,image/png,image/webp,application/pdf\"\n                        onChange={(event) => setProofEditFile(event.target.files?.[0] ?? null)}\n                      />\n                      <div className=\"inline-actions\">\n                        <button\n                          type=\"button\"\n                          className=\"button button-secondary button-compact\"\n                          onClick={() => {\n                            setProofTargetId(null);\n                            setProofEditFile(null);\n                          }}\n                        >\n                          Cancelar\n                        </button>\n                        <button\n                          type=\"button\"\n                          className=\"button button-primary button-compact\"\n                          disabled={!proofEditFile || proofUploadMutation.isPending}\n                          onClick={() => proofUploadMutation.mutate()}\n                        >\n                          {proofUploadMutation.isPending ? 'Subiendo…' : 'Guardar constancia'}\n                        </button>\n                      </div>\n                    </div>\n                  ) : null}\n                  {paymentActionError?.id === payment.id ? (\n                    <p className=\"field-error\">{paymentActionError.message}</p>\n                  ) : null}\n                  {payment.rejectionReason ? (",
)

# Liberaciones: estado comprensible por línea y penalidad junto al producto.
replace_once(
    "apps/web/src/pages/sale-detail-page.tsx",
    "const releaseLabels: Record<string, string> = {",
    "function saleItemStatusLabel(status: string, pending: boolean) {\n  if (pending) return 'Liberación pendiente';\n  if (status === 'RELEASED') return 'Liberado';\n  if (status === 'PARTIALLY_RELEASED') return 'Parcialmente liberado';\n  if (status === 'ACTIVE') return 'Reservado';\n  return status;\n}\n\nconst releaseLabels: Record<string, string> = {",
)
replace_once(
    "apps/web/src/pages/sale-detail-page.tsx",
    "                          <StatusBadge tone={item.itemStatus === 'RELEASED' ? 'danger' : 'success'}>\n                            {item.itemStatus}\n                          </StatusBadge>",
    "                          <StatusBadge\n                            tone={\n                              pendingLineIds.has(item.id)\n                                ? 'warning'\n                                : item.itemStatus === 'RELEASED'\n                                  ? 'danger'\n                                  : 'success'\n                            }\n                          >\n                            {saleItemStatusLabel(item.itemStatus, pendingLineIds.has(item.id))}\n                          </StatusBadge>",
)
replace_once(
    "apps/web/src/pages/sale-detail-page.tsx",
    "                    <StatusBadge tone={item.itemStatus === 'RELEASED' ? 'danger' : 'success'}>\n                      {item.itemStatus}\n                    </StatusBadge>",
    "                    <StatusBadge\n                      tone={\n                        pendingLineIds.has(item.id)\n                          ? 'warning'\n                          : item.itemStatus === 'RELEASED'\n                            ? 'danger'\n                            : 'success'\n                      }\n                    >\n                      {saleItemStatusLabel(item.itemStatus, pendingLineIds.has(item.id))}\n                    </StatusBadge>",
)
replace_once(
    "apps/web/src/pages/sale-detail-page.tsx",
    "                            Penalidad: <strong>{money(request.penaltyAmount)}</strong>",
    "                            Penalidad: <strong>{money(request.penaltyAmount)}</strong> —{' '}\n                            {requestProductName(request.saleItemId)}",
)

# Normalización de búsquedas de producto e inventario.
replace_once(
    "apps/api/src/modules/products/supabase-products.repository.ts",
    "function normalizeSearch(search: string): string {\n  return search\n    .replace(/[,%()]/g, ' ')\n    .trim()\n    .slice(0, 100);\n}",
    "function normalizeSearch(search: string): string {\n  return search\n    .normalize('NFD')\n    .replace(/[\\u0300-\\u036f]/g, '')\n    .replace(/[,%()]/g, ' ')\n    .trim()\n    .slice(0, 100);\n}\n\nfunction normalizeComparable(value: string | null | undefined): string {\n  return (value ?? '')\n    .normalize('NFD')\n    .replace(/[\\u0300-\\u036f]/g, '')\n    .toLocaleLowerCase('es');\n}",
)
replace_once(
    "apps/api/src/modules/products/supabase-products.repository.ts",
    "          .ilike('name', `%${search}%`)",
    "          .ilike('search_name_normalized', `%${search.toLocaleLowerCase('es')}%`)",
)
replace_once(
    "apps/api/src/modules/products/supabase-products.repository.ts",
    "          `code.ilike.%${search}%,name.ilike.%${search}%,character_name.ilike.%${search}%${franchiseFilter}`,
",
    "          `code.ilike.%${search}%,search_name_normalized.ilike.%${search.toLocaleLowerCase('es')}%,search_character_normalized.ilike.%${search.toLocaleLowerCase('es')}%${franchiseFilter}`,
",
)
old_inventory_search = """    if (query.search) {
      const search = normalizeSearch(query.search);
      if (search)
        inventoryQuery = inventoryQuery.or(
          `product_name.ilike.%${search}%,sku.ilike.%${search}%,product_code.ilike.%${search}%`,
        );
    }

    const { data, error } = await inventoryQuery.returns<InventoryViewRow[]>();"""
new_inventory_search = """    const { data, error } = await inventoryQuery.returns<InventoryViewRow[]>();"""
replace_once(
    "apps/api/src/modules/products/supabase-products.repository.ts",
    old_inventory_search,
    new_inventory_search,
)
replace_once(
    "apps/api/src/modules/products/supabase-products.repository.ts",
    "    const items: InventoryRow[] = (data ?? []).map((row) => ({",
    "    const search = query.search ? normalizeComparable(normalizeSearch(query.search)) : '';\n    const filteredRows = search\n      ? (data ?? []).filter((row) =>\n          normalizeComparable(\n            `${row.product_name} ${row.variant_name} ${row.product_code} ${row.sku} ${row.franchise_name ?? ''}`,\n          ).includes(search),\n        )\n      : (data ?? []);\n\n    const items: InventoryRow[] = filteredRows.map((row) => ({",
)

# Inventario siempre revalida al volver desde una venta.
replace_once(
    "apps/web/src/pages/inventory-page.tsx",
    "    placeholderData: (previous) => previous,\n  });",
    "    placeholderData: (previous) => previous,\n    refetchOnMount: 'always',\n  });",
)

# La ruta comodín también debe tratarse como 404 amigable.
replace_once(
    "apps/web/src/pages/route-error-page.tsx",
    "  const notFound = isRouteErrorResponse(error) && error.status === 404;",
    "  const notFound = !error || (isRouteErrorResponse(error) && error.status === 404);",
)

# Migración incremental 044: no reescribe ninguna migración ya desplegada.
migration = r'''-- Yukimi Gestión
-- Migración 044: correcciones de validación manual de ventas, clientes y vencimientos

begin;

create or replace function private.normalize_search_text(p_value text)
returns text
language sql
immutable
parallel safe
set search_path = ''
as $$
  select lower(translate(
    coalesce(p_value, ''),
    'ÁÀÄÂÃÅáàäâãåÉÈËÊéèëêÍÌÏÎíìïîÓÒÖÔÕóòöôõÚÙÜÛúùüûÑñÇç',
    'AAAAAAaaaaaaEEEEeeeeIIIIiiiiOOOOOoooooUUUUuuuuNnCc'
  ));
$$;

alter table public.products
  add column if not exists search_name_normalized text
  generated always as (private.normalize_search_text(name)) stored;
alter table public.products
  add column if not exists search_character_normalized text
  generated always as (private.normalize_search_text(character_name)) stored;
alter table public.franchises
  add column if not exists search_name_normalized text
  generated always as (private.normalize_search_text(name)) stored;

create index if not exists ix_products_search_name_normalized
  on public.products using gin (search_name_normalized extensions.gin_trgm_ops);
create index if not exists ix_products_search_character_normalized
  on public.products using gin (search_character_normalized extensions.gin_trgm_ops);
create index if not exists ix_franchises_search_name_normalized
  on public.franchises using gin (search_name_normalized extensions.gin_trgm_ops);

create or replace function private.require_client_document_v1()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if nullif(btrim(new.document_type), '') is null then
    raise exception 'El tipo de documento es obligatorio.' using errcode = '23514';
  end if;
  if nullif(btrim(new.document_number), '') is null then
    raise exception 'El número de documento es obligatorio.' using errcode = '23514';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_require_client_document_v1 on public.clients;
create trigger trg_require_client_document_v1
before insert or update of document_type, document_number on public.clients
for each row execute function private.require_client_document_v1();

create or replace view public.v_sales_overview
with (security_invoker = true)
as
select
  s.id,
  s.code,
  s.client_id,
  s.client_name_snapshot,
  s.client_phone_snapshot,
  s.sale_type_code,
  s.sales_channel_code,
  s.commercial_state_code,
  case
    when s.balance_amount > 0
      and s.due_at < now()
      and s.payment_state_code in ('UNPAID', 'PARTIAL', 'OVERDUE')
      and s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')
    then 'OVERDUE'
    else s.payment_state_code
  end as payment_state_code,
  s.delivery_state_code,
  s.currency_code,
  s.sold_at,
  s.reserved_at,
  s.due_at,
  s.subtotal,
  s.discount_total,
  s.penalty_total,
  s.shipping_charge_total,
  s.total_amount,
  s.paid_total,
  s.refunded_total,
  s.balance_amount,
  count(distinct si.id)::integer as item_lines,
  coalesce(sum(si.quantity), 0)::integer as total_units,
  s.created_by,
  creator.display_name as created_by_name,
  s.created_at,
  s.updated_at,
  s.version
from public.sales s
left join public.sale_items si
  on si.sale_id = s.id
 and si.item_status not in ('CANCELLED', 'RELEASED')
left join public.profiles creator on creator.id = s.created_by
group by s.id, creator.display_name;

create or replace function public.create_sale_v3(
  p_input jsonb,
  p_idempotency_key text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_sale_type text := coalesce(nullif(p_input ->> 'saleTypeCode', ''), 'REGULAR');
  v_due_reason text := nullif(btrim(p_input ->> 'dueDateReason'), '');
  v_due_at timestamptz := nullif(p_input ->> 'dueAt', '')::timestamptz;
  v_client_id uuid := nullif(p_input ->> 'clientId', '')::uuid;
  v_is_vip boolean;
  v_can_reserve_without_deposit boolean;
  v_minimum numeric;
begin
  if v_sale_type not in ('REGULAR', 'CUSTOM_ORDER') then
    raise exception 'Tipo de venta no permitido.';
  end if;
  if v_due_at is not null and length(coalesce(v_due_reason, '')) < 5 then
    raise exception 'Explica el motivo del plazo personalizado.';
  end if;

  select c.is_vip, coalesce(vp.can_reserve_without_deposit, false)
  into v_is_vip, v_can_reserve_without_deposit
  from public.clients c
  left join public.client_vip_profiles vp on vp.client_id = c.id
  where c.id = v_client_id;

  if coalesce(v_is_vip, false) then
    v_minimum := nullif(p_input ->> 'negotiatedMinimumDepositAmount', '')::numeric;
    if v_minimum is null then
      raise exception 'Registra el adelanto mínimo negociado para la venta VIP.';
    end if;
    if v_minimum = 0 and not v_can_reserve_without_deposit then
      raise exception 'Este cliente VIP no tiene habilitada la separación sin adelanto.' using errcode = 'P0001';
    end if;
  end if;

  v_result := public.create_sale_v2(p_input, p_idempotency_key);
  perform set_config('app.audit_reason', 'Confirmación de venta con condiciones comerciales', true);
  update public.sales
  set sale_type_code = v_sale_type,
      due_date_reason = v_due_reason,
      updated_by = private.current_actor_id()
  where id = (v_result ->> 'id')::uuid;
  return v_result;
end;
$$;

create or replace function public.get_sale_detail_v3(p_sale_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  v_result jsonb;
  v_reason text;
  v_payment_state text;
begin
  v_result := public.get_sale_detail_v2(p_sale_id);
  select
    due_date_reason,
    case
      when balance_amount > 0
        and due_at < now()
        and payment_state_code in ('UNPAID', 'PARTIAL', 'OVERDUE')
        and commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')
      then 'OVERDUE'
      else payment_state_code
    end
  into v_reason, v_payment_state
  from public.sales
  where id = p_sale_id;
  v_result := jsonb_set(v_result, '{dueDateReason}', coalesce(to_jsonb(v_reason), 'null'::jsonb), true);
  return jsonb_set(v_result, '{paymentStateCode}', to_jsonb(v_payment_state), true);
end;
$$;

create or replace function public.list_sales_v1(
  p_search text default null,
  p_filter text default 'ALL',
  p_page integer default 1,
  p_page_size integer default 20
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_offset integer := greatest(p_page - 1, 0) * p_page_size;
  v_total integer;
  v_items jsonb;
  v_summary jsonb;
  v_search text := nullif(private.normalize_search_text(btrim(p_search)), '');
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;
  if p_filter not in ('ALL', 'RESERVED', 'UNPAID', 'OVERDUE', 'CANCELLED') then
    raise exception 'Filtro de ventas inválido.';
  end if;

  with base as (
    select s.*
    from public.v_sales_overview s
    where (
      v_search is null
      or private.normalize_search_text(s.code) like '%' || v_search || '%'
      or private.normalize_search_text(s.client_name_snapshot) like '%' || v_search || '%'
      or private.normalize_search_text(s.client_phone_snapshot) like '%' || v_search || '%'
      or exists (
        select 1 from public.sale_items si
        where si.sale_id = s.id
          and (
            private.normalize_search_text(si.product_name_snapshot) like '%' || v_search || '%'
            or private.normalize_search_text(si.sku_snapshot) like '%' || v_search || '%'
          )
      )
    )
    and case p_filter
      when 'RESERVED' then s.commercial_state_code = 'RESERVED'
      when 'UNPAID' then s.payment_state_code = 'UNPAID' and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
      when 'OVERDUE' then s.payment_state_code = 'OVERDUE' and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
      when 'CANCELLED' then s.commercial_state_code in ('CANCELLED', 'ANNULLED')
      else true
    end
  )
  select count(*)::integer into v_total from base;

  with base as (
    select s.*
    from public.v_sales_overview s
    where (
      v_search is null
      or private.normalize_search_text(s.code) like '%' || v_search || '%'
      or private.normalize_search_text(s.client_name_snapshot) like '%' || v_search || '%'
      or private.normalize_search_text(s.client_phone_snapshot) like '%' || v_search || '%'
      or exists (
        select 1 from public.sale_items si
        where si.sale_id = s.id
          and (
            private.normalize_search_text(si.product_name_snapshot) like '%' || v_search || '%'
            or private.normalize_search_text(si.sku_snapshot) like '%' || v_search || '%'
          )
      )
    )
    and case p_filter
      when 'RESERVED' then s.commercial_state_code = 'RESERVED'
      when 'UNPAID' then s.payment_state_code = 'UNPAID' and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
      when 'OVERDUE' then s.payment_state_code = 'OVERDUE' and s.commercial_state_code not in ('CANCELLED', 'ANNULLED')
      when 'CANCELLED' then s.commercial_state_code in ('CANCELLED', 'ANNULLED')
      else true
    end
  )
  select coalesce(jsonb_agg(jsonb_build_object(
    'id', s.id,
    'code', s.code,
    'clientId', s.client_id,
    'clientName', s.client_name_snapshot,
    'clientPhone', s.client_phone_snapshot,
    'saleTypeCode', s.sale_type_code,
    'salesChannelCode', s.sales_channel_code,
    'commercialStateCode', s.commercial_state_code,
    'paymentStateCode', s.payment_state_code,
    'deliveryStateCode', s.delivery_state_code,
    'currencyCode', s.currency_code,
    'totalAmount', s.total_amount,
    'paidTotal', s.paid_total,
    'balanceAmount', s.balance_amount,
    'itemLines', s.item_lines,
    'totalUnits', s.total_units,
    'dueAt', s.due_at,
    'createdAt', s.created_at,
    'createdByName', s.created_by_name,
    'version', s.version
  ) order by s.created_at desc), '[]'::jsonb)
  into v_items
  from (
    select * from base
    order by created_at desc
    limit p_page_size offset v_offset
  ) s;

  select jsonb_build_object(
    'activeSales', count(*) filter (where commercial_state_code not in ('CANCELLED', 'ANNULLED'))::integer,
    'soldAmount', coalesce(sum(total_amount) filter (where commercial_state_code not in ('CANCELLED', 'ANNULLED')), 0),
    'pendingBalance', coalesce(sum(greatest(balance_amount, 0)) filter (where commercial_state_code not in ('CANCELLED', 'ANNULLED')), 0),
    'overdueSales', count(*) filter (where payment_state_code = 'OVERDUE' and commercial_state_code not in ('CANCELLED', 'ANNULLED'))::integer
  ) into v_summary
  from public.v_sales_overview;

  return jsonb_build_object(
    'items', v_items,
    'summary', v_summary,
    'page', greatest(p_page, 1),
    'pageSize', p_page_size,
    'total', v_total
  );
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
  v_search text := nullif(private.normalize_search_text(btrim(p_search)), '');
begin
  if not private.is_active_admin() then
    raise exception 'Usuario no autorizado.' using errcode = '42501';
  end if;

  with sale_stats as (
    select
      s.client_id,
      coalesce(sum(s.total_amount) filter (where s.commercial_state_code not in ('CANCELLED', 'ANNULLED')), 0)::numeric as total_purchased,
      coalesce(sum(greatest(s.balance_amount, 0)) filter (where s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')), 0)::numeric as balance_amount,
      count(*) filter (where s.due_at < now() and s.balance_amount > 0 and s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED'))::integer as overdue_sales,
      max(coalesce(s.sold_at, s.created_at)) filter (where s.commercial_state_code not in ('CANCELLED', 'ANNULLED')) as last_purchase_at
    from public.sales s
    group by s.client_id
  ), incident_stats as (
    select ci.client_id, count(*) filter (where ci.resolved_at is null)::integer as incident_count
    from public.client_incidents ci
    group by ci.client_id
  ), base as (
    select
      c.id, c.code, c.full_name, c.document_type, c.document_number, c.phone,
      c.email::text as email, c.is_vip, c.is_active, c.version,
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
      v_search is null
      or private.normalize_search_text(c.full_name) like '%' || v_search || '%'
      or private.normalize_search_text(c.code) like '%' || v_search || '%'
      or private.normalize_search_text(c.phone) like '%' || v_search || '%'
      or private.normalize_search_text(c.document_number) like '%' || v_search || '%'
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
      coalesce(sum(greatest(s.balance_amount, 0)) filter (where c.is_active and s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED')), 0)::numeric as pending_balance,
      count(distinct c.id) filter (where c.is_active and s.due_at < now() and s.balance_amount > 0 and s.commercial_state_code not in ('CANCELLED', 'ANNULLED', 'COMPLETED'))::integer as overdue_clients
    from public.clients c
    left join public.sales s on s.client_id = c.id
  )
  select jsonb_build_object(
    'items', coalesce((
      select jsonb_agg(jsonb_build_object(
        'id', p.id, 'code', p.code, 'fullName', p.full_name,
        'documentType', p.document_type, 'documentNumber', p.document_number,
        'phone', p.phone, 'email', p.email, 'isVip', p.is_vip, 'isActive', p.is_active,
        'totalPurchased', p.total_purchased, 'balanceAmount', p.balance_amount,
        'overdueSales', p.overdue_sales, 'lastPurchaseAt', p.last_purchase_at,
        'incidentCount', p.incident_count, 'defaultAddress', p.default_address, 'version', p.version
      ) order by p.is_active desc, p.full_name) from paged p
    ), '[]'::jsonb),
    'summary', (select jsonb_build_object(
      'activeClients', active_clients, 'vipClients', vip_clients,
      'pendingBalance', pending_balance, 'overdueClients', overdue_clients
    ) from global_summary),
    'page', greatest(p_page, 1),
    'pageSize', greatest(least(p_page_size, 100), 1),
    'total', (select count(*)::integer from filtered)
  ) into v_result;

  return v_result;
end;
$$;

grant execute on function public.list_sales_v1(text, text, integer, integer) to authenticated;
grant execute on function public.list_clients_v1(text, text, integer, integer) to authenticated;
grant execute on function public.create_sale_v3(jsonb, text) to authenticated;
grant execute on function public.get_sale_detail_v3(uuid) to authenticated;

notify pgrst, 'reload schema';
commit;
'''
write("supabase/migrations/044_sales_validation_fixes.sql", migration)

test = r'''begin;

create extension if not exists pgtap with schema extensions;
set local search_path = extensions, public, pg_catalog;

select plan(8);

select is(private.normalize_search_text('María López'), 'maria lopez', 'La búsqueda ignora tildes');
select is(private.normalize_search_text('PELÚCHE'), 'peluche', 'La normalización conserva texto comparable');
select has_column('products', 'search_name_normalized', 'Productos tiene nombre normalizado');
select has_column('franchises', 'search_name_normalized', 'Franquicias tiene nombre normalizado');
select ok(to_regprocedure('public.create_sale_v3(jsonb,text)') is not null, 'Venta v3 continúa disponible');
select ok(to_regprocedure('public.list_sales_v1(text,text,integer,integer)') is not null, 'Lista de ventas continúa disponible');
select ok(to_regprocedure('public.list_clients_v1(text,text,integer,integer)') is not null, 'Lista de clientes continúa disponible');
select ok(pg_get_viewdef('public.v_sales_overview'::regclass, true) ilike '%OVERDUE%', 'La vista calcula vencimiento efectivo');

select * from finish();
rollback;
'''
write("supabase/tests/database/013_sales_validation_fixes.test.sql", test)

print("Correcciones de validación de ventas aplicadas.")
