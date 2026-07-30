import { useQuery } from '@tanstack/react-query';
import type { ImportFilter } from '@yukimi/shared';
import { CalendarClock, MoreHorizontal, PackageCheck, Plus, Ship, TriangleAlert } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { StatusBadge } from '../components/ui/status-badge';
import { Toolbar } from '../components/ui/toolbar';
import { getImports } from '../features/imports/imports-api';

const filters: Array<{ code: ImportFilter; label: string }> = [
  { code: 'ALL', label: 'Todas' },
  { code: 'ACTIVE', label: 'Activas' },
  { code: 'ARRIVING', label: 'Próximas' },
  { code: 'DELAYED', label: 'Retrasadas' },
  { code: 'STOCKED', label: 'Ingresadas' },
  { code: 'CANCELLED', label: 'Canceladas' },
];

const stateLabels: Record<string, string> = {
  QUOTATION: 'Cotización',
  PURCHASE_CONFIRMED: 'Compra confirmada',
  FOREIGN_WAREHOUSE: 'Almacén extranjero',
  DISPATCH_CONFIRMED: 'Despacho confirmado',
  SHIPPED: 'Embarcada',
  IN_TRANSIT: 'En tránsito',
  RECEIVED_PERU: 'Recibida en Perú',
  STOCKED: 'Ingresada a stock',
  CANCELLED: 'Cancelada',
};
const modeLabels: Record<string, string> = { AIR: 'Avión', SEA: 'Barco', OTHER: 'Otro' };
const money = (value: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
const date = (value: string | null) => value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`)) : 'Sin fecha';
function toneFor(state: string, delayed: boolean): 'success' | 'warning' | 'danger' | 'info' | 'primary' {
  if (delayed) return 'danger';
  if (state === 'STOCKED') return 'success';
  if (state === 'CANCELLED') return 'danger';
  if (state === 'SHIPPED' || state === 'IN_TRANSIT' || state === 'RECEIVED_PERU') return 'info';
  if (state === 'PURCHASE_CONFIRMED' || state === 'FOREIGN_WAREHOUSE') return 'primary';
  return 'warning';
}

export function ImportsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ImportFilter>('ALL');
  const [page, setPage] = useState(1);
  const imports = useQuery({
    queryKey: ['imports', search, filter, page],
    queryFn: () => getImports({ search, filter, page, pageSize: 20 }),
    placeholderData: (previous) => previous,
  });
  const totalPages = Math.max(1, Math.ceil((imports.data?.total ?? 0) / (imports.data?.pageSize ?? 20)));

  return (
    <main className="page">
      <PageHeader
        eyebrow="Abastecimiento internacional"
        title="Importaciones y cajas"
        description="Sigue compras, operadores, cajas, costos y mercadería hasta su ingreso real a stock en Perú."
        actions={<button className="button button-primary" onClick={() => navigate('/importaciones/nueva')}><Plus size={17} /> Nueva importación</button>}
      />
      <section className="stat-grid">
        <article className="inventory-stat"><span className="stat-icon stat-primary"><Ship size={19} /></span><div><small>Importaciones activas</small><strong>{imports.data?.summary.activeImports ?? '—'}</strong><p>Compras y embarques abiertos</p></div></article>
        <article className="inventory-stat"><span className="stat-icon stat-info"><PackageCheck size={19} /></span><div><small>Cajas en tránsito</small><strong>{imports.data?.summary.boxesInTransit ?? '—'}</strong><p>Embarcadas o viajando</p></div></article>
        <article className="inventory-stat"><span className="stat-icon stat-warning"><CalendarClock size={19} /></span><div><small>Unidades esperadas</small><strong>{imports.data?.summary.expectedUnits ?? '—'}</strong><p>Pendientes de ingreso</p></div></article>
        <article className="inventory-stat"><span className="stat-icon stat-danger"><TriangleAlert size={19} /></span><div><small>Retrasadas</small><strong>{imports.data?.summary.delayedImports ?? '—'}</strong><p>Requieren seguimiento</p></div></article>
      </section>
      {imports.isError ? <div className="alert alert-error">{imports.error instanceof Error ? imports.error.message : 'No se pudieron cargar las importaciones.'}</div> : null}
      <section className="panel table-panel">
        <Toolbar placeholder="Buscar importación, caja, tracking, proveedor o producto…" value={search} onChange={(value) => { setSearch(value); setPage(1); }} showFilterButton={false} />
        <div className="filter-chips">{filters.map((item) => <button key={item.code} className={`filter-chip ${filter === item.code ? 'active' : ''}`} onClick={() => { setFilter(item.code); setPage(1); }}>{item.label}</button>)}</div>
        <div className="responsive-table-wrap"><table className="data-table"><thead><tr><th>Importación</th><th>Proveedor</th><th>Medio</th><th>Cajas</th><th>Unidades</th><th>Llegada estimada</th><th>Costos extra</th><th>Estado</th><th /></tr></thead><tbody>
          {imports.isLoading ? <tr><td colSpan={9}><div className="empty-state">Cargando importaciones…</div></td></tr> : null}
          {!imports.isLoading && imports.data?.items.length === 0 ? <tr><td colSpan={9}><div className="empty-state"><strong>No hay importaciones</strong><p>Crea la primera compra internacional o cambia los filtros.</p></div></td></tr> : null}
          {imports.data?.items.map((item) => <tr key={item.id} onClick={() => navigate(`/importaciones/${item.id}`)}>
            <td><strong>{item.code}</strong><small>{item.masterTrackingNumber ?? 'Sin tracking maestro'}</small></td>
            <td><strong>{item.supplierName ?? 'Sin proveedor'}</strong><small>{item.purchaseDate ? `Compra: ${date(item.purchaseDate)}` : 'Compra sin confirmar'}</small></td>
            <td>{modeLabels[item.transportMode] ?? item.transportMode}</td>
            <td className="numeric-cell"><strong>{item.boxCount}</strong><small>{item.openIncidents ? `${item.openIncidents} incidencia(s)` : 'Sin incidencias'}</small></td>
            <td className="numeric-cell"><strong>{item.totalReceivedUnits}/{item.totalExpectedUnits}</strong><small>recibidas</small></td>
            <td>{date(item.estimatedArrivalDate)}</td>
            <td className="numeric-cell">{money(item.totalCostPen)}</td>
            <td><StatusBadge tone={toneFor(item.stateCode, item.isDelayed)}>{item.isDelayed ? 'Retrasada' : stateLabels[item.stateCode] ?? item.stateCode}</StatusBadge></td>
            <td><button className="icon-button table-action" aria-label="Abrir importación"><MoreHorizontal size={18} /></button></td>
          </tr>)}
        </tbody></table></div>
        <div className="table-footer"><span>{imports.data ? `Mostrando ${imports.data.items.length} de ${imports.data.total} importaciones` : 'Cargando…'}</span><div className="pagination"><button disabled={page <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>Anterior</button><button className="active">{page}</button><button disabled={page >= totalPages} onClick={() => setPage((value) => Math.min(totalPages, value + 1))}>Siguiente</button></div></div>
      </section>
      <div className="mobile-card-list">
        <Toolbar placeholder="Buscar importaciones…" value={search} onChange={(value) => { setSearch(value); setPage(1); }} showFilterButton={false} />
        <div className="filter-chips mobile-filter-scroll">{filters.map((item) => <button key={item.code} className={`filter-chip ${filter === item.code ? 'active' : ''}`} onClick={() => { setFilter(item.code); setPage(1); }}>{item.label}</button>)}</div>
        {imports.data?.items.map((item) => <article className="mobile-record-card" key={item.id} onClick={() => navigate(`/importaciones/${item.id}`)}><div className="mobile-record-header"><div><strong>{item.code}</strong><small>{item.supplierName ?? 'Sin proveedor'} · {modeLabels[item.transportMode]}</small></div><StatusBadge tone={toneFor(item.stateCode, item.isDelayed)}>{item.isDelayed ? 'Retrasada' : stateLabels[item.stateCode] ?? item.stateCode}</StatusBadge></div><div className="mobile-record-grid"><span>Cajas<strong>{item.boxCount}</strong></span><span>Unidades<strong>{item.totalReceivedUnits}/{item.totalExpectedUnits}</strong></span><span>Llegada<strong>{date(item.estimatedArrivalDate)}</strong></span><span>Costos<strong>{money(item.totalCostPen)}</strong></span></div></article>)}
      </div>
    </main>
  );
}
