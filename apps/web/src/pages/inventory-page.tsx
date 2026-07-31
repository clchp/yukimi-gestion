import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { InventoryMovementAction, InventoryRow } from '@yukimi/shared';
import { AlertTriangle, Boxes, PackageMinus, PackagePlus, Plus, Wrench, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import { FilterButton, FilterPanel } from '../components/ui/filter-panel';
import { BusyLabel, useFeedback } from '../components/ui/feedback-provider';
import { ContextNote } from '../components/ui/info-tip';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { SearchableSelect } from '../components/ui/searchable-select';
import { StatusBadge } from '../components/ui/status-badge';
import { Toolbar } from '../components/ui/toolbar';
import { getCatalogs } from '../features/catalog/catalog-api';
import { createInventoryMovement, getInventory } from '../features/products/products-api';

interface ConsolidatedRow extends InventoryRow {
  warehouseName: string;
}

type AlertFilter = 'ALL' | 'LOW' | 'OK';

const actionLabels: Record<InventoryMovementAction, string> = {
  TRANSFER: 'Transferencia entre almacenes',
  DAMAGE: 'Producto dañado',
  LOSS: 'Pérdida',
  GIFT: 'Salida por regalo',
  DYNAMIC: 'Ajuste manual de stock',
};

const actionHelp: Record<InventoryMovementAction, string> = {
  TRANSFER:
    'Retira unidades de un almacén y las registra en otro. El origen y el destino deben ser diferentes.',
  DAMAGE: 'Retira unidades disponibles y las clasifica como dañadas.',
  LOSS: 'Retira unidades disponibles porque ya no se encuentran físicamente.',
  GIFT: 'Retira unidades entregadas gratuitamente a una persona. No transfiere stock a otro almacén.',
  DYNAMIC:
    'Añade unidades para corregir una diferencia física comprobada. Debe indicarse el motivo exacto.',
};

function groupConsolidated(items: InventoryRow[]): ConsolidatedRow[] {
  const grouped = new Map<string, ConsolidatedRow>();
  for (const item of items) {
    const current = grouped.get(item.variantId);
    if (!current) {
      grouped.set(item.variantId, { ...item, warehouseName: 'Todos los almacenes' });
      continue;
    }
    current.availableQuantity += item.availableQuantity;
    current.reservedQuantity += item.reservedQuantity;
    current.accumulatedQuantity += item.accumulatedQuantity;
    current.damagedQuantity += item.damagedQuantity;
    current.lostQuantity += item.lostQuantity;
    current.inTransitQuantity += item.inTransitQuantity;
    current.preorderExpectedQuantity += item.preorderExpectedQuantity;
  }
  return [...grouped.values()];
}

function isLow(row: InventoryRow) {
  return row.minimumStock > 0 && row.availableQuantity <= row.minimumStock;
}

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const { confirm, notify, notifyError } = useFeedback();
  const [warehouseId, setWarehouseId] = useState<string>('ALL');
  const [search, setSearch] = useState(() => searchParams.get('search')?.trim() ?? '');
  const [filterOpen, setFilterOpen] = useState(false);
  const [alertFilter, setAlertFilter] = useState<AlertFilter>('ALL');
  const [draftWarehouseId, setDraftWarehouseId] = useState('ALL');
  const [draftAlertFilter, setDraftAlertFilter] = useState<AlertFilter>('ALL');
  const [movementOpen, setMovementOpen] = useState(false);
  const [action, setAction] = useState<InventoryMovementAction>('TRANSFER');
  const [variantId, setVariantId] = useState('');
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [errors, setErrors] = useState<Record<string, string>>({});

  const catalogs = useQuery({ queryKey: ['catalogs'], queryFn: getCatalogs });
  const inventory = useQuery({
    queryKey: ['inventory', warehouseId, search],
    queryFn: () =>
      getInventory({
        warehouseId: warehouseId === 'ALL' ? undefined : warehouseId,
        search,
        includeVirtual: false,
      }),
    placeholderData: (previous) => previous,
  });

  const operationalWarehouses = useMemo(
    () =>
      (catalogs.data?.warehouses ?? [])
        .filter((warehouse) => warehouse.isActive && warehouse.warehouseType === 'OPERATIONAL')
        .sort((left, right) => left.name.localeCompare(right.name, 'es', { sensitivity: 'base' })),
    [catalogs.data],
  );
  const allRows = useMemo(
    () =>
      warehouseId === 'ALL'
        ? groupConsolidated(inventory.data?.items ?? [])
        : (inventory.data?.items ?? []),
    [inventory.data?.items, warehouseId],
  );
  const rows = useMemo(
    () =>
      allRows.filter(
        (row) => alertFilter === 'ALL' || (alertFilter === 'LOW' ? isLow(row) : !isLow(row)),
      ),
    [alertFilter, allRows],
  );
  const movementVariants = useMemo(() => {
    const map = new Map<string, InventoryRow>();
    for (const row of inventory.data?.items ?? [])
      if (!map.has(row.variantId)) map.set(row.variantId, row);
    return [...map.values()].sort((left, right) =>
      `${left.productName} ${left.variantName}`.localeCompare(
        `${right.productName} ${right.variantName}`,
        'es',
        { sensitivity: 'base' },
      ),
    );
  }, [inventory.data?.items]);
  const selectedRows = useMemo(
    () => (inventory.data?.items ?? []).filter((row) => row.variantId === variantId),
    [inventory.data?.items, variantId],
  );
  const selectedSourceRow = selectedRows.find((row) => row.warehouseId === sourceWarehouseId);

  const movementMutation = useMutation({
    mutationFn: () =>
      createInventoryMovement({
        action,
        variantId,
        sourceWarehouseId,
        destinationWarehouseId: action === 'TRANSFER' ? destinationWarehouseId : null,
        quantity: Number(quantity),
        reason: reason.trim(),
        notes: notes.trim() || null,
      }),
    onSuccess: async (result) => {
      setMovementOpen(false);
      setReason('');
      setNotes('');
      setQuantity('1');
      setErrors({});
      notify({
        title: 'Movimiento registrado',
        message: `${result.code}: ${actionLabels[result.action]} por ${result.quantity} unidades.`,
        tone: 'success',
      });
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
    onError: (error) => notifyError(error, 'No se pudo registrar el movimiento.'),
  });

  function openMovement(row?: InventoryRow, nextAction: InventoryMovementAction = 'TRANSFER') {
    const fallback = row ?? inventory.data?.items[0];
    const source = warehouseId === 'ALL' ? fallback?.warehouseId : warehouseId;
    setAction(nextAction);
    setVariantId(fallback?.variantId ?? '');
    setSourceWarehouseId(source ?? operationalWarehouses[0]?.id ?? '');
    setDestinationWarehouseId(operationalWarehouses.find((item) => item.id !== source)?.id ?? '');
    setQuantity('1');
    setReason('');
    setNotes('');
    setErrors({});
    setMovementOpen(true);
  }

  function resolveLowStock(row: InventoryRow) {
    const other = (inventory.data?.items ?? []).find(
      (candidate) =>
        candidate.variantId === row.variantId &&
        candidate.warehouseId !== row.warehouseId &&
        candidate.availableQuantity > 0,
    );
    if (other) {
      openMovement(other, 'TRANSFER');
      setDestinationWarehouseId(row.warehouseId);
      setQuantity(
        String(
          Math.min(other.availableQuantity, Math.max(1, row.minimumStock - row.availableQuantity)),
        ),
      );
      setReason(`Reposición de stock bajo en ${row.warehouseName}`);
    } else {
      openMovement(row, 'DYNAMIC');
      setQuantity(String(Math.max(1, row.minimumStock - row.availableQuantity)));
      setReason(`Corrección física para alcanzar el stock mínimo en ${row.warehouseName}`);
    }
  }

  function validateMovement() {
    const next: Record<string, string> = {};
    const amount = Number(quantity);
    if (!variantId) next.variantId = 'Selecciona un producto o variante.';
    if (!sourceWarehouseId) next.sourceWarehouseId = 'Selecciona un almacén.';
    if (!Number.isInteger(amount) || amount <= 0)
      next.quantity = 'La cantidad debe ser un entero mayor que cero.';
    if (reason.trim().length < 5) next.reason = 'El motivo debe tener al menos 5 caracteres.';
    if (action === 'TRANSFER') {
      if (!destinationWarehouseId)
        next.destinationWarehouseId = 'Selecciona el almacén de destino.';
      else if (destinationWarehouseId === sourceWarehouseId)
        next.destinationWarehouseId = 'El destino debe ser diferente al origen.';
    }
    if (action !== 'DYNAMIC' && selectedSourceRow && amount > selectedSourceRow.availableQuantity) {
      next.quantity = `Solicitaste ${amount}, pero ${selectedSourceRow.warehouseName} solo tiene ${selectedSourceRow.availableQuantity} disponibles.`;
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submitMovement(event: FormEvent) {
    event.preventDefault();
    if (!validateMovement()) return;
    const accepted = await confirm({
      title: 'Confirmar movimiento de inventario',
      message: `${actionLabels[action]} por ${Number(quantity)} unidades.`,
      detail: actionHelp[action],
      confirmLabel: 'Registrar movimiento',
    });
    if (!accepted) {
      notify({
        title: 'Movimiento cancelado',
        message: 'No se modificó el inventario.',
        tone: 'info',
      });
      return;
    }
    movementMutation.mutate();
  }

  const totals = useMemo(
    () =>
      allRows.reduce(
        (summary, row) => ({
          available: summary.available + row.availableQuantity,
          reserved: summary.reserved + row.reservedQuantity,
          inTransit: summary.inTransit + row.inTransitQuantity,
          unavailable: summary.unavailable + row.damagedQuantity + row.lostQuantity,
        }),
        { available: 0, reserved: 0, inTransit: 0, unavailable: 0 },
      ),
    [allRows],
  );
  const activeFilterCount = Number(warehouseId !== 'ALL') + Number(alertFilter !== 'ALL');

  return (
    <main className="page">
      <PageHeader
        eyebrow="Control de existencias"
        title="Inventario"
        description="Disponibilidad real por almacén y movimientos con motivo y auditoría."
        actions={
          <button
            className="button button-primary"
            type="button"
            disabled={!inventory.data?.items.length}
            onClick={() => openMovement(undefined, 'TRANSFER')}
          >
            <Plus size={17} /> Registrar movimiento
          </button>
        }
      />

      <div className="warehouse-tabs">
        {operationalWarehouses.map((warehouse) => (
          <button
            className={warehouseId === warehouse.id ? 'active' : ''}
            key={warehouse.id}
            onClick={() => {
              setWarehouseId(warehouse.id);
              setDraftWarehouseId(warehouse.id);
            }}
          >
            <span className={`warehouse-dot ${warehouse.code.toLowerCase()}`} /> {warehouse.name}
          </button>
        ))}
        <button
          className={warehouseId === 'ALL' ? 'active' : ''}
          onClick={() => {
            setWarehouseId('ALL');
            setDraftWarehouseId('ALL');
          }}
        >
          Vista consolidada <b>{totals.available}</b>
        </button>
      </div>

      <section className="stat-grid inventory-stat-grid">
        <article className="inventory-stat">
          <span className="stat-icon stat-success">
            <Boxes size={19} />
          </span>
          <div>
            <small>Disponible</small>
            <strong>{totals.available}</strong>
            <p>Unidades vendibles</p>
          </div>
        </article>
        <article className="inventory-stat">
          <span className="stat-icon stat-warning">
            <PackageMinus size={19} />
          </span>
          <div>
            <small>Reservado</small>
            <strong>{totals.reserved}</strong>
            <p>Separado a clientes</p>
          </div>
        </article>
        <article className="inventory-stat">
          <span className="stat-icon stat-info">
            <PackagePlus size={19} />
          </span>
          <div>
            <small>En tránsito</small>
            <strong>{totals.inTransit}</strong>
            <p>Mercadería en camino</p>
          </div>
        </article>
        <article className="inventory-stat">
          <span className="stat-icon stat-danger">
            <PackageMinus size={19} />
          </span>
          <div>
            <small>No disponible</small>
            <strong>{totals.unavailable}</strong>
            <p>Dañado o perdido</p>
          </div>
        </article>
      </section>

      {inventory.isError ? (
        <div className="alert alert-error">No se pudo cargar el inventario.</div>
      ) : null}

      <Panel className="table-panel">
        <Toolbar
          placeholder="Buscar producto, código o SKU…"
          value={search}
          onChange={setSearch}
          showFilterButton={false}
        >
          <FilterButton
            activeCount={activeFilterCount}
            onClick={() => {
              setDraftWarehouseId(warehouseId);
              setDraftAlertFilter(alertFilter);
              setFilterOpen(true);
            }}
          />
        </Toolbar>
        <div className="responsive-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Producto</th>
                <th>Almacén</th>
                <th>Disponible</th>
                <th>Reservado</th>
                <th>Preventa</th>
                <th>Tránsito</th>
                <th>Dañado</th>
                <th>Stock mínimo</th>
                <th>Alerta</th>
                <th>Acción</th>
              </tr>
            </thead>
            <tbody>
              {inventory.isLoading ? (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state">Cargando inventario…</div>
                  </td>
                </tr>
              ) : null}
              {!inventory.isLoading && rows.length === 0 ? (
                <tr>
                  <td colSpan={10}>
                    <div className="empty-state">
                      <strong>Sin resultados</strong>
                      <p>Cambia la búsqueda o limpia los filtros.</p>
                    </div>
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => {
                const low = isLow(row);
                const missing = Math.max(0, row.minimumStock - row.availableQuantity);
                return (
                  <tr key={`${row.variantId}-${row.warehouseId}`}>
                    <td>
                      <strong>{row.productName}</strong>
                      <small>
                        {row.productCode} · {row.variantName} · {row.sku}
                      </small>
                    </td>
                    <td>{row.warehouseName}</td>
                    <td className="numeric-cell">
                      <strong>{row.availableQuantity}</strong>
                    </td>
                    <td className="numeric-cell">{row.reservedQuantity}</td>
                    <td className="numeric-cell">{row.preorderExpectedQuantity}</td>
                    <td className="numeric-cell">{row.inTransitQuantity}</td>
                    <td className="numeric-cell">{row.damagedQuantity}</td>
                    <td className="numeric-cell">{row.minimumStock}</td>
                    <td>
                      {low ? (
                        <button
                          className="stock-alert-action"
                          type="button"
                          title={`Faltan ${missing} unidades para alcanzar el mínimo`}
                          onClick={() => resolveLowStock(row)}
                        >
                          <AlertTriangle size={14} /> Stock bajo · Resolver
                        </button>
                      ) : (
                        <StatusBadge tone="success">Correcto</StatusBadge>
                      )}
                    </td>
                    <td>
                      <button
                        className="button button-secondary button-compact"
                        type="button"
                        onClick={() => openMovement(row, 'TRANSFER')}
                      >
                        <Wrench size={15} /> Registrar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mobile-card-list inventory-mobile-list">
        {rows.map((row) => {
          const low = isLow(row);
          return (
            <article
              className="mobile-record-card"
              key={`${row.variantId}-${row.warehouseId}-mobile`}
            >
              <div className="mobile-record-header">
                <div>
                  <strong>{row.productName}</strong>
                  <small>
                    {row.variantName} · {row.sku}
                  </small>
                </div>
                <StatusBadge tone={low ? 'warning' : 'success'}>
                  {low ? 'Stock bajo' : 'Correcto'}
                </StatusBadge>
              </div>
              <div className="mobile-record-grid">
                <span>
                  Disponible<strong>{row.availableQuantity}</strong>
                </span>
                <span>
                  Reservado<strong>{row.reservedQuantity}</strong>
                </span>
                <span>
                  Tránsito<strong>{row.inTransitQuantity}</strong>
                </span>
                <span>
                  Dañado<strong>{row.damagedQuantity}</strong>
                </span>
              </div>
              <div className="mobile-record-footer">
                <small>{row.warehouseName}</small>
                <button
                  className="link-button"
                  type="button"
                  onClick={() => (low ? resolveLowStock(row) : openMovement(row, 'TRANSFER'))}
                >
                  {low ? 'Resolver stock bajo' : 'Registrar movimiento'}
                </button>
              </div>
            </article>
          );
        })}
      </div>

      <FilterPanel
        open={filterOpen}
        activeCount={Number(draftWarehouseId !== 'ALL') + Number(draftAlertFilter !== 'ALL')}
        onClose={() => setFilterOpen(false)}
        onApply={() => {
          setWarehouseId(draftWarehouseId);
          setAlertFilter(draftAlertFilter);
          setFilterOpen(false);
        }}
        onClear={() => {
          setDraftWarehouseId('ALL');
          setDraftAlertFilter('ALL');
          setWarehouseId('ALL');
          setAlertFilter('ALL');
        }}
      >
        <SearchableSelect
          label="Almacén"
          value={draftWarehouseId}
          options={[
            { value: 'ALL', label: 'Todos los almacenes' },
            ...operationalWarehouses.map((warehouse) => ({
              value: warehouse.id,
              label: warehouse.name,
            })),
          ]}
          onChange={setDraftWarehouseId}
        />
        <SearchableSelect
          label="Estado del stock"
          value={draftAlertFilter}
          options={[
            { value: 'ALL', label: 'Todos' },
            { value: 'LOW', label: 'Solo stock bajo' },
            { value: 'OK', label: 'Solo stock correcto' },
          ]}
          onChange={(value) => setDraftAlertFilter(value as AlertFilter)}
        />
      </FilterPanel>

      {movementOpen ? (
        <div
          className="app-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMovementOpen(false);
          }}
        >
          <form
            className="app-modal-card modal-card-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-movement-title"
            onSubmit={(event) => void submitMovement(event)}
          >
            <header className="app-modal-header">
              <div>
                <span className="eyebrow">Trazabilidad de stock</span>
                <h2 id="inventory-movement-title">Registrar movimiento</h2>
                <p>
                  El movimiento se ejecutará de forma atómica y conservará el motivo para auditoría.
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Cerrar"
                onClick={() => setMovementOpen(false)}
              >
                <X size={20} />
              </button>
            </header>
            {Object.keys(errors).length > 0 ? (
              <div className="form-error-summary" role="alert">
                No se pudo continuar. Corrige {Object.keys(errors).length} campos marcados en rojo.
              </div>
            ) : null}
            <ContextNote
              tone={action === 'DYNAMIC' ? 'warning' : 'info'}
              title={actionLabels[action]}
            >
              {actionHelp[action]}
            </ContextNote>
            <div className="form-grid form-grid-2">
              <SearchableSelect
                label="Tipo de movimiento"
                required
                value={action}
                options={(Object.keys(actionLabels) as InventoryMovementAction[]).map((code) => ({
                  value: code,
                  label: actionLabels[code],
                  description: actionHelp[code],
                }))}
                onChange={(value) => {
                  setAction(value as InventoryMovementAction);
                  setErrors({});
                }}
              />
              <label className={`field ${errors.quantity ? 'field-invalid' : ''}`}>
                <span>Cantidad *</span>
                <input
                  type="number"
                  min="1"
                  max="999999"
                  step="1"
                  value={quantity}
                  aria-invalid={Boolean(errors.quantity)}
                  onChange={(event) => {
                    setQuantity(event.target.value);
                    setErrors((current) => ({ ...current, quantity: '' }));
                  }}
                />
                {errors.quantity ? <small className="field-error">{errors.quantity}</small> : null}
              </label>
              <div className="field-span-2">
                <SearchableSelect
                  label="Producto o variante"
                  required
                  value={variantId}
                  error={errors.variantId}
                  searchPlaceholder="Buscar por producto, variante o SKU…"
                  options={movementVariants.map((row) => ({
                    value: row.variantId,
                    label: `${row.productName} · ${row.variantName}`,
                    description: row.sku,
                  }))}
                  onChange={(value) => {
                    setVariantId(value);
                    const first = (inventory.data?.items ?? []).find(
                      (row) => row.variantId === value,
                    );
                    if (first) setSourceWarehouseId(first.warehouseId);
                    setErrors((current) => ({ ...current, variantId: '' }));
                  }}
                />
              </div>
              <SearchableSelect
                label={action === 'TRANSFER' ? 'Almacén de origen' : 'Almacén afectado'}
                required
                value={sourceWarehouseId}
                error={errors.sourceWarehouseId}
                options={operationalWarehouses.map((warehouse) => ({
                  value: warehouse.id,
                  label: warehouse.name,
                  description: `${selectedRows.find((row) => row.warehouseId === warehouse.id)?.availableQuantity ?? 0} disponibles`,
                }))}
                onChange={(value) => {
                  setSourceWarehouseId(value);
                  setErrors((current) => ({ ...current, sourceWarehouseId: '' }));
                }}
              />
              {action === 'TRANSFER' ? (
                <SearchableSelect
                  label="Almacén de destino"
                  required
                  value={destinationWarehouseId}
                  error={errors.destinationWarehouseId}
                  options={operationalWarehouses
                    .filter((warehouse) => warehouse.id !== sourceWarehouseId)
                    .map((warehouse) => ({ value: warehouse.id, label: warehouse.name }))}
                  onChange={(value) => {
                    setDestinationWarehouseId(value);
                    setErrors((current) => ({ ...current, destinationWarehouseId: '' }));
                  }}
                />
              ) : (
                <div />
              )}
              <label className={`field field-span-2 ${errors.reason ? 'field-invalid' : ''}`}>
                <span>Motivo *</span>
                <textarea
                  rows={4}
                  value={reason}
                  aria-invalid={Boolean(errors.reason)}
                  onChange={(event) => {
                    setReason(event.target.value);
                    setErrors((current) => ({ ...current, reason: '' }));
                  }}
                  placeholder="Explica por qué se realiza este movimiento…"
                />
                {errors.reason ? <small className="field-error">{errors.reason}</small> : null}
              </label>
              <label className="field field-span-2">
                <span>Notas</span>
                <textarea
                  rows={3}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
            </div>
            <small className="required-note">* Campo obligatorio</small>
            {variantId && sourceWarehouseId ? (
              <div className="movement-preview">
                <strong>Resultado esperado</strong>
                <span>
                  {action === 'TRANSFER'
                    ? `Se retirarán ${quantity || 0} unidades de ${operationalWarehouses.find((warehouse) => warehouse.id === sourceWarehouseId)?.name ?? 'origen'} y se agregarán al destino.`
                    : action === 'DYNAMIC'
                      ? `Se agregarán ${quantity || 0} unidades disponibles al almacén seleccionado como corrección manual.`
                      : `Se retirarán ${quantity || 0} unidades disponibles y se registrarán como ${actionLabels[action].toLocaleLowerCase('es-PE')}.`}
                </span>
              </div>
            ) : null}
            <footer className="app-modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => {
                  setMovementOpen(false);
                  notify({
                    title: 'Movimiento cancelado',
                    message: 'No se modificó el inventario.',
                    tone: 'info',
                  });
                }}
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={movementMutation.isPending}
              >
                {movementMutation.isPending ? (
                  <BusyLabel label="Registrando…" />
                ) : (
                  'Revisar y confirmar'
                )}
              </button>
            </footer>
          </form>
        </div>
      ) : null}
    </main>
  );
}
