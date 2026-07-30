import { useQuery } from '@tanstack/react-query';
import { Download, MoreHorizontal, Plus, QrCode, SlidersHorizontal } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { StatusBadge } from '../components/ui/status-badge';
import { Toolbar } from '../components/ui/toolbar';
import { getCatalogs } from '../features/catalog/catalog-api';
import { ProductImage } from '../features/products/product-image';
import { getProducts } from '../features/products/products-api';

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(value);
}

function productStatus(available: number, minimum: number, preorder: number, isActive: boolean) {
  if (!isActive) return { label: 'Inactivo', tone: 'neutral' as const };
  if (available === 0 && preorder > 0) return { label: 'Preventa', tone: 'info' as const };
  if (minimum > 0 && available <= minimum) return { label: 'Stock bajo', tone: 'warning' as const };
  if (available === 0) return { label: 'Agotado', tone: 'danger' as const };
  return { label: 'Disponible', tone: 'success' as const };
}

export function ProductsPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState<string | undefined>();
  const [page, setPage] = useState(1);

  const catalogs = useQuery({ queryKey: ['catalogs'], queryFn: getCatalogs });
  const products = useQuery({
    queryKey: ['products', search, categoryId, page],
    queryFn: () => getProducts({ search, categoryId, page, pageSize: 20, isActive: true }),
    placeholderData: (previous) => previous,
  });

  const totalPages = Math.max(1, Math.ceil((products.data?.total ?? 0) / (products.data?.pageSize ?? 20)));
  const activeCategories = useMemo(
    () => (catalogs.data?.categories ?? []).filter((category) => category.isActive),
    [catalogs.data],
  );

  return (
    <main className="page">
      <PageHeader
        eyebrow="Catálogo"
        title="Productos"
        description="Administra el catálogo, sus variantes, precios y disponibilidad por almacén."
        actions={
          <>
            <button className="button button-secondary" type="button" disabled>
              <Download size={17} /> Exportar
            </button>
            <button className="button button-primary" onClick={() => navigate('/productos/nuevo')}>
              <Plus size={17} /> Nuevo producto
            </button>
          </>
        }
      />

      <section className="summary-strip">
        <div><span>Productos activos</span><strong>{products.data?.summary.activeProducts ?? '—'}</strong></div>
        <div><span>Unidades disponibles</span><strong>{products.data?.summary.availableUnits ?? '—'}</strong></div>
        <div><span>En preventa</span><strong>{products.data?.summary.preorderUnits ?? '—'}</strong></div>
        <div><span>Stock bajo</span><strong className="text-warning">{products.data?.summary.lowStockVariants ?? '—'}</strong></div>
      </section>

      {products.isError ? (
        <div className="alert alert-error">{products.error instanceof Error ? products.error.message : 'No se pudieron cargar los productos.'}</div>
      ) : null}

      <section className="panel table-panel">
        <Toolbar
          placeholder="Buscar por nombre, código o personaje…"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
        >
          <button className="button button-secondary button-compact" type="button" disabled>
            <SlidersHorizontal size={17} /> Columnas
          </button>
        </Toolbar>
        <div className="filter-chips">
          <button
            className={`filter-chip ${categoryId === undefined ? 'active' : ''}`}
            onClick={() => { setCategoryId(undefined); setPage(1); }}
          >
            Todos <span>{products.data?.summary.activeProducts ?? 0}</span>
          </button>
          {activeCategories.map((category) => (
            <button
              className={`filter-chip ${categoryId === category.id ? 'active' : ''}`}
              key={category.id}
              onClick={() => { setCategoryId(category.id); setPage(1); }}
            >
              {category.name}
            </button>
          ))}
        </div>
        <div className="responsive-table-wrap">
          <table className="data-table product-table">
            <thead>
              <tr>
                <th>Producto</th><th>Categoría</th><th>Variantes</th><th>Disponible</th><th>Reservado</th><th>En tránsito</th><th>Precio desde</th><th>Estado</th><th />
              </tr>
            </thead>
            <tbody>
              {products.isLoading ? (
                <tr><td colSpan={9}><div className="empty-state">Cargando productos…</div></td></tr>
              ) : null}
              {!products.isLoading && products.data?.items.length === 0 ? (
                <tr><td colSpan={9}><div className="empty-state"><strong>No hay productos</strong><p>Crea el primer producto o cambia los filtros.</p></div></td></tr>
              ) : null}
              {products.data?.items.map((product) => {
                const available = product.variants.reduce((total, variant) => total + variant.availableQuantity, 0);
                const reserved = product.variants.reduce((total, variant) => total + variant.reservedQuantity, 0);
                const transit = product.variants.reduce((total, variant) => total + variant.inTransitQuantity, 0);
                const preorder = product.variants.reduce((total, variant) => total + variant.preorderExpectedQuantity, 0);
                const minimum = product.variants.reduce((lowest, variant) => Math.max(lowest, variant.minimumStock), 0);
                const lowestPrice = Math.min(...product.variants.map((variant) => variant.salePrice));
                const currency = product.variants[0]?.currencyCode ?? 'PEN';
                const status = productStatus(available, minimum, preorder, product.isActive);
                return (
                  <tr key={product.productId}>
                    <td>
                      <div className="product-cell">
                        <ProductImage path={product.imagePath} alt={product.productName} fallbackText={product.categoryName.slice(0, 1)} />
                        <div><strong>{product.productName}</strong><small>{product.productCode} · {product.franchiseName ?? 'Sin franquicia'}</small></div>
                      </div>
                    </td>
                    <td>{product.categoryName}</td>
                    <td>{product.variants.length}</td>
                    <td className="numeric-cell"><strong>{available}</strong></td>
                    <td className="numeric-cell">{reserved}</td>
                    <td className="numeric-cell">{transit}</td>
                    <td className="numeric-cell"><strong>{formatMoney(lowestPrice, currency)}</strong></td>
                    <td><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td>
                    <td><button className="icon-button table-action" aria-label="Más acciones" type="button"><MoreHorizontal size={18} /></button></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>{products.data ? `Mostrando ${products.data.items.length} de ${products.data.total} productos` : 'Cargando…'}</span>
          <div className="pagination">
            <button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button>
            <button className="active">{page}</button>
            <button disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Siguiente</button>
          </div>
        </div>
      </section>

      <div className="mobile-card-list">
        <Toolbar
          placeholder="Buscar productos…"
          value={search}
          onChange={(value) => { setSearch(value); setPage(1); }}
          showFilterButton={false}
        />
        {products.data?.items.map((product) => {
          const available = product.variants.reduce((total, variant) => total + variant.availableQuantity, 0);
          const reserved = product.variants.reduce((total, variant) => total + variant.reservedQuantity, 0);
          const transit = product.variants.reduce((total, variant) => total + variant.inTransitQuantity, 0);
          const preorder = product.variants.reduce((total, variant) => total + variant.preorderExpectedQuantity, 0);
          const minimum = product.variants.reduce((lowest, variant) => Math.max(lowest, variant.minimumStock), 0);
          const status = productStatus(available, minimum, preorder, product.isActive);
          return (
            <article className="mobile-record-card" key={product.productId}>
              <div className="mobile-record-header">
                <ProductImage path={product.imagePath} alt={product.productName} fallbackText={product.categoryName.slice(0, 1)} />
                <div><strong>{product.productName}</strong><small>{product.productCode}</small></div>
                <button className="icon-button table-action" type="button"><MoreHorizontal size={18} /></button>
              </div>
              <div className="mobile-record-grid">
                <span>Disponible<strong>{available}</strong></span>
                <span>Reservado<strong>{reserved}</strong></span>
                <span>Tránsito<strong>{transit}</strong></span>
                <span>Variantes<strong>{product.variants.length}</strong></span>
              </div>
              <div className="mobile-record-footer">
                <StatusBadge tone={status.tone}>{status.label}</StatusBadge>
                <button className="link-button" type="button"><QrCode size={15} /> Ver etiqueta</button>
              </div>
            </article>
          );
        })}
      </div>
    </main>
  );
}
