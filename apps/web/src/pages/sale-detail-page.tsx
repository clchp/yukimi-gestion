import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Ban, Check, ShieldCheck, Truck, X } from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import { useAuth } from '../features/auth/auth-context';
import { getSale, requestSaleRelease, reviewSaleRelease } from '../features/sales/sales-api';
import { SalePaymentsSection } from '../features/payments/sale-payments-section';

const money = (value: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin fecha';
const paymentLabels: Record<string, string> = { UNPAID: 'Sin pago', PARTIAL: 'Pago parcial', PAID: 'Pagada', OVERDUE: 'Vencida', REFUNDED: 'Reembolsada' };
const deliveryLabels: Record<string, string> = { PENDING: 'Pendiente', ACCUMULATED: 'Acumula almacén', PARTIAL: 'Parcial', DELIVERED: 'Entregada', CANCELLED: 'Cancelada' };
const releaseLabels: Record<string, string> = { REQUESTED: 'Solicitada', APPROVED: 'Aprobada', REJECTED: 'Rechazada', EXECUTED: 'Ejecutada', CANCELLED: 'Cancelada' };

export function SaleDetailPage() {
  const navigate = useNavigate();
  const { saleId } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const sale = useQuery({ queryKey: ['sale', saleId], queryFn: () => getSale(saleId as string), enabled: Boolean(saleId) });
  const invalidate = () => Promise.all([queryClient.invalidateQueries({ queryKey: ['sale', saleId] }), queryClient.invalidateQueries({ queryKey: ['sales'] }), queryClient.invalidateQueries({ queryKey: ['inventory'] })]);

  const requestRelease = useMutation({
    mutationFn: async () => {
      const reason = window.prompt('Escribe el motivo de la liberación o cancelación:')?.trim();
      if (!reason) throw new Error('La solicitud fue cancelada.');
      const penaltyText = window.prompt('Penalidad propuesta en soles. Escribe 0 si no corresponde:', '0') ?? '0';
      const penaltyAmount = Number(penaltyText);
      if (!Number.isFinite(penaltyAmount) || penaltyAmount < 0) throw new Error('La penalidad no es válida.');
      return requestSaleRelease(saleId as string, { reason, penaltyAmount });
    },
    onSuccess: invalidate,
  });

  const review = useMutation({
    mutationFn: async ({ requestId, decision }: { requestId: string; decision: 'APPROVE' | 'REJECT' }) => {
      const notes = window.prompt(decision === 'APPROVE' ? 'Notas de aprobación:' : 'Motivo del rechazo:')?.trim();
      if (!notes) throw new Error('La revisión fue cancelada.');
      return reviewSaleRelease(requestId, { decision, reviewNotes: notes });
    },
    onSuccess: invalidate,
  });

  if (sale.isLoading) return <main className="page"><div className="empty-state">Cargando venta…</div></main>;
  if (sale.isError || !sale.data) return <main className="page"><button className="back-link" onClick={() => navigate('/ventas')}><ArrowLeft size={17} /> Volver</button><div className="alert alert-error">{sale.error instanceof Error ? sale.error.message : 'No se pudo cargar la venta.'}</div></main>;

  const data = sale.data;
  const pendingRequest = data.releaseRequests.find((item) => item.stateCode === 'REQUESTED');
  const closed = ['CANCELLED', 'ANNULLED', 'COMPLETED'].includes(data.commercialStateCode);

  return (
    <main className="page">
      <button className="back-link" onClick={() => navigate('/ventas')}><ArrowLeft size={17} /> Volver a ventas</button>
      <PageHeader title={`Venta ${data.code}`} description={`Creada ${dateTime(data.createdAt)} por ${data.createdByName ?? 'Sistema'}`} actions={!closed ? <div className="inline-actions">{data.deliveryStateCode !== 'DELIVERED' ? <button className="button button-primary" onClick={() => navigate(`/entregas/nueva?saleId=${data.id}`)}><Truck size={17} /> Preparar entrega</button> : null}{!pendingRequest ? <button className="button button-danger" disabled={requestRelease.isPending} onClick={() => requestRelease.mutate()}><Ban size={17} /> Solicitar liberación</button> : null}</div> : undefined} />
      <div className="sale-status-line"><StatusBadge tone={data.commercialStateCode === 'CANCELLED' ? 'danger' : 'primary'}>{data.commercialStateCode}</StatusBadge><StatusBadge tone={data.paymentStateCode === 'OVERDUE' ? 'danger' : 'warning'}>{paymentLabels[data.paymentStateCode] ?? data.paymentStateCode}</StatusBadge><StatusBadge tone="info">{deliveryLabels[data.deliveryStateCode] ?? data.deliveryStateCode}</StatusBadge></div>
      {requestRelease.isError ? <div className="alert alert-error">{requestRelease.error instanceof Error ? requestRelease.error.message : 'No se pudo solicitar la liberación.'}</div> : null}
      {review.isError ? <div className="alert alert-error">{review.error instanceof Error ? review.error.message : 'No se pudo revisar la solicitud.'}</div> : null}

      <section className="sale-detail-grid">
        <div className="sale-detail-main">
          <Panel title="Resumen de la venta"><div className="detail-summary-grid"><div><span>Cliente</span><strong>{data.clientName}</strong><small>{data.clientCode}{data.clientIsVip ? ' · VIP' : ''}</small></div><div><span>Canal</span><strong>{data.salesChannelCode}</strong><small>Tipo {data.saleTypeCode}</small></div><div><span>Vencimiento</span><strong>{dateTime(data.dueAt)}</strong><small>{paymentLabels[data.paymentStateCode] ?? data.paymentStateCode}</small></div><div><span>Entrega</span><strong>{deliveryLabels[data.deliveryStateCode] ?? data.deliveryStateCode}</strong><small>{data.items.reduce((sum, item) => sum + item.quantity, 0)} unidades</small></div></div>{data.notes ? <p className="detail-note"><strong>Notas:</strong> {data.notes}</p> : null}</Panel>

          <Panel title="Productos reservados"><div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>Producto</th><th>Asignación</th><th>Cant.</th><th>Precio original</th><th>Descuento</th><th>Total</th><th>Estado</th></tr></thead><tbody>{data.items.map((item) => <tr key={item.id}><td><strong>{item.productName}</strong><small>{item.variantName} · {item.sku}</small></td><td>{item.allocations.map((allocation) => <small key={allocation.id}>{allocation.warehouseName}: {allocation.quantity} · {allocation.lotCode}</small>)}</td><td className="numeric-cell">{item.quantity}</td><td className="numeric-cell">{money(item.originalUnitPrice)}</td><td className="numeric-cell">{money(item.lineDiscountTotal)}</td><td className="numeric-cell"><strong>{money(item.lineTotal)}</strong></td><td><StatusBadge tone={item.itemStatus === 'RELEASED' ? 'danger' : 'success'}>{item.itemStatus}</StatusBadge></td></tr>)}</tbody></table></div></Panel>

          <SalePaymentsSection saleId={data.id} closed={closed} />

          <Panel title="Solicitudes de liberación" subtitle="La persona que solicita no puede aprobar su propia solicitud.">
            {data.releaseRequests.length === 0 ? <div className="empty-state"><strong>Sin solicitudes</strong><p>La reserva permanece activa.</p></div> : <div className="release-request-list">{data.releaseRequests.map((request) => { const ownRequest = request.requestedById === auth.currentUser?.profile.id; return <article className="release-request-card" key={request.id}><div><StatusBadge tone={request.stateCode === 'EXECUTED' ? 'danger' : request.stateCode === 'REJECTED' ? 'neutral' : 'warning'}>{releaseLabels[request.stateCode] ?? request.stateCode}</StatusBadge><strong>{request.reason}</strong><small>Solicitada por {request.requestedByName ?? 'Administradora'} · {dateTime(request.requestedAt)}</small><span>Penalidad propuesta: {money(request.penaltyAmount)}</span>{request.reviewNotes ? <p>Revisión: {request.reviewNotes}</p> : null}</div>{request.stateCode === 'REQUESTED' ? ownRequest ? <div className="alert alert-warning compact-alert">Debe revisarla la otra administradora.</div> : <div className="inline-actions"><button className="button button-primary button-compact" disabled={review.isPending} onClick={() => review.mutate({ requestId: request.id, decision: 'APPROVE' })}><Check size={16} /> Aprobar</button><button className="button button-secondary button-compact" disabled={review.isPending} onClick={() => review.mutate({ requestId: request.id, decision: 'REJECT' })}><X size={16} /> Rechazar</button></div> : null}</article>; })}</div>}
          </Panel>
        </div>

        <aside className="sale-detail-sidebar">
          <Panel title="Totales"><div className="summary-lines"><div><span>Subtotal</span><strong>{money(data.subtotal)}</strong></div><div><span>Descuento</span><strong>− {money(data.discountTotal)}</strong></div><div><span>Penalidad</span><strong>{money(data.penaltyTotal)}</strong></div></div><div className="summary-total"><span>Total</span><strong>{money(data.totalAmount)}</strong></div><div className="summary-lines"><div><span>Pagado</span><strong>{money(data.paidTotal)}</strong></div><div><span>Saldo</span><strong className="text-warning">{money(data.balanceAmount)}</strong></div></div></Panel>
          <Panel title="Control de stock"><div className="quick-action-list"><div className="stock-control-note"><ShieldCheck size={18} /><span><strong>Reserva atómica</strong><small>El stock disponible fue movido a reservado en una sola transacción.</small></span></div></div></Panel>
          <Panel title="Historial"><div className="activity-list simple-activity">{data.history.map((item) => <div className="activity-row" key={item.id}><span className="activity-marker activity-primary" /><div><strong>{item.dimension}: {item.newStateCode}</strong><p>{item.reason ?? item.changedByName ?? 'Cambio registrado'}</p></div><time>{dateTime(item.changedAt)}</time></div>)}</div></Panel>
        </aside>
      </section>
    </main>
  );
}
