import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowLeft,
  Ban,
  Check,
  PackageCheck,
  ShieldCheck,
  Truck,
  X,
} from 'lucide-react';
import { useNavigate, useParams } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import { useAuth } from '../features/auth/auth-context';
import {
  getSale,
  getSaleReleaseQuote,
  requestSaleRelease,
  reviewSaleRelease,
  createReturnCase,
} from '../features/sales/sales-api';
import { getCatalogs } from '../features/catalog/catalog-api';
import { getInventory } from '../features/products/products-api';
import { SalePaymentsSection } from '../features/payments/sale-payments-section';

import { SearchableNativeSelect } from '../components/ui/searchable-native-select';
const money = (value: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : 'Sin fecha';
const paymentLabels: Record<string, string> = {
  UNPAID: 'Sin pago',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  REFUNDED: 'Reembolsada',
};
const deliveryLabels: Record<string, string> = {
  PENDING: 'Pendiente',
  ACCUMULATED: 'Acumula almacén',
  PARTIAL: 'Parcial',
  DELIVERED: 'Entregada',
  CANCELLED: 'Cancelada',
};
function saleItemStatusLabel(status: string, pending: boolean) {
  if (pending) return 'Liberación pendiente';
  if (status === 'RELEASED') return 'Liberado';
  if (status === 'PARTIALLY_RELEASED') return 'Parcialmente liberado';
  if (status === 'ACTIVE') return 'Reservado';
  return status;
}

const releaseLabels: Record<string, string> = {
  REQUESTED: 'Solicitada',
  APPROVED: 'Aprobada',
  REJECTED: 'Rechazada',
  EXECUTED: 'Ejecutada',
  CANCELLED: 'Cancelada',
};

type ReviewTarget = { requestId: string; decision: 'APPROVE' | 'REJECT' };

export function SaleDetailPage() {
  const navigate = useNavigate();
  const { saleId } = useParams();
  const auth = useAuth();
  const queryClient = useQueryClient();
  const [releaseItemId, setReleaseItemId] = useState<string | null>(null);
  const [releaseReason, setReleaseReason] = useState('');
  const [penaltyAmount, setPenaltyAmount] = useState('');
  const [reviewTarget, setReviewTarget] = useState<ReviewTarget | null>(null);
  const [reviewNotes, setReviewNotes] = useState('');
  const [returnOpen, setReturnOpen] = useState(false);
  const [returnType, setReturnType] = useState<'RETURN' | 'EXCHANGE'>('RETURN');
  const [returnItemId, setReturnItemId] = useState('');
  const [returnQuantity, setReturnQuantity] = useState('1');
  const [returnCondition, setReturnCondition] = useState<
    'NEW' | 'OPENED' | 'DAMAGED' | 'DEFECTIVE' | 'OTHER'
  >('OPENED');
  const [returnWarehouseId, setReturnWarehouseId] = useState('');
  const [replacementVariantId, setReplacementVariantId] = useState('');
  const [returnReason, setReturnReason] = useState('');

  const sale = useQuery({
    queryKey: ['sale', saleId],
    queryFn: () => getSale(saleId as string),
    enabled: Boolean(saleId),
  });
  const releaseQuote = useQuery({
    queryKey: ['sale-release-quote', releaseItemId],
    queryFn: () => getSaleReleaseQuote(releaseItemId as string),
    enabled: Boolean(releaseItemId),
  });
  const catalogs = useQuery({ queryKey: ['catalogs'], queryFn: getCatalogs });
  const inventory = useQuery({
    queryKey: ['inventory', 'return-options'],
    queryFn: () => getInventory({ includeVirtual: false }),
    enabled: returnOpen,
  });
  const invalidate = () =>
    Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sale', saleId] }),
      queryClient.invalidateQueries({ queryKey: ['sales'] }),
      queryClient.invalidateQueries({ queryKey: ['inventory'] }),
    ]);

  useEffect(() => {
    if (releaseQuote.data) {
      setPenaltyAmount(String(releaseQuote.data.suggestedReleasePenaltyAmount));
    }
  }, [releaseQuote.data]);

  const requestRelease = useMutation({
    mutationFn: ({
      saleItemId,
      reason,
      penalty,
    }: {
      saleItemId: string;
      reason: string;
      penalty: number;
    }) => requestSaleRelease(saleItemId, { reason, penaltyAmount: penalty }),
    onSuccess: async () => {
      setReleaseItemId(null);
      setReleaseReason('');
      setPenaltyAmount('');
      await invalidate();
    },
  });

  const returnMutation = useMutation({
    mutationFn: () =>
      createReturnCase(saleId as string, {
        caseType: returnType,
        reason: returnReason,
        items: [
          {
            saleItemId: returnItemId,
            quantity: Number(returnQuantity),
            receivedCondition: returnCondition,
            destinationWarehouseId: returnWarehouseId,
            replacementVariantId: returnType === 'EXCHANGE' ? replacementVariantId : null,
            notes: null,
          },
        ],
      }),
    onSuccess: async () => {
      setReturnOpen(false);
      setReturnReason('');
      setReplacementVariantId('');
      await invalidate();
    },
  });

  const review = useMutation({
    mutationFn: ({ requestId, decision, notes }: ReviewTarget & { notes: string }) =>
      reviewSaleRelease(requestId, { decision, reviewNotes: notes }),
    onSuccess: async () => {
      setReviewTarget(null);
      setReviewNotes('');
      await invalidate();
    },
  });

  const proposedPenalty = Number(penaltyAmount);
  const releaseEstimate = useMemo(() => {
    if (!releaseQuote.data || !Number.isFinite(proposedPenalty) || proposedPenalty < 0) return null;
    const effective = Math.max(proposedPenalty, releaseQuote.data.activeLatePenaltyAmount);
    const retained = Math.min(effective, releaseQuote.data.depositBasisAmount);
    return {
      effective,
      retained,
      refundable: Math.max(releaseQuote.data.depositBasisAmount - retained, 0),
    };
  }, [proposedPenalty, releaseQuote.data]);

  const submitRelease = (event: FormEvent) => {
    event.preventDefault();
    if (!releaseItemId || releaseReason.trim().length < 5 || !releaseEstimate) return;
    requestRelease.mutate({
      saleItemId: releaseItemId,
      reason: releaseReason.trim(),
      penalty: proposedPenalty,
    });
  };

  const submitReview = (event: FormEvent) => {
    event.preventDefault();
    if (!reviewTarget || reviewNotes.trim().length < 3) return;
    review.mutate({ ...reviewTarget, notes: reviewNotes.trim() });
  };

  if (sale.isLoading)
    return (
      <main className="page">
        <div className="empty-state">Cargando venta…</div>
      </main>
    );
  if (sale.isError || !sale.data) {
    return (
      <main className="page">
        <button className="back-link" onClick={() => navigate('/ventas')}>
          <ArrowLeft size={17} /> Volver
        </button>
        <div className="alert alert-error">
          {sale.error instanceof Error ? sale.error.message : 'No se pudo cargar la venta.'}
        </div>
      </main>
    );
  }

  const data = sale.data;
  const closed = ['CANCELLED', 'ANNULLED', 'COMPLETED'].includes(data.commercialStateCode);
  const pendingLineIds = new Set(
    data.releaseRequests
      .filter((item) => ['REQUESTED', 'APPROVED'].includes(item.stateCode))
      .map((item) => item.saleItemId),
  );
  const selectedReleaseItem = data.items.find((item) => item.id === releaseItemId);
  const requestProductName = (itemId: string | null) =>
    data.items.find((item) => item.id === itemId)?.productName ?? 'Venta completa (flujo anterior)';

  return (
    <main className="page">
      <button className="back-link" onClick={() => navigate('/ventas')}>
        <ArrowLeft size={17} /> Volver a ventas
      </button>
      <PageHeader
        title={`Venta ${data.code}`}
        description={`Creada ${dateTime(data.createdAt)} por ${data.createdByName ?? 'Sistema'}`}
        actions={
          <>
            {!closed && data.deliveryStateCode !== 'DELIVERED' ? (
              <button
                className="button button-primary"
                onClick={() => navigate(`/entregas/nueva?saleId=${data.id}`)}
              >
                <Truck size={17} /> Preparar entrega
              </button>
            ) : null}
            {!closed ? (
              <button
                className="button button-secondary"
                onClick={() => {
                  setReturnItemId(data.items[0]?.id ?? '');
                  setReturnWarehouseId(
                    catalogs.data?.warehouses.find(
                      (warehouse) =>
                        warehouse.isActive && warehouse.warehouseType === 'OPERATIONAL',
                    )?.id ?? '',
                  );
                  setReturnOpen(true);
                }}
              >
                <PackageCheck size={17} /> Devolución / cambio
              </button>
            ) : null}
          </>
        }
      />
      <div className="sale-status-line">
        <StatusBadge tone={data.commercialStateCode === 'CANCELLED' ? 'danger' : 'primary'}>
          {data.commercialStateCode}
        </StatusBadge>
        <StatusBadge tone={data.paymentStateCode === 'OVERDUE' ? 'danger' : 'warning'}>
          {paymentLabels[data.paymentStateCode] ?? data.paymentStateCode}
        </StatusBadge>
        <StatusBadge tone="info">
          {deliveryLabels[data.deliveryStateCode] ?? data.deliveryStateCode}
        </StatusBadge>
      </div>
      {requestRelease.isError ? (
        <div className="alert alert-error">
          {requestRelease.error instanceof Error
            ? requestRelease.error.message
            : 'No se pudo solicitar la liberación.'}
        </div>
      ) : null}
      {returnMutation.isError ? (
        <div className="alert alert-error">
          {returnMutation.error instanceof Error
            ? returnMutation.error.message
            : 'No se pudo registrar la devolución o cambio.'}
        </div>
      ) : null}
      {review.isError ? (
        <div className="alert alert-error">
          {review.error instanceof Error
            ? review.error.message
            : 'No se pudo revisar la solicitud.'}
        </div>
      ) : null}

      <section className="sale-detail-grid">
        <div className="sale-detail-main">
          <Panel title="Resumen de la venta">
            <div className="detail-summary-grid">
              <div>
                <span>Cliente</span>
                <strong>{data.clientName}</strong>
                <small>
                  {data.clientCode}
                  {data.clientIsVip ? ' · VIP' : ''}
                </small>
              </div>
              <div>
                <span>Canal</span>
                <strong>{data.salesChannelCode}</strong>
                <small>Tipo {data.saleTypeCode}</small>
              </div>
              <div>
                <span>Vencimiento</span>
                <strong>{dateTime(data.dueAt)}</strong>
                <small>{paymentLabels[data.paymentStateCode] ?? data.paymentStateCode}</small>
              </div>
              <div>
                <span>Entrega</span>
                <strong>{deliveryLabels[data.deliveryStateCode] ?? data.deliveryStateCode}</strong>
                <small>{data.items.reduce((sum, item) => sum + item.quantity, 0)} unidades</small>
              </div>
            </div>
            {data.negotiatedMinimumDepositAmount != null ? (
              <p className="detail-note">
                <strong>Acuerdo VIP:</strong> adelanto mínimo de{' '}
                {money(data.negotiatedMinimumDepositAmount)} · {data.negotiatedMinimumDepositReason}
              </p>
            ) : null}
            {data.notes ? (
              <p className="detail-note">
                <strong>Notas:</strong> {data.notes}
              </p>
            ) : null}
          </Panel>

          <Panel
            title="Productos reservados"
            subtitle="La liberación y su penalidad se gestionan por producto."
          >
            <div className="responsive-table-wrap sale-items-table">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Producto</th>
                    <th>Asignación</th>
                    <th>Cant.</th>
                    <th>Precio original</th>
                    <th>Descuento</th>
                    <th>Total</th>
                    <th>Estado</th>
                    <th>
                      <span className="sr-only">Acciones</span>
                    </th>
                  </tr>
                </thead>
                <tbody>
                  {data.items.map((item) => {
                    const canRelease =
                      !closed &&
                      ['ACTIVE', 'PARTIALLY_RELEASED'].includes(item.itemStatus) &&
                      !pendingLineIds.has(item.id);
                    return (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.productName}</strong>
                          <small>
                            {item.variantName} · {item.sku}
                          </small>
                        </td>
                        <td>
                          {item.allocations.map((allocation) => (
                            <small key={allocation.id}>
                              {allocation.warehouseName}: {allocation.quantity} ·{' '}
                              {allocation.lotCode}
                            </small>
                          ))}
                        </td>
                        <td className="numeric-cell">{item.quantity}</td>
                        <td className="numeric-cell">{money(item.originalUnitPrice)}</td>
                        <td className="numeric-cell">{money(item.lineDiscountTotal)}</td>
                        <td className="numeric-cell">
                          <strong>{money(item.lineTotal)}</strong>
                        </td>
                        <td>
                          <StatusBadge
                            tone={
                              pendingLineIds.has(item.id)
                                ? 'warning'
                                : item.itemStatus === 'RELEASED'
                                  ? 'danger'
                                  : 'success'
                            }
                          >
                            {saleItemStatusLabel(item.itemStatus, pendingLineIds.has(item.id))}
                          </StatusBadge>
                        </td>
                        <td>
                          {canRelease ? (
                            <button
                              className="button button-danger button-compact"
                              onClick={() => setReleaseItemId(item.id)}
                            >
                              <Ban size={15} /> Liberar
                            </button>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <div className="sale-item-mobile-list">
              {data.items.map((item) => {
                const canRelease =
                  !closed &&
                  ['ACTIVE', 'PARTIALLY_RELEASED'].includes(item.itemStatus) &&
                  !pendingLineIds.has(item.id);
                return (
                  <article className="sale-item-mobile-card" key={item.id}>
                    <div>
                      <strong>{item.productName}</strong>
                      <small>
                        {item.variantName} · {item.sku}
                      </small>
                    </div>
                    <StatusBadge
                      tone={
                        pendingLineIds.has(item.id)
                          ? 'warning'
                          : item.itemStatus === 'RELEASED'
                            ? 'danger'
                            : 'success'
                      }
                    >
                      {saleItemStatusLabel(item.itemStatus, pendingLineIds.has(item.id))}
                    </StatusBadge>
                    <dl>
                      <div>
                        <dt>Cantidad</dt>
                        <dd>{item.quantity}</dd>
                      </div>
                      <div>
                        <dt>Descuento</dt>
                        <dd>{money(item.lineDiscountTotal)}</dd>
                      </div>
                      <div>
                        <dt>Total</dt>
                        <dd>{money(item.lineTotal)}</dd>
                      </div>
                    </dl>
                    {canRelease ? (
                      <button
                        className="button button-danger"
                        onClick={() => setReleaseItemId(item.id)}
                      >
                        <Ban size={15} /> Solicitar liberación
                      </button>
                    ) : null}
                  </article>
                );
              })}
            </div>
          </Panel>

          <SalePaymentsSection saleId={data.id} closed={closed} />

          <Panel
            title="Solicitudes de liberación"
            subtitle="La persona que solicita no puede aprobar su propia solicitud."
          >
            {data.releaseRequests.length === 0 ? (
              <div className="empty-state">
                <strong>Sin solicitudes</strong>
                <p>Los productos de la reserva permanecen activos.</p>
              </div>
            ) : (
              <div className="release-request-list">
                {data.releaseRequests.map((request) => {
                  const ownRequest = request.requestedById === auth.currentUser?.profile.id;
                  return (
                    <article className="release-request-card" key={request.id}>
                      <div>
                        <div className="release-request-heading">
                          <StatusBadge
                            tone={
                              request.stateCode === 'EXECUTED'
                                ? 'danger'
                                : request.stateCode === 'REJECTED'
                                  ? 'neutral'
                                  : 'warning'
                            }
                          >
                            {releaseLabels[request.stateCode] ?? request.stateCode}
                          </StatusBadge>
                          <strong>{requestProductName(request.saleItemId)}</strong>
                        </div>
                        <p>{request.reason}</p>
                        <small>
                          Solicitada por {request.requestedByName ?? 'Administradora'} ·{' '}
                          {dateTime(request.requestedAt)}
                        </small>
                        <div className="release-amounts">
                          <span>
                            Penalidad: <strong>{money(request.penaltyAmount)}</strong> —{' '}
                            {requestProductName(request.saleItemId)}
                            {request.penaltyOverridden ? ' · editada' : ''}
                          </span>
                          <span>
                            Retención: <strong>{money(request.retainedAmount)}</strong>
                          </span>
                          <span>
                            Devolución estimada: <strong>{money(request.refundableAmount)}</strong>
                          </span>
                        </div>
                        {request.reviewNotes ? <p>Revisión: {request.reviewNotes}</p> : null}
                      </div>
                      {request.stateCode === 'REQUESTED' ? (
                        ownRequest ? (
                          <div className="alert alert-warning compact-alert">
                            Debe revisarla la otra administradora.
                          </div>
                        ) : (
                          <div className="inline-actions">
                            <button
                              className="button button-primary button-compact"
                              disabled={review.isPending}
                              onClick={() =>
                                setReviewTarget({ requestId: request.id, decision: 'APPROVE' })
                              }
                            >
                              <Check size={16} /> Aprobar
                            </button>
                            <button
                              className="button button-secondary button-compact"
                              disabled={review.isPending}
                              onClick={() =>
                                setReviewTarget({ requestId: request.id, decision: 'REJECT' })
                              }
                            >
                              <X size={16} /> Rechazar
                            </button>
                          </div>
                        )
                      ) : null}
                    </article>
                  );
                })}
              </div>
            )}
          </Panel>
        </div>

        <aside className="sale-detail-sidebar">
          <Panel title="Totales">
            <div className="summary-lines">
              <div>
                <span>Subtotal</span>
                <strong>{money(data.subtotal)}</strong>
              </div>
              <div>
                <span>Descuento</span>
                <strong>− {money(data.discountTotal)}</strong>
              </div>
              <div>
                <span>Penalidad</span>
                <strong>{money(data.penaltyTotal)}</strong>
              </div>
            </div>
            <div className="summary-total">
              <span>Total</span>
              <strong>{money(data.totalAmount)}</strong>
            </div>
            <div className="summary-lines">
              <div>
                <span>Pagado</span>
                <strong>{money(data.paidTotal)}</strong>
              </div>
              <div>
                <span>Saldo</span>
                <strong className="text-warning">{money(data.balanceAmount)}</strong>
              </div>
            </div>
          </Panel>
          <Panel title="Control de stock">
            <div className="quick-action-list">
              <div className="stock-control-note">
                <ShieldCheck size={18} />
                <span>
                  <strong>Reserva atómica</strong>
                  <small>El stock disponible fue movido a reservado en una sola transacción.</small>
                </span>
              </div>
            </div>
          </Panel>
          <Panel title="Historial">
            <div className="activity-list simple-activity">
              {data.history.map((item) => (
                <div className="activity-row" key={item.id}>
                  <span className="activity-marker activity-primary" />
                  <div>
                    <strong>
                      {item.dimension}: {item.newStateCode}
                    </strong>
                    <p>{item.reason ?? item.changedByName ?? 'Cambio registrado'}</p>
                  </div>
                  <time>{dateTime(item.changedAt)}</time>
                </div>
              ))}
            </div>
          </Panel>
        </aside>
      </section>

      {returnOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReturnOpen(false);
          }}
        >
          <form
            className="modal-card modal-card-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="return-title"
            onSubmit={(event) => {
              event.preventDefault();
              returnMutation.mutate();
            }}
          >
            <div className="modal-header">
              <div>
                <small>Postventa</small>
                <h2 id="return-title">Registrar devolución o cambio</h2>
                <p>El ingreso y la salida de stock se ejecutan en una sola operación.</p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Cerrar"
                onClick={() => setReturnOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="form-grid form-grid-2">
              <label className="field">
                <span>Tipo *</span>
                <SearchableNativeSelect
                  value={returnType}
                  onChange={(event) => setReturnType(event.target.value as 'RETURN' | 'EXCHANGE')}
                >
                  <option value="RETURN">Devolución</option>
                  <option value="EXCHANGE">Cambio</option>
                </SearchableNativeSelect>
              </label>
              <label className="field">
                <span>Condición recibida *</span>
                <SearchableNativeSelect
                  value={returnCondition}
                  onChange={(event) =>
                    setReturnCondition(event.target.value as typeof returnCondition)
                  }
                >
                  <option value="NEW">Nuevo</option>
                  <option value="OPENED">Abierto</option>
                  <option value="DAMAGED">Dañado</option>
                  <option value="DEFECTIVE">Defectuoso</option>
                  <option value="OTHER">Otro</option>
                </SearchableNativeSelect>
              </label>
              <label className="field field-span-2">
                <span>Producto de la venta *</span>
                <SearchableNativeSelect
                  value={returnItemId}
                  onChange={(event) => setReturnItemId(event.target.value)}
                  required
                >
                  {data.items.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.productName} · {item.variantName} · comprado {item.quantity}
                    </option>
                  ))}
                </SearchableNativeSelect>
              </label>
              <label className="field">
                <span>Cantidad *</span>
                <input
                  type="number"
                  min="1"
                  max={data.items.find((item) => item.id === returnItemId)?.quantity ?? 1}
                  value={returnQuantity}
                  onChange={(event) => setReturnQuantity(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Almacén receptor *</span>
                <SearchableNativeSelect
                  value={returnWarehouseId}
                  onChange={(event) => setReturnWarehouseId(event.target.value)}
                  required
                >
                  <option value="">Seleccionar</option>
                  {catalogs.data?.warehouses
                    .filter(
                      (warehouse) =>
                        warehouse.isActive && warehouse.warehouseType === 'OPERATIONAL',
                    )
                    .map((warehouse) => (
                      <option key={warehouse.id} value={warehouse.id}>
                        {warehouse.name}
                      </option>
                    ))}
                </SearchableNativeSelect>
              </label>
              {returnType === 'EXCHANGE' ? (
                <label className="field field-span-2">
                  <span>Variante de reemplazo *</span>
                  <SearchableNativeSelect
                    value={replacementVariantId}
                    onChange={(event) => setReplacementVariantId(event.target.value)}
                    required
                  >
                    <option value="">Seleccionar</option>
                    {inventory.data?.items
                      .filter(
                        (row) => row.availableQuantity > 0 && row.warehouseId === returnWarehouseId,
                      )
                      .map((row) => (
                        <option key={`${row.variantId}:${row.warehouseId}`} value={row.variantId}>
                          {row.productName} · {row.variantName} · {row.availableQuantity}{' '}
                          disponibles
                        </option>
                      ))}
                  </SearchableNativeSelect>
                </label>
              ) : null}
              <label className="field field-span-2">
                <span>Motivo *</span>
                <textarea
                  rows={4}
                  minLength={5}
                  maxLength={1000}
                  value={returnReason}
                  onChange={(event) => setReturnReason(event.target.value)}
                  required
                />
              </label>
            </div>
            <div className="alert alert-warning">
              <AlertTriangle size={17} /> Confirma que el producto fue recibido físicamente antes de
              completar esta operación.
            </div>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setReturnOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={
                  returnMutation.isPending ||
                  !returnItemId ||
                  !returnWarehouseId ||
                  returnReason.trim().length < 5 ||
                  Number(returnQuantity) < 1 ||
                  (returnType === 'EXCHANGE' && !replacementVariantId)
                }
              >
                {returnMutation.isPending ? 'Procesando…' : 'Confirmar operación'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {releaseItemId ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReleaseItemId(null);
          }}
        >
          <form
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="release-title"
            onSubmit={submitRelease}
          >
            <div className="modal-header">
              <div>
                <small>Producto de la venta</small>
                <h2 id="release-title">Solicitar liberación</h2>
                <p>
                  {selectedReleaseItem?.productName} · {selectedReleaseItem?.variantName}
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Cerrar"
                onClick={() => setReleaseItemId(null)}
              >
                <X size={18} />
              </button>
            </div>
            {releaseQuote.isLoading ? (
              <div className="empty-state">Calculando la regla aplicable…</div>
            ) : null}
            {releaseQuote.isError ? (
              <div className="alert alert-error">
                {releaseQuote.error instanceof Error
                  ? releaseQuote.error.message
                  : 'No se pudo calcular la penalidad.'}
              </div>
            ) : null}
            {releaseQuote.data ? (
              <>
                <div className="release-rule-callout">
                  <div>
                    <span>Categoría</span>
                    <strong>{releaseQuote.data.categoryName}</strong>
                  </div>
                  <div>
                    <span>Valor sugerido</span>
                    <strong>{money(releaseQuote.data.suggestedReleasePenaltyAmount)}</strong>
                  </div>
                  <div>
                    <span>Adelanto asignado</span>
                    <strong>{money(releaseQuote.data.depositBasisAmount)}</strong>
                  </div>
                </div>
                <p className="helper-text">
                  {releaseQuote.data.withinGracePeriod
                    ? `Está dentro de las primeras ${releaseQuote.data.graceHours} horas: se sugiere S/0.`
                    : `Pasaron ${Math.floor(releaseQuote.data.elapsedHours)} horas. El valor de ${releaseQuote.data.categoryName} aparece por defecto y puede modificarse.`}
                </p>
                {releaseQuote.data.activeLatePenaltyAmount > 0 ? (
                  <div className="alert alert-warning">
                    <AlertTriangle size={17} /> Existe una penalidad por atraso de{' '}
                    {money(releaseQuote.data.activeLatePenaltyAmount)}. El sistema conservará solo
                    la penalidad mayor.
                  </div>
                ) : null}
                <label className="field">
                  <span>Penalidad de liberación (S/) *</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={penaltyAmount}
                    onChange={(event) => setPenaltyAmount(event.target.value)}
                    required
                  />
                  <small>El valor sugerido es editable y el cambio quedará registrado.</small>
                </label>
                <label className="field">
                  <span>Motivo *</span>
                  <textarea
                    rows={4}
                    minLength={5}
                    maxLength={1000}
                    value={releaseReason}
                    onChange={(event) => setReleaseReason(event.target.value)}
                    placeholder="Explica por qué el cliente libera este producto."
                    required
                  />
                </label>
                {releaseEstimate ? (
                  <div className="release-refund-summary" aria-live="polite">
                    <div>
                      <span>Penalidad aplicable</span>
                      <strong>{money(releaseEstimate.effective)}</strong>
                    </div>
                    <div>
                      <span>Se retiene del adelanto</span>
                      <strong>{money(releaseEstimate.retained)}</strong>
                    </div>
                    <div>
                      <span>Devolución estimada</span>
                      <strong>{money(releaseEstimate.refundable)}</strong>
                    </div>
                  </div>
                ) : null}
                <div className="alert alert-info compact-alert">
                  Esta solicitud no mueve stock hasta que la otra administradora la apruebe.
                </div>
              </>
            ) : null}
            {requestRelease.isError ? (
              <div className="alert alert-error">
                {requestRelease.error instanceof Error
                  ? requestRelease.error.message
                  : 'No se pudo guardar la solicitud.'}
              </div>
            ) : null}
            <div className="modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setReleaseItemId(null)}
              >
                Cancelar
              </button>
              <button
                className="button button-danger"
                type="submit"
                disabled={
                  !releaseQuote.data ||
                  !releaseEstimate ||
                  releaseReason.trim().length < 5 ||
                  requestRelease.isPending
                }
              >
                {requestRelease.isPending ? 'Solicitando…' : 'Solicitar liberación'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {reviewTarget ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReviewTarget(null);
          }}
        >
          <form
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="review-title"
            onSubmit={submitReview}
          >
            <div className="modal-header">
              <div>
                <small>Control de dos personas</small>
                <h2 id="review-title">
                  {reviewTarget.decision === 'APPROVE'
                    ? 'Aprobar liberación'
                    : 'Rechazar liberación'}
                </h2>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Cerrar"
                onClick={() => setReviewTarget(null)}
              >
                <X size={18} />
              </button>
            </div>
            <label className="field">
              <span>
                {reviewTarget.decision === 'APPROVE'
                  ? 'Notas de aprobación *'
                  : 'Motivo del rechazo *'}
              </span>
              <textarea
                rows={4}
                minLength={3}
                maxLength={1000}
                value={reviewNotes}
                onChange={(event) => setReviewNotes(event.target.value)}
                required
              />
            </label>
            {reviewTarget.decision === 'APPROVE' ? (
              <div className="alert alert-warning">
                <AlertTriangle size={17} /> Al aprobar, el producto reservado volverá al stock
                disponible y la operación quedará auditada.
              </div>
            ) : null}
            <div className="modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setReviewTarget(null)}
              >
                Cancelar
              </button>
              <button
                className={
                  reviewTarget.decision === 'APPROVE'
                    ? 'button button-danger'
                    : 'button button-primary'
                }
                type="submit"
                disabled={reviewNotes.trim().length < 3 || review.isPending}
              >
                {review.isPending ? 'Procesando…' : 'Confirmar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
