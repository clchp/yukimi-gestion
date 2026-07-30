import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, ImagePlus, Plus, QrCode, Save, Trash2 } from 'lucide-react';
import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import type { CreateProductInput } from '@yukimi/shared';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import { getCatalogs } from '../features/catalog/catalog-api';
import { createProduct } from '../features/products/products-api';
import { uploadProductImages } from '../features/products/upload-product-images';

interface VariantDraft {
  clientId: string;
  variantName: string;
  salePrice: string;
  currencyCode: string;
  minimumStock: string;
  barcode: string;
  attributes: Record<string, string>;
  initialStock: Record<
    string,
    {
      quantity: string;
      originalUnitCost: string;
      originalCurrencyCode: string;
      exchangeRateToPen: string;
    }
  >;
}

function createVariantDraft(): VariantDraft {
  return {
    clientId: crypto.randomUUID(),
    variantName: 'Estándar',
    salePrice: '0.00',
    currencyCode: 'PEN',
    minimumStock: '0',
    barcode: '',
    attributes: {},
    initialStock: {},
  };
}

function LocalImagePreview({ file, cover }: { file: File; cover: boolean }) {
  const url = useMemo(() => URL.createObjectURL(file), [file]);
  useEffect(() => () => URL.revokeObjectURL(url), [url]);
  return (
    <div className="image-preview">
      <img src={url} alt={`Vista previa de ${file.name}`} />
      {cover ? <span>Portada</span> : null}
    </div>
  );
}

function parseNonNegative(value: string, fieldName: string): number {
  const parsed = Number(value || 0);
  if (!Number.isFinite(parsed) || parsed < 0)
    throw new Error(`${fieldName} debe ser un número mayor o igual a cero.`);
  return parsed;
}

export function NewProductPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const idempotencyKeyRef = useRef(crypto.randomUUID());
  const catalogs = useQuery({ queryKey: ['catalogs'], queryFn: getCatalogs });

  const [name, setName] = useState('');
  const [franchiseId, setFranchiseId] = useState('');
  const [characterName, setCharacterName] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [brandId, setBrandId] = useState('');
  const [productLineId, setProductLineId] = useState('');
  const [description, setDescription] = useState('');
  const [isActive, setIsActive] = useState(true);
  const [variants, setVariants] = useState<VariantDraft[]>([createVariantDraft()]);
  const [images, setImages] = useState<File[]>([]);
  const [formError, setFormError] = useState<string | null>(null);
  const [createdCode, setCreatedCode] = useState<string | null>(null);
  const [imageWarning, setImageWarning] = useState<string | null>(null);

  const operationalWarehouses = useMemo(
    () =>
      (catalogs.data?.warehouses ?? []).filter(
        (warehouse) => warehouse.isActive && warehouse.warehouseType === 'OPERATIONAL',
      ),
    [catalogs.data],
  );
  const activeCategories = useMemo(
    () => (catalogs.data?.categories ?? []).filter((item) => item.isActive),
    [catalogs.data],
  );
  const activeFranchises = useMemo(
    () => (catalogs.data?.franchises ?? []).filter((item) => item.isActive),
    [catalogs.data],
  );
  const activeBrands = useMemo(
    () => (catalogs.data?.brands ?? []).filter((item) => item.isActive),
    [catalogs.data],
  );
  const availableLines = useMemo(
    () =>
      (catalogs.data?.productLines ?? []).filter(
        (item) => item.isActive && (!brandId || item.brandId === brandId),
      ),
    [brandId, catalogs.data],
  );
  const activeAttributes = useMemo(
    () => (catalogs.data?.attributeDefinitions ?? []).filter((item) => item.isActive),
    [catalogs.data],
  );

  const saveMutation = useMutation({
    mutationFn: async (input: CreateProductInput) => {
      const result = await createProduct(input, idempotencyKeyRef.current);
      let uploadWarning: string | null = null;
      if (images.length > 0) {
        try {
          await uploadProductImages(result.productId, images);
        } catch (error) {
          uploadWarning =
            error instanceof Error
              ? `El producto se creó, pero una imagen no pudo guardarse: ${error.message}`
              : 'El producto se creó, pero las imágenes no pudieron guardarse.';
        }
      }
      return { result, uploadWarning };
    },
    onSuccess: async ({ result, uploadWarning }) => {
      setCreatedCode(result.productCode);
      setImageWarning(uploadWarning);
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['products'] }),
        queryClient.invalidateQueries({ queryKey: ['inventory'] }),
      ]);
      window.setTimeout(() => navigate('/productos'), uploadWarning ? 2200 : 700);
    },
  });

  function updateVariant(clientId: string, patch: Partial<VariantDraft>) {
    setVariants((current) =>
      current.map((variant) =>
        variant.clientId === clientId ? { ...variant, ...patch } : variant,
      ),
    );
  }

  function updateAttribute(clientId: string, attributeId: string, value: string) {
    setVariants((current) =>
      current.map((variant) =>
        variant.clientId === clientId
          ? { ...variant, attributes: { ...variant.attributes, [attributeId]: value } }
          : variant,
      ),
    );
  }

  function updateStock(
    clientId: string,
    warehouseId: string,
    key: keyof VariantDraft['initialStock'][string],
    value: string,
  ) {
    setVariants((current) =>
      current.map((variant) => {
        if (variant.clientId !== clientId) return variant;
        const existing = variant.initialStock[warehouseId] ?? {
          quantity: '0',
          originalUnitCost: '0.00',
          originalCurrencyCode: 'PEN',
          exchangeRateToPen: '1',
        };
        return {
          ...variant,
          initialStock: {
            ...variant.initialStock,
            [warehouseId]: { ...existing, [key]: value },
          },
        };
      }),
    );
  }

  function handleImages(event: ChangeEvent<HTMLInputElement>) {
    const selected = [...(event.target.files ?? [])];
    const allowed = selected.filter(
      (file) =>
        ['image/jpeg', 'image/png', 'image/webp'].includes(file.type) &&
        file.size <= 5 * 1024 * 1024,
    );
    if (allowed.length !== selected.length)
      setFormError('Solo se aceptan imágenes JPG, PNG o WebP de hasta 5 MB.');
    setImages(allowed.slice(0, 6));
  }

  function buildInput(): CreateProductInput {
    if (!name.trim()) throw new Error('El nombre del producto es obligatorio.');
    if (!categoryId) throw new Error('Debes seleccionar una categoría.');
    if (variants.length === 0) throw new Error('Debes registrar al menos una variante.');

    return {
      name: name.trim(),
      franchiseId: franchiseId || null,
      characterName: characterName.trim() || null,
      categoryId,
      brandId: brandId || null,
      productLineId: productLineId || null,
      description: description.trim() || null,
      isActive,
      variants: variants.map((variant, index) => ({
        variantName:
          variant.variantName.trim() ||
          (variants.length === 1 ? 'Estándar' : `Variante ${index + 1}`),
        barcode: variant.barcode.trim() || null,
        salePrice: parseNonNegative(variant.salePrice, 'El precio'),
        currencyCode: variant.currencyCode,
        minimumStock: Math.trunc(parseNonNegative(variant.minimumStock, 'El stock mínimo')),
        weightGrams: null,
        dimensions: {},
        isActive: true,
        attributes: Object.entries(variant.attributes)
          .filter(([, value]) => value.trim())
          .map(([attributeId, rawValue]) => {
            const definition = activeAttributes.find((attribute) => attribute.id === attributeId);
            if (definition?.dataType === 'NUMBER')
              return { attributeId, valueNumber: Number(rawValue) };
            if (definition?.dataType === 'BOOLEAN')
              return { attributeId, valueBoolean: rawValue === 'true' };
            if (definition?.dataType === 'DATE') return { attributeId, valueDate: rawValue };
            return { attributeId, valueText: rawValue.trim() };
          }),
        initialStock: operationalWarehouses.map((warehouse) => {
          const stock = variant.initialStock[warehouse.id] ?? {
            quantity: '0',
            originalUnitCost: '0',
            originalCurrencyCode: 'PEN',
            exchangeRateToPen: '1',
          };
          return {
            warehouseId: warehouse.id,
            quantity: Math.trunc(parseNonNegative(stock.quantity, 'La cantidad inicial')),
            originalCurrencyCode: stock.originalCurrencyCode,
            originalUnitCost: parseNonNegative(stock.originalUnitCost, 'El costo unitario'),
            exchangeRateToPen: Math.max(Number(stock.exchangeRateToPen || 1), 0.000001),
          };
        }),
      })),
    };
  }

  function handleSubmit(event: FormEvent) {
    event.preventDefault();
    setFormError(null);
    try {
      saveMutation.mutate(buildInput());
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'Revisa los datos del producto.');
    }
  }

  const errorMessage =
    formError ?? (saveMutation.error instanceof Error ? saveMutation.error.message : null);

  return (
    <main className="page">
      <button className="back-link" onClick={() => navigate('/productos')} type="button">
        <ArrowLeft size={17} /> Volver a productos
      </button>
      <form onSubmit={handleSubmit}>
        <PageHeader
          eyebrow="Catálogo"
          title="Nuevo producto"
          description="Registra la información base. El código y cada SKU se generarán automáticamente."
          actions={
            <>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => navigate('/configuracion')}
              >
                Administrar catálogos
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={saveMutation.isPending || catalogs.isLoading}
              >
                <Save size={17} /> {saveMutation.isPending ? 'Guardando…' : 'Crear producto'}
              </button>
            </>
          }
        />

        {catalogs.isError ? (
          <div className="alert alert-error">
            No se pudieron cargar los catálogos. Revisa la conexión con la API.
          </div>
        ) : null}
        {errorMessage ? (
          <div className="alert alert-error product-form-alert">{errorMessage}</div>
        ) : null}
        {createdCode ? (
          <div className="alert alert-success product-form-alert">
            Producto {createdCode} creado correctamente. Redirigiendo…
          </div>
        ) : null}
        {imageWarning ? (
          <div className="alert alert-warning product-form-alert">{imageWarning}</div>
        ) : null}

        <section className="form-layout">
          <div className="form-main">
            <Panel
              title="Información general"
              subtitle="Datos que permitirán identificar y encontrar el producto."
            >
              <div className="form-grid form-grid-2">
                <label className="field field-span-2">
                  <span>Nombre del producto *</span>
                  <input
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                    placeholder="Ej. Figura Gojo Satoru"
                    maxLength={200}
                  />
                </label>
                <label className="field">
                  <span>Anime o franquicia</span>
                  <select
                    value={franchiseId}
                    onChange={(event) => setFranchiseId(event.target.value)}
                  >
                    <option value="">Sin franquicia</option>
                    {activeFranchises.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Personaje</span>
                  <input
                    value={characterName}
                    onChange={(event) => setCharacterName(event.target.value)}
                    placeholder="Ej. Gojo Satoru"
                    maxLength={160}
                  />
                </label>
                <label className="field">
                  <span>Categoría *</span>
                  <select
                    value={categoryId}
                    onChange={(event) => setCategoryId(event.target.value)}
                  >
                    <option value="">Seleccionar categoría</option>
                    {activeCategories.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Marca</span>
                  <select
                    value={brandId}
                    onChange={(event) => {
                      setBrandId(event.target.value);
                      setProductLineId('');
                    }}
                  >
                    <option value="">Sin marca</option>
                    {activeBrands.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Línea o colección</span>
                  <select
                    value={productLineId}
                    onChange={(event) => setProductLineId(event.target.value)}
                  >
                    <option value="">Sin línea</option>
                    {availableLines.map((item) => (
                      <option value={item.id} key={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="field">
                  <span>Estado inicial</span>
                  <select
                    value={isActive ? 'active' : 'inactive'}
                    onChange={(event) => setIsActive(event.target.value === 'active')}
                  >
                    <option value="active">Activo</option>
                    <option value="inactive">Inactivo</option>
                  </select>
                </label>
                <label className="field field-span-2">
                  <span>Descripción</span>
                  <textarea
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder="Detalles relevantes, dimensiones, edición y características…"
                    maxLength={2000}
                  />
                </label>
              </div>
            </Panel>

            <Panel
              title="Variantes"
              subtitle="Cada producto debe tener al menos una variante. Para un artículo simple usa “Estándar”."
            >
              <div className="variant-editor-list">
                {variants.map((variant, variantIndex) => (
                  <article className="variant-editor-card" key={variant.clientId}>
                    <div className="variant-editor-heading">
                      <div>
                        <strong>Variante {variantIndex + 1}</strong>
                        <small>El SKU y el QR se generarán al guardar.</small>
                      </div>
                      <button
                        className="icon-button danger-icon"
                        type="button"
                        aria-label="Eliminar variante"
                        disabled={variants.length === 1}
                        onClick={() =>
                          setVariants((current) =>
                            current.filter((item) => item.clientId !== variant.clientId),
                          )
                        }
                      >
                        <Trash2 size={17} />
                      </button>
                    </div>
                    <div className="form-grid variant-basic-grid">
                      <label className="field">
                        <span>Nombre de variante *</span>
                        <input
                          value={variant.variantName}
                          onChange={(event) =>
                            updateVariant(variant.clientId, { variantName: event.target.value })
                          }
                          placeholder="Estándar, 20 cm, Edición limitada…"
                        />
                      </label>
                      <label className="field">
                        <span>Precio de venta *</span>
                        <input
                          type="number"
                          min="0"
                          step="0.01"
                          value={variant.salePrice}
                          onChange={(event) =>
                            updateVariant(variant.clientId, { salePrice: event.target.value })
                          }
                        />
                      </label>
                      <label className="field">
                        <span>Moneda</span>
                        <select
                          value={variant.currencyCode}
                          onChange={(event) =>
                            updateVariant(variant.clientId, { currencyCode: event.target.value })
                          }
                        >
                          {(catalogs.data?.currencies ?? [])
                            .filter((currency) => currency.isActive)
                            .map((currency) => (
                              <option value={currency.code} key={currency.code}>
                                {currency.symbol} — {currency.name}
                              </option>
                            ))}
                        </select>
                      </label>
                      <label className="field">
                        <span>Stock mínimo</span>
                        <input
                          type="number"
                          min="0"
                          step="1"
                          value={variant.minimumStock}
                          onChange={(event) =>
                            updateVariant(variant.clientId, { minimumStock: event.target.value })
                          }
                        />
                      </label>
                      <label className="field field-span-2">
                        <span>Código de barras opcional</span>
                        <input
                          value={variant.barcode}
                          onChange={(event) =>
                            updateVariant(variant.clientId, { barcode: event.target.value })
                          }
                          placeholder="Escanea o escribe un código existente"
                        />
                      </label>
                    </div>
                    {activeAttributes.length > 0 ? (
                      <div className="variant-attributes">
                        <span className="subsection-label">Atributos opcionales</span>
                        <div className="form-grid">
                          {activeAttributes.map((attribute) => (
                            <label className="field" key={attribute.id}>
                              <span>{attribute.name}</span>
                              {attribute.dataType === 'BOOLEAN' ? (
                                <select
                                  value={variant.attributes[attribute.id] ?? ''}
                                  onChange={(event) =>
                                    updateAttribute(
                                      variant.clientId,
                                      attribute.id,
                                      event.target.value,
                                    )
                                  }
                                >
                                  <option value="">Sin especificar</option>
                                  <option value="true">Sí</option>
                                  <option value="false">No</option>
                                </select>
                              ) : (
                                <input
                                  type={
                                    attribute.dataType === 'NUMBER'
                                      ? 'number'
                                      : attribute.dataType === 'DATE'
                                        ? 'date'
                                        : 'text'
                                  }
                                  value={variant.attributes[attribute.id] ?? ''}
                                  onChange={(event) =>
                                    updateAttribute(
                                      variant.clientId,
                                      attribute.id,
                                      event.target.value,
                                    )
                                  }
                                  placeholder={
                                    attribute.dataType === 'COLOR'
                                      ? 'Ej. Negro'
                                      : `Valor de ${attribute.name.toLowerCase()}`
                                  }
                                />
                              )}
                            </label>
                          ))}
                        </div>
                      </div>
                    ) : null}
                    <div className="variant-stock-section">
                      <span className="subsection-label">Inventario inicial por almacén</span>
                      <div className="initial-stock-grid">
                        {operationalWarehouses.map((warehouse) => {
                          const stock = variant.initialStock[warehouse.id] ?? {
                            quantity: '0',
                            originalUnitCost: '0.00',
                            originalCurrencyCode: 'PEN',
                            exchangeRateToPen: '1',
                          };
                          return (
                            <div className="warehouse-stock-card" key={warehouse.id}>
                              <strong>{warehouse.name}</strong>
                              <div className="form-grid">
                                <label className="field">
                                  <span>Cantidad</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="1"
                                    value={stock.quantity}
                                    onChange={(event) =>
                                      updateStock(
                                        variant.clientId,
                                        warehouse.id,
                                        'quantity',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>
                                <label className="field">
                                  <span>Costo unitario</span>
                                  <input
                                    type="number"
                                    min="0"
                                    step="0.01"
                                    value={stock.originalUnitCost}
                                    onChange={(event) =>
                                      updateStock(
                                        variant.clientId,
                                        warehouse.id,
                                        'originalUnitCost',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>
                                <label className="field">
                                  <span>Moneda costo</span>
                                  <select
                                    value={stock.originalCurrencyCode}
                                    onChange={(event) =>
                                      updateStock(
                                        variant.clientId,
                                        warehouse.id,
                                        'originalCurrencyCode',
                                        event.target.value,
                                      )
                                    }
                                  >
                                    {(catalogs.data?.currencies ?? [])
                                      .filter((currency) => currency.isActive)
                                      .map((currency) => (
                                        <option value={currency.code} key={currency.code}>
                                          {currency.code}
                                        </option>
                                      ))}
                                  </select>
                                </label>
                                <label className="field">
                                  <span>Tipo de cambio</span>
                                  <input
                                    type="number"
                                    min="0.000001"
                                    step="0.000001"
                                    value={stock.exchangeRateToPen}
                                    disabled={stock.originalCurrencyCode === 'PEN'}
                                    onChange={(event) =>
                                      updateStock(
                                        variant.clientId,
                                        warehouse.id,
                                        'exchangeRateToPen',
                                        event.target.value,
                                      )
                                    }
                                  />
                                </label>
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  </article>
                ))}
              </div>
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setVariants((current) => [...current, createVariantDraft()])}
              >
                <Plus size={17} /> Agregar variante
              </button>
            </Panel>
          </div>

          <aside className="form-sidebar">
            <Panel title="Imágenes">
              <input
                ref={fileInputRef}
                className="visually-hidden"
                type="file"
                accept="image/jpeg,image/png,image/webp"
                multiple
                onChange={handleImages}
              />
              <button
                className="image-drop image-drop-button"
                type="button"
                onClick={() => fileInputRef.current?.click()}
              >
                <ImagePlus size={28} />
                <strong>Sube las fotografías</strong>
                <span>JPG, PNG o WebP, máximo 5 MB</span>
              </button>
              {images.length > 0 ? (
                <div className="image-preview-grid">
                  {images.map((file, index) => (
                    <LocalImagePreview
                      file={file}
                      cover={index === 0}
                      key={`${file.name}-${file.lastModified}`}
                    />
                  ))}
                </div>
              ) : (
                <p className="helper-text">La primera imagen será la portada del producto.</p>
              )}
            </Panel>
            <Panel title="Código automático">
              <div className="generated-code">
                <QrCode size={28} />
                <span>
                  <small>Código y SKU</small>
                  <strong>Se generan al guardar</strong>
                </span>
              </div>
              <StatusBadge tone="info">Seguro para uso simultáneo</StatusBadge>
            </Panel>
            <Panel title="Antes de guardar">
              <ul className="form-checklist">
                <li>Verifica la categoría y la franquicia.</li>
                <li>Registra una variante “Estándar” si no existen variaciones.</li>
                <li>El stock inicial generará un movimiento auditable.</li>
                <li>Ningún saldo se editará directamente.</li>
              </ul>
            </Panel>
          </aside>
        </section>
      </form>
    </main>
  );
}
