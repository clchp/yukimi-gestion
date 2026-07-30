import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryMethod, UpdateDeliveryInput } from '@yukimi/shared';
import { ArrowLeft, Check, PackageCheck } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import {
  getDelivery,
  getDeliverySupportData,
  updateDelivery,
} from '../features/deliveries/deliveries-api';

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
  {
    code: 'WAREHOUSE_ACCUMULATION',
    label: 'Acumula almacén',
    description: 'Los productos permanecen separados para el cliente.',
  },
  { code: 'OTHER', label: 'Otro', description: 'Método excepcional documentado en notas.' },
];
const money = (value: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);

export function EditDeliveryPage() {
  const navigate = useNavigate();
  const { deliveryId } = useParams();
  const queryClient = useQueryClient();
  const detail = useQuery({
    queryKey: ['delivery', deliveryId],
    queryFn: () => getDelivery(deliveryId as string),
    enabled: Boolean(deliveryId),
  });
  const support = useQuery({
    queryKey: ['delivery-edit-support', deliveryId],
    queryFn: async () => {
      const current = await getDelivery(deliveryId as string);
      return getDeliverySupportData(current.saleId, current.id);
    },
    enabled: Boolean(deliveryId),
  });

  const [initialized, setInitialized] = useState(false);
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
  const [reason, setReason] = useState('');
  const [quantities, setQuantities] = useState<Record<string, number>>({});
  const [localError, setLocalError] = useState<string | null>(null);

  const selectedSale = support.data?.selectedSale ?? null;
  const operators = support.data?.operators ?? [];
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
    const current = detail.data;
    if (!current || initialized) return;
    setMethod(current.deliveryMethod);
    setOperatorId(current.operatorPartnerId ?? '');
    setAddressId(current.destinationAddressId ?? '');
    setPlannedDate(current.plannedDispatchDate ?? '');
    setTrackingNumber(current.trackingNumber ?? '');
    setShippingCost(String(current.shippingCost));
    setCostPayer(current.costPayer as typeof costPayer);
    setNotes(current.notes ?? '');
    setQuantities(
      Object.fromEntries(current.items.map((item) => [item.saleItemId, item.quantity])),
    );
    setInitialized(true);
  }, [detail.data, initialized]);

  useEffect(() => {
    if (!initialized) return;
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
  }, [costPayer, initialized, matchingOperators, method, operatorId]);

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
      const current = detail.data;
      if (!current || !selectedSale) throw new Error('La entrega no está disponible.');
      if (!current.canEdit)
        throw new Error('Esta entrega ya fue despachada o finalizada y no puede editarse.');
      if (reason.trim().length < 3) throw new Error('Indica el motivo de la corrección.');
      if (selectedItems.length === 0)
        throw new Error('La entrega debe conservar al menos un producto.');
      for (const item of selectedItems) {
        const quantity = quantities[item.saleItemId] ?? 0;
        if (quantity > item.remainingQuantity)
          throw new Error(
            `La cantidad de ${item.productName} supera el máximo disponible para esta entrega.`,
          );
      }
      const cost = Number(shippingCost || 0);
      if (!Number.isFinite(cost) || cost < 0) throw new Error('El costo de envío no es válido.');
      const input: UpdateDeliveryInput = {
        version: current.version,
        reason: reason.trim(),
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
      return updateDelivery(current.id, input);
    },
    onSuccess: async (result) => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['delivery', deliveryId] }),
        queryClient.invalidateQueries({ queryKey: ['deliveries'] }),
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
      ]);
      navigate(`/entregas/${result.id}`);
    },
    onError: (error) =>
      setLocalError(error instanceof Error ? error.message : 'No se pudo corregir la entrega.'),
  });

  if (detail.isLoading || support.isLoading)
    return (
      <main className="page">
        <div className="empty-state">Cargando entrega…</div>
      </main>
    );
  if (detail.isError || support.isError || !detail.data || !selectedSale)
    return (
      <main className="page">
        <button className="back-link" onClick={() => navigate(`/entregas/${deliveryId ?? ''}`)}>
          <ArrowLeft size={17} /> Volver
        </button>
        <div className="alert alert-error">No se pudieron cargar los datos de edición.</div>
      </main>
    );
  if (!detail.data.canEdit)
    return (
      <main className="page">
        <button className="back-link" onClick={() => navigate(`/entregas/${detail.data.id}`)}>
          <ArrowLeft size={17} /> Volver
        </button>
        <div className="alert alert-error">
          La entrega ya fue despachada, entregada o cancelada. Para conservar la trazabilidad ya no
          se puede editar.
        </div>
      </main>
    );

  return (
    <main className="page delivery-form-page">
      <button className="back-link" onClick={() => navigate(`/entregas/${detail.data.id}`)}>
        <ArrowLeft size={17} /> Volver a la entrega
      </button>
      <PageHeader
        eyebrow="Corrección logística"
        title={`Editar ${detail.data.code}`}
        description={`Venta ${detail.data.saleCode} · ${detail.data.clientName}. Todos los cambios quedarán auditados.`}
      />
      {localError ? <div className="alert alert-error">{localError}</div> : null}

      <section className="delivery-form-layout">
        <div className="delivery-form-main">
          <Panel
            title="1. Productos de esta entrega"
            subtitle="Puedes corregir cantidades o reemplazar productos mientras la entrega no haya sido despachada."
          >
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
                    <span>Máximo {item.remainingQuantity}</span>
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
          </Panel>

          <Panel title="2. Método y destino">
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
                  <select
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
                  </select>
                </label>
              ) : null}
              <label className="field">
                <span>Dirección o punto de referencia</span>
                <select value={addressId} onChange={(event) => setAddressId(event.target.value)}>
                  <option value="">Sin dirección registrada</option>
                  {selectedSale.addresses.map((address) => (
                    <option key={address.id} value={address.id}>
                      {address.label} · {address.addressLine}
                      {address.isPrimary ? ' · Principal' : ''}
                    </option>
                  ))}
                </select>
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
                <span>N.º de seguimiento</span>
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
                <select
                  value={costPayer}
                  onChange={(event) => setCostPayer(event.target.value as typeof costPayer)}
                >
                  <option value="CLIENT">Cliente</option>
                  <option value="BUSINESS">Yukimi</option>
                  <option value="SHARED">Compartido</option>
                  <option value="NOT_APPLICABLE">No aplica</option>
                </select>
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
              <label className="field field-span-2">
                <span>Motivo de la corrección</span>
                <textarea
                  rows={3}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  placeholder="Ej.: se eligió la agencia equivocada"
                  required
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
                <strong>{detail.data.saleCode}</strong>
              </div>
              <div>
                <span>Cliente</span>
                <strong>{detail.data.clientName}</strong>
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
              disabled={save.isPending || totalUnits === 0 || reason.trim().length < 3}
              onClick={() => save.mutate()}
            >
              {save.isPending ? 'Guardando…' : 'Guardar corrección'}
            </button>
          </Panel>
        </aside>
      </section>
    </main>
  );
}
