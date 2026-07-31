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
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { Panel } from '../components/ui/panel';
import { PageHeader } from '../components/ui/page-header';
import { StatCard } from '../components/ui/stat-card';
import { StatusBadge } from '../components/ui/status-badge';
import { ContextNote } from '../components/ui/info-tip';
import { useAuth } from '../features/auth/auth-context';
import { getDashboard, getReports } from '../features/insights/insights-api';

function money(value: number, currency = 'PEN') {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(value);
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', { weekday: 'short', day: '2-digit' }).format(
    new Date(`${value.slice(0, 10)}T12:00:00`),
  );
}

function longDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short', year: 'numeric' }).format(
    new Date(`${value.slice(0, 10)}T12:00:00`),
  );
}

function inputDate(date: Date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFrom(value: string) {
  return new Date(`${value.slice(0, 10)}T12:00:00`);
}

function shiftDays(value: string, days: number) {
  const date = dateFrom(value);
  date.setDate(date.getDate() + days);
  return inputDate(date);
}

function firstDayOfMonth(value: string) {
  const date = dateFrom(value);
  return inputDate(new Date(date.getFullYear(), date.getMonth(), 1, 12));
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
  UNPAID: 'Sin pago',
  PARTIAL: 'Pago parcial',
  PAID: 'Pagada',
  OVERDUE: 'Vencida',
  REFUNDED: 'Reembolsada',
};

const deliveryLabels: Record<string, string> = {
  ACCUMULATED: 'Acumula en almacén',
  PENDING: 'Entrega pendiente',
  READY: 'Lista para despacho',
  DISPATCHED: 'Despachada',
  IN_TRANSIT: 'En camino',
  DELIVERED: 'Entregada',
  CANCELLED: 'Cancelada',
};

const actionLabels: Record<string, string> = {
  INSERT: 'registró',
  UPDATE: 'actualizó',
  DELETE: 'eliminó',
  OTHER: 'realizó una acción en',
  CREATE: 'creó',
  CANCEL: 'canceló',
  REVERSE: 'revirtió',
};

const moduleLabels: Record<string, string> = {
  SYSTEM: 'el sistema',
  SISTEMA: 'el sistema',
  INVENTORY: 'el inventario',
  INVENTARIO: 'el inventario',
  SALES: 'una venta',
  VENTAS: 'una venta',
  IMPORTS: 'una importación',
  IMPORTACIONES: 'una importación',
  FINANCE: 'finanzas',
  FINANZAS: 'finanzas',
  CATALOG: 'el catálogo',
  CATALOGO: 'el catálogo',
  CLIENTS: 'un cliente',
  CLIENTES: 'un cliente',
  DELIVERIES: 'una entrega',
  ENTREGAS: 'una entrega',
};

type PeriodCode = 'TODAY' | '7D' | 'MONTH' | 'CUSTOM';

function activityText(item: {
  actorName: string;
  module: string;
  action: string;
  reason: string | null;
}) {
  const action = actionLabels[item.action.toLocaleUpperCase('es-PE')] ?? 'actualizó';
  const moduleName =
    moduleLabels[item.module.toLocaleUpperCase('es-PE')] ?? item.module.toLocaleLowerCase('es-PE');
  const reason = item.reason ? ` Motivo: ${item.reason}.` : '';
  return `${item.actorName} ${action} ${moduleName}.${reason}`;
}

export function DashboardPage() {
  const auth = useAuth();
  const navigate = useNavigate();
  const [period, setPeriod] = useState<PeriodCode>('7D');
  const [customStart, setCustomStart] = useState('');
  const [customEnd, setCustomEnd] = useState('');
  const dashboard = useQuery({
    queryKey: ['dashboard'],
    queryFn: getDashboard,
    refetchInterval: 60_000,
  });
  const firstName = auth.currentUser?.profile.display_name.split(' ')[0] ?? 'Administradora';
  const data = dashboard.data;
  const businessDate = data?.businessDate.slice(0, 10) ?? inputDate(new Date());

  const performanceRange = useMemo(() => {
    if (period === 'TODAY') return { startDate: businessDate, endDate: businessDate };
    if (period === 'MONTH') return { startDate: firstDayOfMonth(businessDate), endDate: businessDate };
    if (period === 'CUSTOM') {
      return {
        startDate: customStart || businessDate,
        endDate: customEnd || customStart || businessDate,
      };
    }
    return { startDate: shiftDays(businessDate, -6), endDate: businessDate };
  }, [businessDate, customEnd, customStart, period]);

  const performance = useQuery({
    queryKey: ['dashboard-performance', performanceRange.startDate, performanceRange.endDate],
    queryFn: () => getReports(performanceRange),
    enabled:
      Boolean(data) &&
      performanceRange.startDate <= performanceRange.endDate &&
      (period !== 'CUSTOM' || Boolean(customStart && customEnd)),
  });

  const chartData = performance.data?.daily ?? data?.weekly ?? [];
  const maxWeekly = Math.max(
    1,
    ...chartData.map((item) => Math.max(item.salesAmount, item.collectionsAmount)),
  );
  const periodTitle =
    period === 'TODAY'
      ? 'Rendimiento de hoy'
      : period === 'MONTH'
        ? 'Rendimiento del mes'
        : period === 'CUSTOM'
          ? 'Rendimiento del periodo'
          : 'Rendimiento de los últimos 7 días';
  const totalLabel = period === 'TODAY' ? 'Total de hoy' : period === 'MONTH' ? 'Total del mes' : 'Total del periodo';

  return (
    <main className="page dashboard-page">
      <PageHeader
        eyebrow="Resumen general"
        title={`Buenas tardes, ${firstName}`}
        description="Datos reales de ventas, cobros, stock, importaciones y pendientes del negocio."
        actions={
          <>
            <button
              className="button button-secondary"
              type="button"
              onClick={() => navigate('/finanzas')}
            >
              Registrar gasto
            </button>
            <button
              className="button button-primary"
              type="button"
              onClick={() => navigate('/ventas/nueva')}
            >
              Nueva venta
            </button>
          </>
        }
      />

      {dashboard.isError ? (
        <div className="alert alert-error">
          {dashboard.error instanceof Error
            ? dashboard.error.message
            : 'No se pudo cargar el panel.'}
        </div>
      ) : null}

      <section className="stat-grid" aria-label="Indicadores principales">
        <StatCard
          label="Ventas de hoy"
          value={data ? money(data.summary.salesTodayAmount) : '—'}
          detail={data ? `${data.summary.salesTodayCount} ventas registradas` : 'Cargando…'}
          icon={ShoppingCart}
          tone="primary"
        />
        <StatCard
          label="Cobrado hoy"
          value={data ? money(data.summary.confirmedPaymentsToday) : '—'}
          detail="Pagos confirmados"
          icon={CircleDollarSign}
          tone="success"
        />
        <StatCard
          label="Pagos por atender"
          value={data ? String(data.summary.paymentsDueSoon + data.summary.overduePayments) : '—'}
          detail={data ? `${data.summary.overduePayments} vencidos` : 'Cargando…'}
          icon={CalendarClock}
          tone={data?.summary.overduePayments ? 'danger' : 'warning'}
        />
        <StatCard
          label="Mercadería en tránsito"
          value={data ? `${data.summary.transitBoxes} cajas` : '—'}
          detail={data ? `${data.summary.activeImports} importaciones activas` : 'Cargando…'}
          icon={PackageCheck}
          tone="info"
        />
      </section>

      <section className="dashboard-grid dashboard-grid-primary">
        <Panel
          title={periodTitle}
          subtitle={`${longDate(performanceRange.startDate)} — ${longDate(performanceRange.endDate)}`}
          action={
            <button className="link-button" type="button" onClick={() => navigate('/reportes')}>
              Ver reporte <ArrowRight size={15} />
            </button>
          }
        >
          <div className="chart-periods" aria-label="Periodo del gráfico">
            {([
              ['TODAY', 'Hoy'],
              ['7D', '7 días'],
              ['MONTH', 'Mes'],
              ['CUSTOM', 'Personalizado'],
            ] as Array<[PeriodCode, string]>).map(([code, label]) => (
              <button
                type="button"
                className={`chart-period-button ${period === code ? 'active' : ''}`}
                key={code}
                aria-pressed={period === code}
                onClick={() => setPeriod(code)}
              >
                {label}
              </button>
            ))}
          </div>
          {period === 'CUSTOM' ? (
            <div className="chart-custom-range">
              <label>
                <span>Desde *</span>
                <input
                  type="date"
                  value={customStart}
                  max={customEnd || businessDate}
                  onChange={(event) => setCustomStart(event.target.value)}
                />
              </label>
              <label>
                <span>Hasta *</span>
                <input
                  type="date"
                  value={customEnd}
                  min={customStart}
                  max={businessDate}
                  onChange={(event) => setCustomEnd(event.target.value)}
                />
              </label>
            </div>
          ) : null}
          <div className="chart-summary">
            <div>
              <span>{totalLabel}</span>
              <strong>
                {performance.isFetching
                  ? 'Actualizando…'
                  : money(chartData.reduce((sum, item) => sum + item.salesAmount, 0))}
              </strong>
              <small>Valores confirmados dentro del periodo seleccionado.</small>
            </div>
            <div className="chart-legend" aria-label="Leyenda del gráfico">
              <span>
                <i className="legend-dot primary-dot" /> Ventas
              </span>
              <span>
                <i className="legend-dot neutral-dot" /> Cobros
              </span>
            </div>
          </div>
          <div
            className={`bar-chart dashboard-real-chart chart-columns-${Math.min(Math.max(chartData.length, 1), 31)}`}
            role="group"
            aria-label={`Gráfico de ventas y cobros desde ${longDate(performanceRange.startDate)} hasta ${longDate(performanceRange.endDate)}`}
            style={{ gridTemplateColumns: `repeat(${Math.max(chartData.length, 1)}, minmax(30px, 1fr))` }}
          >
            {chartData.map((item) => {
              const description = `${longDate(item.date)}. Ventas: ${money(item.salesAmount)}. Cobros: ${money(item.collectionsAmount)}.`;
              return (
                <div className="bar-column" key={item.date}>
                  <span className="chart-tooltip" role="tooltip">{description}</span>
                  <button className="bar-track dual-bar-track chart-bar-button" type="button" aria-label={description}>
                    <span
                      className="sales-bar"
                      aria-hidden="true"
                      style={{
                        height: `${Math.max(item.salesAmount > 0 ? 5 : 0, (item.salesAmount / maxWeekly) * 100)}%`,
                      }}
                    />
                    <span
                      className="collections-bar"
                      aria-hidden="true"
                      style={{
                        height: `${Math.max(item.collectionsAmount > 0 ? 5 : 0, (item.collectionsAmount / maxWeekly) * 100)}%`,
                      }}
                    />
                  </button>
                  <small>{shortDate(item.date)}</small>
                </div>
              );
            })}
            {performance.isLoading || !data ? <div className="empty-state">Cargando gráfico…</div> : null}
            {!performance.isLoading && data && chartData.length === 0 ? (
              <div className="empty-state chart-empty-state">
                No hay ventas ni cobros confirmados en este periodo.
              </div>
            ) : null}
          </div>
          {period === 'CUSTOM' && (!customStart || !customEnd) ? (
            <ContextNote>Selecciona una fecha de inicio y una fecha final para consultar el periodo.</ContextNote>
          ) : null}
        </Panel>

        <Panel
          title="Saldos disponibles"
          subtitle="Cuentas financieras activas"
          action={<WalletCards size={19} />}
        >
          <div className="account-list">
            {(data?.accounts ?? []).map((account, index) => (
              <div className="account-row" key={account.id}>
                <span className={`account-icon account-${(index % 4) + 1}`}>
                  {account.name.slice(0, 1)}
                </span>
                <div>
                  <strong>{account.name}</strong>
                  <small>
                    Entradas del mes: {money(account.monthInflows, account.currencyCode)}
                  </small>
                </div>
                <b>{money(account.currentBalance, account.currencyCode)}</b>
              </div>
            ))}
            {data?.accounts.length === 0 ? (
              <div className="empty-state">No hay cuentas activas.</div>
            ) : null}
          </div>
          <button
            className="button button-secondary button-full"
            onClick={() => navigate('/finanzas')}
          >
            Ver movimientos
          </button>
        </Panel>
      </section>

      <section className="dashboard-grid dashboard-grid-secondary">
        <Panel title="Prioridades" subtitle="Alertas que requieren atención">
          <div className="priority-list">
            {(data?.priorities ?? []).map((item) => (
              <button
                className="priority-item"
                type="button"
                key={item.id}
                onClick={() => item.actionUrl && navigate(item.actionUrl)}
                disabled={!item.actionUrl}
              >
                <span
                  className={`priority-icon ${item.priority === 'CRITICAL' ? 'danger' : item.priority === 'HIGH' ? 'warning' : 'info'}`}
                >
                  {item.typeCode === 'DISPATCH_PENDING' ? (
                    <Truck size={18} />
                  ) : (
                    <AlertTriangle size={18} />
                  )}
                </span>
                <span>
                  <strong>{item.title}</strong>
                  <small>{item.body}</small>
                </span>
                <StatusBadge
                  tone={
                    item.priority === 'CRITICAL'
                      ? 'danger'
                      : item.priority === 'HIGH'
                        ? 'warning'
                        : 'info'
                  }
                >
                  {item.priority === 'CRITICAL'
                    ? 'Urgente'
                    : item.priority === 'HIGH'
                      ? 'Atender'
                      : 'Revisar'}
                </StatusBadge>
              </button>
            ))}
            {data?.priorities.length === 0 ? (
              <div className="empty-state">
                <strong>Todo al día</strong>
                <p>No hay alertas operativas pendientes.</p>
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel
          title="Actividad reciente"
          subtitle="Cambios importantes explicados en lenguaje sencillo"
          action={
            <button className="link-button" type="button" onClick={() => navigate('/auditoria')}>
              Ver todo <ArrowRight size={15} />
            </button>
          }
        >
          <div className="activity-list">
            {(data?.recentActivity ?? []).map((item) => (
              <button
                type="button"
                className="activity-row activity-row-button"
                key={item.id}
                onClick={() => navigate(`/auditoria?search=${encodeURIComponent(item.entityId ?? item.actorName)}`)}
              >
                <span className="activity-marker activity-info" />
                <div>
                  <strong>{activityText(item)}</strong>
                  {item.entityId ? <p>Código de referencia: {item.entityId}</p> : null}
                </div>
                <time>{timeAgo(item.occurredAt)}</time>
              </button>
            ))}
            {data?.recentActivity.length === 0 ? (
              <div className="empty-state">Aún no hay actividad registrada.</div>
            ) : null}
          </div>
        </Panel>
      </section>

      <Panel
        title="Ventas recientes"
        subtitle="Últimas operaciones registradas"
        action={
          <button className="link-button" type="button" onClick={() => navigate('/ventas')}>
            Ver todas <ArrowRight size={15} />
          </button>
        }
      >
        <div className="responsive-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Venta</th>
                <th>Cliente</th>
                <th>Total</th>
                <th>Pagado</th>
                <th>Saldo</th>
                <th>Estado</th>
                <th>Entrega</th>
              </tr>
            </thead>
            <tbody>
              {(data?.recentSales ?? []).map((sale) => (
                <tr
                  key={sale.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => navigate(`/ventas/${sale.id}`)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' || event.key === ' ') navigate(`/ventas/${sale.id}`);
                  }}
                >
                  <td>
                    <strong>{sale.code}</strong>
                    <small>
                      {new Intl.DateTimeFormat('es-PE', {
                        dateStyle: 'short',
                        timeStyle: 'short',
                      }).format(new Date(sale.createdAt))}
                    </small>
                  </td>
                  <td>{sale.clientName}</td>
                  <td className="numeric-cell">{money(sale.totalAmount)}</td>
                  <td className="numeric-cell">{money(sale.paidTotal)}</td>
                  <td className="numeric-cell">{money(sale.balanceAmount)}</td>
                  <td>
                    <StatusBadge
                      tone={
                        sale.paymentStateCode === 'PAID'
                          ? 'success'
                          : sale.paymentStateCode === 'OVERDUE'
                            ? 'danger'
                            : 'warning'
                      }
                    >
                      {paymentLabels[sale.paymentStateCode] ?? sale.paymentStateCode}
                    </StatusBadge>
                  </td>
                  <td>{deliveryLabels[sale.deliveryStateCode] ?? 'Pendiente de definir'}</td>
                </tr>
              ))}
              {data?.recentSales.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">No hay ventas registradas.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>
    </main>
  );
}
