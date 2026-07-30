import { useQuery } from '@tanstack/react-query';
import {
  AlertTriangle,
  ArrowRight,
  CalendarClock,
  CircleDollarSign,
  PackageCheck,
  ShoppingCart,
  Truck,
  WalletCards,
} from 'lucide-react';
import { useNavigate } from 'react-router';
import { Panel } from '../components/ui/panel';
import { PageHeader } from '../components/ui/page-header';
import { StatCard } from '../components/ui/stat-card';
import { StatusBadge } from '../components/ui/status-badge';
import { useAuth } from '../features/auth/auth-context';
import { getDashboard } from '../features/insights/insights-api';

function money(value: number, currency = 'PEN') {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(value);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: '2-digit' }).format(new Date(`${value.slice(0, 10)}T12:00:00`));
}

function timeAgo(value: string) {
  const date = new Date(value);
  const diff = Math.max(0, Date.now() - date.getTime());
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Ahora';
  if (minutes < 60) return `Hace ${minutes} min`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `Hace ${hours} h`;
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: '2-digit' }).format(date);
}

const paymentLabels: Record<string, string> = {
  UNPAID: 'Sin pago', PARTIAL: 'Pago parcial', PAID: 'Pagada', OVERDUE: 'Vencida', REFUNDED: 'Reembolsada',
};

export function DashboardPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const dashboard = useQuery({ queryKey: ['dashboard'], queryFn: getDashboard, refetchInterval: 60_000 });
  const firstName = auth.currentUser?.profile.display_name.split(' ')[0] ?? 'Administradora';
  const data = dashboard.data;
  const maxWeekly = Math.max(1, ...(data?.weekly.map((item) => Math.max(item.salesAmount, item.collectionsAmount)) ?? [1]));

  return (
    <main className="page dashboard-page">
      <PageHeader
        eyebrow="Resumen general"
        title={`Buenas tardes, ${firstName}`}
        description="Datos reales de ventas, cobros, stock, importaciones y pendientes del negocio."
        actions={
          <>
            <button className="button button-secondary" type="button" onClick={() => navigate('/finanzas')}>Registrar gasto</button>
            <button className="button button-primary" type="button" onClick={() => navigate('/ventas/nueva')}>Nueva venta</button>
          </>
        }
      />

      {dashboard.isError ? <div className="alert alert-error">{dashboard.error instanceof Error ? dashboard.error.message : 'No se pudo cargar el panel.'}</div> : null}

      <section className="stat-grid" aria-label="Indicadores principales">
        <StatCard label="Ventas de hoy" value={data ? money(data.summary.salesTodayAmount) : '—'} detail={data ? `${data.summary.salesTodayCount} ventas registradas` : 'Cargando…'} icon={ShoppingCart} tone="primary" />
        <StatCard label="Cobrado hoy" value={data ? money(data.summary.confirmedPaymentsToday) : '—'} detail="Pagos confirmados" icon={CircleDollarSign} tone="success" />
        <StatCard label="Pagos por atender" value={data ? String(data.summary.paymentsDueSoon + data.summary.overduePayments) : '—'} detail={data ? `${data.summary.overduePayments} vencidos` : 'Cargando…'} icon={CalendarClock} tone={data?.summary.overduePayments ? 'danger' : 'warning'} />
        <StatCard label="Mercadería en tránsito" value={data ? `${data.summary.transitBoxes} cajas` : '—'} detail={data ? `${data.summary.activeImports} importaciones activas` : 'Cargando…'} icon={PackageCheck} tone="info" />
      </section>

      <section className="dashboard-grid dashboard-grid-primary">
        <Panel title="Rendimiento semanal" subtitle="Ventas y cobros confirmados de los últimos 7 días" action={<button className="link-button" type="button" onClick={() => navigate('/reportes')}>Ver reporte <ArrowRight size={15} /></button>}>
          <div className="chart-summary">
            <div><span>Total semanal</span><strong>{data ? money(data.weekly.reduce((sum, item) => sum + item.salesAmount, 0)) : '—'}</strong><small>Las barras claras representan cobros.</small></div>
            <div className="chart-legend"><span><i className="legend-dot primary-dot" /> Ventas</span><span><i className="legend-dot neutral-dot" /> Cobros</span></div>
          </div>
          <div className="bar-chart dashboard-real-chart" role="img" aria-label="Gráfico real de ventas y cobros de los últimos siete días">
            {(data?.weekly ?? []).map((item) => (
              <div className="bar-column" key={item.date} title={`${shortDate(item.date)} · Ventas ${money(item.salesAmount)} · Cobros ${money(item.collectionsAmount)}`}>
                <div className="bar-track dual-bar-track">
                  <span className="sales-bar" style={{ height: `${Math.max(item.salesAmount > 0 ? 5 : 0, (item.salesAmount / maxWeekly) * 100)}%` }} />
                  <span className="collections-bar" style={{ height: `${Math.max(item.collectionsAmount > 0 ? 5 : 0, (item.collectionsAmount / maxWeekly) * 100)}%` }} />
                </div>
                <small>{shortDate(item.date)}</small>
              </div>
            ))}
            {!data ? <div className="empty-state">Cargando gráfico…</div> : null}
          </div>
        </Panel>

        <Panel title="Saldos disponibles" subtitle="Cuentas financieras activas" action={<WalletCards size={19} />}>
          <div className="account-list">
            {(data?.accounts ?? []).map((account, index) => (
              <div className="account-row" key={account.id}>
                <span className={`account-icon account-${(index % 4) + 1}`}>{account.name.slice(0, 1)}</span>
                <div><strong>{account.name}</strong><small>Entradas del mes: {money(account.monthInflows, account.currencyCode)}</small></div>
                <b>{money(account.currentBalance, account.currencyCode)}</b>
              </div>
            ))}
            {data?.accounts.length === 0 ? <div className="empty-state">No hay cuentas activas.</div> : null}
          </div>
          <button className="button button-secondary button-full" onClick={() => navigate('/finanzas')}>Ver movimientos</button>
        </Panel>
      </section>

      <section className="dashboard-grid dashboard-grid-secondary">
        <Panel title="Prioridades" subtitle="Alertas que requieren atención">
          <div className="priority-list">
            {(data?.priorities ?? []).map((item) => (
              <button className="priority-item" type="button" key={item.id} onClick={() => item.actionUrl && navigate(item.actionUrl)}>
                <span className={`priority-icon ${item.priority === 'CRITICAL' ? 'danger' : item.priority === 'HIGH' ? 'warning' : 'info'}`}>
                  {item.typeCode === 'DISPATCH_PENDING' ? <Truck size={18} /> : <AlertTriangle size={18} />}
                </span>
                <span><strong>{item.title}</strong><small>{item.body}</small></span>
                <StatusBadge tone={item.priority === 'CRITICAL' ? 'danger' : item.priority === 'HIGH' ? 'warning' : 'info'}>{item.priority === 'CRITICAL' ? 'Urgente' : item.priority === 'HIGH' ? 'Atender' : 'Revisar'}</StatusBadge>
              </button>
            ))}
            {data?.priorities.length === 0 ? <div className="empty-state"><strong>Todo al día</strong><p>No hay alertas operativas pendientes.</p></div> : null}
          </div>
        </Panel>

        <Panel title="Actividad reciente" subtitle="Últimos cambios auditados" action={<button className="link-button" onClick={() => navigate('/auditoria')}>Ver todo <ArrowRight size={15} /></button>}>
          <div className="activity-list">
            {(data?.recentActivity ?? []).map((item) => (
              <div className="activity-row" key={item.id}>
                <span className="activity-marker activity-info" />
                <div><strong>{item.actorName} · {item.module}</strong><p>{item.action}{item.entityId ? ` · ${item.entityId}` : ''}{item.reason ? ` · ${item.reason}` : ''}</p></div>
                <time>{timeAgo(item.occurredAt)}</time>
              </div>
            ))}
            {data?.recentActivity.length === 0 ? <div className="empty-state">Aún no hay actividad registrada.</div> : null}
          </div>
        </Panel>
      </section>

      <Panel title="Ventas recientes" subtitle="Últimas operaciones registradas" action={<button className="link-button" onClick={() => navigate('/ventas')}>Ver todas <ArrowRight size={15} /></button>}>
        <div className="responsive-table-wrap">
          <table className="data-table">
            <thead><tr><th>Venta</th><th>Cliente</th><th>Total</th><th>Pagado</th><th>Saldo</th><th>Estado</th><th>Entrega</th></tr></thead>
            <tbody>
              {(data?.recentSales ?? []).map((sale) => (
                <tr key={sale.id} onClick={() => navigate(`/ventas/${sale.id}`)}>
                  <td><strong>{sale.code}</strong><small>{new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(sale.createdAt))}</small></td>
                  <td>{sale.clientName}</td>
                  <td className="numeric-cell">{money(sale.totalAmount)}</td>
                  <td className="numeric-cell">{money(sale.paidTotal)}</td>
                  <td className="numeric-cell">{money(sale.balanceAmount)}</td>
                  <td><StatusBadge tone={sale.paymentStateCode === 'PAID' ? 'success' : sale.paymentStateCode === 'OVERDUE' ? 'danger' : 'warning'}>{paymentLabels[sale.paymentStateCode] ?? sale.paymentStateCode}</StatusBadge></td>
                  <td>{sale.deliveryStateCode}</td>
                </tr>
              ))}
              {data?.recentSales.length === 0 ? <tr><td colSpan={7}><div className="empty-state">No hay ventas registradas.</div></td></tr> : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </main>
  );
}
