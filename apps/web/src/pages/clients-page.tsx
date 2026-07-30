import { useQuery } from '@tanstack/react-query';
import { Download, MoreHorizontal, Plus, Star } from 'lucide-react';
import { useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { StatusBadge } from '../components/ui/status-badge';
import { Toolbar } from '../components/ui/toolbar';
import { getClients, type ClientFilter } from '../features/clients/clients-api';

function formatMoney(value: number) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
}

function formatDate(value: string | null) {
  if (!value) return 'Sin compras';
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit', year: 'numeric' }).format(new Date(value));
}

const filters: Array<{ code: ClientFilter; label: string }> = [
  { code: 'ALL', label: 'Todos' },
  { code: 'VIP', label: 'VIP' },
  { code: 'WITH_DEBT', label: 'Con deuda' },
  { code: 'OVERDUE', label: 'Vencidos' },
  { code: 'INACTIVE', label: 'Inactivos' },
];

export function ClientsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<ClientFilter>('ALL');
  const [page, setPage] = useState(1);
  const clients = useQuery({
    queryKey: ['clients', search, filter, page],
    queryFn: () => getClients({ search, filter, page, pageSize: 20 }),
    placeholderData: (previous) => previous,
  });

  const totalPages = Math.max(1, Math.ceil((clients.data?.total ?? 0) / (clients.data?.pageSize ?? 20)));

  return (
    <main className="page">
      <PageHeader
        eyebrow="Relaciones comerciales"
        title="Clientes"
        description="Consulta sus compras, saldos, condición VIP, direcciones e historial de cumplimiento."
        actions={
          <>
            <button className="button button-secondary" type="button" disabled><Download size={17} /> Exportar</button>
            <button className="button button-primary" type="button" onClick={() => navigate('/clientes/nuevo')}><Plus size={17} /> Nuevo cliente</button>
          </>
        }
      />

      <section className="summary-strip">
        <div><span>Clientes activos</span><strong>{clients.data?.summary.activeClients ?? '—'}</strong></div>
        <div><span>Clientes VIP</span><strong>{clients.data?.summary.vipClients ?? '—'}</strong></div>
        <div><span>Saldo pendiente</span><strong>{clients.data ? formatMoney(clients.data.summary.pendingBalance) : '—'}</strong></div>
        <div><span>Con pagos vencidos</span><strong className="text-danger">{clients.data?.summary.overdueClients ?? '—'}</strong></div>
      </section>

      {clients.isError ? <div className="alert alert-error">{clients.error instanceof Error ? clients.error.message : 'No se pudieron cargar los clientes.'}</div> : null}

      <section className="panel table-panel">
        <Toolbar
          placeholder="Buscar por nombre, teléfono, DNI o código…"
          value={search}
          onChange={(value) => { setSearch(value); setPage(1); }}
          showFilterButton={false}
        />
        <div className="filter-chips">
          {filters.map((item) => (
            <button
              className={`filter-chip ${filter === item.code ? 'active' : ''}`}
              key={item.code}
              type="button"
              onClick={() => { setFilter(item.code); setPage(1); }}
            >
              {item.label}
              {item.code === 'VIP' ? <span>{clients.data?.summary.vipClients ?? 0}</span> : null}
              {item.code === 'OVERDUE' ? <span>{clients.data?.summary.overdueClients ?? 0}</span> : null}
            </button>
          ))}
        </div>
        <div className="responsive-table-wrap">
          <table className="data-table">
            <thead><tr><th>Cliente</th><th>Tipo</th><th>Total comprado</th><th>Saldo</th><th>Vencimientos</th><th>Última compra</th><th /></tr></thead>
            <tbody>
              {clients.isLoading ? <tr><td colSpan={7}><div className="empty-state">Cargando clientes…</div></td></tr> : null}
              {!clients.isLoading && clients.data?.items.length === 0 ? (
                <tr><td colSpan={7}><div className="empty-state"><strong>No hay clientes</strong><p>Crea el primer cliente o cambia los filtros.</p></div></td></tr>
              ) : null}
              {clients.data?.items.map((client) => (
                <tr key={client.id} onClick={() => navigate(`/clientes/${client.id}`)}>
                  <td><div className="client-cell"><span className="avatar avatar-table">{client.fullName.slice(0, 1).toUpperCase()}</span><div><strong>{client.fullName}</strong><small>{client.code} · {client.phone ?? 'Sin celular'}</small></div></div></td>
                  <td>{client.isVip ? <StatusBadge tone="primary"><Star size={12} /> VIP</StatusBadge> : <StatusBadge>{client.isActive ? 'Regular' : 'Inactivo'}</StatusBadge>}</td>
                  <td className="numeric-cell"><strong>{formatMoney(client.totalPurchased)}</strong></td>
                  <td className="numeric-cell"><strong className={client.balanceAmount > 0 ? 'text-warning' : ''}>{formatMoney(client.balanceAmount)}</strong></td>
                  <td>{client.overdueSales > 0 ? <StatusBadge tone="danger">{client.overdueSales} vencida(s)</StatusBadge> : <StatusBadge tone="success">Al día</StatusBadge>}</td>
                  <td>{formatDate(client.lastPurchaseAt)}</td>
                  <td><button className="icon-button table-action" aria-label="Abrir cliente" type="button"><MoreHorizontal size={18} /></button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>{clients.data ? `Mostrando ${clients.data.items.length} de ${clients.data.total} clientes` : 'Cargando…'}</span>
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
            <button className="active">{page}</button>
            <button disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Siguiente</button>
          </div>
        </div>
      </section>

      <div className="mobile-card-list">
        <Toolbar placeholder="Buscar clientes…" value={search} onChange={(value) => { setSearch(value); setPage(1); }} showFilterButton={false} />
        <div className="filter-chips mobile-filter-scroll">
          {filters.map((item) => <button className={`filter-chip ${filter === item.code ? 'active' : ''}`} key={item.code} onClick={() => setFilter(item.code)}>{item.label}</button>)}
        </div>
        {clients.data?.items.map((client) => (
          <article className="mobile-record-card" key={client.id} onClick={() => navigate(`/clientes/${client.id}`)}>
            <div className="mobile-record-header"><span className="avatar">{client.fullName.slice(0, 1).toUpperCase()}</span><div><strong>{client.fullName}</strong><small>{client.code} · {client.phone ?? 'Sin celular'}</small></div>{client.isVip ? <StatusBadge tone="primary">VIP</StatusBadge> : null}</div>
            <div className="mobile-record-grid"><span>Total comprado<strong>{formatMoney(client.totalPurchased)}</strong></span><span>Saldo<strong>{formatMoney(client.balanceAmount)}</strong></span><span>Última compra<strong>{formatDate(client.lastPurchaseAt)}</strong></span><span>Estado<strong>{client.overdueSales ? `${client.overdueSales} vencida(s)` : 'Al día'}</strong></span></div>
          </article>
        ))}
      </div>
    </main>
  );
}
