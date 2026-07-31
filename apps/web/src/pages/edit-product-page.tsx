import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { UpdateProductInput } from '@yukimi/shared';
import { ArrowLeft, Save } from 'lucide-react';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import { useNavigate, useParams } from 'react-router';
import { BusyLabel, useFeedback } from '../components/ui/feedback-provider';
import { ContextNote } from '../components/ui/info-tip';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { SearchableSelect } from '../components/ui/searchable-select';
import { getCatalogs } from '../features/catalog/catalog-api';
import { getProduct, updateProduct } from '../features/products/products-api';

interface VariantForm {
  id: string;
  sku: string;
  variantName: string;
  barcode: string;
  salePrice: string;
  currencyCode: string;
  minimumStock: string;
  weightGrams: string;
  dimensions: Record<string, string | number>;
  isActive: boolean;
  version: number;
}

export function EditProductPage() {
  const { productId = '' } = useParams();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, notify, notifyError } = useFeedback();
  const product = useQuery({ queryKey: ['product', productId], queryFn: () => getProduct(productId), enabled: Boolean(productId) });
  const catalogs = useQuery({ queryKey: ['catalogs'], queryFn: getCatalogs });
  const [initialized, setInitialized] = useState(false);
  const [name, setName] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [franchiseId, setFranchiseId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [productLineId, setProductLineId] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [reason, setReason] = useState('');
  const [variants, setVariants] = useState<VariantForm[]>([]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!product.data || initialized) return;
    setName(product.data.name);
    setCharacterName(product.data.characterName ?? '');
    setCategoryId(product.data.categoryId);
    setFranchiseId(product.data.franchiseId ?? '');
    setBrandId(product.data.brandId ?? '');
    setProductLineId(product.data.productLineId ?? '');
    setDescription(product.data.description ?? '');
    setIsActive(product.data.isActive);
    setVariants(product.data.variants.map((variant) => ({
      id: variant.id,
      sku: variant.sku,
      variantName: variant.variantName,
      barcode: variant.barcode ?? '',
      salePrice: String(variant.salePrice),
      currencyCode: variant.currencyCode,
      minimumStock: String(variant.minimumStock),
      weightGrams: variant.weightGrams == null ? '' : String(variant.weightGrams),
      dimensions: variant.dimensions,
      isActive: variant.isActive,
      version: variant.version,
    })));
    setInitialized(true);
  }, [initialized, product.data]);

  const availableLines = useMemo(
    () => (catalogs.data?.productLines ?? [])
      .filter((line) => line.isActive && (!brandId || line.brandId === brandId))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' })),
    [brandId, catalogs.data?.productLines],
  );

  const mutation = useMutation({
    mutationFn: (input: UpdateProductInput) => updateProduct(productId, input),
    onSuccess: async () => {
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['product', productId] }),
        queryClient.invalidateQueries({ queryKey: ['products'] }),
      ]);
      notify({ title: 'Producto actualizado', message: 'Los cambios y el motivo quedaron registrados.', tone: 'success' });
      navigate(`/productos/${productId}`);
    },
    onError: (error) => notifyError(error, 'No se pudo actualizar el producto.'),
  });

  function updateVariant(index: number, patch: Partial<VariantForm>) {
    setVariants((current) => current.map((variant, position) => position === index ? { ...variant, ...patch } : variant));
    setErrors((current) => {
      const next = { ...current };
      Object.keys(patch).forEach((key) => delete next[`variant-${index}-${key}`]);
      return next;
    });
  }

  function validate() {
    const next: Record<string, string> = {};
    if (name.trim().length < 2) next.name = 'El nombre debe tener al menos 2 caracteres.';
    if (!categoryId) next.categoryId = 'Selecciona una categoría.';
    if (brandId && productLineId && !availableLines.some((line) => line.id === productLineId)) {
      next.productLineId = 'La línea seleccionada no pertenece a la marca actual.';
    }
    if (reason.trim().length < 5) next.reason = 'El motivo debe tener al menos 5 caracteres.';
    variants.forEach((variant, index) => {
      if (!variant.variantName.trim()) next[`variant-${index}-variantName`] = 'El nombre de la variante es obligatorio.';
      const price = Number(variant.salePrice);
      if (!Number.isFinite(price) || price < 0) next[`variant-${index}-salePrice`] = 'Ingresa un precio válido igual o mayor que cero.';
      const minimum = Number(variant.minimumStock);
      if (!Number.isInteger(minimum) || minimum < 0) next[`variant-${index}-minimumStock`] = 'El stock mínimo debe ser un entero igual o mayor que cero.';
      if (variant.weightGrams && (!Number.isFinite(Number(variant.weightGrams)) || Number(variant.weightGrams) < 0)) {
        next[`variant-${index}-weightGrams`] = 'El peso debe ser un número igual o mayor que cero.';
      }
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!product.data || !validate()) return;
    const accepted = await confirm({
      title: 'Confirmar edición del producto',
      message: `Se actualizará ${product.data.name}.`,
      detail: 'Los precios modificados generarán historial y todos los cambios quedarán en auditoría.',
      confirmLabel: 'Guardar cambios',
    });
    if (!accepted) {
      notify({ title: 'Edición cancelada', message: 'No se modificó el producto.', tone: 'info' });
      return;
    }
    mutation.mutate({
      name: name.trim(),
      characterName: characterName.trim() || null,
      categoryId,
      franchiseId: franchiseId || null,
      brandId: brandId || null,
      productLineId: productLineId || null,
      description: description.trim() || null,
      isActive,
      version: product.data.version,
      reason: reason.trim(),
      variants: variants.map((variant) => ({
        id: variant.id,
        variantName: variant.variantName.trim(),
        barcode: variant.barcode.trim() || null,
        salePrice: Number(variant.salePrice),
        currencyCode: variant.currencyCode,
        minimumStock: Number(variant.minimumStock),
        weightGrams: variant.weightGrams ? Number(variant.weightGrams) : null,
        dimensions: variant.dimensions,
        isActive: variant.isActive,
        version: variant.version,
      })),
    });
  }

  if (product.isLoading || catalogs.isLoading) return <main className="page"><div className="empty-state">Cargando formulario…</div></main>;
  if (!product.data || product.isError || catalogs.isError) return <main className="page"><div className="alert alert-error">No se pudo preparar la edición.</div></main>;

  return (
    <main className="page">
      <button className="link-button" type="button" onClick={() => navigate(`/productos/${productId}`)}>
        <ArrowLeft size={16} /> Volver al detalle
      </button>
      <PageHeader eyebrow="Mantenimiento del catálogo" title={`Editar ${product.data.name}`} description={`${product.data.code} · Conserva el historial y la trazabilidad del producto.`} />
      {Object.keys(errors).length > 0 ? (
        <div className="form-error-summary" role="alert">No se pudo guardar. Corrige {Object.keys(errors).length} campos marcados en rojo.</div>
      ) : null}
      <form className="product-edit-form" onSubmit={(event) => void submit(event)} noValidate>
        <Panel title="Información general" subtitle="Datos que permiten identificar y encontrar el producto.">
          <div className="form-grid two-columns">
            <label className={`field ${errors.name ? 'field-invalid' : ''}`}>
              <span>Nombre del producto *</span>
              <input value={name} aria-invalid={Boolean(errors.name)} onChange={(event) => { setName(event.target.value); setErrors((current) => ({ ...current, name: '' })); }} />
              {errors.name ? <small className="field-error">{errors.name}</small> : null}
            </label>
            <label className="field"><span>Personaje</span><input value={characterName} onChange={(event) => setCharacterName(event.target.value)} /></label>
            <SearchableSelect
              label="Categoría"
              required
              value={categoryId}
              error={errors.categoryId}
              options={(catalogs.data?.categories ?? []).filter((item) => item.isActive).map((item) => ({ value: item.id, label: item.name }))}
              onChange={(value) => { setCategoryId(value); setErrors((current) => ({ ...current, categoryId: '' })); }}
            />
            <SearchableSelect
              label="Franquicia o anime"
              value={franchiseId}
              allowClear
              options={(catalogs.data?.franchises ?? []).filter((item) => item.isActive).map((item) => ({ value: item.id, label: item.name }))}
              onChange={setFranchiseId}
            />
            <SearchableSelect
              label="Marca"
              value={brandId}
              allowClear
              options={(catalogs.data?.brands ?? []).filter((item) => item.isActive).map((item) => ({ value: item.id, label: item.name }))}
              onChange={(value) => {
                setBrandId(value);
                if (!value || !availableLines.some((line) => line.id === productLineId && line.brandId === value)) setProductLineId('');
              }}
            />
            <SearchableSelect
              label="Línea o colección"
              value={productLineId}
              allowClear
              disabled={!brandId}
              placeholder={brandId ? 'Seleccionar línea' : 'Selecciona una marca primero'}
              error={errors.productLineId}
              options={availableLines.map((item) => ({ value: item.id, label: item.name }))}
              onChange={setProductLineId}
            />
          </div>
          <label className="field"><span>Descripción</span><textarea rows={5} value={description} onChange={(event) => setDescription(event.target.value)} /></label>
          <label className="checkbox-field"><input type="checkbox" checked={isActive} onChange={(event) => setIsActive(event.target.checked)} /> Producto activo</label>
        </Panel>

        <Panel title="Variantes" subtitle="Edita nombres, precios y stock mínimo sin cambiar el SKU histórico.">
          <div className="variant-edit-list">
            {variants.map((variant, index) => (
              <section className="variant-edit-card" key={variant.id}>
                <header><div><strong>{variant.variantName || `Variante ${index + 1}`}</strong><small>{variant.sku}</small></div><label className="checkbox-field"><input type="checkbox" checked={variant.isActive} onChange={(event) => updateVariant(index, { isActive: event.target.checked })} /> Activa</label></header>
                <div className="form-grid four-columns">
                  <label className={`field ${errors[`variant-${index}-variantName`] ? 'field-invalid' : ''}`}><span>Nombre *</span><input value={variant.variantName} onChange={(event) => updateVariant(index, { variantName: event.target.value })} />{errors[`variant-${index}-variantName`] ? <small className="field-error">{errors[`variant-${index}-variantName`]}</small> : null}</label>
                  <label className="field"><span>Código de barras</span><input value={variant.barcode} onChange={(event) => updateVariant(index, { barcode: event.target.value })} /></label>
                  <label className={`field ${errors[`variant-${index}-salePrice`] ? 'field-invalid' : ''}`}><span>Precio de venta *</span><input type="number" min="0" step="0.01" value={variant.salePrice} onChange={(event) => updateVariant(index, { salePrice: event.target.value })} />{errors[`variant-${index}-salePrice`] ? <small className="field-error">{errors[`variant-${index}-salePrice`]}</small> : null}</label>
                  <label className={`field ${errors[`variant-${index}-minimumStock`] ? 'field-invalid' : ''}`}><span>Stock mínimo *</span><input type="number" min="0" step="1" value={variant.minimumStock} onChange={(event) => updateVariant(index, { minimumStock: event.target.value })} />{errors[`variant-${index}-minimumStock`] ? <small className="field-error">{errors[`variant-${index}-minimumStock`]}</small> : null}</label>
                  <label className={`field ${errors[`variant-${index}-weightGrams`] ? 'field-invalid' : ''}`}><span>Peso en gramos</span><input type="number" min="0" step="0.001" value={variant.weightGrams} onChange={(event) => updateVariant(index, { weightGrams: event.target.value })} />{errors[`variant-${index}-weightGrams`] ? <small className="field-error">{errors[`variant-${index}-weightGrams`]}</small> : null}</label>
                </div>
              </section>
            ))}
          </div>
        </Panel>

        <Panel title="Motivo y confirmación" subtitle="Este texto aparecerá en la auditoría.">
          <ContextNote tone="info">Describe qué cambiaste y por qué. No incluyas datos personales innecesarios.</ContextNote>
          <label className={`field ${errors.reason ? 'field-invalid' : ''}`}>
            <span>Motivo del cambio *</span>
            <textarea rows={4} value={reason} aria-invalid={Boolean(errors.reason)} onChange={(event) => { setReason(event.target.value); setErrors((current) => ({ ...current, reason: '' })); }} placeholder="Ej. Corrección de nombre y actualización de precio autorizada…" />
            {errors.reason ? <small className="field-error">{errors.reason}</small> : null}
          </label>
          <small className="required-note">* Campo obligatorio</small>
          <div className="form-actions"><button className="button button-secondary" type="button" onClick={() => navigate(`/productos/${productId}`)}>Cancelar</button><button className="button button-primary" type="submit" disabled={mutation.isPending}>{mutation.isPending ? <BusyLabel label="Guardando…" /> : <><Save size={17} /> Guardar cambios</>}</button></div>
        </Panel>
      </form>
    </main>
  );
}
