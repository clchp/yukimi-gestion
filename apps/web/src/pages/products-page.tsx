import { useQuery } from '@tanstack/react-query';
import {
  Download,
  Edit3,
  Eye,
  ImageIcon,
  Plus,
  Printer,
  QrCode,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { FilterButton, FilterPanel } from '../components/ui/filter-panel';
import { useFeedback } from '../components/ui/feedback-provider';
import { ContextNote } from '../components/ui/info-tip';
import { PageHeader } from '../components/ui/page-header';
import { SearchableSelect } from '../components/ui/searchable-select';
import { StatusBadge } from '../components/ui/status-badge';
import { Toolbar } from '../components/ui/toolbar';
import { getCatalogs } from '../features/catalog/catalog-api';
import { downloadCsv } from '../features/insights/csv-export';
import { ProductImage } from '../features/products/product-image';
import {
  downloadProductLabelPng,
  printProductLabel,
  productLabelSvg,
} from '../features/products/product-label';
import { getProducts } from '../features/products/products-api';

type ProductItem = Awaited<ReturnType<typeof getProducts>>['items'][number];
type ProductStatusFilter = 'ALL' | 'ACTIVE' | 'INACTIVE' | 'AVAILABLE' | 'LOW' | 'OUT' | 'PREORDER';

function formatMoney(value: number, currencyCode: string) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(value);
}

function totals(product: ProductItem) {
  return product.variants.reduce(
    (result, variant) => ({
      available: result.available + variant.availableQuantity,
      reserved: result.reserved + variant.reservedQuantity,
      transit: result.transit + variant.inTransitQuantity,
      preorder: result.preorder + variant.preorderExpectedQuantity,
      minimum: Math.max(result.minimum, variant.minimumStock),
    }),
    { available: 0, reserved: 0, transit: 0, preorder: 0, minimum: 0 },
  );
}

function productStatus(product: ProductItem) {
  const stock = totals(product);
  if (!product.isActive) return { code: 'INACTIVE', label: 'Inactivo', tone: 'neutral' as const };
  if (stock.available === 0 && stock.preorder > 0) return { code: 'PREORDER', label: 'Preventa', tone: 'info' as const };
  if (stock.minimum > 0 && stock.available <= stock.minimum) return { code: 'LOW', label: 'Stock bajo', tone: 'warning' as const };
  if (stock.available === 0) return { code: 'OUT', label: 'Agotado', tone: 'danger' as const };
  return { code: 'AVAILABLE', label: 'Disponible', tone: 'success' as const };
}

function fileDate() {
  return new Date().toISOString().slice(0, 10);
}

export function ProductsPage() {
  const navigate = useNavigate();
  const { notify, notifyError } = useFeedback();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [filterOpen, setFilterOpen] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [franchiseId, setFranchiseId] = useState('');
  const [statusFilter, setStatusFilter] = useState<ProductStatusFilter>('ALL');
  const [draftCategoryId, setDraftCategoryId] = useState('');
  const [draftFranchiseId, setDraftFranchiseId] = useState('');
  const [draftStatusFilter, setDraftStatusFilter] = useState<ProductStatusFilter>('ALL');
  const [imageTarget, setImageTarget] = useState<ProductItem | null>(null);
  const [labelTarget, setLabelTarget] = useState<{ product: ProductItem; variantId: string } | null>(null);
  const [isExporting, setIsExporting] = useState(false);

  const catalogs = useQuery({ queryKey: ['catalogs'], queryFn: getCatalogs });
  const products = useQuery({
    queryKey: ['products', search, categoryId, statusFilter],
    queryFn: () =>
      getProducts({
        search: search.trim() || undefined,
        categoryId: categoryId || undefined,
        isActive: statusFilter === 'ACTIVE' ? true : statusFilter === 'INACTIVE' ? false : undefined,
        page: 1,
        pageSize: 100,
      }),
    placeholderData: (previous) => previous,
  });

  const filteredItems = useMemo(() => {
    const source = products.data?.items ?? [];
    return source.filter((product) => {
      if (franchiseId && product.franchiseId !== franchiseId) return false;
      if (statusFilter !== 'ALL' && statusFilter !== 'ACTIVE' && statusFilter !== 'INACTIVE') {
        if (productStatus(product).code !== statusFilter) return false;
      }
      return true;
    });
  }, [franchiseId, products.data?.items, statusFilter]);

  const pageSize = 20;
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / pageSize));
  const visibleItems = filteredItems.slice((page - 1) * pageSize, page * pageSize);
  const activeCount = Number(Boolean(categoryId)) + Number(Boolean(franchiseId)) + Number(statusFilter !== 'ALL');
  const selectedVariant =
    labelTarget?.product.variants.find((variant) => variant.variantId === labelTarget.variantId) ?? labelTarget?.product.variants[0];
  const qrPayload = labelTarget && selectedVariant ? `YUKIMI:${labelTarget.product.productCode}:${selectedVariant.sku}` : '';
  const labelSubtitle = selectedVariant ? `${selectedVariant.variantName} · ${selectedVariant.sku}` : '';
  const labelMarkup = labelTarget && selectedVariant
    ? productLabelSvg(labelTarget.product.productName, labelSubtitle, qrPayload)
    : '';

  function openFilters() {
    setDraftCategoryId(categoryId);
    setDraftFranchiseId(franchiseId);
    setDraftStatusFilter(statusFilter);
    setFilterOpen(true);
  }

  function applyFilters() {
    setCategoryId(draftCategoryId);
    setFranchiseId(draftFranchiseId);
    setStatusFilter(draftStatusFilter);
    setPage(1);
    setFilterOpen(false);
  }

  function clearFilters() {
    setDraftCategoryId('');
    setDraftFranchiseId('');
    setDraftStatusFilter('ALL');
    setCategoryId('');
    setFranchiseId('');
    setStatusFilter('ALL');
    setPage(1);
  }

  async function loadAllForExport() {
    const first = await getProducts({
      search: search.trim() || undefined,
      categoryId: categoryId || undefined,
      isActive: statusFilter === 'ACTIVE' ? true : statusFilter === 'INACTIVE' ? false : undefined,
      page: 1,
      pageSize: 100,
    });
    const all = [...first.items];
    const pages = Math.ceil(first.total / first.pageSize);
    for (let current = 2; current <= pages; current += 1) {
      const next = await getProducts({
        search: search.trim() || undefined,
        categoryId: categoryId || undefined,
        isActive: statusFilter === 'ACTIVE' ? true : statusFilter === 'INACTIVE' ? false : undefined,
        page: current,
        pageSize: 100,
      });
      all.push(...next.items);
    }
    return all.filter((product) => {
      if (franchiseId && product.franchiseId !== franchiseId) return false;
      if (!['ALL', 'ACTIVE', 'INACTIVE'].includes(statusFilter) && productStatus(product).code !== statusFilter) return false;
      return true;
    });
  }

  async function exportProducts() {
    setIsExporting(true);
    try {
      const all = await loadAllForExport();
      const rows: unknown[][] = [[
        'Código', 'Producto', 'Categoría', 'Franquicia', 'Marca', 'Línea o colección',
        'SKU', 'Variante', 'Disponible', 'Reservado', 'En tránsito', 'Preventa', 'Precio', 'Moneda', 'Estado',
      ]];
      for (const product of all) {
        for (const variant of product.variants) {
          rows.push([
            product.productCode,
            product.productName,
            product.categoryName,
            product.franchiseName ?? '',
            product.brandName ?? '',
            product.productLineName ?? '',
            variant.sku,
            variant.variantName,
            variant.availableQuantity,
            variant.reservedQuantity,
            variant.inTransitQuantity,
            variant.preorderExpectedQuantity,
            variant.salePrice,
            variant.currencyCode,
            productStatus(product).label,
          ]);
        }
      }
      const filename = `yukimi-productos-${fileDate()}.csv`;
      downloadCsv(filename, rows);
      notify({
        title: 'Exportación completada',
        message: `Se descargó ${filename} con ${Math.max(rows.length - 1, 0)} variantes.`,
        tone: 'success',
      });
    } catch (error) {
      notifyError(error, 'No se pudo exportar el catálogo.');
    } finally {
      setIsExporting(false);
    }
  }

  function openLabel(product: ProductItem) {
    const variant = product.variants[0];
    if (!variant) {
      notify({ title: 'Producto sin variantes', message: 'No existe una variante para generar la etiqueta.', tone: 'warning' });
      return;
    }
    setLabelTarget({ product, variantId: variant.variantId });
  }

  async function downloadLabel() {
    if (!labelTarget || !selectedVariant) return;
    try {
      const filename = `etiqueta-${selectedVariant.sku}.png`;
      await downloadProductLabelPng(filename, labelTarget.product.productName, labelSubtitle, qrPayload);
      notify({ title: 'Etiqueta descargada', message: `${filename} se guardó en Descargas.`, tone: 'success' });
    } catch (error) {
      notifyError(error, 'No se pudo descargar la etiqueta.');
    }
  }

  function printLabel() {
    if (!labelTarget || !selectedVariant) return;
    try {
      printProductLabel(labelTarget.product.productName, labelSubtitle, qrPayload);
    } catch (error) {
      notifyError(error, 'No se pudo abrir la impresión.');
    }
  }

  return (
    <main className="page">
      <PageHeader
        eyebrow="Catálogo"
        title="Productos"
        description="Administra productos, variantes, precios, imágenes y disponibilidad."
        actions={
          <>
            <button className="button button-secondary" type="button" disabled={isExporting} onClick={() => void exportProducts()} title="Descarga los resultados filtrados para abrirlos en Excel.">
              <Download size={17} /> {isExporting ? 'Exportando…' : 'Exportar CSV'}
            </button>
            <button className="button button-primary" type="button" onClick={() => navigate('/productos/nuevo')}>
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

      {products.isError ? <div className="alert alert-error">No se pudieron cargar los productos.</div> : null}

      <section className="panel table-panel">
        <Toolbar
          placeholder="Buscar por nombre, código o personaje…"
          value={search}
          onChange={(value) => { setSearch(value); setPage(1); }}
          showFilterButton={false}
        >
          <FilterButton activeCount={activeCount} onClick={openFilters} />
        </Toolbar>
        {activeCount > 0 ? (
          <div className="active-filter-summary">
            <span>{activeCount} {activeCount === 1 ? 'filtro activo' : 'filtros activos'}</span>
            <button className="link-button" type="button" onClick={clearFilters}>Limpiar</button>
          </div>
        ) : null}
        <div className="responsive-table-wrap">
          <table className="data-table product-table">
            <thead><tr><th>Producto</th><th>Categoría</th><th>Variantes</th><th>Disponible</th><th>Reservado</th><th>En tránsito</th><th>Precio desde</th><th>Estado</th><th>Acciones</th></tr></thead>
            <tbody>
              {products.isLoading ? <tr><td colSpan={9}><div className="empty-state">Cargando productos…</div></td></tr> : null}
              {!products.isLoading && visibleItems.length === 0 ? <tr><td colSpan={9}><div className="empty-state"><strong>No hay productos</strong><p>Cambia la búsqueda o limpia los filtros.</p></div></td></tr> : null}
              {visibleItems.map((product) => {
                const stock = totals(product);
                const status = productStatus(product);
                const lowestPrice = Math.min(...product.variants.map((variant) => variant.salePrice));
                const currency = product.variants[0]?.currencyCode ?? 'PEN';
                return (
                  <tr key={product.productId}>
                    <td>
                      <div className="product-cell">
                        <button className="product-thumb-button" type="button" aria-label={`Ver imagen de ${product.productName}`} onClick={() => setImageTarget(product)}>
                          <ProductImage path={product.imagePath} alt={product.productName} fallbackText={product.categoryName.slice(0, 1)} />
                        </button>
                        <button className="product-name-button" type="button" onClick={() => navigate(`/productos/${product.productId}`)}>
                          <strong>{product.productName}</strong>
                          <small>{product.productCode} · {product.franchiseName ?? 'Sin franquicia'}</small>
                        </button>
                      </div>
                    </td>
                    <td>{product.categoryName}</td><td>{product.variants.length}</td>
                    <td className="numeric-cell"><strong>{stock.available}</strong></td><td className="numeric-cell">{stock.reserved}</td><td className="numeric-cell">{stock.transit}</td>
                    <td className="numeric-cell"><strong>{formatMoney(lowestPrice, currency)}</strong></td>
                    <td><StatusBadge tone={status.tone}>{status.label}</StatusBadge></td>
                    <td><div className="table-row-actions"><button className="icon-button table-action" type="button" title="Ver detalle" aria-label={`Ver ${product.productName}`} onClick={() => navigate(`/productos/${product.productId}`)}><Eye size={17} /></button><button className="icon-button table-action" type="button" title="Editar" aria-label={`Editar ${product.productName}`} onClick={() => navigate(`/productos/${product.productId}/editar`)}><Edit3 size={17} /></button><button className="icon-button table-action" type="button" title="Etiqueta QR" aria-label={`Etiqueta QR de ${product.productName}`} onClick={() => openLabel(product)}><QrCode size={17} /></button></div></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="table-footer">
          <span>Mostrando {visibleItems.length} de {filteredItems.length} productos filtrados</span>
          <div className="pagination"><button disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Anterior</button><button className="active">{page}</button><button disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Siguiente</button></div>
        </div>
      </section>

      <div className="mobile-card-list">
        {visibleItems.map((product) => {
          const stock = totals(product);
          const status = productStatus(product);
          return (
            <article className="mobile-record-card" key={product.productId}>
              <button className="mobile-record-header clickable-row" type="button" onClick={() => navigate(`/productos/${product.productId}`)}>
                <ProductImage path={product.imagePath} alt={product.productName} fallbackText={product.categoryName.slice(0, 1)} />
                <div><strong>{product.productName}</strong><small>{product.productCode}</small></div>
              </button>
              <div className="mobile-record-grid"><span>Disponible<strong>{stock.available}</strong></span><span>Reservado<strong>{stock.reserved}</strong></span><span>Tránsito<strong>{stock.transit}</strong></span><span>Variantes<strong>{product.variants.length}</strong></span></div>
              <div className="mobile-record-footer"><StatusBadge tone={status.tone}>{status.label}</StatusBadge><div className="row-actions"><button className="link-button" type="button" onClick={() => navigate(`/productos/${product.productId}/editar`)}><Edit3 size={15} /> Editar</button><button className="link-button" type="button" onClick={() => openLabel(product)}><QrCode size={15} /> Etiqueta</button></div></div>
            </article>
          );
        })}
      </div>

      <FilterPanel open={filterOpen} activeCount={Number(Boolean(draftCategoryId)) + Number(Boolean(draftFranchiseId)) + Number(draftStatusFilter !== 'ALL')} onClose={() => setFilterOpen(false)} onApply={applyFilters} onClear={clearFilters}>
        <SearchableSelect label="Categoría" value={draftCategoryId} allowClear options={(catalogs.data?.categories ?? []).filter((item) => item.isActive).map((item) => ({ value: item.id, label: item.name }))} onChange={setDraftCategoryId} />
        <SearchableSelect label="Franquicia o anime" value={draftFranchiseId} allowClear options={(catalogs.data?.franchises ?? []).filter((item) => item.isActive).map((item) => ({ value: item.id, label: item.name }))} onChange={setDraftFranchiseId} />
        <SearchableSelect label="Estado" value={draftStatusFilter} options={[
          { value: 'ALL', label: 'Todos los estados' }, { value: 'ACTIVE', label: 'Productos activos' }, { value: 'INACTIVE', label: 'Productos inactivos' }, { value: 'AVAILABLE', label: 'Disponible' }, { value: 'LOW', label: 'Stock bajo' }, { value: 'OUT', label: 'Agotado' }, { value: 'PREORDER', label: 'Preventa' },
        ]} onChange={(value) => setDraftStatusFilter(value as ProductStatusFilter)} />
        <ContextNote>Los resultados actuales también se aplicarán a la exportación CSV.</ContextNote>
      </FilterPanel>

      {imageTarget ? (
        <div className="app-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setImageTarget(null); }}>
          <section className="app-modal-card product-image-modal" role="dialog" aria-modal="true" aria-labelledby="product-image-title">
            <header className="app-modal-header"><div><span className="eyebrow">Imagen del producto</span><h2 id="product-image-title">{imageTarget.productName}</h2><p>{imageTarget.productCode} · {imageTarget.variants.length} {imageTarget.variants.length === 1 ? 'variante' : 'variantes'}</p></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={() => setImageTarget(null)}><X size={20} /></button></header>
            <div className="image-viewer-stage"><ProductImage path={imageTarget.imagePath} alt={imageTarget.productName} className="product-detail-image" fallbackText={imageTarget.categoryName.slice(0, 1)} /></div>
            {!imageTarget.imagePath ? <ContextNote tone="warning"><ImageIcon size={16} /> Este producto todavía no tiene una imagen asociada.</ContextNote> : null}
            <footer className="app-modal-actions"><button className="button button-secondary" type="button" onClick={() => setImageTarget(null)}>Cerrar</button><button className="button button-primary" type="button" onClick={() => navigate(`/productos/${imageTarget.productId}`)}>Ver detalle</button></footer>
          </section>
        </div>
      ) : null}

      {labelTarget && selectedVariant ? (
        <div className="app-modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setLabelTarget(null); }}>
          <section className="app-modal-card product-label-modal" role="dialog" aria-modal="true" aria-labelledby="product-label-title">
            <header className="app-modal-header"><div><span className="eyebrow">Etiqueta de inventario</span><h2 id="product-label-title">{labelTarget.product.productName}</h2><p>{labelSubtitle}</p></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={() => setLabelTarget(null)}><X size={20} /></button></header>
            {labelTarget.product.variants.length > 1 ? <SearchableSelect label="Variante" value={selectedVariant.variantId} options={labelTarget.product.variants.map((variant) => ({ value: variant.variantId, label: `${variant.variantName} · ${variant.sku}` }))} onChange={(variantId) => setLabelTarget({ product: labelTarget.product, variantId })} /> : null}
            <div className="product-label-preview" dangerouslySetInnerHTML={{ __html: labelMarkup }} />
            <footer className="app-modal-actions"><button className="button button-secondary" type="button" onClick={printLabel}><Printer size={17} /> Imprimir</button><button className="button button-primary" type="button" onClick={() => void downloadLabel()}><Download size={17} /> Descargar etiqueta</button></footer>
          </section>
        </div>
      ) : null}
    </main>
  );
}
