import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateImportCostInput,
  ImportBoxStateCode,
  ImportStateCode,
  UpdateInsuranceClaimInput,
} from '@yukimi/shared';
import { AlertTriangle, ArrowLeft, Boxes, CircleDollarSign, Link2, PackageCheck, Ship, Truck } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import {
  addImportCost,
  advanceImport,
  advanceImportBox,
  allocatePreorder,
  createImportIncident,
  createInsuranceClaim,
  createPreorderSale,
  getImport,
  getImportSupportData,
  receiveImportBox,
  updateInsuranceClaim,
} from '../features/imports/imports-api';

const stateLabels: Record<string, string> = {
  QUOTATION: 'Cotización', PURCHASE_CONFIRMED: 'Compra confirmada', FOREIGN_WAREHOUSE: 'Almacén extranjero',
  DISPATCH_CONFIRMED: 'Despacho confirmado', SHIPPED: 'Embarcada', IN_TRANSIT: 'En tránsito',
  RECEIVED_PERU: 'Recibida en Perú', STOCKED: 'Ingresada a stock', CANCELLED: 'Cancelada', REGISTERED: 'Registrada',
};
const transitionLabels: Record<string, string> = {
  PURCHASE_CONFIRMED: 'Confirmar compra', FOREIGN_WAREHOUSE: 'Confirmar llegada a almacén extranjero',
  DISPATCH_CONFIRMED: 'Confirmar despacho', SHIPPED: 'Marcar embarcada', IN_TRANSIT: 'Marcar en tránsito',
  RECEIVED_PERU: 'Confirmar llegada a Perú', STOCKED: 'Ingresar a stock', CANCELLED: 'Cancelar',
};
const modeLabels: Record<string, string> = { AIR: 'Avión', SEA: 'Barco', OTHER: 'Otro' };
const costLabels: Record<string, string> = { CARD: 'Tarjeta', COMMISSION: 'Comisión', FREIGHT: 'Flete', CUSTOMS: 'Aduanas', INSURANCE: 'Seguro', LOCAL_DELIVERY: 'Entrega local', OTHER: 'Otro' };
const incidentLabels: Record<string, string> = { MISSING: 'Faltante', DAMAGED: 'Dañado', DELAY: 'Retraso', WRONG_ITEM: 'Producto equivocado', OTHER: 'Otro' };
const money = (value: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
const date = (value: string | null) => value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : 'Sin fecha';
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin registrar';
function toneFor(state: string): 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  if (state === 'STOCKED') return 'success';
  if (state === 'CANCELLED') return 'danger';
  if (state === 'SHIPPED' || state === 'IN_TRANSIT' || state === 'RECEIVED_PERU') return 'info';
  if (state === 'PURCHASE_CONFIRMED' || state === 'FOREIGN_WAREHOUSE') return 'primary';
  return 'warning';
}

export function ImportDetailPage() {
  const navigate = useNavigate();
  const { importId } = useParams();
  const queryClient = useQueryClient();
  const detail = useQuery({ queryKey: ['import', importId], queryFn: () => getImport(importId as string), enabled: Boolean(importId) });
  const support = useQuery({ queryKey: ['import-support'], queryFn: getImportSupportData });

  const [costType, setCostType] = useState<CreateImportCostInput['costType']>('FREIGHT');
  const [costAmount, setCostAmount] = useState(0);
  const [costCurrency, setCostCurrency] = useState('PEN');
  const [costExchangeRate, setCostExchangeRate] = useState(1);
  const [costBoxId, setCostBoxId] = useState('');
  const [costDescription, setCostDescription] = useState('');
  const [preorderItemId, setPreorderItemId] = useState('');
  const [preorderSaleItemId, setPreorderSaleItemId] = useState('');
  const [preorderQuantity, setPreorderQuantity] = useState(1);
  const [newPreorderItemId, setNewPreorderItemId] = useState('');
  const [newPreorderClientId, setNewPreorderClientId] = useState('');
  const [newPreorderChannel, setNewPreorderChannel] = useState('WHATSAPP');
  const [newPreorderQuantity, setNewPreorderQuantity] = useState(1);
  const [newPreorderOriginalPrice, setNewPreorderOriginalPrice] = useState(0);
  const [newPreorderFinalPrice, setNewPreorderFinalPrice] = useState(0);
  const [newPreorderDiscountType, setNewPreorderDiscountType] = useState('MANUAL');
  const [newPreorderDiscountReason, setNewPreorderDiscountReason] = useState('');
  const [newPreorderDeliveryMode, setNewPreorderDeliveryMode] = useState<'PENDING' | 'ACCUMULATED'>('ACCUMULATED');
  const [newPreorderNotes, setNewPreorderNotes] = useState('');

  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['import', importId] }),
      queryClient.invalidateQueries({ queryKey: ['imports'] }),
      queryClient.invalidateQueries({ queryKey: ['import-support'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      queryClient.invalidateQueries({ queryKey: ['sales'] }),
    ]);
  };

  const shipmentTransition = useMutation({
    mutationFn: async (nextStateCode: ImportStateCode) => {
      const reason = window.prompt(nextStateCode === 'CANCELLED' ? 'Motivo de cancelación:' : 'Detalle o referencia de este cambio:', transitionLabels[nextStateCode] ?? '')?.trim();
      if (!reason) throw new Error('El cambio fue cancelado.');
      const tracking = nextStateCode === 'SHIPPED' || nextStateCode === 'IN_TRANSIT'
        ? window.prompt('Tracking maestro (opcional):', detail.data?.masterTrackingNumber ?? '')?.trim() || null
        : detail.data?.masterTrackingNumber ?? null;
      return advanceImport(importId as string, { nextStateCode, reason, occurredAt: new Date().toISOString(), masterTrackingNumber: tracking });
    },
    onSuccess: invalidate,
  });

  const boxTransition = useMutation({
    mutationFn: async ({ boxId, nextStateCode, trackingNumber }: { boxId: string; nextStateCode: ImportBoxStateCode; trackingNumber: string | null }) => {
      const reason = window.prompt(nextStateCode === 'CANCELLED' ? 'Motivo de cancelación de la caja:' : 'Detalle de este cambio:', transitionLabels[nextStateCode] ?? '')?.trim();
      if (!reason) throw new Error('El cambio fue cancelado.');
      const tracking = nextStateCode === 'SHIPPED' || nextStateCode === 'IN_TRANSIT'
        ? window.prompt('Tracking de la caja (opcional):', trackingNumber ?? '')?.trim() || null
        : trackingNumber;
      return advanceImportBox(boxId, { nextStateCode, reason, occurredAt: new Date().toISOString(), trackingNumber: tracking });
    },
    onSuccess: invalidate,
  });

  const receive = useMutation({
    mutationFn: async (boxId: string) => {
      const box = detail.data?.boxes.find((item) => item.id === boxId);
      if (!box) throw new Error('No se encontró la caja.');
      const items = box.items.map((item) => {
        const quantityText = window.prompt(`Cantidad recibida de ${item.productName} · ${item.variantName} (esperadas: ${item.expectedQuantity}):`, String(item.expectedQuantity));
        if (quantityText == null) throw new Error('La recepción fue cancelada.');
        const costText = window.prompt(`Costo final unitario en soles para ${item.productName}:`, String(item.finalUnitCostPen ?? item.originalUnitCost * item.exchangeRateToPen));
        if (costText == null) throw new Error('La recepción fue cancelada.');
        return { importBoxItemId: item.id, receivedQuantity: Number(quantityText), finalUnitCostPen: Number(costText), notes: null };
      });
      const reason = window.prompt('Motivo o referencia de recepción:', `Ingreso a stock de ${box.code}`)?.trim();
      if (!reason) throw new Error('La recepción fue cancelada.');
      return receiveImportBox(box.id, { reason, occurredAt: new Date().toISOString(), items }, crypto.randomUUID());
    },
    onSuccess: invalidate,
  });

  const addCost = useMutation({
    mutationFn: () => addImportCost(importId as string, {
      importBoxId: costBoxId || null,
      costType,
      description: costDescription.trim() || null,
      amount: Number(costAmount),
      currencyCode: costCurrency,
      exchangeRateToPen: Number(costExchangeRate),
      allocationMethod: 'BY_PURCHASE_VALUE',
      isIncludedInUnitCost: true,
      occurredAt: new Date().toISOString(),
    }),
    onSuccess: async () => { setCostAmount(0); setCostDescription(''); await invalidate(); },
  });

  const incident = useMutation({
    mutationFn: async ({ boxId, itemId }: { boxId: string | null; itemId: string | null }) => {
      const type = window.prompt('Tipo: MISSING, DAMAGED, DELAY, WRONG_ITEM u OTHER', 'DELAY')?.trim().toUpperCase();
      if (!type || !['MISSING', 'DAMAGED', 'DELAY', 'WRONG_ITEM', 'OTHER'].includes(type)) throw new Error('Tipo de incidencia inválido.');
      const description = window.prompt('Describe la incidencia:')?.trim();
      if (!description) throw new Error('La descripción es obligatoria.');
      const quantityText = itemId ? window.prompt('Cantidad afectada (opcional):', '1') : null;
      return createImportIncident(importId as string, {
        importBoxId: boxId,
        importBoxItemId: itemId,
        incidentType: type as 'MISSING' | 'DAMAGED' | 'DELAY' | 'WRONG_ITEM' | 'OTHER',
        affectedQuantity: quantityText ? Number(quantityText) : null,
        description,
        occurredAt: new Date().toISOString(),
      });
    },
    onSuccess: invalidate,
  });

  const insuranceClaim = useMutation({
    mutationFn: async (incidentId: string) => {
      const claimNumber = window.prompt('Número de reclamo o referencia del seguro (opcional):')?.trim() || null;
      const amountText = window.prompt('Importe reclamado:', '0');
      if (amountText == null) throw new Error('El reclamo fue cancelado.');
      const currencyCode = window.prompt('Moneda del reclamo:', 'PEN')?.trim().toUpperCase();
      if (!currencyCode) throw new Error('La moneda es obligatoria.');
      const notes = window.prompt('Detalle del reclamo:')?.trim() || null;
      return createInsuranceClaim(importId as string, {
        importIncidentId: incidentId,
        claimNumber,
        claimedAmount: Number(amountText),
        currencyCode,
        status: 'SUBMITTED',
        submittedAt: new Date().toISOString(),
        notes,
      });
    },
    onSuccess: invalidate,
  });

  const insuranceUpdate = useMutation({
    mutationFn: async (claimId: string) => {
      const statusText = window.prompt(
        'Estado: PENDING, SUBMITTED, APPROVED, PARTIALLY_APPROVED, REJECTED, PAID o CLOSED',
        'APPROVED',
      )?.trim().toUpperCase();
      const validStatuses: UpdateInsuranceClaimInput['status'][] = ['PENDING', 'SUBMITTED', 'APPROVED', 'PARTIALLY_APPROVED', 'REJECTED', 'PAID', 'CLOSED'];
      if (!statusText || !validStatuses.includes(statusText as UpdateInsuranceClaimInput['status'])) throw new Error('Estado de seguro inválido.');
      const approvedText = ['APPROVED', 'PARTIALLY_APPROVED', 'PAID', 'CLOSED'].includes(statusText)
        ? window.prompt('Importe aprobado (opcional):')
        : null;
      const resolutionNotes = window.prompt('Detalle de la actualización:')?.trim();
      if (!resolutionNotes) throw new Error('El detalle es obligatorio.');
      return updateInsuranceClaim(claimId, {
        status: statusText as UpdateInsuranceClaimInput['status'],
        approvedAmount: approvedText ? Number(approvedText) : null,
        resolutionNotes,
      });
    },
    onSuccess: invalidate,
  });

  const createPreorder = useMutation({
    mutationFn: () => {
      if (!newPreorderItemId || !newPreorderClientId || !newPreorderChannel) throw new Error('Selecciona producto, cliente y canal.');
      return createPreorderSale({
        clientId: newPreorderClientId,
        salesChannelCode: newPreorderChannel,
        importBoxItemId: newPreorderItemId,
        quantity: Number(newPreorderQuantity),
        originalUnitPrice: Number(newPreorderOriginalPrice),
        finalUnitPrice: Number(newPreorderFinalPrice),
        discountTypeCode: newPreorderFinalPrice < newPreorderOriginalPrice ? newPreorderDiscountType : null,
        discountReason: newPreorderFinalPrice < newPreorderOriginalPrice ? newPreorderDiscountReason : null,
        deliveryMode: newPreorderDeliveryMode,
        dueAt: null,
        notes: newPreorderNotes.trim() || null,
      }, crypto.randomUUID());
    },
    onSuccess: async (result) => {
      await invalidate();
      navigate(`/ventas/${result.id}`);
    },
  });

  const preorder = useMutation({
    mutationFn: () => {
      if (!preorderItemId || !preorderSaleItemId) throw new Error('Selecciona el producto importado y la preventa.');
      return allocatePreorder({ saleItemId: preorderSaleItemId, importBoxItemId: preorderItemId, quantity: Number(preorderQuantity) });
    },
    onSuccess: async () => { setPreorderQuantity(1); await invalidate(); },
  });

  const selectedImportItem = useMemo(() => detail.data?.boxes.flatMap((box) => box.items).find((item) => item.id === preorderItemId) ?? null, [detail.data, preorderItemId]);
  const candidates = useMemo(() => (support.data?.preorderCandidates ?? []).filter((candidate) => !selectedImportItem || candidate.variantId === selectedImportItem.variantId), [selectedImportItem, support.data]);

  if (detail.isLoading) return <main className="page"><div className="empty-state">Cargando importación…</div></main>;
  if (detail.isError || !detail.data) return <main className="page"><button className="back-link" onClick={() => navigate('/importaciones')}><ArrowLeft size={17} /> Volver</button><div className="alert alert-error">{detail.error instanceof Error ? detail.error.message : 'No se pudo cargar la importación.'}</div></main>;

  const data = detail.data;
  const error = shipmentTransition.error ?? boxTransition.error ?? receive.error ?? addCost.error ?? incident.error ?? createPreorder.error ?? preorder.error;

  return (
    <main className="page import-detail-page">
      <button className="back-link" onClick={() => navigate('/importaciones')}><ArrowLeft size={17} /> Volver a importaciones</button>
      <PageHeader eyebrow="Seguimiento internacional" title={`Importación ${data.code}`} description={`${data.supplierName ?? 'Sin proveedor'} · ${modeLabels[data.transportMode]} · Creada ${dateTime(data.createdAt)}`} />
      <div className="sale-status-line"><StatusBadge tone={toneFor(data.stateCode)}>{stateLabels[data.stateCode] ?? data.stateCode}</StatusBadge><StatusBadge tone="info">{data.boxes.length} caja(s)</StatusBadge></div>
      {error ? <div className="alert alert-error">{error instanceof Error ? error.message : 'No se pudo completar la operación.'}</div> : null}

      <section className="summary-strip">
        <div><span>Unidades esperadas</span><strong>{data.totals.expectedUnits}</strong></div>
        <div><span>Unidades recibidas</span><strong>{data.totals.receivedUnits}</strong></div>
        <div><span>Compra estimada</span><strong>{money(data.totals.purchaseValuePen)}</strong></div>
        <div><span>Costos adicionales</span><strong>{money(data.totals.extraCostsPen)}</strong></div>
      </section>

      <section className="import-detail-grid">
        <div className="import-detail-main">
          <Panel title="Datos generales"><div className="detail-summary-grid"><div><span>Proveedor</span><strong>{data.supplierName ?? 'Sin proveedor'}</strong><small>{data.purchaseCurrencyCode} · TC {data.sunatExchangeRate}</small></div><div><span>Compra</span><strong>{date(data.purchaseDate)}</strong><small>Llegada: {date(data.estimatedArrivalDate)}</small></div><div><span>Tracking maestro</span><strong>{data.masterTrackingNumber ?? 'Pendiente'}</strong><small>{modeLabels[data.transportMode]}</small></div><div><span>Preventas asignadas</span><strong>{data.totals.allocatedPreorders}</strong><small>Unidades vinculadas</small></div></div>{data.notes ? <p className="detail-note"><strong>Notas:</strong> {data.notes}</p> : null}</Panel>

          <Panel title="Cajas" subtitle="Cada caja mantiene su propio tracking, productos y estado.">
            <div className="import-box-detail-list">{data.boxes.map((box) => <article className="import-box-detail" key={box.id}>
              <header><div><span className="box-icon"><Boxes size={18} /></span><div><strong>{box.code}</strong><small>{box.trackingNumber ?? 'Sin tracking'} · {box.internationalOperatorName ?? 'Sin operador internacional'}</small></div></div><StatusBadge tone={toneFor(box.stateCode)}>{stateLabels[box.stateCode] ?? box.stateCode}</StatusBadge></header>
              <div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>Producto</th><th>Destino</th><th>Esperado</th><th>Recibido</th><th>Preventa</th><th>Costo</th><th /></tr></thead><tbody>{box.items.map((item) => <tr key={item.id}><td><strong>{item.productName}</strong><small>{item.variantName} · {item.sku}</small></td><td>{item.destinationWarehouseName ?? 'Sin almacén'}</td><td className="numeric-cell">{item.expectedQuantity}</td><td className="numeric-cell">{item.receivedQuantity}</td><td className="numeric-cell">{item.preorderAllocatedQuantity}</td><td className="numeric-cell">{item.finalUnitCostPen == null ? `${item.originalCurrencyCode} ${item.originalUnitCost}` : money(item.finalUnitCostPen)}</td><td><button className="icon-button" title="Registrar incidencia" onClick={() => incident.mutate({ boxId: box.id, itemId: item.id })}><AlertTriangle size={16} /></button></td></tr>)}</tbody></table></div>
              <div className="import-box-actions">
                {box.allowedTransitions.map((transition) => <button key={transition.stateCode} className={transition.stateCode === 'CANCELLED' ? 'button button-danger' : 'button button-secondary'} disabled={boxTransition.isPending} onClick={() => boxTransition.mutate({ boxId: box.id, nextStateCode: transition.stateCode, trackingNumber: box.trackingNumber })}><Truck size={16} /> {transitionLabels[transition.stateCode] ?? transition.name}</button>)}
                {box.canReceive ? <button className="button button-primary" disabled={receive.isPending || data.stateCode !== 'RECEIVED_PERU'} onClick={() => receive.mutate(box.id)}><PackageCheck size={16} /> Ingresar caja a stock</button> : null}
              </div>
              {box.canReceive && data.stateCode !== 'RECEIVED_PERU' ? <div className="alert alert-warning">Primero confirma que la importación general fue recibida en Perú.</div> : null}
            </article>)}</div>
          </Panel>

          <Panel title="Historial"><div className="timeline-list">{data.history.map((item) => <article key={item.id}><span className="timeline-dot" /><div><strong>{item.entityCode} · {stateLabels[item.newStateCode] ?? item.newStateCode}</strong><small>{dateTime(item.changedAt)} · {item.changedByName ?? 'Sistema'}</small>{item.reason ? <p>{item.reason}</p> : null}</div></article>)}</div></Panel>
        </div>

        <aside className="import-detail-sidebar">
          <Panel title="Siguiente estado" subtitle="Avanza la importación general en orden."><div className="delivery-transition-list">{data.allowedTransitions.length === 0 ? <div className="empty-state"><Ship size={28} /><strong>Flujo finalizado</strong></div> : data.allowedTransitions.map((item) => <button key={item.stateCode} className={item.stateCode === 'CANCELLED' ? 'button button-danger button-full' : 'button button-primary button-full'} disabled={shipmentTransition.isPending || (item.stateCode === 'STOCKED' && data.boxes.some((box) => !['STOCKED', 'CANCELLED'].includes(box.stateCode)))} onClick={() => shipmentTransition.mutate(item.stateCode)}><Ship size={16} /> {transitionLabels[item.stateCode] ?? item.name}</button>)}</div></Panel>

          <Panel title="Registrar costo" subtitle="Comisiones, flete, aduanas, seguro u otros."><div className="compact-form-stack"><label className="field"><span>Tipo</span><select value={costType} onChange={(event) => setCostType(event.target.value as CreateImportCostInput['costType'])}>{Object.entries(costLabels).map(([code, label]) => <option key={code} value={code}>{label}</option>)}</select></label><label className="field"><span>Caja opcional</span><select value={costBoxId} onChange={(event) => setCostBoxId(event.target.value)}><option value="">Toda la importación</option>{data.boxes.map((box) => <option key={box.id} value={box.id}>{box.code}</option>)}</select></label><div className="form-grid compact-grid"><label className="field"><span>Importe</span><input type="number" min="0" step="0.01" value={costAmount} onChange={(event) => setCostAmount(Number(event.target.value))} /></label><label className="field"><span>Moneda</span><select value={costCurrency} onChange={(event) => setCostCurrency(event.target.value)}>{support.data?.currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code}</option>)}</select></label></div><label className="field"><span>TC a PEN</span><input type="number" min="0.000001" step="0.000001" value={costExchangeRate} onChange={(event) => setCostExchangeRate(Number(event.target.value))} /></label><label className="field"><span>Descripción</span><input value={costDescription} onChange={(event) => setCostDescription(event.target.value)} /></label><button className="button button-secondary button-full" disabled={addCost.isPending || costAmount < 0 || costExchangeRate <= 0} onClick={() => addCost.mutate()}><CircleDollarSign size={16} /> Guardar costo</button></div></Panel>

          <Panel title="Crear preventa" subtitle="Genera una venta PREORDER y la vincula a una unidad esperada de esta importación."><div className="compact-form-stack"><label className="field"><span>Producto esperado</span><select value={newPreorderItemId} onChange={(event) => { const id = event.target.value; setNewPreorderItemId(id); const importItem = data.boxes.flatMap((box) => box.items).find((item) => item.id === id); const variant = support.data?.variants.find((item) => item.id === importItem?.variantId); const price = variant?.salePrice ?? 0; setNewPreorderOriginalPrice(price); setNewPreorderFinalPrice(price); }}><option value="">Seleccionar</option>{data.boxes.flatMap((box) => box.items.filter((item) => item.inventoryLotId == null).map((item) => <option key={item.id} value={item.id}>{box.code} · {item.productName} · {item.variantName} · libres {Math.max(item.expectedQuantity - item.preorderAllocatedQuantity, 0)}</option>))}</select></label><label className="field"><span>Cliente</span><select value={newPreorderClientId} onChange={(event) => setNewPreorderClientId(event.target.value)}><option value="">Seleccionar cliente</option>{support.data?.activeClients.map((client) => <option key={client.id} value={client.id}>{client.fullName}{client.isVip ? ' · VIP' : ''}</option>)}</select></label><label className="field"><span>Canal</span><select value={newPreorderChannel} onChange={(event) => setNewPreorderChannel(event.target.value)}>{support.data?.salesChannels.map((channel) => <option key={channel.code} value={channel.code}>{channel.name}</option>)}</select></label><div className="form-grid compact-grid"><label className="field"><span>Cantidad</span><input type="number" min="1" value={newPreorderQuantity} onChange={(event) => setNewPreorderQuantity(Number(event.target.value))} /></label><label className="field"><span>Precio original</span><input type="number" min="0" step="0.01" value={newPreorderOriginalPrice} onChange={(event) => setNewPreorderOriginalPrice(Number(event.target.value))} /></label><label className="field"><span>Precio final</span><input type="number" min="0" step="0.01" value={newPreorderFinalPrice} onChange={(event) => setNewPreorderFinalPrice(Number(event.target.value))} /></label></div>{newPreorderFinalPrice < newPreorderOriginalPrice ? <><label className="field"><span>Tipo de descuento</span><select value={newPreorderDiscountType} onChange={(event) => setNewPreorderDiscountType(event.target.value)}>{support.data?.discountTypes.map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}</select></label><label className="field"><span>Motivo</span><input value={newPreorderDiscountReason} onChange={(event) => setNewPreorderDiscountReason(event.target.value)} /></label></> : null}<label className="field"><span>Entrega</span><select value={newPreorderDeliveryMode} onChange={(event) => setNewPreorderDeliveryMode(event.target.value as 'PENDING' | 'ACCUMULATED')}><option value="ACCUMULATED">Acumula almacén</option><option value="PENDING">Entrega pendiente</option></select></label><label className="field"><span>Notas</span><textarea rows={3} value={newPreorderNotes} onChange={(event) => setNewPreorderNotes(event.target.value)} /></label><button className="button button-primary button-full" disabled={createPreorder.isPending || !newPreorderItemId || !newPreorderClientId || newPreorderQuantity <= 0 || newPreorderFinalPrice > newPreorderOriginalPrice} onClick={() => createPreorder.mutate()}><PackageCheck size={16} /> Crear y vincular preventa</button></div></Panel>

          <Panel title="Vincular preventa" subtitle="Asigna mercadería esperada a una línea de venta marcada como PREORDER."><div className="compact-form-stack"><label className="field"><span>Producto importado</span><select value={preorderItemId} onChange={(event) => { setPreorderItemId(event.target.value); setPreorderSaleItemId(''); }}><option value="">Seleccionar</option>{data.boxes.flatMap((box) => box.items.map((item) => <option key={item.id} value={item.id}>{box.code} · {item.productName} · {item.variantName}</option>))}</select></label><label className="field"><span>Venta / cliente</span><select value={preorderSaleItemId} onChange={(event) => setPreorderSaleItemId(event.target.value)}><option value="">Seleccionar preventa</option>{candidates.map((candidate) => <option key={candidate.saleItemId} value={candidate.saleItemId}>{candidate.saleCode} · {candidate.clientName} · quedan {candidate.remainingQuantity}</option>)}</select></label><label className="field"><span>Cantidad</span><input type="number" min="1" value={preorderQuantity} onChange={(event) => setPreorderQuantity(Number(event.target.value))} /></label><button className="button button-secondary button-full" disabled={preorder.isPending || !preorderItemId || !preorderSaleItemId} onClick={() => preorder.mutate()}><Link2 size={16} /> Vincular preventa</button>{support.data?.preorderCandidates.length === 0 ? <small>No hay líneas PREORDER pendientes. Se habilitarán desde el flujo de preventas.</small> : null}</div></Panel>

          <Panel title="Costos registrados"><div className="summary-list">{data.costs.length === 0 ? <div className="empty-state">Sin costos adicionales</div> : data.costs.slice(0, 8).map((cost) => <div key={cost.id}><span>{costLabels[cost.costType] ?? cost.costType}{cost.boxCode ? ` · ${cost.boxCode}` : ''}</span><strong>{money(cost.amountPen)}</strong></div>)}</div></Panel>
          <Panel title="Incidencias y seguro">
            <div className="incident-list">
              {data.incidents.length === 0 ? <div className="empty-state">Sin incidencias</div> : data.incidents.map((item) => (
                <article key={item.id}>
                  <StatusBadge tone={item.status === 'OPEN' ? 'danger' : item.status === 'COVERED' ? 'success' : 'warning'}>{incidentLabels[item.incidentType] ?? item.incidentType}</StatusBadge>
                  <div className="incident-content">
                    <strong>{item.boxCode ?? data.code}</strong>
                    <small>{item.description}</small>
                    {item.insuranceClaims.map((claim) => (
                      <div className="insurance-claim-row" key={claim.id}>
                        <span>Seguro {claim.claimNumber ?? 'sin número'} · {claim.status}</span>
                        <strong>{claim.claimedAmount == null ? 'Sin importe' : `${claim.currencyCode ?? ''} ${claim.claimedAmount.toFixed(2)}`}</strong>
                        {!['REJECTED', 'CLOSED'].includes(claim.status) ? <button className="button button-secondary button-compact" disabled={insuranceUpdate.isPending} onClick={() => insuranceUpdate.mutate(claim.id)}>Actualizar</button> : null}
                      </div>
                    ))}
                    {['MISSING', 'DAMAGED'].includes(item.incidentType) && item.insuranceClaims.length === 0 ? <button className="button button-secondary button-compact" disabled={insuranceClaim.isPending} onClick={() => insuranceClaim.mutate(item.id)}>Registrar reclamo al seguro</button> : null}
                  </div>
                </article>
              ))}
            </div>
            <button className="button button-secondary button-full" onClick={() => incident.mutate({ boxId: null, itemId: null })}><AlertTriangle size={16} /> Registrar incidencia general</button>
          </Panel>
        </aside>
      </section>
    </main>
  );
}
