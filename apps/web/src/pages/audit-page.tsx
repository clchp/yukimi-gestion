import { useQuery } from '@tanstack/react-query';
import type { AuditItem } from '@yukimi/shared';
import { Download, Eye, ShieldCheck, X } from 'lucide-react';
import { useMemo, useState } from 'react';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import { Toolbar } from '../components/ui/toolbar';
import { downloadCsv } from '../features/insights/csv-export';
import { getAuditLog, registerReportExport } from '../features/insights/insights-api';

function inputDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat('es-PE', { dateStyle: 'short', timeStyle: 'medium' }).format(
    new Date(value),
  );
}

function actionTone(action: string): 'success' | 'danger' | 'warning' | 'info' | 'neutral' {
  if (action === 'REVERSE' || action === 'DELETE') return 'danger';
  if (action === 'CONFIRM') return 'success';
  if (action === 'STATE_CHANGE' || action === 'UPDATE') return 'warning';
  if (action === 'INSERT') return 'info';
  return 'neutral';
}

export function AuditPage() {
  const defaultDates = useMemo(() => {
    const now = new Date();
    const from = new Date(now);
    from.setDate(from.getDate() - 30);
    return { from: inputDate(from), to: inputDate(now) };
  }, []);
  const [search, setSearch] = useState('');
  const [module, setModule] = useState('');
  const [action, setAction] = useState('');
  const [dateFrom, setDateFrom] = useState(defaultDates.from);
  const [dateTo, setDateTo] = useState(defaultDates.to);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<AuditItem | null>(null);
  const [message, setMessage] = useState('');

  const audit = useQuery({
    queryKey: ['audit', search, module, action, dateFrom, dateTo, page],
    queryFn: () => getAuditLog({ search, module, action, dateFrom, dateTo, page, pageSize: 25 }),
    placeholderData: (previous) => previous,
  });
  const totalPages = Math.max(
    1,
    Math.ceil((audit.data?.total ?? 0) / (audit.data?.pageSize ?? 25)),
  );

  async function exportAudit() {
    if (!audit.data) return;
    const filename = `yukimi-auditoria-${dateFrom}-${dateTo}.csv`;
    downloadCsv(filename, [
      [
        'Fecha y hora',
        'Administradora',
        'Módulo',
        'Tabla',
        'Acción',
        'Registro',
        'Motivo',
        'Request ID',
      ],
      ...audit.data.items.map((item) => [
        item.occurredAt,
        item.actorName,
        item.module,
        item.tableName,
        item.action,
        item.entityId,
        item.reason,
        item.requestId,
      ]),
    ]);
    try {
      const result = await registerReportExport({
        reportType: 'AUDIT',
        format: 'CSV',
        startDate: dateFrom,
        endDate: dateTo,
        filename,
        filters: { module: module || null, action: action || null, search: search || null },
      });
      setMessage(`Exportación registrada como ${result.code}.`);
    } catch {
      setMessage('El archivo se descargó, pero no se pudo registrar la exportación.');
    }
  }

  return (
    <main className="page audit-page">
      <PageHeader
        eyebrow="Trazabilidad"
        title="Auditoría del sistema"
        description="Consulta quién realizó cada acción, cuándo ocurrió y qué información cambió."
        actions={
          <button
            className="button button-secondary"
            type="button"
            disabled={!audit.data}
            onClick={() => void exportAudit()}
          >
            <Download size={17} /> Exportar log
          </button>
        }
      />

      <section className="audit-banner">
        <ShieldCheck size={24} />
        <div>
          <strong>Historial protegido</strong>
          <p>Los eventos son de solo lectura y no pueden eliminarse desde la aplicación.</p>
        </div>
      </section>
      {message ? <div className="alert alert-info">{message}</div> : null}
      {audit.isError ? (
        <div className="alert alert-error">
          {audit.error instanceof Error ? audit.error.message : 'No se pudo cargar la auditoría.'}
        </div>
      ) : null}

      <section className="summary-strip audit-summary-strip">
        <div>
          <span>Acciones últimos 30 días</span>
          <strong>{audit.data?.summary.last30Days ?? '—'}</strong>
        </div>
        <div>
          <span>Acciones sensibles</span>
          <strong>{audit.data?.summary.sensitiveActions ?? '—'}</strong>
        </div>
        {(audit.data?.summary.actors ?? []).slice(0, 2).map((actor) => (
          <div key={actor.actorName}>
            <span>{actor.actorName}</span>
            <strong>{actor.count}</strong>
          </div>
        ))}
      </section>

      <Panel className="table-panel mobile-scroll-panel">
        <Toolbar
          placeholder="Buscar administradora, tabla, registro o motivo…"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          showFilterButton={false}
        />
        <div className="audit-filter-grid">
          <label className="field">
            <span>Módulo</span>
            <select
              value={module}
              onChange={(event) => {
                setModule(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todos</option>
              <option value="SALES">Ventas y pagos</option>
              <option value="CLIENTS">Clientes</option>
              <option value="INVENTORY">Productos e inventario</option>
              <option value="DELIVERIES">Entregas</option>
              <option value="IMPORTS">Importaciones</option>
              <option value="FINANCE">Finanzas</option>
              <option value="SYSTEM">Sistema y reportes</option>
            </select>
          </label>
          <label className="field">
            <span>Acción</span>
            <select
              value={action}
              onChange={(event) => {
                setAction(event.target.value);
                setPage(1);
              }}
            >
              <option value="">Todas</option>
              <option value="INSERT">Creación</option>
              <option value="UPDATE">Actualización</option>
              <option value="STATE_CHANGE">Cambio de estado</option>
              <option value="CONFIRM">Confirmación</option>
              <option value="REVERSE">Reversión</option>
              <option value="DELETE">Eliminación lógica/física</option>
              <option value="OTHER">Otra</option>
            </select>
          </label>
          <label className="field">
            <span>Desde</span>
            <input
              type="date"
              value={dateFrom}
              max={dateTo}
              onChange={(event) => {
                setDateFrom(event.target.value);
                setPage(1);
              }}
            />
          </label>
          <label className="field">
            <span>Hasta</span>
            <input
              type="date"
              value={dateTo}
              min={dateFrom}
              onChange={(event) => {
                setDateTo(event.target.value);
                setPage(1);
              }}
            />
          </label>
        </div>
        <div className="responsive-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha y hora</th>
                <th>Administradora</th>
                <th>Módulo</th>
                <th>Acción</th>
                <th>Registro</th>
                <th>Motivo</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {audit.isLoading ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">Cargando auditoría…</div>
                  </td>
                </tr>
              ) : null}
              {audit.data?.items.map((item) => (
                <tr key={item.id}>
                  <td>{formatDate(item.occurredAt)}</td>
                  <td>
                    <div className="client-cell">
                      <span className="avatar avatar-table">
                        {item.actorName.slice(0, 1).toUpperCase()}
                      </span>
                      <strong>{item.actorName}</strong>
                    </div>
                  </td>
                  <td>
                    <StatusBadge tone="neutral">{item.module}</StatusBadge>
                    <small>{item.tableName}</small>
                  </td>
                  <td>
                    <StatusBadge tone={actionTone(item.action)}>{item.action}</StatusBadge>
                  </td>
                  <td>
                    <code>{item.entityId ?? '—'}</code>
                  </td>
                  <td>{item.reason ?? 'Sin motivo adicional'}</td>
                  <td>
                    <button
                      className="icon-button table-action"
                      type="button"
                      aria-label="Ver detalle"
                      onClick={() => setSelected(item)}
                    >
                      <Eye size={17} />
                    </button>
                  </td>
                </tr>
              ))}
              {!audit.isLoading && audit.data?.items.length === 0 ? (
                <tr>
                  <td colSpan={7}>
                    <div className="empty-state">No hay eventos con estos filtros.</div>
                  </td>
                </tr>
              ) : null}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>
            {audit.data
              ? `Mostrando ${audit.data.items.length} de ${audit.data.total} eventos`
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
      </Panel>

      {selected ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelected(null);
          }}
        >
          <section
            className="modal-card audit-detail-modal"
            role="dialog"
            aria-modal="true"
            aria-label="Detalle del evento de auditoría"
          >
            <div className="modal-header">
              <div>
                <span className="eyebrow">Evento #{selected.id}</span>
                <h2>
                  {selected.action} · {selected.module}
                </h2>
                <p>
                  {formatDate(selected.occurredAt)} · {selected.actorName}
                </p>
              </div>
              <button className="icon-button" type="button" onClick={() => setSelected(null)}>
                <X size={18} />
              </button>
            </div>
            <div className="audit-detail-grid">
              <div>
                <span>Tabla</span>
                <strong>{selected.tableName}</strong>
              </div>
              <div>
                <span>Registro</span>
                <strong>{selected.entityId ?? 'No aplica'}</strong>
              </div>
              <div>
                <span>Request ID</span>
                <strong>{selected.requestId ?? 'No disponible'}</strong>
              </div>
              <div>
                <span>Motivo</span>
                <strong>{selected.reason ?? 'Sin motivo adicional'}</strong>
              </div>
            </div>
            <div className="audit-json-grid">
              <div>
                <h3>Valores anteriores</h3>
                <pre>{JSON.stringify(selected.oldValues, null, 2) ?? '—'}</pre>
              </div>
              <div>
                <h3>Valores nuevos</h3>
                <pre>{JSON.stringify(selected.newValues, null, 2) ?? '—'}</pre>
              </div>
            </div>
            <h3>Metadatos</h3>
            <pre>{JSON.stringify(selected.metadata, null, 2)}</pre>
          </section>
        </div>
      ) : null}
    </main>
  );
}
