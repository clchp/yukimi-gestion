import { useQuery } from '@tanstack/react-query';
import { ArrowLeft, Download, Edit3, Printer, QrCode } from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { useFeedback } from '../components/ui/feedback-provider';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { SearchableSelect } from '../components/ui/searchable-select';
import { StatusBadge } from '../components/ui/status-badge';
import { ProductImage } from '../features/products/product-image';
import {
  downloadProductLabelPng,
  printProductLabel,
  productLabelSvg,
} from '../features/products/product-label';
import { getProduct } from '../features/products/products-api';

function money(value: number, currencyCode: string) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: currencyCode,
    minimumFractionDigits: 2,
  }).format(value);
}

export function ProductDetailPage() {
  const { productId = '' } = useParams();
  const navigate = useNavigate();
  const { notify, notifyError } = useFeedback();
  const [imageIndex, setImageIndex] = useState(0);
  const [variantId, setVariantId] = useState('');
  const product = useQuery({
    queryKey: ['product', productId],
    queryFn: () => getProduct(productId),
    enabled: Boolean(productId),
  });
  const selectedVariant =
    product.data?.variants.find((variant) => variant.id === variantId) ?? product.data?.variants[0];
  const payload = product.data && selectedVariant
    ? `YUKIMI:${product.data.code}:${selectedVariant.sku}`
    : '';
  const images = product.data?.imagePaths ?? [];
  const selectedImagePath = images[Math.min(imageIndex, Math.max(images.length - 1, 0))] ?? null;
  const subtitle = selectedVariant ? `${selectedVariant.variantName} · ${selectedVariant.sku}` : '';
  const labelMarkup = useMemo(
    () => product.data && selectedVariant ? productLabelSvg(product.data.name, subtitle, payload) : '',
    [payload, product.data, selectedVariant, subtitle],
  );

  async function downloadLabel() {
    if (!product.data || !selectedVariant) return;
    try {
      const filename = `etiqueta-${selectedVariant.sku}.png`;
      await downloadProductLabelPng(filename, product.data.name, subtitle, payload);
      notify({
        title: 'Etiqueta descargada',
        message: `${filename} se guardó en la carpeta de descargas.`,
        tone: 'success',
      });
    } catch (error) {
      notifyError(error, 'No se pudo descargar la etiqueta.');
    }
  }

  function printLabel() {
    if (!product.data || !selectedVariant) return;
    try {
      printProductLabel(product.data.name, subtitle, payload);
    } catch (error) {
      notifyError(error, 'No se pudo abrir la impresión.');
    }
  }

  if (product.isLoading) return <main className="page"><div className="empty-state">Cargando producto…</div></main>;
  if (product.isError || !product.data) {
    return (
      <main className="page">
        <button className="link-button" type="button" onClick={() => navigate('/productos')}>
          <ArrowLeft size={16} /> Volver a productos
        </button>
        <div className="alert alert-error">No se pudo cargar el detalle del producto.</div>
      </main>
    );
  }

  return (
    <main className="page">
      <button className="link-button" type="button" onClick={() => navigate('/productos')}>
        <ArrowLeft size={16} /> Volver a productos
      </button>
      <PageHeader
        eyebrow="Detalle del producto"
        title={product.data.name}
        description={`${product.data.code} · ${product.data.categoryName}`}
        actions={
          <button
            className="button button-primary"
            type="button"
            onClick={() => navigate(`/productos/${productId}/editar`)}
          >
            <Edit3 size={17} /> Editar producto
          </button>
        }
      />

      <section className="product-detail-grid">
        <Panel title="Imágenes" subtitle="Haz clic en una miniatura para verla en mayor tamaño.">
          <div className="image-viewer">
            <div className="image-viewer-stage">
              <ProductImage
                path={selectedImagePath}
                alt={product.data.name}
                className="product-detail-image"
                fallbackText={product.data.categoryName.slice(0, 1)}
              />
            </div>
            {images.length > 1 ? (
              <div className="image-viewer-thumbnails" aria-label="Galería del producto">
                {images.map((path, index) => (
                  <button
                    type="button"
                    className={imageIndex === index ? 'active' : ''}
                    key={path}
                    aria-label={`Ver imagen ${index + 1}`}
                    onClick={() => setImageIndex(index)}
                  >
                    <ProductImage path={path} alt={`${product.data.name} ${index + 1}`} className="product-gallery-thumb" />
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </Panel>

        <Panel title="Información general" subtitle="Identificación y asociaciones del catálogo.">
          <dl className="detail-list">
            <div><dt>Estado</dt><dd><StatusBadge tone={product.data.isActive ? 'success' : 'neutral'}>{product.data.isActive ? 'Activo' : 'Inactivo'}</StatusBadge></dd></div>
            <div><dt>Personaje</dt><dd>{product.data.characterName ?? 'No indicado'}</dd></div>
            <div><dt>Franquicia o anime</dt><dd>{product.data.franchiseName ?? 'Sin franquicia'}</dd></div>
            <div><dt>Marca</dt><dd>{product.data.brandName ?? 'Sin marca'}</dd></div>
            <div><dt>Línea o colección</dt><dd>{product.data.productLineName ?? 'Sin línea'}</dd></div>
            <div><dt>Descripción</dt><dd>{product.data.description ?? 'Sin descripción'}</dd></div>
          </dl>
        </Panel>
      </section>

      <Panel title="Variantes" subtitle="Precio, stock mínimo, SKU y disponibilidad administrativa.">
        <div className="responsive-table-wrap">
          <table className="data-table">
            <thead><tr><th>Variante</th><th>SKU</th><th>Precio</th><th>Stock mínimo</th><th>Estado</th></tr></thead>
            <tbody>
              {product.data.variants.map((variant) => (
                <tr key={variant.id}>
                  <td><strong>{variant.variantName}</strong></td>
                  <td>{variant.sku}</td>
                  <td>{money(variant.salePrice, variant.currencyCode)}</td>
                  <td>{variant.minimumStock}</td>
                  <td><StatusBadge tone={variant.isActive ? 'success' : 'neutral'}>{variant.isActive ? 'Activa' : 'Inactiva'}</StatusBadge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </Panel>

      <Panel title="Etiqueta QR" subtitle="Vista previa idéntica a la descarga y a la impresión.">
        <div className="product-label-layout">
          <div className="product-label-controls">
            <SearchableSelect
              label="Variante"
              value={selectedVariant?.id ?? ''}
              options={product.data.variants.map((variant) => ({
                value: variant.id,
                label: `${variant.variantName} · ${variant.sku}`,
              }))}
              onChange={setVariantId}
            />
            <div className="context-note context-note-info">
              <QrCode size={18} />
              <span>Comprueba que el QR sea legible desde la pantalla antes de imprimir varias etiquetas.</span>
            </div>
            <div className="row-actions">
              <button className="button button-secondary" type="button" onClick={printLabel}>
                <Printer size={17} /> Imprimir
              </button>
              <button className="button button-primary" type="button" onClick={() => void downloadLabel()}>
                <Download size={17} /> Descargar etiqueta
              </button>
            </div>
          </div>
          <div className="product-label-preview" dangerouslySetInnerHTML={{ __html: labelMarkup }} />
        </div>
      </Panel>
    </main>
  );
}
