import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeftRight, Boxes, PackageMinus, PackagePlus, Plus, X } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useSearchParams } from 'react-router';
import type { InventoryMovementAction, InventoryRow } from '@yukimi/shared';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import { Toolbar } from '../components/ui/toolbar';
import { getCatalogs } from '../features/catalog/catalog-api';
import { createInventoryMovement, getInventory } from '../features/products/products-api';

interface ConsolidatedRow extends InventoryRow {
  warehouseName: string;
}

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

export function InventoryPage() {
  const queryClient = useQueryClient();
  const [searchParams] = useSearchParams();
  const [warehouseId, setWarehouseId] = useState<string>('ALL');
  const [search, setSearch] = useState(() => searchParams.get('search')?.trim() ?? '');
  const [movementOpen, setMovementOpen] = useState(false);
  const [action, setAction] = useState<InventoryMovementAction>('TRANSFER');
  const [variantId, setVariantId] = useState('');
  const [sourceWarehouseId, setSourceWarehouseId] = useState('');
  const [destinationWarehouseId, setDestinationWarehouseId] = useState('');
  const [quantity, setQuantity] = useState('1');
  const [reason, setReason] = useState('');
  const [notes, setNotes] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);
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
      (catalogs.data?.warehouses ?? []).filter(
        (warehouse) => warehouse.isActive && warehouse.warehouseType === 'OPERATIONAL',
      ),
    [catalogs.data],
  );
  const rows = useMemo(
    () =>
      warehouseId === 'ALL'
        ? groupConsolidated(inventory.data?.items ?? [])
        : (inventory.data?.items ?? []),
    [inventory.data, warehouseId],
  );
  const movementVariants = useMemo(() => {
    const map = new Map<string, InventoryRow>();
    for (const row of inventory.data?.items ?? [])
      if (!map.has(row.variantId)) map.set(row.variantId, row);
    return [...map.values()];
  }, [inventory.data]);

  const movementMutation = useMutation({
    mutationFn: () =>
      createInventoryMovement({
        action,
        variantId,
        sourceWarehouseId,
        destinationWarehouseId: action === 'TRANSFER' ? destinationWarehouseId : null,
        quantity: Number(quantity),
        reason,
        notes: notes.trim() || null,
      }),
    onSuccess: async (result) => {
      setFeedback(`Movimiento ${result.code} registrado correctamente.`);
      setMovementOpen(false);
      setReason('');
      setNotes('');
      setQuantity('1');
      await queryClient.invalidateQueries({ queryKey: ['inventory'] });
    },
  });

  function openMovement(row?: InventoryRow, nextAction: InventoryMovementAction = 'TRANSFER') {
    const fallback = row ?? inventory.data?.items[0];
    setAction(nextAction);
    setVariantId(fallback?.variantId ?? '');
    setSourceWarehouseId(fallback?.warehouseId ?? operationalWarehouses[0]?.id ?? '');
    setDestinationWarehouseId(
      operationalWarehouses.find((item) => item.id !== (fallback?.warehouseId ?? ''))?.id ?? '',
    );
    setMovementOpen(true);
    setFeedback(null);
  }

  function submitMovement(event: FormEvent) {
    event.preventDefault();
    movementMutation.mutate();
  }

  const totals = useMemo(
    () =>
      rows.reduce(
        (summary, row) => ({
          available: summary.available + row.availableQuantity,
          reserved: summary.reserved + row.reservedQuantity,
          inTransit: summary.inTransit + row.inTransitQuantity,
          unavailable: summary.unavailable + row.damagedQuantity + row.lostQuantity,
        }),
        { available: 0, reserved: 0, inTransit: 0, unavailable: 0 },
      ),
    [rows],
  );

  return (
    <main className="page">
      <PageHeader
        eyebrow="Control de existencias"
        title="Inventario"
        description="Disponibilidad real por almacén y trazabilidad basada en movimientos."
        actions={
          <>
            <button
              className="button button-secondary"
              type="button"
              disabled={!inventory.data?.items.length}
              onClick={() => openMovement(undefined, 'TRANSFER')}
            >
              <ArrowLeftRight size={17} /> Transferir
            </button>
            <button
              className="button button-primary"
              type="button"
              disabled={!inventory.data?.items.length}
              onClick={() => openMovement(undefined, 'DYNAMIC')}
            >
              <Plus size={17} /> Nuevo movimiento
            </button>
          </>
        }
      />

      <div className="warehouse-tabs">
        {operationalWarehouses.map((warehouse) => (
          <button
            className={warehouseId === warehouse.id ? 'active' : ''}
            key={warehouse.id}
            onClick={() => setWarehouseId(warehouse.id)}
          >
            <span className={`warehouse-dot ${warehouse.code.toLowerCase()}`} /> {warehouse.name}
          </button>
        ))}
        <button
          className={warehouseId === 'ALL' ? 'active' : ''}
          onClick={() => setWarehouseId('ALL')}
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

      {feedback ? <div className="alert alert-success">{feedback}</div> : null}
      {inventory.isError ? (
        <div className="alert alert-error">
          {inventory.error instanceof Error
            ? inventory.error.message
            : 'No se pudo cargar el inventario.'}
        </div>
      ) : null}

      <Panel className="table-panel">
        <Toolbar
          placeholder="Buscar producto, código o SKU…"
          value={search}
          onChange={setSearch}
          showFilterButton={false}
        />
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
                      <strong>Sin movimientos de inventario</strong>
                      <p>Registra stock inicial al crear un producto.</p>
                    </div>
                  </td>
                </tr>
              ) : null}
              {rows.map((row) => {
                const low = row.minimumStock > 0 && row.availableQuantity <= row.minimumStock;
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
                      <StatusBadge tone={low ? 'warning' : 'success'}>
                        {low ? 'Revisar' : 'Correcto'}
                      </StatusBadge>
                    </td>
                    <td>
                      <button
                        className="button button-secondary button-compact"
                        type="button"
                        onClick={() => openMovement(row, 'TRANSFER')}
                      >
                        Mover
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
        <Toolbar
          placeholder="Buscar inventario…"
          value={search}
          onChange={setSearch}
          showFilterButton={false}
        />
        {rows.map((row) => {
          const low = row.minimumStock > 0 && row.availableQuantity <= row.minimumStock;
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
                  {low ? 'Bajo' : 'Correcto'}
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
                <small>Stock mínimo: {row.minimumStock}</small>
              </div>
            </article>
          );
        })}
      </div>

      {movementOpen ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setMovementOpen(false);
          }}
        >
          <form
            className="modal-card modal-card-wide"
            role="dialog"
            aria-modal="true"
            aria-labelledby="inventory-movement-title"
            onSubmit={submitMovement}
          >
            <div className="modal-header">
              <div>
                <small>Trazabilidad de stock</small>
                <h2 id="inventory-movement-title">Registrar movimiento</h2>
                <p>
                  El movimiento se ejecutará atómicamente y conservará el motivo para auditoría.
                </p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Cerrar"
                onClick={() => setMovementOpen(false)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="form-grid form-grid-2">
              <label className="field">
                <span>Tipo *</span>
                <select
                  value={action}
                  onChange={(event) => setAction(event.target.value as InventoryMovementAction)}
                >
                  <option value="TRANSFER">Transferencia</option>
                  <option value="DAMAGE">Producto dañado</option>
                  <option value="LOSS">Pérdida</option>
                  <option value="GIFT">Regalo</option>
                  <option value="DYNAMIC">Ajuste dinámico</option>
                </select>
              </label>
              <label className="field">
                <span>Cantidad *</span>
                <input
                  type="number"
                  min="1"
                  max="999999"
                  value={quantity}
                  onChange={(event) => setQuantity(event.target.value)}
                  required
                />
              </label>
              <label className="field field-span-2">
                <span>Producto / variante *</span>
                <select
                  value={variantId}
                  onChange={(event) => setVariantId(event.target.value)}
                  required
                >
                  {movementVariants.map((row) => (
                    <option key={row.variantId} value={row.variantId}>
                      {row.productName} · {row.variantName} · {row.sku}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Almacén de origen *</span>
                <select
                  value={sourceWarehouseId}
                  onChange={(event) => setSourceWarehouseId(event.target.value)}
                  required
                >
                  {operationalWarehouses.map((warehouse) => (
                    <option key={warehouse.id} value={warehouse.id}>
                      {warehouse.name}
                    </option>
                  ))}
                </select>
              </label>
              {action === 'TRANSFER' ? (
                <label className="field">
                  <span>Almacén de destino *</span>
                  <select
                    value={destinationWarehouseId}
                    onChange={(event) => setDestinationWarehouseId(event.target.value)}
                    required
                  >
                    <option value="">Seleccionar</option>
                    {operationalWarehouses
                      .filter((warehouse) => warehouse.id !== sourceWarehouseId)
                      .map((warehouse) => (
                        <option key={warehouse.id} value={warehouse.id}>
                          {warehouse.name}
                        </option>
                      ))}
                  </select>
                </label>
              ) : null}
              <label className="field field-span-2">
                <span>Motivo *</span>
                <textarea
                  rows={3}
                  minLength={5}
                  maxLength={1000}
                  value={reason}
                  onChange={(event) => setReason(event.target.value)}
                  required
                />
              </label>
              <label className="field field-span-2">
                <span>Notas</span>
                <textarea
                  rows={2}
                  maxLength={1000}
                  value={notes}
                  onChange={(event) => setNotes(event.target.value)}
                />
              </label>
            </div>
            {movementMutation.isError ? (
              <div className="alert alert-error">
                {movementMutation.error instanceof Error
                  ? movementMutation.error.message
                  : 'No se pudo registrar el movimiento.'}
              </div>
            ) : null}
            <div className="modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setMovementOpen(false)}
              >
                Cancelar
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={
                  movementMutation.isPending ||
                  !variantId ||
                  !sourceWarehouseId ||
                  !reason.trim() ||
                  Number(quantity) < 1 ||
                  (action === 'TRANSFER' && !destinationWarehouseId)
                }
              >
                {movementMutation.isPending ? 'Registrando…' : 'Confirmar movimiento'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
