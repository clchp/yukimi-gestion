import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryStateCode } from '@yukimi/shared';
import {
  AlertTriangle,
  ArrowLeft,
  ExternalLink,
  PackageCheck,
  Pencil,
  Truck,
  X,
} from 'lucide-react';
import { useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import { advanceDelivery, getDelivery } from '../features/deliveries/deliveries-api';
import { getSale } from '../features/sales/sales-api';

const stateLabels: Record<string, string> = {
  PENDING_INSTRUCTIONS: 'Pendiente de indicaciones',
  ACCUMULATED: 'Acumula almacén',
  PENDING_AGENCY_DISPATCH: 'Pendiente de despacho a agencia',
  DELIVERED_TO_AGENCY: 'Entregado a agencia',
  OUT_FOR_DELIVERY: 'En reparto',
  PARTIALLY_DELIVERED: 'Parcialmente entregado',
  DELIVERED_TO_CLIENT: 'Entregado al cliente',
  CANCELLED: 'Cancelada',
};
const methodLabels: Record<string, string> = {
  AGENCY: 'Agencia',
  MOTORBIKE: 'Motorizado',
  IN_PERSON: 'Presencial',
  WAREHOUSE_ACCUMULATION: 'Acumula almacén',
  OTHER: 'Otro',
};
const costPayerLabels: Record<string, string> = {
  CLIENT: 'Cliente',
  BUSINESS: 'Yukimi',
  SHARED: 'Compartido',
  NOT_APPLICABLE: 'No aplica',
};
const transitionLabels: Partial<Record<DeliveryStateCode, string>> = {
  ACCUMULATED: 'Mantener acumulado',
  PENDING_AGENCY_DISPATCH: 'Preparar despacho a agencia',
  DELIVERED_TO_AGENCY: 'Registrar entrega a agencia',
  OUT_FOR_DELIVERY: 'Marcar en reparto',
  PARTIALLY_DELIVERED: 'Marcar entrega parcial',
  DELIVERED_TO_CLIENT: 'Confirmar entrega al cliente',
  CANCELLED: 'Cancelar entrega',
};
const physicalTransitions = new Set<DeliveryStateCode>([
  'DELIVERED_TO_AGENCY',
  'OUT_FOR_DELIVERY',
  'PARTIALLY_DELIVERED',
  'DELIVERED_TO_CLIENT',
]);
const money = (value: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : 'Sin registrar';
const dateOnly = (value: string | null) => {
  if (!value) return 'Sin fecha';
  const [year, month, day] = value.split('-').map(Number);
  if (!year || !month || !day) return value;
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(
    new Date(year, month - 1, day),
  );
};
function toneFor(state: string): 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  if (state === 'DELIVERED_TO_CLIENT') return 'success';
  if (state === 'CANCELLED') return 'danger';
  if (state === 'DELIVERED_TO_AGENCY' || state === 'OUT_FOR_DELIVERY') return 'info';
  if (state === 'ACCUMULATED') return 'primary';
  return 'warning';
}

export function DeliveryDetailPage() {
  const navigate = useNavigate();
  const { deliveryId } = useParams();
  const queryClient = useQueryClient();
  const [pendingState, setPendingState] = useState<DeliveryStateCode | null>(null);
  const [transitionReason, setTransitionReason] = useState('');
  const [trackingNumber, setTrackingNumber] = useState('');
  const delivery = useQuery({
    queryKey: ['delivery', deliveryId],
    queryFn: () => getDelivery(deliveryId as string),
    enabled: Boolean(deliveryId),
  });
  const sale = useQuery({
    queryKey: ['sale', delivery.data?.saleId],
    queryFn: () => getSale(delivery.data?.saleId as string),
    enabled: Boolean(delivery.data?.saleId),
  });

  const transition = useMutation({
    mutationFn: async ({
      nextStateCode,
      reason,
      tracking,
    }: {
      nextStateCode: DeliveryStateCode;
      reason: string;
      tracking: string;
    }) => {
      const data = delivery.data;
      if (!data) throw new Error('La entrega no está disponible.');
      const normalizedTracking = tracking.trim() || data.trackingNumber;
      if (nextStateCode === 'DELIVERED_TO_AGENCY' && !normalizedTracking) {
        throw new Error('El número de seguimiento es obligatorio para la agencia.');
      }
      return advanceDelivery(data.id, {
        nextStateCode,
        reason: reason.trim(),
        occurredAt: new Date().toISOString(),
        trackingNumber: normalizedTracking,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['delivery', deliveryId] }),
        queryClient.invalidateQueries({ queryKey: ['deliveries'] }),
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['sale'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      ]);
      setPendingState(null);
      setTransitionReason('');
    },
  });

  if (delivery.isLoading)
    return (
      <main className="page">
        <div className="empty-state">Cargando entrega…</div>
      </main>
    );
  if (delivery.isError || !delivery.data)
    return (
      <main className="page">
        <button className="back-link" onClick={() => navigate('/entregas')}>
          <ArrowLeft size={17} /> Volver
        </button>
        <div className="alert alert-error">
          {delivery.error instanceof Error
            ? delivery.error.message
            : 'No se pudo cargar la entrega.'}
        </div>
      </main>
    );

  const data = delivery.data;
  const pendingBalance = Math.max(0, sale.data?.balanceAmount ?? 0);
  const pendingTransitionHasPhysicalEffect =
    pendingState !== null && physicalTransitions.has(pendingState);

  return (
    <main className="page delivery-detail-page">
      <button className="back-link" onClick={() => navigate('/entregas')}>
        <ArrowLeft size={17} /> Volver a entregas
      </button>
      <PageHeader
        eyebrow="Seguimiento logístico"
        title={`Entrega ${data.code}`}
        description={`Venta ${data.saleCode} · Creada ${dateTime(data.createdAt)} por ${data.createdByName ?? 'Sistema'}`}
        actions={
          <>
            {data.canEdit ? (
              <button
                className="button button-primary"
                onClick={() => navigate(`/entregas/${data.id}/editar`)}
              >
                <Pencil size={17} /> Editar entrega
              </button>
            ) : null}
            <button
              className="button button-secondary"
              onClick={() => navigate(`/ventas/${data.saleId}`)}
            >
              <ExternalLink size={17} /> Abrir venta
            </button>
          </>
        }
      />
      <div className="sale-status-line">
        <StatusBadge tone={toneFor(data.stateCode)}>
          {stateLabels[data.stateCode] ?? data.stateCode}
        </StatusBadge>
        <StatusBadge tone="info">
          {methodLabels[data.deliveryMethod] ?? data.deliveryMethod}
        </StatusBadge>
      </div>
      {pendingBalance > 0 ? (
        <div className="alert alert-warning delivery-payment-warning">
          <AlertTriangle size={18} />
          <div>
            <strong>La venta todavía tiene {money(pendingBalance)} de saldo pendiente.</strong>
            <span>La preparación está permitida; verifica el pago antes de ejecutar el despacho.</span>
          </div>
        </div>
      ) : null}
      {transition.isError ? (
        <div className="alert alert-error">
          {transition.error instanceof Error
            ? transition.error.message
            : 'No se pudo actualizar la entrega.'}
        </div>
      ) : null}

      <section className="sale-detail-grid">
        <div className="sale-detail-main">
          <Panel title="Resumen de la entrega">
            <div className="detail-summary-grid">
              <div>
                <span>Cliente</span>
                <strong>{data.clientName}</strong>
                <small>{data.clientPhone ?? 'Sin celular'}</small>
              </div>
              <div>
                <span>Operador</span>
                <strong>{data.operatorName ?? 'Sin operador'}</strong>
                <small>{methodLabels[data.deliveryMethod]}</small>
              </div>
              <div>
                <span>Seguimiento</span>
                <strong>{data.trackingNumber ?? 'Pendiente'}</strong>
                <small>{stateLabels[data.stateCode]}</small>
              </div>
              <div>
                <span>Costo</span>
                <strong>{money(data.shippingCost)}</strong>
                <small>{costPayerLabels[data.costPayer] ?? data.costPayer}</small>
              </div>
            </div>
            <p className={`detail-note ${data.destinationAddress ? '' : 'detail-note-warning'}`}>
              <strong>Destino:</strong>{' '}
              {data.destinationAddress
                ? `${data.destinationLabel ? `${data.destinationLabel} · ` : ''}${data.destinationAddress}`
                : 'Sin dirección o punto registrado'}
            </p>
            {data.notes ? (
              <p className="detail-note">
                <strong>Notas:</strong> {data.notes}
              </p>
            ) : null}
          </Panel>

          <Panel title="Productos de esta entrega">
            <div className="responsive-table-wrap delivery-detail-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>SKU</th>
                    <th>Cantidad</th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.productName}</strong>
                        <small>{item.variantName}</small>
                      </td>
                      <td>{item.sku}</td>
                      <td className="numeric-cell">
                        <strong>{item.quantity}</strong>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="mobile-card-list delivery-item-mobile">
              {data.items.map((item) => (
                <article className="mobile-record-card" key={item.id}>
                  <strong>{item.productName}</strong>
                  <small>
                    {item.variantName} · {item.sku}
                  </small>
                  <span>{item.quantity} unidad(es)</span>
                </article>
              ))}
            </div>
          </Panel>

          <Panel title="Historial">
            <div className="timeline-list">
              {data.history.map((item) => (
                <article key={item.id}>
                  <span className="timeline-dot" />
                  <div>
                    <strong>{stateLabels[item.newStateCode] ?? item.newStateCode}</strong>
                    <small>
                      {dateTime(item.changedAt)} · {item.changedByName ?? 'Sistema'}
                    </small>
                    {item.reason ? <p>{item.reason}</p> : null}
                  </div>
                </article>
              ))}
            </div>
          </Panel>
        </div>

        <aside className="sale-detail-sidebar">
          <Panel title="Fechas">
            <div className="summary-list delivery-meta-list">
              <div>
                <span>Planificado</span>
                <strong>{dateOnly(data.plannedDispatchDate)}</strong>
              </div>
              <div>
                <span>Despachado</span>
                <strong>{dateTime(data.dispatchedAt)}</strong>
              </div>
              <div>
                <span>Recibido por agencia</span>
                <strong>{dateTime(data.agencyReceivedAt)}</strong>
              </div>
              <div>
                <span>Entregado al cliente</span>
                <strong>{dateTime(data.deliveredAt)}</strong>
              </div>
            </div>
          </Panel>
          <Panel
            title="Siguiente acción"
            subtitle="Solo se muestra el siguiente paso válido. Los cambios quedan en el historial."
          >
            <div className="delivery-transition-list">
              {data.allowedTransitions.length === 0 ? (
                <div className="empty-state">
                  <PackageCheck size={28} />
                  <strong>Flujo finalizado</strong>
                </div>
              ) : (
                data.allowedTransitions.map((item) => (
                  <button
                    key={item.stateCode}
                    className={
                      item.stateCode === 'CANCELLED'
                        ? 'button button-danger button-full'
                        : 'button button-primary button-full'
                    }
                    disabled={transition.isPending}
                    onClick={() => {
                      setPendingState(item.stateCode);
                      setTransitionReason(transitionLabels[item.stateCode] ?? item.name);
                      setTrackingNumber(data.trackingNumber ?? '');
                    }}
                  >
                    <Truck size={16} /> {transitionLabels[item.stateCode] ?? item.name}
                  </button>
                ))
              )}
            </div>
          </Panel>
        </aside>
      </section>

      {pendingState ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setPendingState(null);
          }}
        >
          <form
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="delivery-transition-title"
            onSubmit={(event) => {
              event.preventDefault();
              transition.mutate({
                nextStateCode: pendingState,
                reason: transitionReason,
                tracking: trackingNumber,
              });
            }}
          >
            <div className="modal-header">
              <div>
                <small>Cambio de estado</small>
                <h2 id="delivery-transition-title">
                  {transitionLabels[pendingState] ?? stateLabels[pendingState]}
                </h2>
                <p>Confirma los datos antes de actualizar la entrega.</p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Cerrar"
                onClick={() => setPendingState(null)}
              >
                <X size={18} />
              </button>
            </div>
            {pendingBalance > 0 && pendingTransitionHasPhysicalEffect ? (
              <div className="alert alert-warning delivery-payment-warning">
                <AlertTriangle size={18} />
                <div>
                  <strong>Saldo pendiente: {money(pendingBalance)}</strong>
                  <span>Confirma que revisaste el pago antes de continuar con el movimiento físico.</span>
                </div>
              </div>
            ) : null}
            {pendingState === 'DELIVERED_TO_AGENCY' ? (
              <label className="field">
                <span>Número de seguimiento *</span>
                <input
                  value={trackingNumber}
                  onChange={(event) => setTrackingNumber(event.target.value)}
                  minLength={3}
                  required
                />
              </label>
            ) : null}
            <label className="field">
              <span>
                {pendingState === 'CANCELLED' ? 'Motivo de cancelación' : 'Nota del cambio'} *
              </span>
              <textarea
                rows={4}
                minLength={3}
                maxLength={1000}
                value={transitionReason}
                onChange={(event) => setTransitionReason(event.target.value)}
                required
              />
            </label>
            {transition.isError ? (
              <div className="alert alert-error">
                {transition.error instanceof Error
                  ? transition.error.message
                  : 'No se pudo actualizar la entrega.'}
              </div>
            ) : null}
            <div className="modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setPendingState(null)}
              >
                Volver
              </button>
              <button
                className={
                  pendingState === 'CANCELLED' ? 'button button-danger' : 'button button-primary'
                }
                type="submit"
                disabled={transition.isPending}
              >
                {transition.isPending ? 'Guardando…' : 'Confirmar cambio'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
