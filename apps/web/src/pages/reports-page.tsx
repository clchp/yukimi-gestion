import { useQuery } from '@tanstack/react-query';
import { Download, Printer, TrendingUp } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import { downloadCsv } from '../features/insights/csv-export';
import { downloadPdf, downloadXlsx } from '../features/insights/file-export';
import { getReports, registerReportExport } from '../features/insights/insights-api';

import { SearchableNativeSelect } from '../components/ui/searchable-native-select';
function inputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function initialPeriod() {
  const now = new Date();
  return { start: inputDate(new Date(now.getFullYear(), now.getMonth(), 1)), end: inputDate(now) };
}

function money(value: number) {
  return new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
}

function percent(value: number | null) {
  if (value === null) return 'Sin comparación';
  return `${value >= 0 ? '+' : ''}${new Intl.NumberFormat('es-PE', { maximumFractionDigits: 2 }).format(value)}%`;
}

function shortDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', { day: '2-digit', month: 'short' }).format(
    new Date(`${value.slice(0, 10)}T12:00:00`),
  );
}

type ReportDataValue = Awaited<ReturnType<typeof getReports>>;
function reportRows(
  data: ReportDataValue,
  startDate: string,
  endDate: string,
  warehouseName: string,
): unknown[][] {
  return [
    ['YUKIMI GESTIÓN — REPORTE GENERAL'],
    ['Periodo', startDate, endDate],
    ['Almacén', warehouseName],
    [],
    ['RESUMEN'],
    ['Ventas netas', data.summary.netSales],
    ['Cobrado', data.summary.collected],
    ['Costo estimado', data.summary.estimatedCost],
    ['Ganancia estimada', data.summary.estimatedProfit],
    ['Ticket promedio', data.summary.averageTicket],
    ['Saldo por cobrar', data.summary.outstandingBalance],
    ['Cantidad de ventas', data.summary.salesCount],
    ['Unidades vendidas', data.summary.unitsSold],
    [],
    ['EVOLUCIÓN DIARIA'],
    ['Fecha', 'Ventas', 'Cobros', 'Cantidad de ventas'],
    ...data.daily.map((item) => [
      item.date.slice(0, 10),
      item.salesAmount,
      item.collectionsAmount,
      item.salesCount,
    ]),
    [],
    ['PRODUCTOS MÁS VENDIDOS'],
    ['SKU', 'Producto', 'Variante', 'Unidades', 'Ventas', 'Costo estimado', 'Ganancia estimada'],
    ...data.topProducts.map((item) => [
      item.sku,
      item.productName,
      item.variantName,
      item.units,
      item.revenue,
      item.cost,
      item.profit,
    ]),
    [],
    ['CLIENTES PRINCIPALES'],
    ['Cliente', 'Ventas', 'Comprado', 'Saldo'],
    ...data.topClients.map((item) => [
      item.clientName,
      item.salesCount,
      item.purchased,
      item.outstanding,
    ]),
    [],
    ['STOCK BAJO'],
    ['SKU', 'Producto', 'Variante', 'Disponible', 'Mínimo'],
    ...data.lowStock.map((item) => [
      item.sku,
      item.productName,
      item.variantName,
      item.available,
      item.minimum,
    ]),
  ];
}
export function ReportsPage() {
  const defaults = useMemo(initialPeriod, []);
  const [startDate, setStartDate] = useState(defaults.start);
  const [endDate, setEndDate] = useState(defaults.end);
  const [warehouseId, setWarehouseId] = useState('');
  const [exportMessage, setExportMessage] = useState('');

  const report = useQuery({
    queryKey: ['reports', startDate, endDate, warehouseId],
    queryFn: () => getReports({ startDate, endDate, warehouseId: warehouseId || undefined }),
    enabled: Boolean(startDate && endDate && startDate <= endDate),
    placeholderData: (previous) => previous,
  });

  const data = report.data;
  const maxDaily = Math.max(
    1,
    ...(data?.daily.map((item) => Math.max(item.salesAmount, item.collectionsAmount)) ?? [1]),
  );
  const maxCategory = Math.max(1, ...(data?.categories.map((item) => item.revenue) ?? [1]));

  async function exportCsv() {
    if (!data) return;
    const filename = `yukimi-reporte-${startDate}-${endDate}.csv`;
    const rows = reportRows(
      data,
      startDate,
      endDate,
      data.warehouses.find((item) => item.id === warehouseId)?.name ?? 'Todos',
    );

    downloadCsv(filename, rows);
    try {
      const result = await registerReportExport({
        reportType: 'GENERAL',
        format: 'CSV',
        startDate,
        endDate,
        filename,
        filters: { warehouseId: warehouseId || null },
      });
      setExportMessage(`Exportación registrada como ${result.code}.`);
    } catch {
      setExportMessage(
        'El CSV se descargó, pero no se pudo registrar la exportación en auditoría.',
      );
    }
  }

  async function exportXlsx() {
    if (!data) return;
    const filename = `yukimi-reporte-${startDate}-${endDate}.xlsx`;
    downloadXlsx(
      filename,
      reportRows(
        data,
        startDate,
        endDate,
        data.warehouses.find((item) => item.id === warehouseId)?.name ?? 'Todos',
      ),
    );
    try {
      const result = await registerReportExport({
        reportType: 'GENERAL',
        format: 'XLSX',
        startDate,
        endDate,
        filename,
        filters: { warehouseId: warehouseId || null },
      });
      setExportMessage(`Excel registrado como ${result.code}.`);
    } catch {
      setExportMessage('El Excel se descargó, pero no se pudo registrar la exportación.');
    }
  }

  async function exportPdf() {
    if (!data) return;
    const filename = `yukimi-reporte-${startDate}-${endDate}.pdf`;
    const lines = reportRows(
      data,
      startDate,
      endDate,
      data.warehouses.find((item) => item.id === warehouseId)?.name ?? 'Todos',
    ).map((row) => row.join(' | '));
    downloadPdf(filename, 'Yukimi Gestión — Reporte general', lines);
    try {
      const result = await registerReportExport({
        reportType: 'GENERAL',
        format: 'PDF',
        startDate,
        endDate,
        filename,
        filters: { warehouseId: warehouseId || null },
      });
      setExportMessage(`PDF registrado como ${result.code}.`);
    } catch {
      setExportMessage('El PDF se descargó, pero no se pudo registrar la exportación.');
    }
  }

  return (
    <main className="page reports-page">
      <PageHeader
        eyebrow="Análisis"
        title="Reportes y estadísticas"
        description="Ventas, cobros, rentabilidad estimada, inventario y clientes usando los datos reales del sistema."
        actions={
          <>
            <button
              className="button button-secondary"
              type="button"
              disabled={!data}
              onClick={() => void exportXlsx()}
            >
              <Download size={17} /> Excel
            </button>
            <button
              className="button button-secondary"
              type="button"
              disabled={!data}
              onClick={() => void exportCsv()}
            >
              <Download size={17} /> CSV
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={!data}
              onClick={() => void exportPdf()}
            >
              <Printer size={17} /> PDF
            </button>
          </>
        }
      />

      <div className="report-filters no-print">
        <label className="field">
          <span>Desde</span>
          <input
            type="date"
            value={startDate}
            max={endDate}
            onChange={(event) => setStartDate(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Hasta</span>
          <input
            type="date"
            value={endDate}
            min={startDate}
            onChange={(event) => setEndDate(event.target.value)}
          />
        </label>
        <label className="field">
          <span>Almacén</span>
          <SearchableNativeSelect
            value={warehouseId}
            onChange={(event) => setWarehouseId(event.target.value)}
          >
            <option value="">Todos los almacenes</option>
            {data?.warehouses.map((warehouse) => (
              <option key={warehouse.id} value={warehouse.id}>
                {warehouse.name}
              </option>
            ))}
          </SearchableNativeSelect>
        </label>
      </div>

      {report.isError ? (
        <div className="alert alert-error">
          {report.error instanceof Error ? report.error.message : 'No se pudo generar el reporte.'}
        </div>
      ) : null}
      {exportMessage ? <div className="alert alert-info no-print">{exportMessage}</div> : null}
      {report.isFetching ? (
        <div className="loading-line no-print">Actualizando reporte…</div>
      ) : null}

      <section className="stat-grid">
        <article className="report-kpi">
          <span>Ventas netas</span>
          <strong>{data ? money(data.summary.netSales) : '—'}</strong>
          <small
            className={
              (data?.summary.salesChangePercent ?? 0) >= 0 ? 'text-success' : 'text-danger'
            }
          >
            {data ? percent(data.summary.salesChangePercent) : 'Cargando…'} vs. periodo anterior
          </small>
        </article>
        <article className="report-kpi">
          <span>Ganancia estimada</span>
          <strong>{data ? money(data.summary.estimatedProfit) : '—'}</strong>
          <small>Ventas menos costo de lotes asignados</small>
        </article>
        <article className="report-kpi">
          <span>Ticket promedio</span>
          <strong>{data ? money(data.summary.averageTicket) : '—'}</strong>
          <small>
            {data
              ? `${data.summary.salesCount} ventas · ${data.summary.unitsSold} unidades`
              : 'Cargando…'}
          </small>
        </article>
        <article className="report-kpi">
          <span>Saldo por cobrar</span>
          <strong>{data ? money(data.summary.outstandingBalance) : '—'}</strong>
          <small>Cobrado en el periodo: {data ? money(data.summary.collected) : '—'}</small>
        </article>
      </section>

      <section className="dashboard-grid dashboard-grid-primary">
        <Panel title="Ventas y cobros" subtitle={`${startDate} al ${endDate}`}>
          <div className="report-daily-chart" role="img" aria-label="Ventas y cobros por día">
            {(data?.daily ?? []).map((item) => (
              <div
                className="report-day-column"
                key={item.date}
                title={`${shortDate(item.date)} · Ventas ${money(item.salesAmount)} · Cobros ${money(item.collectionsAmount)}`}
              >
                <div className="report-day-bars">
                  <span
                    className="report-sales-bar"
                    style={{
                      height: `${Math.max(item.salesAmount > 0 ? 4 : 0, (item.salesAmount / maxDaily) * 100)}%`,
                    }}
                  />
                  <span
                    className="report-collection-bar"
                    style={{
                      height: `${Math.max(item.collectionsAmount > 0 ? 4 : 0, (item.collectionsAmount / maxDaily) * 100)}%`,
                    }}
                  />
                </div>
                <small>{shortDate(item.date)}</small>
              </div>
            ))}
          </div>
          <div className="chart-legend">
            <span>
              <i className="legend-dot primary-dot" /> Ventas
            </span>
            <span>
              <i className="legend-dot neutral-dot" /> Cobros
            </span>
          </div>
        </Panel>

        <Panel title="Inventario actual" subtitle="Valorización según costo final de los lotes">
          <div className="report-health">
            <div>
              <span>Unidades disponibles</span>
              <strong>{data?.inventory.availableUnits ?? '—'}</strong>
              <StatusBadge tone="success">Disponibles</StatusBadge>
            </div>
            <div>
              <span>Reservadas o acumuladas</span>
              <strong>{data?.inventory.reservedUnits ?? '—'}</strong>
              <StatusBadge tone="warning">Comprometidas</StatusBadge>
            </div>
            <div>
              <span>Variantes con stock bajo</span>
              <strong>{data?.inventory.lowStockVariants ?? '—'}</strong>
              <StatusBadge tone={data?.inventory.lowStockVariants ? 'danger' : 'success'}>
                Mínimos
              </StatusBadge>
            </div>
            <div>
              <span>Valor estimado</span>
              <strong>{data ? money(data.inventory.valuationPen) : '—'}</strong>
              <StatusBadge tone="info">Costo PEN</StatusBadge>
            </div>
          </div>
        </Panel>
      </section>

      <section className="dashboard-grid dashboard-grid-secondary">
        <Panel title="Ventas por categoría" subtitle="Participación sobre las ventas del periodo">
          <div className="category-bars">
            {(data?.categories ?? []).map((category) => (
              <div className="category-bar-row" key={category.name}>
                <div>
                  <strong>{category.name}</strong>
                  <small>{category.units} unidades</small>
                </div>
                <div className="category-bar-track">
                  <span style={{ width: `${(category.revenue / maxCategory) * 100}%` }} />
                </div>
                <b>{money(category.revenue)}</b>
              </div>
            ))}
            {data?.categories.length === 0 ? (
              <div className="empty-state">No hay ventas en el periodo.</div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Canales de venta" subtitle="Cantidad e importe por canal">
          <div className="account-list">
            {(data?.channels ?? []).map((channel, index) => (
              <div className="account-row" key={channel.code}>
                <span className={`account-icon account-${(index % 4) + 1}`}>
                  {channel.name.slice(0, 1)}
                </span>
                <div>
                  <strong>{channel.name}</strong>
                  <small>{channel.salesCount} ventas</small>
                </div>
                <b>{money(channel.amount)}</b>
              </div>
            ))}
            {data?.channels.length === 0 ? (
              <div className="empty-state">No hay canales con ventas.</div>
            ) : null}
          </div>
        </Panel>
      </section>

      <Panel
        title="Productos más vendidos"
        subtitle="Rentabilidad estimada a partir del costo de los lotes asignados"
        className="table-panel mobile-scroll-panel"
      >
        <div className="responsive-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>SKU</th>
                <th>Unidades</th>
                <th>Ventas</th>
                <th>Costo estimado</th>
                <th>Ganancia estimada</th>
              </tr>
            </thead>
            <tbody>
              {(data?.topProducts ?? []).map((item) => (
                <tr key={item.variantId}>
                  <td>
                    <strong>{item.productName}</strong>
                    <small>{item.variantName}</small>
                  </td>
                  <td>
                    <code>{item.sku}</code>
                  </td>
                  <td className="numeric-cell">{item.units}</td>
                  <td className="numeric-cell">{money(item.revenue)}</td>
                  <td className="numeric-cell">{money(item.cost)}</td>
                  <td className="numeric-cell">
                    <strong className={item.profit >= 0 ? 'text-success' : 'text-danger'}>
                      {money(item.profit)}
                    </strong>
                  </td>
                </tr>
              ))}
              {data?.topProducts.length === 0 ? (
                <tr>
                  <td colSpan={6}>
                    <div className="empty-state">No hay productos vendidos en el periodo.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
      </Panel>

      <section className="dashboard-grid dashboard-grid-secondary">
        <Panel title="Clientes principales" subtitle="Compras y saldo pendiente del periodo">
          <div className="responsive-table-wrap">
            <table className="data-table compact-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Ventas</th>
                  <th>Comprado</th>
                  <th>Saldo</th>
                </tr>
              </thead>
              <tbody>
                {(data?.topClients ?? []).map((client) => (
                  <tr key={client.clientId}>
                    <td>
                      <strong>{client.clientName}</strong>
                    </td>
                    <td>{client.salesCount}</td>
                    <td>{money(client.purchased)}</td>
                    <td className={client.outstanding > 0 ? 'text-warning' : ''}>
                      {money(client.outstanding)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Panel>
        <Panel title="Stock bajo" subtitle="Variantes en el mínimo o por debajo">
          <div className="priority-list">
            {(data?.lowStock ?? []).slice(0, 8).map((item) => (
              <div className="priority-item static-priority" key={item.variantId}>
                <span className="priority-icon danger">
                  <TrendingUp size={18} />
                </span>
                <span>
                  <strong>
                    {item.productName} · {item.variantName}
                  </strong>
                  <small>
                    {item.sku} · mínimo {item.minimum}
                  </small>
                </span>
                <StatusBadge tone="danger">{item.available} disp.</StatusBadge>
              </div>
            ))}
            {data?.lowStock.length === 0 ? (
              <div className="empty-state">No hay alertas de stock bajo.</div>
            ) : null}
          </div>
        </Panel>
      </section>
    </main>
  );
}
