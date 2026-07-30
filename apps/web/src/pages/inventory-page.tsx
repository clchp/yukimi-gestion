import { useQuery } from '@tanstack/react-query';
import { ArrowLeftRight, Boxes, PackageMinus, PackagePlus, Plus } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useSearchParams } from 'react-router';
import type { InventoryRow } from '@yukimi/shared';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import { Toolbar } from '../components/ui/toolbar';
import { getCatalogs } from '../features/catalog/catalog-api';
import { getInventory } from '../features/products/products-api';

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
  const [searchParams] = useSearchParams();
  const [warehouseId, setWarehouseId] = useState<string>('ALL');
  const [search, setSearch] = useState(() => searchParams.get('search')?.trim() ?? '');
  const catalogs = useQuery({ queryKey: ['catalogs'], queryFn: getCatalogs });
  const inventory = useQuery({
    queryKey: ['inventory', warehouseId, search],
    queryFn: () => getInventory({ warehouseId: warehouseId === 'ALL' ? undefined : warehouseId, search, includeVirtual: false }),
    placeholderData: (previous) => previous,
  });

  const operationalWarehouses = useMemo(
    () => (catalogs.data?.warehouses ?? []).filter((warehouse) => warehouse.isActive && warehouse.warehouseType === 'OPERATIONAL'),
    [catalogs.data],
  );
  const rows = useMemo(
    () => (warehouseId === 'ALL' ? groupConsolidated(inventory.data?.items ?? []) : inventory.data?.items ?? []),
    [inventory.data, warehouseId],
  );
  const totals = useMemo(
    () => rows.reduce(
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
            <button className="button button-secondary" type="button" disabled><ArrowLeftRight size={17} /> Transferir</button>
            <button className="button button-primary" type="button" disabled><Plus size={17} /> Nuevo movimiento</button>
          </>
        }
      />

      <div className="warehouse-tabs">
        {operationalWarehouses.map((warehouse) => (
          <button className={warehouseId === warehouse.id ? 'active' : ''} key={warehouse.id} onClick={() => setWarehouseId(warehouse.id)}>
            <span className={`warehouse-dot ${warehouse.code.toLowerCase()}`} /> {warehouse.name}
          </button>
        ))}
        <button className={warehouseId === 'ALL' ? 'active' : ''} onClick={() => setWarehouseId('ALL')}>Vista consolidada <b>{totals.available}</b></button>
      </div>

      <section className="stat-grid inventory-stat-grid">
        <article className="inventory-stat"><span className="stat-icon stat-success"><Boxes size={19} /></span><div><small>Disponible</small><strong>{totals.available}</strong><p>Unidades vendibles</p></div></article>
        <article className="inventory-stat"><span className="stat-icon stat-warning"><PackageMinus size={19} /></span><div><small>Reservado</small><strong>{totals.reserved}</strong><p>Separado a clientes</p></div></article>
        <article className="inventory-stat"><span className="stat-icon stat-info"><PackagePlus size={19} /></span><div><small>En tránsito</small><strong>{totals.inTransit}</strong><p>Mercadería en camino</p></div></article>
        <article className="inventory-stat"><span className="stat-icon stat-danger"><PackageMinus size={19} /></span><div><small>No disponible</small><strong>{totals.unavailable}</strong><p>Dañado o perdido</p></div></article>
      </section>

      {inventory.isError ? <div className="alert alert-error">{inventory.error instanceof Error ? inventory.error.message : 'No se pudo cargar el inventario.'}</div> : null}

      <Panel className="table-panel">
        <Toolbar placeholder="Buscar producto, código o SKU…" value={search} onChange={setSearch} showFilterButton={false} />
        <div className="responsive-table-wrap">
          <table className="data-table">
            <thead><tr><th>Producto</th><th>Almacén</th><th>Disponible</th><th>Reservado</th><th>Preventa</th><th>Tránsito</th><th>Dañado</th><th>Stock mínimo</th><th>Alerta</th></tr></thead>
            <tbody>
              {inventory.isLoading ? <tr><td colSpan={9}><div className="empty-state">Cargando inventario…</div></td></tr> : null}
              {!inventory.isLoading && rows.length === 0 ? <tr><td colSpan={9}><div className="empty-state"><strong>Sin movimientos de inventario</strong><p>Registra stock inicial al crear un producto.</p></div></td></tr> : null}
              {rows.map((row) => {
                const low = row.minimumStock > 0 && row.availableQuantity <= row.minimumStock;
                return (
                  <tr key={`${row.variantId}-${row.warehouseId}`}>
                    <td><strong>{row.productName}</strong><small>{row.productCode} · {row.variantName} · {row.sku}</small></td>
                    <td>{row.warehouseName}</td>
                    <td className="numeric-cell"><strong>{row.availableQuantity}</strong></td>
                    <td className="numeric-cell">{row.reservedQuantity}</td>
                    <td className="numeric-cell">{row.preorderExpectedQuantity}</td>
                    <td className="numeric-cell">{row.inTransitQuantity}</td>
                    <td className="numeric-cell">{row.damagedQuantity}</td>
                    <td className="numeric-cell">{row.minimumStock}</td>
                    <td><StatusBadge tone={low ? 'warning' : 'success'}>{low ? 'Revisar' : 'Correcto'}</StatusBadge></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Panel>

      <div className="mobile-card-list inventory-mobile-list">
        <Toolbar placeholder="Buscar inventario…" value={search} onChange={setSearch} showFilterButton={false} />
        {rows.map((row) => {
          const low = row.minimumStock > 0 && row.availableQuantity <= row.minimumStock;
          return (
            <article className="mobile-record-card" key={`${row.variantId}-${row.warehouseId}-mobile`}>
              <div className="mobile-record-header"><div><strong>{row.productName}</strong><small>{row.variantName} · {row.sku}</small></div><StatusBadge tone={low ? 'warning' : 'success'}>{low ? 'Bajo' : 'Correcto'}</StatusBadge></div>
              <div className="mobile-record-grid"><span>Disponible<strong>{row.availableQuantity}</strong></span><span>Reservado<strong>{row.reservedQuantity}</strong></span><span>Tránsito<strong>{row.inTransitQuantity}</strong></span><span>Dañado<strong>{row.damagedQuantity}</strong></span></div>
              <div className="mobile-record-footer"><small>{row.warehouseName}</small><small>Stock mínimo: {row.minimumStock}</small></div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
