import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { DeliveryStateCode } from '@yukimi/shared';
import { ArrowLeft, ExternalLink, PackageCheck, Pencil, Truck } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import { advanceDelivery, getDelivery } from '../features/deliveries/deliveries-api';

const stateLabels: Record<string, string> = {
  PENDING_INSTRUCTIONS: 'Pendiente de indicaciones', ACCUMULATED: 'Acumula almacén',
  PENDING_AGENCY_DISPATCH: 'Pendiente de despacho a agencia', DELIVERED_TO_AGENCY: 'Entregado a agencia',
  OUT_FOR_DELIVERY: 'En reparto', PARTIALLY_DELIVERED: 'Parcialmente entregado',
  DELIVERED_TO_CLIENT: 'Entregado al cliente', CANCELLED: 'Cancelada',
};
const methodLabels: Record<string, string> = {
  AGENCY: 'Agencia', MOTORBIKE: 'Motorizado', IN_PERSON: 'Presencial', WAREHOUSE_ACCUMULATION: 'Acumula almacén', OTHER: 'Otro',
};
const transitionLabels: Partial<Record<DeliveryStateCode, string>> = {
  ACCUMULATED: 'Mantener acumulado', PENDING_AGENCY_DISPATCH: 'Preparar despacho a agencia',
  DELIVERED_TO_AGENCY: 'Confirmar entrega a agencia', OUT_FOR_DELIVERY: 'Marcar en reparto',
  PARTIALLY_DELIVERED: 'Marcar entrega parcial', DELIVERED_TO_CLIENT: 'Confirmar entrega al cliente', CANCELLED: 'Cancelar entrega',
};
const money = (value: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin registrar';
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
  const delivery = useQuery({ queryKey: ['delivery', deliveryId], queryFn: () => getDelivery(deliveryId as string), enabled: Boolean(deliveryId) });

  const transition = useMutation({
    mutationFn: async (nextStateCode: DeliveryStateCode) => {
      const data = delivery.data;
      if (!data) throw new Error('La entrega no está disponible.');
      let trackingNumber: string | null = data.trackingNumber;
      if (nextStateCode === 'DELIVERED_TO_AGENCY' && !trackingNumber) {
        trackingNumber = window.prompt('Ingresa el número de seguimiento entregado por la agencia:')?.trim() || null;
        if (!trackingNumber) throw new Error('El número de seguimiento es obligatorio para la agencia.');
      }
      const reason = window.prompt(nextStateCode === 'CANCELLED' ? 'Indica el motivo de cancelación:' : 'Escribe una nota breve sobre este cambio:', transitionLabels[nextStateCode] ?? '')?.trim();
      if (!reason) throw new Error('El cambio fue cancelado.');
      return advanceDelivery(data.id, {
        nextStateCode,
        reason,
        occurredAt: new Date().toISOString(),
        trackingNumber,
      });
    },
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['delivery', deliveryId] }),
        queryClient.invalidateQueries({ queryKey: ['deliveries'] }),
        queryClient.invalidateQueries({ queryKey: ['sales'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      ]);
    },
  });

  if (delivery.isLoading) return <main className="page"><div className="empty-state">Cargando entrega…</div></main>;
  if (delivery.isError || !delivery.data) return <main className="page"><button className="back-link" onClick={() => navigate('/entregas')}><ArrowLeft size={17} /> Volver</button><div className="alert alert-error">{delivery.error instanceof Error ? delivery.error.message : 'No se pudo cargar la entrega.'}</div></main>;

  const data = delivery.data;
  return (
    <main className="page">
      <button className="back-link" onClick={() => navigate('/entregas')}><ArrowLeft size={17} /> Volver a entregas</button>
      <PageHeader eyebrow="Seguimiento logístico" title={`Entrega ${data.code}`} description={`Venta ${data.saleCode} · Creada ${dateTime(data.createdAt)} por ${data.createdByName ?? 'Sistema'}`} actions={<>{data.canEdit ? <button className="button button-primary" onClick={() => navigate(`/entregas/${data.id}/editar`)}><Pencil size={17} /> Editar entrega</button> : null}<button className="button button-secondary" onClick={() => navigate(`/ventas/${data.saleId}`)}><ExternalLink size={17} /> Abrir venta</button></>} />
      <div className="sale-status-line"><StatusBadge tone={toneFor(data.stateCode)}>{stateLabels[data.stateCode] ?? data.stateCode}</StatusBadge><StatusBadge tone="info">{methodLabels[data.deliveryMethod] ?? data.deliveryMethod}</StatusBadge></div>
      {transition.isError ? <div className="alert alert-error">{transition.error instanceof Error ? transition.error.message : 'No se pudo actualizar la entrega.'}</div> : null}

      <section className="sale-detail-grid">
        <div className="sale-detail-main">
          <Panel title="Resumen de la entrega"><div className="detail-summary-grid"><div><span>Cliente</span><strong>{data.clientName}</strong><small>{data.clientPhone ?? 'Sin celular'}</small></div><div><span>Operador</span><strong>{data.operatorName ?? 'Sin operador'}</strong><small>{methodLabels[data.deliveryMethod]}</small></div><div><span>Seguimiento</span><strong>{data.trackingNumber ?? 'Pendiente'}</strong><small>{stateLabels[data.stateCode]}</small></div><div><span>Costo</span><strong>{money(data.shippingCost)}</strong><small>{data.costPayer}</small></div></div>{data.destinationAddress ? <p className="detail-note"><strong>Destino:</strong> {data.destinationLabel ? `${data.destinationLabel} · ` : ''}{data.destinationAddress}</p> : null}{data.notes ? <p className="detail-note"><strong>Notas:</strong> {data.notes}</p> : null}</Panel>

          <Panel title="Productos de esta entrega"><div className="responsive-table-wrap delivery-detail-table"><table className="data-table"><thead><tr><th>Producto</th><th>SKU</th><th>Cantidad</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td><strong>{item.productName}</strong><small>{item.variantName}</small></td><td>{item.sku}</td><td className="numeric-cell"><strong>{item.quantity}</strong></td></tr>)}</tbody></table></div><div className="mobile-card-list delivery-item-mobile">{data.items.map((item) => <article className="mobile-record-card" key={item.id}><strong>{item.productName}</strong><small>{item.variantName} · {item.sku}</small><span>{item.quantity} unidad(es)</span></article>)}</div></Panel>

          <Panel title="Historial"><div className="timeline-list">{data.history.map((item) => <article key={item.id}><span className="timeline-dot" /><div><strong>{stateLabels[item.newStateCode] ?? item.newStateCode}</strong><small>{dateTime(item.changedAt)} · {item.changedByName ?? 'Sistema'}</small>{item.reason ? <p>{item.reason}</p> : null}</div></article>)}</div></Panel>
        </div>

        <aside className="sale-detail-sidebar">
          <Panel title="Fechas"><div className="summary-list"><div><span>Planificado</span><strong>{data.plannedDispatchDate ?? 'Sin fecha'}</strong></div><div><span>Despachado</span><strong>{dateTime(data.dispatchedAt)}</strong></div><div><span>Recibido por agencia</span><strong>{dateTime(data.agencyReceivedAt)}</strong></div><div><span>Entregado al cliente</span><strong>{dateTime(data.deliveredAt)}</strong></div></div></Panel>
          <Panel title="Siguiente acción" subtitle="Los cambios quedan en el historial y actualizan el inventario cuando el cliente recibe."><div className="delivery-transition-list">{data.allowedTransitions.length === 0 ? <div className="empty-state"><PackageCheck size={28} /><strong>Flujo finalizado</strong></div> : data.allowedTransitions.map((item) => <button key={item.stateCode} className={item.stateCode === 'CANCELLED' ? 'button button-danger button-full' : 'button button-primary button-full'} disabled={transition.isPending} onClick={() => transition.mutate(item.stateCode)}><Truck size={16} /> {transitionLabels[item.stateCode] ?? item.name}</button>)}</div></Panel>
        </aside>
      </section>
    </main>
  );
}
