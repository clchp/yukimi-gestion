import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateClientAddressInput, CreateDeliveryInput, DeliveryMethod } from '@yukimi/shared';
import { AlertTriangle, ArrowLeft, Check, PackageCheck, Plus, Truck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { DeliveryAddressModal } from '../components/deliveries/delivery-address-modal';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { SearchableNativeSelect } from '../components/ui/searchable-native-select';
import { StatusBadge } from '../components/ui/status-badge';
import { createClientAddress } from '../features/clients/clients-api';
import { createDelivery, getDeliverySupportData } from '../features/deliveries/deliveries-api';
import { getSale } from '../features/sales/sales-api';

const methodOptions: Array<{ code: DeliveryMethod; label: string; description: string }> = [
  { code: 'AGENCY', label: 'Agencia', description: 'Shalom u Olva para envío interprovincial.' },
  {
    code: 'MOTORBIKE',
    label: 'Motorizado',
    description: 'Courier o reparto local, como AF Express.',
  },
  {
    code: 'IN_PERSON',
    label: 'Entrega presencial',
    description: 'Recojo o entrega directa al cliente.',
  },
  { code: 'OTHER', label: 'Otro', description: 'Método excepcional documentado en notas.' },
];

const deliveryStateLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  ACCUMULATED: 'Acumula almacén',
  PENDING_INSTRUCTIONS: 'Pendiente de indicaciones',
  PENDING_AGENCY_DISPATCH: 'Pendiente de despacho',
  DELIVERED_TO_AGENCY: 'Entregado a agencia',
  OUT_FOR_DELIVERY: 'En reparto',
  DELIVERED_TO_CLIENT: 'Entregado al cliente',
};

const money = (value: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);

type DeliveryFieldErrors = Partial<
  Record<'operatorPartnerId' | 'destinationAddressId' | 'plannedDispatchDate' | 'notes', string>
>;

export function NewDeliveryPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [searchParams, setSearchParams] = useSearchParams();
  const initialSaleId = searchParams.get('saleId') ?? '';
  const [saleId, setSaleId] = useState(initialSaleId);
  const [method, setMethod] = useState<DeliveryMethod>('AGENCY');
  const [operatorId, setOperatorId] = useState('');
  const [addressId, setAddressId] = useState('');
  const [plannedDate, setPlannedDate] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const [shippingCost, setShippingCost] = useState('0');
  const [costPayer, setCostPayer] = useState<'CLIENT' | 'BUSINESS' | 'SHARED' | 'NOT_APPLICABLE'>(
    'CLIENT',
  );
  const [notes, setNotes] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<DeliveryFieldErrors>({});
  const [addressModalOpen, setAddressModalOpen] = useState(false);
  const idempotencyKey = useRef(crypto.randomUUID());

  const generalSupport = useQuery({
    queryKey: ['delivery-support'],
    queryFn: () => getDeliverySupportData(),
  });
  const selectedSupport = useQuery({
    queryKey: ['delivery-support', saleId],
    queryFn: () => getDeliverySupportData(saleId),
    enabled: Boolean(saleId),
  });
  const selectedSaleDetail = useQuery({
    queryKey: ['sale', saleId],
    queryFn: () => getSale(saleId),
    enabled: Boolean(saleId),
  });

  const selectedSale = selectedSupport.data?.selectedSale ?? null;
  const operators = selectedSupport.data?.operators ?? generalSupport.data?.operators ?? [];
  const matchingOperators = useMemo(
    () =>
      operators.filter((operator) => {
        if (method === 'AGENCY') return operator.types.includes('AGENCY');
        if (method === 'MOTORBIKE') return operator.types.includes('COURIER');
        return true;
      }),
    [method, operators],
  );

  useEffect(() => {
    if (method === 'AGENCY' || method === 'MOTORBIKE') {
      if (!matchingOperators.some((item) => item.id === operatorId))
        setOperatorId(matchingOperators[0]?.id ?? '');
    } else {
      setOperatorId('');
    }
    if (method === 'WAREHOUSE_ACCUMULATION') {
      setCostPayer('NOT_APPLICABLE');
      setShippingCost('0');
    } else if (costPayer === 'NOT_APPLICABLE') {
      setCostPayer('CLIENT');
    }
  }, [costPayer, matchingOperators, method, operatorId]);

  useEffect(() => {
    if (
      selectedSale?.addresses.length &&
      !selectedSale.addresses.some((item) => item.id === addressId)
    ) {
      setAddressId(
        selectedSale.addresses.find((item) => item.isPrimary)?.id ??
          selectedSale.addresses[0]?.id ??
          '',
      );
    }
    if (selectedSale) {
      setQuantities((current) => {
        const next = { ...current };
        selectedSale.items.forEach((item) => {
          if (next[item.saleItemId] === undefined) next[item.saleItemId] = item.remainingQuantity;
        });
        return next;
      });
    }
  }, [addressId, selectedSale]);

  const selectedItems = useMemo(
    () => selectedSale?.items.filter((item) => (quantities[item.saleItemId] ?? 0) > 0) ?? [],
    [quantities, selectedSale],
  );
  const totalUnits = selectedItems.reduce(
    (sum, item) => sum + (quantities[item.saleItemId] ?? 0),
    0,
  );
  const pendingBalance = Math.max(0, selectedSaleDetail.data?.balanceAmount ?? 0);

  const addAddress = useMutation({
    mutationFn: async (input: CreateClientAddressInput) => {
      if (!selectedSale) throw new Error('Selecciona una venta antes de agregar el destino.');
      return createClientAddress(selectedSale.clientId, input);
    },
    onSuccess: async (result) => {
      setAddressId(result.id);
      setFieldErrors((current) => ({ ...current, destinationAddressId: undefined }));
      await queryClient.invalidateQueries({ queryKey: ['delivery-support', saleId] });
      await selectedSupport.refetch();
      setAddressModalOpen(false);
    },
  });

  const save = useMutation({
    mutationFn: async () => {
      setLocalError(null);
      const nextErrors: DeliveryFieldErrors = {};
      if (!selectedSale) throw new Error('Selecciona una venta.');
      if (selectedItems.length === 0)
        throw new Error('Selecciona al menos un producto para la entrega.');
      for (const item of selectedItems) {
        const quantity = quantities[item.saleItemId] ?? 0;
        if (quantity > item.remainingQuantity)
          throw new Error(`La cantidad de ${item.productName} supera lo pendiente.`);
      }
      if ((method === 'AGENCY' || method === 'MOTORBIKE') && !operatorId) {
        nextErrors.operatorPartnerId =
          method === 'AGENCY' ? 'Selecciona la agencia.' : 'Selecciona el courier o motorizado.';
      }
      if (method !== 'WAREHOUSE_ACCUMULATION' && !addressId) {
        nextErrors.destinationAddressId = 'Registra una dirección o punto de entrega.';
      }
      if (['AGENCY', 'MOTORBIKE', 'IN_PERSON'].includes(method) && !plannedDate) {
        nextErrors.plannedDispatchDate = 'Indica la fecha planificada.';
      }
      if (method === 'OTHER' && notes.trim().length < 5) {
        nextErrors.notes = 'Describe el método y el acuerdo de entrega.';
      }
      setFieldErrors(nextErrors);
      if (Object.keys(nextErrors).length > 0) {
        throw new Error('Revisa los campos marcados antes de crear la entrega.');
      }

      const cost = Number(shippingCost || 0);
      if (!Number.isFinite(cost) || cost < 0) throw new Error('El costo de envío no es válido.');
      const input: CreateDeliveryInput = {
        saleId: selectedSale.id,
        deliveryMethod: method,
        operatorPartnerId: operatorId || null,
        destinationAddressId: addressId || null,
        trackingNumber: trackingNumber.trim() || null,
        shippingCost: cost,
        costPayer,
        plannedDispatchDate: plannedDate || null,
        notes: notes.trim() || null,
        items: selectedItems.map((item) => ({
          saleItemId: item.saleItemId,
          quantity: quantities[item.saleItemId] ?? 0,
        })),
      };
      return createDelivery(input, idempotencyKey.current);
    },
    onSuccess: (result) => navigate(`/entregas/${result.id}`),
    onError: (error) =>
      setLocalError(error instanceof Error ? error.message : 'No se pudo crear la entrega.'),
  });

  return (
    <main className="page delivery-form-page">
      <button className="back-link" onClick={() => navigate('/entregas')}>
        <ArrowLeft size={17} /> Volver a entregas
      </button>
      <PageHeader
        eyebrow="Nueva operación logística"
        title="Preparar entrega"
        description="Selecciona una venta, define los productos de esta salida y registra el método de entrega."
      />
      {localError ? <div className="alert alert-error">{localError}</div> : null}
      {generalSupport.isError || selectedSupport.isError ? (
        <div className="alert alert-error">No se pudieron cargar las opciones de entrega.</div>
      ) : null}

      <section className="delivery-form-layout">
        <div className="delivery-form-main">
          <Panel
            title="1. Venta y cliente"
            subtitle="Solo aparecen ventas con productos pendientes de entrega."
          >
            <label className="field">
              <span>Venta</span>
              <SearchableNativeSelect
                value={saleId}
                onChange={(event) => {
                  const value = event.target.value;
                  setSaleId(value);
                  setSearchParams(value ? { saleId: value } : {});
                  setQuantities({});
                  setAddressId('');
                  setFieldErrors({});
                }}
              >
                <option value="">Selecciona una venta</option>
                {generalSupport.data?.eligibleSales.map((sale) => (
                  <option key={sale.id} value={sale.id}>
                    {sale.code} · {sale.clientName} · {sale.remainingUnits} unidad(es)
                  </option>
                ))}
              </SearchableNativeSelect>
            </label>
            {selectedSale ? (
              <div className="selection-row">
                <span className="selection-icon">
                  <Truck size={20} />
                </span>
                <div>
                  <strong>{selectedSale.clientName}</strong>
                  <small>
                    {selectedSale.code} · {selectedSale.clientPhone ?? 'Sin celular'}
                  </small>
                </div>
                <StatusBadge tone="info">
                  {deliveryStateLabels[selectedSale.deliveryStateCode] ??
                    selectedSale.deliveryStateCode}
                </StatusBadge>
              </div>
            ) : null}
            {selectedSale && pendingBalance > 0 ? (
              <div className="alert alert-warning delivery-payment-warning">
                <AlertTriangle size={18} />
                <div>
                  <strong>La venta tiene {money(pendingBalance)} de saldo pendiente.</strong>
                  <span>Puedes preparar la entrega, pero verifica el pago antes de despachar.</span>
                </div>
              </div>
            ) : null}
          </Panel>

          <Panel
            title="2. Productos de esta entrega"
            subtitle="Puedes preparar una entrega parcial y dejar el resto pendiente."
          >
            {!selectedSale ? (
              <div className="empty-state">Selecciona una venta para ver sus productos.</div>
            ) : selectedSale.items.length === 0 ? (
              <div className="empty-state">
                <strong>Sin productos pendientes</strong>
                <p>Todo el contenido de esta venta ya fue asignado a entregas.</p>
              </div>
            ) : (
              <div className="delivery-item-picker">
                {selectedSale.items.map((item) => (
                  <article key={item.saleItemId}>
                    <div>
                      <strong>{item.productName}</strong>
                      <small>
                        {item.variantName} · {item.sku}
                      </small>
                      {item.allocations.map((allocation, index) => (
                        <small key={`${allocation.warehouseName}-${index}`}>
                          {allocation.warehouseName}: {allocation.quantity} · {allocation.status}
                        </small>
                      ))}
                    </div>
                    <div className="delivery-quantity-control">
                      <span>Pendiente {item.remainingQuantity}</span>
                      <input
                        type="number"
                        min="0"
                        max={item.remainingQuantity}
                        value={quantities[item.saleItemId] ?? 0}
                        onChange={(event) =>
                          setQuantities((current) => ({
                            ...current,
                            [item.saleItemId]: Math.max(0, Number(event.target.value) || 0),
                          }))
                        }
                      />
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="3. Método y destino">
            <div className="choice-grid delivery-method-grid">
              {methodOptions.map((item) => (
                <button
                  type="button"
                  key={item.code}
                  className={`choice-card ${method === item.code ? 'selected' : ''}`}
                  onClick={() => {
                    setMethod(item.code);
                    setFieldErrors({});
                  }}
                >
                  <span className="choice-icon">
                    <PackageCheck size={19} />
                  </span>
                  <strong>{item.label}</strong>
                  <small>{item.description}</small>
                  {method === item.code ? <Check size={17} /> : null}
                </button>
              ))}
            </div>
            <div className="form-grid form-grid-2">
              {method === 'AGENCY' || method === 'MOTORBIKE' ? (
                <div className="field">
                  <span>{method === 'AGENCY' ? 'Agencia *' : 'Courier o motorizado *'}</span>
                  <SearchableNativeSelect
                    value={operatorId}
                    onChange={(event) => {
                      setOperatorId(event.target.value);
                      setFieldErrors((current) => ({ ...current, operatorPartnerId: undefined }));
                    }}
                    required
                  >
                    <option value="">Selecciona</option>
                    {matchingOperators.map((operator) => (
                      <option key={operator.id} value={operator.id}>
                        {operator.name}
                      </option>
                    ))}
                  </SearchableNativeSelect>
                  {fieldErrors.operatorPartnerId ? (
                    <small className="field-error">{fieldErrors.operatorPartnerId}</small>
                  ) : null}
                </div>
              ) : null}
              <div className="field">
                <div className="delivery-field-title">
                  <span>Dirección o punto de entrega *</span>
                  <button
                    type="button"
                    className="delivery-add-address-button"
                    disabled={!selectedSale}
                    onClick={() => setAddressModalOpen(true)}
                  >
                    <Plus size={15} /> Agregar
                  </button>
                </div>
                <SearchableNativeSelect
                  value={addressId}
                  onChange={(event) => {
                    setAddressId(event.target.value);
                    setFieldErrors((current) => ({ ...current, destinationAddressId: undefined }));
                  }}
                >
                  <option value="">Selecciona una dirección o punto</option>
                  {selectedSale?.addresses.map((address) => (
                    <option key={address.id} value={address.id}>
                      {address.label} · {address.addressLine}
                      {address.isPrimary ? ' · Principal' : ''}
                    </option>
                  ))}
                </SearchableNativeSelect>
                {fieldErrors.destinationAddressId ? (
                  <small className="field-error">{fieldErrors.destinationAddressId}</small>
                ) : null}
              </div>
              <label className="field">
                <span>
                  Fecha planificada de {method === 'IN_PERSON' ? 'entrega' : 'despacho'}
                  {['AGENCY', 'MOTORBIKE', 'IN_PERSON'].includes(method) ? ' *' : ''}
                </span>
                <input
                  type="date"
                  value={plannedDate}
                  onChange={(event) => {
                    setPlannedDate(event.target.value);
                    setFieldErrors((current) => ({ ...current, plannedDispatchDate: undefined }));
                  }}
                />
                {fieldErrors.plannedDispatchDate ? (
                  <small className="field-error">{fieldErrors.plannedDispatchDate}</small>
                ) : null}
              </label>
              <label className="field">
                <span>N.º de seguimiento inicial</span>
                <input
                  value={trackingNumber}
                  onChange={(event) => setTrackingNumber(event.target.value)}
                  placeholder="Puede registrarse después"
                />
              </label>
              <label className="field">
                <span>Costo de envío</span>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={shippingCost}
                  onChange={(event) => setShippingCost(event.target.value)}
                  disabled={method === 'WAREHOUSE_ACCUMULATION'}
                />
              </label>
              <label className="field">
                <span>Quién asume el costo</span>
                <SearchableNativeSelect
                  value={costPayer}
                  onChange={(event) => setCostPayer(event.target.value as typeof costPayer)}
                >
                  <option value="CLIENT">Cliente</option>
                  <option value="BUSINESS">Yukimi</option>
                  <option value="SHARED">Compartido</option>
                  <option value="NOT_APPLICABLE">No aplica</option>
                </SearchableNativeSelect>
              </label>
              <label className="field field-span-2">
                <span>Notas{method === 'OTHER' ? ' *' : ''}</span>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(event) => {
                    setNotes(event.target.value);
                    setFieldErrors((current) => ({ ...current, notes: undefined }));
                  }}
                  placeholder="Indicaciones de entrega, horario, persona que recibe…"
                />
                {fieldErrors.notes ? (
                  <small className="field-error">{fieldErrors.notes}</small>
                ) : null}
              </label>
            </div>
          </Panel>
        </div>

        <aside className="delivery-form-summary">
          <Panel title="Resumen">
            <div className="summary-list delivery-summary-list">
              <div>
                <span>Venta</span>
                <strong>{selectedSale?.code ?? '—'}</strong>
              </div>
              <div>
                <span>Cliente</span>
                <strong>{selectedSale?.clientName ?? '—'}</strong>
              </div>
              <div>
                <span>Método</span>
                <strong>{methodOptions.find((item) => item.code === method)?.label}</strong>
              </div>
              <div>
                <span>Unidades</span>
                <strong>{totalUnits}</strong>
              </div>
              <div>
                <span>Costo</span>
                <strong>{money(Number(shippingCost || 0))}</strong>
              </div>
            </div>
            <button
              className="button button-primary button-full"
              disabled={save.isPending || !selectedSale || totalUnits === 0}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Creando…' : 'Crear entrega'}
            </button>
          </Panel>
        </aside>
      </section>

      <DeliveryAddressModal
        open={addressModalOpen}
        clientName={selectedSale?.clientName ?? 'Cliente'}
        isPending={addAddress.isPending}
        errorMessage={
          addAddress.isError
            ? addAddress.error instanceof Error
              ? addAddress.error.message
              : 'No se pudo guardar la dirección.'
            : null
        }
        onClose={() => {
          if (!addAddress.isPending) setAddressModalOpen(false);
        }}
        onSubmit={(input) => addAddress.mutate(input)}
      />
    </main>
  );
}
