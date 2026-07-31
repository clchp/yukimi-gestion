import { useMutation, useQuery } from '@tanstack/react-query';
import type { CreateDeliveryInput, DeliveryMethod } from '@yukimi/shared';
import { ArrowLeft, Check, PackageCheck, Truck } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import { createDelivery, getDeliverySupportData } from '../features/deliveries/deliveries-api';

import { SearchableNativeSelect } from '../components/ui/searchable-native-select';
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
const money = (value: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);

export function NewDeliveryPage() {
  const navigate = useNavigate();
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

  const save = useMutation({
    mutationFn: async () => {
      setLocalError(null);
      if (!selectedSale) throw new Error('Selecciona una venta.');
      if (selectedItems.length === 0)
        throw new Error('Selecciona al menos un producto para la entrega.');
      for (const item of selectedItems) {
        const quantity = quantities[item.saleItemId] ?? 0;
        if (quantity > item.remainingQuantity)
          throw new Error(`La cantidad de ${item.productName} supera lo pendiente.`);
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
                <StatusBadge tone="info">{selectedSale.deliveryStateCode}</StatusBadge>
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
                  onClick={() => setMethod(item.code)}
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
                <label className="field">
                  <span>{method === 'AGENCY' ? 'Agencia' : 'Courier o motorizado'}</span>
                  <SearchableNativeSelect
                    value={operatorId}
                    onChange={(event) => setOperatorId(event.target.value)}
                    required
                  >
                    <option value="">Selecciona</option>
                    {matchingOperators.map((operator) => (
                      <option key={operator.id} value={operator.id}>
                        {operator.name}
                      </option>
                    ))}
                  </SearchableNativeSelect>
                </label>
              ) : null}
              <label className="field">
                <span>Dirección o punto de referencia</span>
                <SearchableNativeSelect
                  value={addressId}
                  onChange={(event) => setAddressId(event.target.value)}
                >
                  <option value="">Sin dirección registrada</option>
                  {selectedSale?.addresses.map((address) => (
                    <option key={address.id} value={address.id}>
                      {address.label} · {address.addressLine}
                      {address.isPrimary ? ' · Principal' : ''}
                    </option>
                  ))}
                </SearchableNativeSelect>
              </label>
              <label className="field">
                <span>Fecha planificada de despacho</span>
                <input
                  type="date"
                  value={plannedDate}
                  onChange={(event) => setPlannedDate(event.target.value)}
                />
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
                <span>Notas</span>
                <textarea
                  rows={4}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                  placeholder="Indicaciones de entrega, horario, persona que recibe…"
                />
              </label>
            </div>
          </Panel>
        </div>

        <aside className="delivery-form-summary">
          <Panel title="Resumen">
            <div className="summary-list">
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
    </main>
  );
}
