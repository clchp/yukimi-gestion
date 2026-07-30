import { useQuery } from '@tanstack/react-query';
import type { DeliveryFilter } from '@yukimi/shared';
import { MoreHorizontal, PackageCheck, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { StatusBadge } from '../components/ui/status-badge';
import { Toolbar } from '../components/ui/toolbar';
import { getDeliveries, getDeliverySupportData } from '../features/deliveries/deliveries-api';

const filters: Array<{ code: DeliveryFilter; label: string }> = [
  { code: 'ALL', label: 'Todas' },
  { code: 'PENDING_AGENCY', label: 'Pendiente agencia' },
  { code: 'IN_TRANSIT', label: 'En agencia o reparto' },
  { code: 'DELIVERED', label: 'Entregadas' },
  { code: 'CANCELLED', label: 'Canceladas' },
];

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
const money = (value: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
const date = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(
        new Date(`${value}T12:00:00`),
      )
    : 'Sin fecha';

function toneFor(state: string): 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  if (state === 'DELIVERED_TO_CLIENT') return 'success';
  if (state === 'CANCELLED') return 'danger';
  if (state === 'DELIVERED_TO_AGENCY' || state === 'OUT_FOR_DELIVERY') return 'info';
  if (state === 'ACCUMULATED') return 'primary';
  return 'warning';
}

export function DeliveriesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<DeliveryFilter>('ALL');
  const [page, setPage] = useState(1);
  const deliveries = useQuery({
    queryKey: ['deliveries', search, filter, page],
    queryFn: () => getDeliveries({ search, filter, page, pageSize: 20 }),
    placeholderData: (previous) => previous,
  });
  const support = useQuery({
    queryKey: ['delivery-support'],
    queryFn: () => getDeliverySupportData(),
  });
  const accumulatedSales =
    support.data?.eligibleSales.filter((sale) => sale.deliveryStateCode === 'ACCUMULATED') ?? [];
  const totalPages = Math.max(
    1,
    Math.ceil((deliveries.data?.total ?? 0) / (deliveries.data?.pageSize ?? 20)),
  );

  return (
    <main className="page">
      <PageHeader
        eyebrow="Despachos"
        title="Gestión de entregas"
        description="Organiza entregas parciales, acumulaciones, despachos a agencia y confirmaciones al cliente."
        actions={
          <button className="button button-primary" onClick={() => navigate('/entregas/nueva')}>
            <Plus size={17} /> Nueva entrega
          </button>
        }
      />
      <section className="summary-strip">
        <div>
          <span>Pendientes</span>
          <strong>{deliveries.data?.summary.pending ?? '—'}</strong>
        </div>
        <div>
          <span>Acumulan almacén</span>
          <strong>{deliveries.data?.summary.accumulated ?? '—'}</strong>
        </div>
        <div>
          <span>En agencia o reparto</span>
          <strong>{deliveries.data?.summary.inTransit ?? '—'}</strong>
        </div>
        <div>
          <span>Entregadas este mes</span>
          <strong>{deliveries.data?.summary.deliveredThisMonth ?? '—'}</strong>
        </div>
      </section>
      {deliveries.isError ? (
        <div className="alert alert-error">
          {deliveries.error instanceof Error
            ? deliveries.error.message
            : 'No se pudieron cargar las entregas.'}
        </div>
      ) : null}
      {accumulatedSales.length > 0 ? (
        <section className="panel accumulated-sales-panel">
          <div className="panel-header">
            <div>
              <h2>Ventas acumuladas listas para despacho</h2>
              <p>Sus productos siguen separados en almacén hasta que prepares una entrega real.</p>
            </div>
          </div>
          <div className="accumulated-sale-list">
            {accumulatedSales.slice(0, 6).map((sale) => (
              <button key={sale.id} onClick={() => navigate(`/entregas/nueva?saleId=${sale.id}`)}>
                <span className="priority-icon info">
                  <PackageCheck size={17} />
                </span>
                <span>
                  <strong>
                    {sale.code} · {sale.clientName}
                  </strong>
                  <small>{sale.remainingUnits} unidad(es) pendientes</small>
                </span>
                <span>Preparar entrega</span>
              </button>
            ))}
          </div>
        </section>
      ) : null}
      <section className="panel table-panel">
        <Toolbar
          placeholder="Buscar entrega, venta, cliente, tracking u operador…"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          showFilterButton={false}
        />
        <div className="filter-chips">
          {filters.map((item) => (
            <button
              key={item.code}
              className={`filter-chip ${filter === item.code ? 'active' : ''}`}
              onClick={() => {
                setFilter(item.code);
                setPage(1);
              }}
            >
              {item.label}
            </button>
          ))}
        </div>
        <div className="responsive-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Entrega</th>
                <th>Cliente</th>
                <th>Venta</th>
                <th>Productos</th>
                <th>Método / operador</th>
                <th>Seguimiento</th>
                <th>Despacho</th>
                <th>Costo</th>
                <th>Estado</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {deliveries.isLoading ? (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state">Cargando entregas…</div>
                  </td>
                </tr>
              ) : null}
              {!deliveries.isLoading && deliveries.data?.items.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state">
                      <strong>No hay entregas</strong>
                      <p>Crea la primera entrega o cambia los filtros.</p>
                    </div>
                  </td>
                </tr>
              ) : null}
              {deliveries.data?.items.map((item) => (
                <tr key={item.id} onClick={() => navigate(`/entregas/${item.id}`)}>
                  <td>
                    <strong>{item.code}</strong>
                    <small>
                      {new Intl.DateTimeFormat('es-PE', { dateStyle: 'short' }).format(
                        new Date(item.createdAt),
                      )}
                    </small>
                  </td>
                  <td>
                    <strong>{item.clientName}</strong>
                    <small>{item.clientPhone ?? 'Sin celular'}</small>
                  </td>
                  <td>{item.saleCode}</td>
                  <td className="numeric-cell">
                    <strong>{item.totalUnits}</strong>
                    <small>{item.itemLines} línea(s)</small>
                  </td>
                  <td>
                    <strong>{methodLabels[item.deliveryMethod] ?? item.deliveryMethod}</strong>
                    <small>{item.operatorName ?? 'Sin operador'}</small>
                  </td>
                  <td>{item.trackingNumber ?? 'Pendiente'}</td>
                  <td>{date(item.plannedDispatchDate)}</td>
                  <td className="numeric-cell">{money(item.shippingCost)}</td>
                  <td>
                    <StatusBadge tone={toneFor(item.stateCode)}>
                      {stateLabels[item.stateCode] ?? item.stateCode}
                    </StatusBadge>
                  </td>
                  <td>
                    <button className="icon-button table-action" aria-label="Abrir entrega">
                      <MoreHorizontal size={18} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>
            {deliveries.data
              ? `Mostrando ${deliveries.data.items.length} de ${deliveries.data.total} entregas`
              : 'Cargando…'}
          </span>
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>
              Anterior
            </button>
            <button className="active">{page}</button>
            <button
              disabled={page >= totalPages}
              onClick={() => setPage((value) => Math.min(totalPages, value + 1))}
            >
              Siguiente
            </button>
          </div>
        </div>
      </section>
      <div className="mobile-card-list">
        <Toolbar
          placeholder="Buscar entregas…"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          showFilterButton={false}
        />
        <div className="filter-chips mobile-filter-scroll">
          {filters.map((item) => (
            <button
              key={item.code}
              className={`filter-chip ${filter === item.code ? 'active' : ''}`}
              onClick={() => setFilter(item.code)}
            >
              {item.label}
            </button>
          ))}
        </div>
        {deliveries.data?.items.map((item) => (
          <article
            className="mobile-record-card"
            key={item.id}
            onClick={() => navigate(`/entregas/${item.id}`)}
          >
            <div className="mobile-record-header">
              <div>
                <strong>{item.code}</strong>
                <small>
                  {item.clientName} · {item.saleCode}
                </small>
              </div>
              <StatusBadge tone={toneFor(item.stateCode)}>
                {stateLabels[item.stateCode] ?? item.stateCode}
              </StatusBadge>
            </div>
            <div className="mobile-record-grid">
              <span>
                Método<strong>{methodLabels[item.deliveryMethod] ?? item.deliveryMethod}</strong>
              </span>
              <span>
                Operador<strong>{item.operatorName ?? 'Sin operador'}</strong>
              </span>
              <span>
                Unidades<strong>{item.totalUnits}</strong>
              </span>
              <span>
                Tracking<strong>{item.trackingNumber ?? 'Pendiente'}</strong>
              </span>
            </div>
          </article>
        ))}
      </div>
    </main>
  );
}
