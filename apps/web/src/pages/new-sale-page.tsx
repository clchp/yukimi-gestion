import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InventoryRow } from '@yukimi/shared';
import { ArrowLeft, ArrowRight, Check, Search, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import { SearchableNativeSelect } from '../components/ui/searchable-native-select';
import { useFeedback } from '../components/ui/feedback-provider';
import { getClient, getClients } from '../features/clients/clients-api';
import { getInventory } from '../features/products/products-api';
import {
  confirmSaleDraft,
  getSaleDraft,
  getSaleSupportData,
  saveSaleDraft,
} from '../features/sales/sales-api';

interface ProductGroup {
  variantId: string;
  productId: string;
  productName: string;
  variantName: string;
  sku: string;
  salePrice: number;
  rows: InventoryRow[];
  totalAvailable: number;
}

interface DraftLine {
  group: ProductGroup;
  quantity: number;
  allocations: Record<string, number>;
  finalUnitPrice: number;
  discountTypeCode: string;
  discountReason: string;
}

type FieldErrors = Record<string, string>;

const steps = ['Cliente', 'Productos', 'Condiciones', 'Confirmación'];
const money = (value: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);

function groupInventory(items: InventoryRow[]): ProductGroup[] {
  const groups = new Map<string, ProductGroup>();
  for (const row of items) {
    let group = groups.get(row.variantId);
    if (!group) {
      group = {
        variantId: row.variantId,
        productId: row.productId,
        productName: row.productName,
        variantName: row.variantName,
        sku: row.sku,
        salePrice: row.salePrice,
        rows: [],
        totalAvailable: 0,
      };
      groups.set(row.variantId, group);
    }
    group.rows.push(row);
    group.totalAvailable += row.availableQuantity;
  }
  return [...groups.values()]
    .filter((group) => group.totalAvailable > 0)
    .map((group) => ({
      ...group,
      rows: [...group.rows].sort((left, right) =>
        left.warehouseName.localeCompare(right.warehouseName, 'es', { sensitivity: 'base' }),
      ),
    }))
    .sort((left, right) =>
      `${left.productName} ${left.variantName}`.localeCompare(
        `${right.productName} ${right.variantName}`,
        'es',
        { sensitivity: 'base' },
      ),
    );
}

function dateAfterDays(days: number) {
  const date = new Date();
  date.setHours(12, 0, 0, 0);
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
}

export function NewSalePage() {
  const navigate = useNavigate();
  const location = useLocation();
  const queryClient = useQueryClient();
  const { notify } = useFeedback();
  const { draftId } = useParams<{ draftId?: string }>();
  const [searchParams] = useSearchParams();
  const [step, setStep] = useState(1);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [salesChannelCode, setSalesChannelCode] = useState('WHATSAPP');
  const [deliveryMode, setDeliveryMode] = useState<'PENDING' | 'ACCUMULATED'>('ACCUMULATED');
  const [dueDate, setDueDate] = useState('');
  const [dueDateReason, setDueDateReason] = useState('');
  const [saleTypeCode, setSaleTypeCode] = useState<'REGULAR' | 'CUSTOM_ORDER'>('REGULAR');
  const [draftVersion, setDraftVersion] = useState<number | null>(null);
  const [hydratedDraftId, setHydratedDraftId] = useState<string | null>(null);
  const [negotiatedMinimumDeposit, setNegotiatedMinimumDeposit] = useState('');
  const [negotiatedDepositReason, setNegotiatedDepositReason] = useState('');
  const [notes, setNotes] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [actionError, setActionError] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  const clients = useQuery({
    queryKey: ['sale-client-search', clientSearch],
    queryFn: () => getClients({ search: clientSearch, filter: 'ACTIVE', page: 1, pageSize: 20 }),
  });
  const clientDetail = useQuery({
    queryKey: ['client', selectedClientId],
    queryFn: () => getClient(selectedClientId as string),
    enabled: Boolean(selectedClientId),
  });
  const inventory = useQuery({
    queryKey: ['sale-product-search', productSearch],
    queryFn: () => getInventory({ search: productSearch, includeVirtual: false }),
  });
  const support = useQuery({ queryKey: ['sale-support'], queryFn: getSaleSupportData });
  const draft = useQuery({
    queryKey: ['sale-draft', draftId],
    queryFn: () => getSaleDraft(draftId as string),
    enabled: Boolean(draftId),
  });

  const productGroups = useMemo(
    () => groupInventory(inventory.data?.items ?? []),
    [inventory.data?.items],
  );

  useEffect(() => {
    if (!salesChannelCode && support.data?.salesChannels[0]) {
      setSalesChannelCode(support.data.salesChannels[0].code);
    }
  }, [salesChannelCode, support.data]);

  useEffect(() => {
    const returnedClientId = searchParams.get('clientId');
    if (returnedClientId) setSelectedClientId(returnedClientId);
  }, [searchParams]);

  useEffect(() => {
    if (!clientDetail.data?.isVip) return;
    setNegotiatedMinimumDeposit((current) => (current === '' ? '0' : current));
  }, [clientDetail.data?.isVip]);

  useEffect(() => {
    if (!draft.data || hydratedDraftId === draft.data.id || productGroups.length === 0) return;
    const payload = draft.data.payload;
    const grouped = new Map<string, DraftLine>();
    for (const item of payload.items) {
      const group = productGroups.find((candidate) => candidate.variantId === item.variantId);
      if (!group || !item.warehouseId) continue;
      const current = grouped.get(item.variantId) ?? {
        group,
        quantity: 0,
        allocations: Object.fromEntries(group.rows.map((row) => [row.warehouseId, 0])),
        finalUnitPrice: item.finalUnitPrice,
        discountTypeCode: item.discountTypeCode ?? 'MANUAL',
        discountReason: item.discountReason ?? '',
      };
      current.quantity += item.quantity;
      current.allocations[item.warehouseId] =
        (current.allocations[item.warehouseId] ?? 0) + item.quantity;
      grouped.set(item.variantId, current);
    }
    setSelectedClientId(payload.clientId);
    setSalesChannelCode(payload.salesChannelCode);
    setDeliveryMode(payload.deliveryMode);
    setDueDate(payload.dueAt?.slice(0, 10) ?? '');
    setDueDateReason(payload.dueDateReason ?? '');
    setSaleTypeCode(payload.saleTypeCode);
    setNegotiatedMinimumDeposit(
      payload.negotiatedMinimumDepositAmount == null
        ? ''
        : String(payload.negotiatedMinimumDepositAmount),
    );
    setNegotiatedDepositReason(payload.negotiatedMinimumDepositReason ?? '');
    setNotes(payload.notes ?? '');
    setLines([...grouped.values()]);
    setDraftVersion(draft.data.version);
    setHydratedDraftId(draft.data.id);
  }, [draft.data, hydratedDraftId, productGroups]);

  const subtotal = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.group.salePrice, 0),
    [lines],
  );
  const total = useMemo(
    () => lines.reduce((sum, line) => sum + line.quantity * line.finalUnitPrice, 0),
    [lines],
  );
  const discount = subtotal - total;
  const paymentTermDays =
    clientDetail.data?.vipProfile?.paymentTermDays ?? support.data?.defaultPaymentTermDays ?? 14;
  const proposedDueDate = dateAfterDays(paymentTermDays);

  function clearErrors(...keys: string[]) {
    setFieldErrors((current) => {
      const next = { ...current };
      for (const key of keys) delete next[key];
      return next;
    });
    setActionError(null);
  }

  function buildInput() {
    return {
      clientId: selectedClientId,
      salesChannelCode,
      currencyCode: 'PEN' as const,
      deliveryMode,
      dueAt: dueDate ? `${dueDate}T23:59:59-05:00` : null,
      dueDateReason: dueDate ? dueDateReason.trim() : null,
      saleTypeCode,
      negotiatedMinimumDepositAmount: clientDetail.data?.isVip
        ? Number(negotiatedMinimumDeposit)
        : null,
      negotiatedMinimumDepositReason: clientDetail.data?.isVip
        ? negotiatedDepositReason.trim()
        : null,
      notes: notes.trim() || null,
      items: lines.flatMap((line) =>
        line.group.rows.flatMap((row) => {
          const quantity = line.allocations[row.warehouseId] ?? 0;
          if (quantity <= 0) return [];
          return [
            {
              variantId: line.group.variantId,
              warehouseId: row.warehouseId,
              quantity,
              originalUnitPrice: line.group.salePrice,
              finalUnitPrice: line.finalUnitPrice,
              discountTypeCode:
                line.finalUnitPrice < line.group.salePrice ? line.discountTypeCode : null,
              discountReason:
                line.finalUnitPrice < line.group.salePrice ? line.discountReason.trim() : null,
              notes: null,
            },
          ];
        }),
      ),
    };
  }

  const invalidateAfterSale = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sales'] }),
      queryClient.invalidateQueries({ queryKey: ['sale-drafts'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['products'] }),
      queryClient.invalidateQueries({ queryKey: ['client', selectedClientId] }),
    ]);
  };

  const draftSave = useMutation({
    mutationFn: () =>
      saveSaleDraft({ draftId: draftId ?? null, version: draftVersion, input: buildInput() }),
    onSuccess: async (result) => {
      setDraftVersion(result.version);
      setActionError(null);
      await queryClient.invalidateQueries({ queryKey: ['sale-drafts'] });
      notify({
        title: 'Borrador guardado',
        message: `${result.code} se guardó sin reservar stock.`,
        tone: 'success',
      });
      if (!draftId) navigate(`/ventas/borradores/${result.id}`, { replace: true });
    },
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : 'No se pudo guardar el borrador.'),
  });

  const save = useMutation({
    mutationFn: async () => {
      const saved = await saveSaleDraft({
        draftId: draftId ?? null,
        version: draftVersion,
        input: buildInput(),
      });
      return confirmSaleDraft(saved.id, saved.version, idempotencyKey.current);
    },
    onSuccess: async (result) => {
      await invalidateAfterSale();
      navigate(`/ventas/${result.id}`);
    },
    onError: (error) =>
      setActionError(error instanceof Error ? error.message : 'No se pudo confirmar la venta.'),
  });

  function addProduct(group: ProductGroup) {
    clearErrors('products');
    if (lines.some((line) => line.group.variantId === group.variantId)) {
      setFieldErrors((current) => ({
        ...current,
        products: 'Este producto ya está agregado. Modifica sus cantidades en la tarjeta inferior.',
      }));
      return;
    }
    setLines((current) => [
      ...current,
      {
        group,
        quantity: 1,
        allocations: Object.fromEntries(group.rows.map((row) => [row.warehouseId, 0])),
        finalUnitPrice: group.salePrice,
        discountTypeCode: 'MANUAL',
        discountReason: '',
      },
    ]);
  }

  function updateLine(index: number, patch: Partial<Omit<DraftLine, 'group' | 'allocations'>>) {
    clearErrors(`line-${index}-quantity`, `line-${index}-price`, `line-${index}-discount`);
    setLines((current) =>
      current.map((line, lineIndex) => (lineIndex === index ? { ...line, ...patch } : line)),
    );
  }

  function updateAllocation(index: number, warehouseId: string, quantity: number) {
    clearErrors(`line-${index}-allocation`);
    setLines((current) =>
      current.map((line, lineIndex) =>
        lineIndex === index
          ? { ...line, allocations: { ...line.allocations, [warehouseId]: quantity } }
          : line,
      ),
    );
  }

  function validateClient() {
    if (selectedClientId) return true;
    setFieldErrors((current) => ({ ...current, client: 'Selecciona un cliente para continuar.' }));
    return false;
  }

  function validateProducts() {
    const errors: FieldErrors = {};
    if (lines.length === 0) errors.products = 'Agrega al menos un producto.';
    lines.forEach((line, index) => {
      if (!Number.isInteger(line.quantity) || line.quantity < 1) {
        errors[`line-${index}-quantity`] = 'La cantidad debe ser de al menos 1 unidad.';
      } else if (line.quantity > line.group.totalAvailable) {
        errors[`line-${index}-quantity`] =
          `Solo hay ${line.group.totalAvailable} unidades disponibles en total.`;
      }
      let allocated = 0;
      for (const row of line.group.rows) {
        const amount = line.allocations[row.warehouseId] ?? 0;
        if (!Number.isInteger(amount) || amount < 0) {
          errors[`line-${index}-allocation`] =
            'Las cantidades por almacén deben ser enteros desde 0.';
          break;
        }
        if (amount > row.availableQuantity) {
          errors[`line-${index}-allocation`] =
            `${row.warehouseName} solo tiene ${row.availableQuantity} unidades disponibles.`;
          break;
        }
        allocated += amount;
      }
      if (!errors[`line-${index}-allocation`] && allocated !== line.quantity) {
        errors[`line-${index}-allocation`] =
          `Distribuye exactamente ${line.quantity} unidad(es). Actualmente asignaste ${allocated}.`;
      }
      if (!Number.isFinite(line.finalUnitPrice) || line.finalUnitPrice < 0) {
        errors[`line-${index}-price`] = 'El precio final no puede ser negativo.';
      } else if (line.finalUnitPrice > line.group.salePrice) {
        errors[`line-${index}-price`] = 'El precio final no puede superar el precio original.';
      }
      if (
        line.finalUnitPrice < line.group.salePrice &&
        (!line.discountTypeCode || line.discountReason.trim().length < 3)
      ) {
        errors[`line-${index}-discount`] =
          'Todo descuento requiere un tipo y un motivo de al menos 3 caracteres.';
      }
    });
    setFieldErrors((current) => ({ ...current, ...errors }));
    return Object.keys(errors).length === 0;
  }

  function validateConditions() {
    const errors: FieldErrors = {};
    if (!salesChannelCode) errors.channel = 'Selecciona el canal de venta.';
    if (dueDate && dueDateReason.trim().length < 5) {
      errors.dueDateReason = 'Explica el motivo del vencimiento personalizado.';
    }
    if (clientDetail.data?.isVip) {
      const minimum = Number(negotiatedMinimumDeposit);
      if (negotiatedMinimumDeposit === '' || !Number.isFinite(minimum) || minimum < 0) {
        errors.vipMinimum = 'Registra un adelanto mínimo válido.';
      } else if (minimum > total) {
        errors.vipMinimum = 'El adelanto mínimo no puede superar el total de la venta.';
      } else if (minimum === 0 && !clientDetail.data.vipProfile?.canReserveWithoutDeposit) {
        errors.vipMinimum =
          'Este cliente VIP no tiene habilitada la separación sin adelanto. Ingresa un monto mayor que 0 o edita su condición VIP.';
      }
      if (negotiatedDepositReason.trim().length < 3) {
        errors.vipReason = 'Explica el acuerdo de separación de esta venta VIP.';
      }
    }
    setFieldErrors((current) => ({ ...current, ...errors }));
    return Object.keys(errors).length === 0;
  }

  function validateAll() {
    setFieldErrors({});
    setActionError(null);
    if (!validateClient()) {
      setStep(1);
      return false;
    }
    if (!validateProducts()) {
      setStep(2);
      return false;
    }
    if (!validateConditions()) {
      setStep(3);
      return false;
    }
    return true;
  }

  function next() {
    setActionError(null);
    const valid =
      step === 1 ? validateClient() : step === 2 ? validateProducts() : validateConditions();
    if (valid) setStep((value) => Math.min(4, value + 1));
  }

  const returnTo = location.pathname;

  return (
    <main className="page sale-wizard-page">
      <button className="back-link" onClick={() => navigate('/ventas')}>
        <ArrowLeft size={17} /> Volver a ventas
      </button>
      <PageHeader
        eyebrow="Registro guiado"
        title={draftId ? 'Editar borrador de venta' : 'Nueva venta o reserva'}
        description="Al confirmar, el stock se mueve de disponible a reservado de forma atómica."
      />

      <div className="stepper">
        {steps.map((label, index) => {
          const number = index + 1;
          return (
            <button
              key={label}
              className={`${number === step ? 'active' : ''} ${number < step ? 'complete' : ''}`}
              onClick={() => number < step && setStep(number)}
            >
              <span>{number < step ? <Check size={15} /> : number}</span>
              <b>{label}</b>
            </button>
          );
        })}
      </div>

      {draft.isError ? (
        <div className="alert alert-error">No se pudo cargar el borrador.</div>
      ) : null}

      <section className="wizard-layout">
        <div className="wizard-main">
          {step === 1 ? (
            <Panel title="Selecciona el cliente" subtitle="Solo se muestran clientes activos.">
              <div className="customer-search">
                <label className="search-field">
                  <Search size={18} />
                  <input
                    value={clientSearch}
                    onChange={(event) => setClientSearch(event.target.value)}
                    placeholder="Buscar por nombre, teléfono, DNI o código…"
                  />
                </label>
                <button
                  className="button button-secondary"
                  onClick={() =>
                    navigate(`/clientes/nuevo?returnTo=${encodeURIComponent(returnTo)}`)
                  }
                >
                  <UserPlus size={17} /> Crear cliente
                </button>
              </div>
              {fieldErrors.client ? (
                <p className="field-error-inline">{fieldErrors.client}</p>
              ) : null}
              <div className="selection-list">
                {clients.data?.items.map((client) => (
                  <button
                    key={client.id}
                    className={`selection-row ${selectedClientId === client.id ? 'selected' : ''}`}
                    onClick={() => {
                      setSelectedClientId(client.id);
                      clearErrors('client');
                    }}
                  >
                    <span className="avatar">{client.fullName.slice(0, 1).toUpperCase()}</span>
                    <span>
                      <strong>{client.fullName}</strong>
                      <small>
                        {client.code} · {client.documentNumber ?? 'Sin documento'} ·{' '}
                        {client.phone ?? 'Sin celular'} · Saldo {money(client.balanceAmount)}
                      </small>
                    </span>
                    {client.isVip ? (
                      <StatusBadge tone="primary">VIP</StatusBadge>
                    ) : (
                      <StatusBadge>
                        {client.overdueSales ? `${client.overdueSales} vencida(s)` : 'Regular'}
                      </StatusBadge>
                    )}
                  </button>
                ))}
              </div>
              {clientDetail.data ? (
                <div className="info-grid">
                  <div>
                    <span>Saldo pendiente</span>
                    <strong>{money(clientDetail.data.stats.balanceAmount)}</strong>
                  </div>
                  <div>
                    <span>Plazo</span>
                    <strong>{paymentTermDays} días</strong>
                  </div>
                  <div>
                    <span>Separación VIP</span>
                    <strong>
                      {clientDetail.data.isVip
                        ? clientDetail.data.vipProfile?.canReserveWithoutDeposit
                          ? 'Puede acordarse desde S/ 0'
                          : 'Requiere adelanto mayor que S/ 0'
                        : 'Condición regular'}
                    </strong>
                  </div>
                </div>
              ) : null}
            </Panel>
          ) : null}

          {step === 2 ? (
            <Panel
              title="Agrega productos"
              subtitle="El producto aparece una sola vez. Distribuye manualmente la cantidad entre Lorena y Camila."
            >
              <label className="search-field product-search-large">
                <Search size={18} />
                <input
                  value={productSearch}
                  onChange={(event) => setProductSearch(event.target.value)}
                  placeholder="Buscar por nombre, código, SKU o franquicia…"
                />
              </label>
              {fieldErrors.products ? (
                <p className="field-error-inline">{fieldErrors.products}</p>
              ) : null}
              <div className="sale-product-results">
                {productGroups.slice(0, 30).map((group) => (
                  <button
                    className="sale-product-result"
                    key={group.variantId}
                    onClick={() => addProduct(group)}
                  >
                    <span>
                      <strong>{group.productName}</strong>
                      <small>
                        {group.variantName} · {group.sku}
                      </small>
                    </span>
                    <span className="sale-product-result-summary">
                      <strong>{money(group.salePrice)}</strong>
                      <small>
                        Total: {group.totalAvailable} ·{' '}
                        {group.rows
                          .map((row) => `${row.warehouseName} ${row.availableQuantity}`)
                          .join(' · ')}
                      </small>
                    </span>
                  </button>
                ))}
              </div>

              <div className="selected-product-list">
                {lines.map((line, index) => {
                  const highestCost = Math.max(
                    ...line.group.rows.map((row) => row.currentUnitCostPen ?? 0),
                  );
                  return (
                    <div
                      className="selected-product-row sale-line-editor"
                      key={line.group.variantId}
                    >
                      <div className="selected-product-copy">
                        <strong>{line.group.productName}</strong>
                        <small>
                          {line.group.variantName} · {line.group.sku}
                        </small>
                        <span>Disponible total: {line.group.totalAvailable}</span>
                      </div>
                      <label>
                        Cantidad total
                        <input
                          type="number"
                          min="1"
                          max={line.group.totalAvailable}
                          value={line.quantity}
                          onChange={(event) =>
                            updateLine(index, { quantity: Number(event.target.value) })
                          }
                          aria-invalid={Boolean(fieldErrors[`line-${index}-quantity`])}
                        />
                      </label>
                      <label>
                        Precio final
                        <input
                          type="number"
                          min="0"
                          max={line.group.salePrice}
                          step="0.01"
                          value={line.finalUnitPrice}
                          onChange={(event) =>
                            updateLine(index, { finalUnitPrice: Number(event.target.value) })
                          }
                          aria-invalid={Boolean(fieldErrors[`line-${index}-price`])}
                        />
                      </label>
                      <button
                        className="icon-button danger-icon"
                        aria-label={`Quitar ${line.group.productName}`}
                        onClick={() => {
                          setLines((current) =>
                            current.filter((_, itemIndex) => itemIndex !== index),
                          );
                          setFieldErrors({});
                        }}
                      >
                        <Trash2 size={17} />
                      </button>

                      {fieldErrors[`line-${index}-quantity`] ? (
                        <p className="sale-inline-error">{fieldErrors[`line-${index}-quantity`]}</p>
                      ) : null}
                      {fieldErrors[`line-${index}-price`] ? (
                        <p className="sale-inline-error">{fieldErrors[`line-${index}-price`]}</p>
                      ) : null}

                      <div className="sale-line-allocations">
                        {line.group.rows.map((row) => (
                          <label className="sale-allocation-field" key={row.warehouseId}>
                            <span>
                              <strong>{row.warehouseName}</strong>
                              <small>{row.availableQuantity} disponibles</small>
                            </span>
                            <input
                              type="number"
                              min="0"
                              max={row.availableQuantity}
                              value={line.allocations[row.warehouseId] ?? 0}
                              onChange={(event) =>
                                updateAllocation(index, row.warehouseId, Number(event.target.value))
                              }
                              aria-label={`Cantidad desde ${row.warehouseName}`}
                              aria-invalid={Boolean(fieldErrors[`line-${index}-allocation`])}
                            />
                          </label>
                        ))}
                      </div>
                      {fieldErrors[`line-${index}-allocation`] ? (
                        <p className="sale-inline-error">
                          {fieldErrors[`line-${index}-allocation`]}
                        </p>
                      ) : null}

                      {line.finalUnitPrice < line.group.salePrice ? (
                        <>
                          <label>
                            Tipo de descuento
                            <SearchableNativeSelect
                              value={line.discountTypeCode}
                              onChange={(event) =>
                                updateLine(index, { discountTypeCode: event.target.value })
                              }
                            >
                              {support.data?.discountTypes.map((type) => (
                                <option key={type.code} value={type.code}>
                                  {type.name}
                                </option>
                              ))}
                            </SearchableNativeSelect>
                          </label>
                          <label className="sale-discount-reason">
                            Motivo del descuento
                            <input
                              value={line.discountReason}
                              onChange={(event) =>
                                updateLine(index, { discountReason: event.target.value })
                              }
                              placeholder="Motivo obligatorio"
                              aria-invalid={Boolean(fieldErrors[`line-${index}-discount`])}
                            />
                          </label>
                        </>
                      ) : null}
                      {fieldErrors[`line-${index}-discount`] ? (
                        <p className="sale-inline-error">{fieldErrors[`line-${index}-discount`]}</p>
                      ) : null}
                      {highestCost > 0 && line.finalUnitPrice < highestCost ? (
                        <div className="below-cost-warning">
                          El precio queda por debajo del costo vigente de {money(highestCost)}.
                          Puedes continuar, pero el motivo del descuento quedará auditado.
                        </div>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            </Panel>
          ) : null}

          {step === 3 ? (
            <Panel
              title="Condiciones de la reserva"
              subtitle="Define el vencimiento y el acuerdo comercial antes de reservar el stock."
            >
              <div className="form-grid form-grid-2 sale-conditions-grid">
                <label className="field">
                  <span>Canal de venta</span>
                  <SearchableNativeSelect
                    value={salesChannelCode}
                    onChange={(event) => {
                      setSalesChannelCode(event.target.value);
                      clearErrors('channel');
                    }}
                  >
                    {support.data?.salesChannels.map((channel) => (
                      <option key={channel.code} value={channel.code}>
                        {channel.name}
                      </option>
                    ))}
                  </SearchableNativeSelect>
                  {fieldErrors.channel ? (
                    <small className="field-error">{fieldErrors.channel}</small>
                  ) : null}
                </label>
                <label className="field">
                  <span>Tipo de venta</span>
                  <SearchableNativeSelect
                    value={saleTypeCode}
                    onChange={(event) =>
                      setSaleTypeCode(event.target.value as 'REGULAR' | 'CUSTOM_ORDER')
                    }
                  >
                    <option value="REGULAR">Regular</option>
                    <option value="CUSTOM_ORDER">Pedido personalizado</option>
                  </SearchableNativeSelect>
                  {saleTypeCode === 'CUSTOM_ORDER' ? (
                    <small>
                      Se identificará y reportará por separado; requiere stock disponible.
                    </small>
                  ) : null}
                </label>
                <label className="field sale-due-field">
                  <span>Fecha de vencimiento opcional</span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(event) => {
                      setDueDate(event.target.value);
                      clearErrors('dueDateReason');
                    }}
                  />
                  <small>
                    Vacía: se aplicará el plazo {clientDetail.data?.isVip ? 'VIP' : 'normal'} de{' '}
                    {paymentTermDays} días.
                  </small>
                </label>
                <label className="field sale-due-reason-field">
                  <span>
                    Motivo del vencimiento {dueDate ? '*' : '(se habilita al cambiar la fecha)'}
                  </span>
                  <input
                    disabled={!dueDate}
                    minLength={5}
                    value={dueDateReason}
                    onChange={(event) => {
                      setDueDateReason(event.target.value);
                      clearErrors('dueDateReason');
                    }}
                    placeholder="Acuerdo específico con el cliente"
                    aria-invalid={Boolean(fieldErrors.dueDateReason)}
                  />
                  {fieldErrors.dueDateReason ? (
                    <small className="field-error">{fieldErrors.dueDateReason}</small>
                  ) : null}
                </label>
              </div>

              <div className="sale-proposed-due">
                Vencimiento que se aplicará: <strong>{dueDate || proposedDueDate}</strong> ·{' '}
                {dueDate ? 'fecha personalizada' : `${paymentTermDays} días`}
              </div>

              {clientDetail.data?.isVip ? (
                <div className="vip-sale-terms">
                  <div className="alert alert-info">
                    Para clientes VIP, el adelanto mínimo se acuerda por venta. El valor 0 solo se
                    permite cuando el perfil tiene habilitada la separación sin adelanto.
                  </div>
                  <div className="form-grid form-grid-2">
                    <label className="field">
                      <span>Adelanto mínimo acordado (S/) *</span>
                      <input
                        type="number"
                        min="0"
                        max={total}
                        step="0.01"
                        value={negotiatedMinimumDeposit}
                        onChange={(event) => {
                          setNegotiatedMinimumDeposit(event.target.value);
                          clearErrors('vipMinimum');
                        }}
                        aria-invalid={Boolean(fieldErrors.vipMinimum)}
                      />
                      {fieldErrors.vipMinimum ? (
                        <small className="field-error">{fieldErrors.vipMinimum}</small>
                      ) : null}
                    </label>
                    <label className="field">
                      <span>Motivo o criterio del acuerdo *</span>
                      <input
                        value={negotiatedDepositReason}
                        onChange={(event) => {
                          setNegotiatedDepositReason(event.target.value);
                          clearErrors('vipReason');
                        }}
                        placeholder="Margen, producto, historial…"
                        aria-invalid={Boolean(fieldErrors.vipReason)}
                      />
                      {fieldErrors.vipReason ? (
                        <small className="field-error">{fieldErrors.vipReason}</small>
                      ) : null}
                    </label>
                  </div>
                </div>
              ) : null}

              <div className="choice-grid sale-delivery-choices">
                <label
                  className={`choice-card ${deliveryMode === 'ACCUMULATED' ? 'selected' : ''}`}
                >
                  <input
                    type="radio"
                    checked={deliveryMode === 'ACCUMULATED'}
                    onChange={() => setDeliveryMode('ACCUMULATED')}
                  />
                  <span>
                    <strong>Acumula almacén</strong>
                    <small>
                      La mercadería queda reservada mientras el cliente sigue comprando.
                    </small>
                  </span>
                </label>
                <label className={`choice-card ${deliveryMode === 'PENDING' ? 'selected' : ''}`}>
                  <input
                    type="radio"
                    checked={deliveryMode === 'PENDING'}
                    onChange={() => setDeliveryMode('PENDING')}
                  />
                  <span>
                    <strong>Entrega pendiente</strong>
                    <small>La agencia o el método de entrega se podrá registrar después.</small>
                  </span>
                </label>
              </div>
              <label className="field">
                <span>Notas internas</span>
                <textarea
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Acuerdos, referencias o información interna…"
                />
              </label>
            </Panel>
          ) : null}

          {step === 4 ? (
            <Panel
              title="Revisa antes de confirmar"
              subtitle="La operación se ejecuta en una sola transacción: venta, líneas y reserva de stock."
            >
              <div className="review-sections">
                <div>
                  <span>Cliente</span>
                  <strong>
                    {clientDetail.data?.fullName ?? '—'}
                    {clientDetail.data?.isVip ? ' · VIP' : ''}
                  </strong>
                </div>
                <div>
                  <span>Productos</span>
                  <strong>
                    {lines.reduce((sum, line) => sum + line.quantity, 0)} unidades en{' '}
                    {
                      new Set(
                        lines.flatMap((line) =>
                          line.group.rows
                            .filter((row) => (line.allocations[row.warehouseId] ?? 0) > 0)
                            .map((row) => row.warehouseId),
                        ),
                      ).size
                    }{' '}
                    almacén(es)
                  </strong>
                </div>
                <div>
                  <span>Subtotal</span>
                  <strong>{money(subtotal)}</strong>
                </div>
                <div>
                  <span>Descuentos</span>
                  <strong>{money(discount)}</strong>
                </div>
                <div>
                  <span>Total</span>
                  <strong>{money(total)}</strong>
                </div>
                <div>
                  <span>Tipo</span>
                  <strong>
                    {saleTypeCode === 'CUSTOM_ORDER' ? 'Pedido personalizado' : 'Venta regular'}
                  </strong>
                </div>
                <div>
                  <span>Entrega</span>
                  <strong>
                    {deliveryMode === 'ACCUMULATED' ? 'Acumula almacén' : 'Pendiente de definir'}
                  </strong>
                </div>
                <div>
                  <span>Vencimiento</span>
                  <strong>
                    {dueDate || proposedDueDate}
                    {dueDate ? ` · ${dueDateReason}` : ` · plazo de ${paymentTermDays} días`}
                  </strong>
                </div>
                {clientDetail.data?.isVip ? (
                  <>
                    <div>
                      <span>Adelanto mínimo acordado</span>
                      <strong>{money(Number(negotiatedMinimumDeposit) || 0)}</strong>
                    </div>
                    <div>
                      <span>Motivo del acuerdo VIP</span>
                      <strong>{negotiatedDepositReason || '—'}</strong>
                    </div>
                  </>
                ) : null}
              </div>

              <div className="review-allocation-list">
                {lines.map((line) => (
                  <div className="detail-note" key={line.group.variantId}>
                    <strong>{line.group.productName}:</strong>{' '}
                    {line.group.rows
                      .filter((row) => (line.allocations[row.warehouseId] ?? 0) > 0)
                      .map(
                        (row) =>
                          `${row.warehouseName} ${line.allocations[row.warehouseId]} unidad(es)`,
                      )
                      .join(' · ')}
                  </div>
                ))}
              </div>

              <div className="alert alert-info">
                Después de reservar podrás registrar uno o varios medios de pago y emitir el
                comprobante correspondiente desde el detalle de la venta.
              </div>
            </Panel>
          ) : null}
        </div>

        <aside className="sale-summary panel">
          <div className="panel-heading">
            <div>
              <h2>Resumen</h2>
              <p>Reserva de stock</p>
            </div>
            <StatusBadge tone={step === 4 ? 'primary' : 'neutral'}>
              {draftId ? 'Borrador guardado' : step === 4 ? 'Lista' : 'Borrador local'}
            </StatusBadge>
          </div>
          <div className="summary-lines">
            <div>
              <span>Subtotal</span>
              <strong>{money(subtotal)}</strong>
            </div>
            <div>
              <span>Descuentos</span>
              <strong>− {money(discount)}</strong>
            </div>
            <div>
              <span>Unidades</span>
              <strong>{lines.reduce((sum, line) => sum + line.quantity, 0)}</strong>
            </div>
          </div>
          <div className="summary-total">
            <span>Total</span>
            <strong>{money(total)}</strong>
          </div>
          <div className="wizard-actions">
            <button
              className="button button-secondary"
              disabled={step === 1 || save.isPending}
              onClick={() => setStep((value) => Math.max(1, value - 1))}
            >
              Anterior
            </button>
            <button
              className="button button-secondary"
              disabled={draftSave.isPending || !selectedClientId || lines.length === 0}
              onClick={() => draftSave.mutate()}
            >
              {draftSave.isPending ? 'Guardando…' : 'Guardar borrador'}
            </button>
            {step < 4 ? (
              <button className="button button-primary" onClick={next}>
                Continuar <ArrowRight size={17} />
              </button>
            ) : (
              <button
                className="button button-primary"
                disabled={save.isPending}
                onClick={() => {
                  if (validateAll()) save.mutate();
                }}
              >
                {save.isPending ? (
                  'Confirmando…'
                ) : (
                  <>
                    <Check size={17} /> Confirmar y reservar
                  </>
                )}
              </button>
            )}
          </div>
          {actionError ? (
            <div className="alert alert-error sale-action-error">{actionError}</div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
