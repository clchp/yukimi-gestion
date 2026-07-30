import { useQuery } from '@tanstack/react-query';
import type { SaleFilter } from '@yukimi/shared';
import { MoreHorizontal, Plus } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { StatusBadge } from '../components/ui/status-badge';
import { Toolbar } from '../components/ui/toolbar';
import { getSales } from '../features/sales/sales-api';

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return 'Sin fecha';
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

const filters: Array<{ code: SaleFilter; label: string }> = [
  { code: 'ALL', label: 'Todas' },
  { code: 'RESERVED', label: 'Reservadas' },
  { code: 'UNPAID', label: 'Sin pago' },
  { code: 'OVERDUE', label: 'Vencidas' },
  { code: 'CANCELLED', label: 'Canceladas' },
];

const paymentLabels: Record<string, string> = {
  UNPAID: 'Sin pago', PARTIAL: 'Pago parcial', PAID: 'Pagada', OVERDUE: 'Vencida', REFUNDED: 'Reembolsada',
};
const deliveryLabels: Record<string, string> = {
  PENDING: 'Pendiente', ACCUMULATED: 'Acumula almacén', PARTIAL: 'Entrega parcial', DELIVERED: 'Entregada', CANCELLED: 'Cancelada',
};

export function SalesPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<SaleFilter>('ALL');
  const [page, setPage] = useState(1);
  const sales = useQuery({
    queryKey: ['sales', search, filter, page],
    queryFn: () => getSales({ search, filter, page, pageSize: 20 }),
    placeholderData: (previous) => previous,
  });
  const totalPages = Math.max(1, Math.ceil((sales.data?.total ?? 0) / (sales.data?.pageSize ?? 20)));

  return (
    <main className="page">
      <PageHeader
        eyebrow="Operación comercial"
        title="Ventas y reservas"
        description="Reserva stock por almacén y conserva la trazabilidad de precios, descuentos y estados."
        actions={<button className="button button-primary" onClick={() => navigate('/ventas/nueva')}><Plus size={17} /> Nueva venta</button>}
      />
      <section className="summary-strip">
        <div><span>Ventas activas</span><strong>{sales.data?.summary.activeSales ?? '—'}</strong></div>
        <div><span>Total vendido</span><strong>{sales.data ? formatMoney(sales.data.summary.soldAmount) : '—'}</strong></div>
        <div><span>Por cobrar</span><strong>{sales.data ? formatMoney(sales.data.summary.pendingBalance) : '—'}</strong></div>
        <div><span>Vencidas</span><strong className="text-danger">{sales.data?.summary.overdueSales ?? '—'}</strong></div>
      </section>
      {sales.isError ? <div className="alert alert-error">{sales.error instanceof Error ? sales.error.message : 'No se pudieron cargar las ventas.'}</div> : null}
      <section className="panel table-panel">
        <Toolbar placeholder="Buscar por venta, cliente, teléfono, producto o SKU…" value={search} onChange={(value) => { setSearch(value); setPage(1); }} showFilterButton={false} />
        <div className="filter-chips">{filters.map((item) => <button key={item.code} className={`filter-chip ${filter === item.code ? 'active' : ''}`} onClick={() => { setFilter(item.code); setPage(1); }}>{item.label}</button>)}</div>
        <div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>Venta</th><th>Cliente</th><th>Canal</th><th>Unidades</th><th>Total</th><th>Saldo</th><th>Vencimiento</th><th>Pago</th><th>Entrega</th><th /></tr></thead><tbody>
          {sales.isLoading ? <tr><td colSpan={10}><div className="empty-state">Cargando ventas…</div></td></tr> : null}
          {!sales.isLoading && sales.data?.items.length === 0 ? <tr><td colSpan={10}><div className="empty-state"><strong>No hay ventas</strong><p>Crea la primera reserva o cambia los filtros.</p></div></td></tr> : null}
          {sales.data?.items.map((sale) => (
            <tr key={sale.id} onClick={() => navigate(`/ventas/${sale.id}`)}>
              <td><strong>{sale.code}</strong><small>{formatDate(sale.createdAt)} · {sale.createdByName ?? 'Sistema'}</small></td>
              <td><strong>{sale.clientName}</strong><small>{sale.clientPhone ?? 'Sin celular'}</small></td>
              <td>{sale.salesChannelCode}</td><td className="numeric-cell">{sale.totalUnits}</td>
              <td className="numeric-cell"><strong>{formatMoney(sale.totalAmount)}</strong></td>
              <td className="numeric-cell"><strong className={sale.balanceAmount > 0 ? 'text-warning' : ''}>{formatMoney(sale.balanceAmount)}</strong></td>
              <td>{formatDate(sale.dueAt)}</td>
              <td><StatusBadge tone={sale.paymentStateCode === 'PAID' ? 'success' : sale.paymentStateCode === 'OVERDUE' ? 'danger' : 'warning'}>{paymentLabels[sale.paymentStateCode] ?? sale.paymentStateCode}</StatusBadge></td>
              <td>{deliveryLabels[sale.deliveryStateCode] ?? sale.deliveryStateCode}</td>
              <td><button className="icon-button table-action" aria-label="Abrir venta"><MoreHorizontal size={18} /></button></td>
            </tr>
          ))}
        </tbody></table></div>
        <div className="table-footer"><span>{sales.data ? `Mostrando ${sales.data.items.length} de ${sales.data.total} ventas` : 'Cargando…'}</span><div className="pagination"><button disabled={page <= 1} onClick={() => setPage((v) => Math.max(1, v - 1))}>Anterior</button><button className="active">{page}</button><button disabled={page >= totalPages} onClick={() => setPage((v) => Math.min(totalPages, v + 1))}>Siguiente</button></div></div>
      </section>
      <div className="mobile-card-list">
        <Toolbar placeholder="Buscar ventas…" value={search} onChange={(value) => { setSearch(value); setPage(1); }} showFilterButton={false} />
        <div className="filter-chips mobile-filter-scroll">{filters.map((item) => <button key={item.code} className={`filter-chip ${filter === item.code ? 'active' : ''}`} onClick={() => setFilter(item.code)}>{item.label}</button>)}</div>
        {sales.data?.items.map((sale) => <article className="mobile-record-card" key={sale.id} onClick={() => navigate(`/ventas/${sale.id}`)}><div className="mobile-record-header"><div><strong>{sale.code}</strong><small>{sale.clientName} · {formatDate(sale.createdAt)}</small></div><StatusBadge tone={sale.paymentStateCode === 'OVERDUE' ? 'danger' : 'warning'}>{paymentLabels[sale.paymentStateCode] ?? sale.paymentStateCode}</StatusBadge></div><div className="mobile-record-grid"><span>Total<strong>{formatMoney(sale.totalAmount)}</strong></span><span>Saldo<strong>{formatMoney(sale.balanceAmount)}</strong></span><span>Unidades<strong>{sale.totalUnits}</strong></span><span>Entrega<strong>{deliveryLabels[sale.deliveryStateCode] ?? sale.deliveryStateCode}</strong></span></div></article>)}
      </div>
    </main>
  );
}
