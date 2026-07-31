import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type {
  CreateImportInput,
  CreateImportPartnerInput,
  ImportTransportMode,
} from '@yukimi/shared';
import { ArrowLeft, Plus, Save, Trash2 } from 'lucide-react';
import { useMemo, useState, type FormEvent } from 'react';
import { useNavigate } from 'react-router';
import { BusyLabel, useFeedback } from '../components/ui/feedback-provider';
import { ContextNote } from '../components/ui/info-tip';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { SearchableSelect } from '../components/ui/searchable-select';
import {
  createImport,
  createImportPartner,
  getImportSupportData,
} from '../features/imports/imports-api';

type ImportBoxInput = CreateImportInput['boxes'][number];
type ImportBoxItemInput = ImportBoxInput['items'][number];

interface BoxForm {
  key: string;
  internationalOperatorId: string;
  localOperatorId: string;
  trackingNumber: string;
  estimatedArrivalDate: string;
  weightGrams: string;
  notes: string;
  items: ItemForm[];
}

interface ItemForm {
  key: string;
  variantId: string;
  destinationWarehouseId: string;
  expectedQuantity: string;
  originalCurrencyCode: string;
  originalUnitCost: string;
  exchangeRateToPen: string;
  notes: string;
}

function todayInput() {
  return new Date().toISOString().slice(0, 10);
}

function sanitizePositiveInteger(value: string) {
  const digits = value.replace(/[^0-9]/g, '');
  return digits.replace(/^0+(?=\d)/, '');
}

function sanitizeDecimal(value: string) {
  const normalized = value.replace(',', '.').replace(/[^0-9.]/g, '');
  const [integer = '', ...rest] = normalized.split('.');
  const cleanInteger = integer.replace(/^0+(?=\d)/, '') || (normalized.startsWith('0') ? '0' : '');
  return rest.length > 0 ? `${cleanInteger}.${rest.join('')}` : cleanInteger;
}

function emptyItem(defaultCurrency = 'PEN'): ItemForm {
  return {
    key: crypto.randomUUID(),
    variantId: '',
    destinationWarehouseId: '',
    expectedQuantity: '1',
    originalCurrencyCode: defaultCurrency,
    originalUnitCost: '0',
    exchangeRateToPen: defaultCurrency === 'PEN' ? '1' : '',
    notes: '',
  };
}

function emptyBox(defaultCurrency = 'PEN', arrivalDate = todayInput()): BoxForm {
  return {
    key: crypto.randomUUID(),
    internationalOperatorId: '',
    localOperatorId: '',
    trackingNumber: '',
    estimatedArrivalDate: arrivalDate,
    weightGrams: '',
    notes: '',
    items: [emptyItem(defaultCurrency)],
  };
}

function money(value: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(value);
}

export function NewImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const { confirm, notify, notifyError, prompt } = useFeedback();
  const [supplierId, setSupplierId] = useState('');
  const [transportMode, setTransportMode] = useState<ImportTransportMode>('OTHER');
  const [purchaseCurrencyCode, setPurchaseCurrencyCode] = useState('PEN');
  const [sunatExchangeRate, setSunatExchangeRate] = useState('1');
  const [purchaseDate, setPurchaseDate] = useState(todayInput());
  const [estimatedArrivalDate, setEstimatedArrivalDate] = useState(todayInput());
  const [masterTrackingNumber, setMasterTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [boxes, setBoxes] = useState<BoxForm[]>([emptyBox()]);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const support = useQuery({
    queryKey: ['import-support'],
    queryFn: getImportSupportData,
  });

  const variantOptions = useMemo(
    () =>
      (support.data?.variants ?? []).map((variant) => ({
        value: variant.id,
        label: `${variant.productName} · ${variant.variantName}`,
        description: variant.sku,
      })),
    [support.data?.variants],
  );

  const createMutation = useMutation({
    mutationFn: (input: CreateImportInput) => createImport(input, crypto.randomUUID()),
    onSuccess: async (result) => {
      notify({
        title: 'Importación creada',
        message: `${result.code} inició en estado Cotización.`,
        tone: 'success',
      });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: ['imports'] }),
        queryClient.invalidateQueries({ queryKey: ['import-support'] }),
      ]);
      navigate(`/importaciones/${result.id}`);
    },
    onError: (error) => notifyError(error, 'No se pudo crear la importación.'),
  });

  function updateBox(boxIndex: number, patch: Partial<BoxForm>) {
    setBoxes((current) =>
      current.map((box, index) => (index === boxIndex ? { ...box, ...patch } : box)),
    );
  }

  function updateItem(boxIndex: number, itemIndex: number, patch: Partial<ItemForm>) {
    setBoxes((current) =>
      current.map((box, currentBoxIndex) =>
        currentBoxIndex === boxIndex
          ? {
              ...box,
              items: box.items.map((item, currentItemIndex) =>
                currentItemIndex === itemIndex ? { ...item, ...patch } : item,
              ),
            }
          : box,
      ),
    );
  }

  function addBox() {
    setBoxes((current) => [...current, emptyBox(purchaseCurrencyCode, estimatedArrivalDate)]);
  }

  function removeBox(index: number) {
    if (boxes.length === 1) {
      notify({
        title: 'Debe existir una caja',
        message: 'Toda importación necesita al menos una caja.',
        tone: 'warning',
      });
      return;
    }
    setBoxes((current) => current.filter((_, position) => position !== index));
  }

  function addItem(boxIndex: number) {
    setBoxes((current) =>
      current.map((box, index) =>
        index === boxIndex
          ? { ...box, items: [...box.items, emptyItem(purchaseCurrencyCode)] }
          : box,
      ),
    );
  }

  function removeItem(boxIndex: number, itemIndex: number) {
    const box = boxes[boxIndex];
    if (!box || box.items.length === 1) {
      notify({
        title: 'La caja debe contener un producto',
        tone: 'warning',
      });
      return;
    }
    setBoxes((current) =>
      current.map((currentBox, index) =>
        index === boxIndex
          ? {
              ...currentBox,
              items: currentBox.items.filter((_, position) => position !== itemIndex),
            }
          : currentBox,
      ),
    );
  }

  function changePurchaseCurrency(value: string) {
    setPurchaseCurrencyCode(value);
    if (value === 'PEN') setSunatExchangeRate('1');
    setBoxes((current) =>
      current.map((box) => ({
        ...box,
        items: box.items.map((item) =>
          item.originalCurrencyCode === purchaseCurrencyCode
            ? {
                ...item,
                originalCurrencyCode: value,
                exchangeRateToPen: value === 'PEN' ? '1' : '',
              }
            : item,
        ),
      })),
    );
  }

  async function createSupplier() {
    const values = await prompt({
      title: 'Nuevo proveedor',
      message:
        'Registra únicamente los datos confirmados. Los campos no obligatorios pueden completarse después.',
      fields: [
        { name: 'name', label: 'Nombre', required: true, minLength: 2 },
        { name: 'countryCode', label: 'País', initialValue: 'PE', required: true },
        { name: 'contactName', label: 'Contacto' },
        { name: 'email', label: 'Correo' },
        { name: 'phone', label: 'Teléfono' },
        { name: 'notes', label: 'Notas', type: 'textarea' },
      ],
      confirmLabel: 'Crear proveedor',
    });
    if (!values) return;
    try {
      const input: CreateImportPartnerInput = {
        partnerTypeCode: 'SUPPLIER',
        legalName: (values.name ?? '').trim(),
        tradeName: (values.name ?? '').trim(),
        countryCode: (values.countryCode ?? '').trim().toUpperCase(),
        contactName: (values.contactName ?? '').trim() || null,
        email: (values.email ?? '').trim() || null,
        phone: (values.phone ?? '').trim() || null,
        notes: (values.notes ?? '').trim() || null,
      };
      const result = await createImportPartner(input);
      setSupplierId(result.id);
      await queryClient.invalidateQueries({ queryKey: ['import-support'] });
      notify({ title: 'Proveedor creado', tone: 'success' });
    } catch (error) {
      notifyError(error, 'No se pudo crear el proveedor.');
    }
  }

  function validate() {
    const next: Record<string, string> = {};
    if (!supplierId) next.supplierId = 'Selecciona un proveedor.';
    const purchaseRate = purchaseCurrencyCode === 'PEN' ? 1 : Number(sunatExchangeRate);
    if (!Number.isFinite(purchaseRate) || purchaseRate <= 0) {
      next.sunatExchangeRate = 'Ingresa un tipo de cambio mayor que cero.';
    }
    if (!purchaseDate) next.purchaseDate = 'Selecciona la fecha de compra.';
    if (!estimatedArrivalDate) next.estimatedArrivalDate = 'Selecciona la llegada estimada.';

    boxes.forEach((box, boxIndex) => {
      if (box.items.length === 0) next[`box-${boxIndex}-items`] = 'Agrega al menos un producto.';
      if (box.weightGrams && Number(box.weightGrams) < 0) {
        next[`box-${boxIndex}-weight`] = 'El peso no puede ser negativo.';
      }
      box.items.forEach((item, itemIndex) => {
        const prefix = `box-${boxIndex}-item-${itemIndex}`;
        if (!item.variantId) next[`${prefix}-variant`] = 'Selecciona un producto o variante.';
        if (!item.destinationWarehouseId) {
          next[`${prefix}-warehouse`] = 'Selecciona el almacén de destino.';
        }
        const quantity = Number(item.expectedQuantity);
        if (!Number.isInteger(quantity) || quantity <= 0) {
          next[`${prefix}-quantity`] = 'La cantidad debe ser un entero mayor que cero.';
        }
        const cost = Number(item.originalUnitCost);
        if (!Number.isFinite(cost) || cost < 0) {
          next[`${prefix}-cost`] = 'El costo debe ser un número igual o mayor que cero.';
        }
        const rate = item.originalCurrencyCode === 'PEN' ? 1 : Number(item.exchangeRateToPen);
        if (!Number.isFinite(rate) || rate <= 0) {
          next[`${prefix}-rate`] = 'Ingresa un tipo de cambio mayor que cero.';
        }
      });
    });
    setErrors(next);
    return Object.keys(next).length === 0;
  }

  const summary = useMemo(() => {
    let products = 0;
    let units = 0;
    let estimatedPen = 0;
    for (const box of boxes) {
      products += box.items.length;
      for (const item of box.items) {
        const quantity = Number(item.expectedQuantity) || 0;
        const cost = Number(item.originalUnitCost) || 0;
        const rate = item.originalCurrencyCode === 'PEN' ? 1 : Number(item.exchangeRateToPen) || 0;
        units += quantity;
        estimatedPen += quantity * cost * rate;
      }
    }
    return { products, units, estimatedPen };
  }, [boxes]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!validate()) return;
    const accepted = await confirm({
      title: 'Confirmar nueva importación',
      message: `Se registrarán ${boxes.length} ${boxes.length === 1 ? 'caja' : 'cajas'} y ${summary.units} unidades esperadas.`,
      detail: 'La importación iniciará en Cotización. Todavía no modificará el inventario.',
      confirmLabel: 'Crear importación',
    });
    if (!accepted) {
      notify({
        title: 'Creación cancelada',
        message: 'La información permanece en el formulario y no se guardó nada.',
        tone: 'info',
      });
      return;
    }

    const input: CreateImportInput = {
      supplierPartnerId: supplierId,
      transportMode,
      purchaseCurrencyCode,
      sunatExchangeRate: purchaseCurrencyCode === 'PEN' ? 1 : Number(sunatExchangeRate),
      purchaseDate,
      estimatedArrivalDate,
      masterTrackingNumber: masterTrackingNumber.trim() || null,
      notes: notes.trim() || null,
      boxes: boxes.map<ImportBoxInput>((box) => ({
        internationalOperatorId: box.internationalOperatorId || null,
        localOperatorId: box.localOperatorId || null,
        trackingNumber: box.trackingNumber.trim() || null,
        estimatedArrivalDate: box.estimatedArrivalDate || null,
        weightGrams: box.weightGrams ? Number(box.weightGrams) : null,
        notes: box.notes.trim() || null,
        items: box.items.map<ImportBoxItemInput>((item) => ({
          variantId: item.variantId,
          destinationWarehouseId: item.destinationWarehouseId,
          expectedQuantity: Number(item.expectedQuantity),
          originalCurrencyCode: item.originalCurrencyCode,
          originalUnitCost: Number(item.originalUnitCost),
          exchangeRateToPen:
            item.originalCurrencyCode === 'PEN' ? 1 : Number(item.exchangeRateToPen),
          notes: item.notes.trim() || null,
        })),
      })),
    };
    createMutation.mutate(input);
  }

  return (
    <main className="page">
      <button className="link-button" type="button" onClick={() => navigate('/importaciones')}>
        <ArrowLeft size={16} /> Volver a importaciones
      </button>
      <PageHeader
        eyebrow="Seguimiento internacional"
        title="Nueva importación"
        description="Registra la compra y sus cajas. El inventario solo cambiará después de confirmar la recepción física."
      />

      {support.isError ? (
        <div className="alert alert-error">
          No se pudieron cargar los proveedores, productos o almacenes.
        </div>
      ) : null}
      {Object.keys(errors).length > 0 ? (
        <div className="form-error-summary" role="alert">
          No se pudo crear la importación. Corrige {Object.keys(errors).length}{' '}
          {Object.keys(errors).length === 1 ? 'campo marcado' : 'campos marcados'} en rojo.
        </div>
      ) : null}

      <form className="new-import-layout" onSubmit={(event) => void submit(event)} noValidate>
        <div className="new-import-main">
          <Panel title="Datos generales" subtitle="La importación inicia en estado Cotización.">
            <div className="form-grid form-grid-2">
              <div className="field-with-action">
                <SearchableSelect
                  label="Proveedor"
                  required
                  value={supplierId}
                  error={errors.supplierId}
                  options={(support.data?.suppliers ?? []).map((partner) => ({
                    value: partner.id,
                    label: partner.name,
                    description: partner.countryCode ?? undefined,
                  }))}
                  onChange={(value) => {
                    setSupplierId(value);
                    setErrors((current) => ({ ...current, supplierId: '' }));
                  }}
                />
                <button
                  className="button button-secondary button-compact"
                  type="button"
                  onClick={() => void createSupplier()}
                >
                  <Plus size={15} /> Crear
                </button>
              </div>
              <SearchableSelect
                label="Medio de transporte"
                required
                value={transportMode}
                options={[
                  { value: 'AIR', label: 'Aéreo' },
                  { value: 'SEA', label: 'Marítimo' },
                  { value: 'OTHER', label: 'Otro' },
                ]}
                onChange={(value) => setTransportMode(value as ImportTransportMode)}
              />
              <SearchableSelect
                label="Moneda de compra"
                required
                value={purchaseCurrencyCode}
                options={(support.data?.currencies ?? []).map((currency) => ({
                  value: currency.code,
                  label: `${currency.code} · ${currency.name}`,
                }))}
                onChange={changePurchaseCurrency}
              />
              <label className={`field ${errors.sunatExchangeRate ? 'field-invalid' : ''}`}>
                <span>Tipo de cambio a soles *</span>
                <input
                  type="number"
                  min="0.000001"
                  step="0.000001"
                  value={purchaseCurrencyCode === 'PEN' ? '1' : sunatExchangeRate}
                  disabled={purchaseCurrencyCode === 'PEN'}
                  onChange={(event) => {
                    setSunatExchangeRate(sanitizeDecimal(event.target.value));
                    setErrors((current) => ({ ...current, sunatExchangeRate: '' }));
                  }}
                />
                {purchaseCurrencyCode === 'PEN' ? (
                  <small>Una compra en soles siempre utiliza tipo de cambio 1.</small>
                ) : null}
                {errors.sunatExchangeRate ? (
                  <small className="field-error">{errors.sunatExchangeRate}</small>
                ) : null}
              </label>
              <label className={`field ${errors.purchaseDate ? 'field-invalid' : ''}`}>
                <span>Fecha de compra *</span>
                <input
                  type="date"
                  value={purchaseDate}
                  onChange={(event) => setPurchaseDate(event.target.value)}
                />
                {errors.purchaseDate ? (
                  <small className="field-error">{errors.purchaseDate}</small>
                ) : null}
              </label>
              <label className={`field ${errors.estimatedArrivalDate ? 'field-invalid' : ''}`}>
                <span>Llegada estimada *</span>
                <input
                  type="date"
                  value={estimatedArrivalDate}
                  min={purchaseDate}
                  onChange={(event) => setEstimatedArrivalDate(event.target.value)}
                />
                {errors.estimatedArrivalDate ? (
                  <small className="field-error">{errors.estimatedArrivalDate}</small>
                ) : null}
              </label>
              <label className="field">
                <span>Tracking maestro</span>
                <input
                  value={masterTrackingNumber}
                  onChange={(event) => setMasterTrackingNumber(event.target.value)}
                  placeholder="Opcional"
                />
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
          </Panel>

          <Panel
            title="Cajas"
            subtitle="Cada caja mantiene su propio tracking, productos, destino y estado."
          >
            <div className="new-import-boxes">
              {boxes.map((box, boxIndex) => (
                <article className="new-import-box-card" key={box.key}>
                  <header>
                    <div>
                      <strong>Caja {boxIndex + 1}</strong>
                      <small>
                        {box.items.length} {box.items.length === 1 ? 'producto' : 'productos'}
                      </small>
                    </div>
                    <button
                      className="icon-button"
                      type="button"
                      aria-label={`Eliminar caja ${boxIndex + 1}`}
                      onClick={() => removeBox(boxIndex)}
                    >
                      <Trash2 size={17} />
                    </button>
                  </header>
                  <div className="form-grid form-grid-2">
                    <SearchableSelect
                      label="Operador internacional"
                      value={box.internationalOperatorId}
                      allowClear
                      options={(support.data?.internationalOperators ?? []).map((partner) => ({
                        value: partner.id,
                        label: partner.name,
                      }))}
                      onChange={(value) => updateBox(boxIndex, { internationalOperatorId: value })}
                    />
                    <SearchableSelect
                      label="Operador local"
                      value={box.localOperatorId}
                      allowClear
                      options={(support.data?.localOperators ?? []).map((partner) => ({
                        value: partner.id,
                        label: partner.name,
                      }))}
                      onChange={(value) => updateBox(boxIndex, { localOperatorId: value })}
                    />
                    <label className="field">
                      <span>Tracking de caja</span>
                      <input
                        value={box.trackingNumber}
                        onChange={(event) =>
                          updateBox(boxIndex, { trackingNumber: event.target.value })
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Llegada estimada</span>
                      <input
                        type="date"
                        min={purchaseDate}
                        value={box.estimatedArrivalDate}
                        onChange={(event) =>
                          updateBox(boxIndex, { estimatedArrivalDate: event.target.value })
                        }
                      />
                    </label>
                    <label
                      className={`field ${errors[`box-${boxIndex}-weight`] ? 'field-invalid' : ''}`}
                    >
                      <span>Peso en gramos</span>
                      <input
                        type="number"
                        min="0"
                        step="0.001"
                        value={box.weightGrams}
                        onChange={(event) =>
                          updateBox(boxIndex, { weightGrams: sanitizeDecimal(event.target.value) })
                        }
                      />
                      {errors[`box-${boxIndex}-weight`] ? (
                        <small className="field-error">{errors[`box-${boxIndex}-weight`]}</small>
                      ) : null}
                    </label>
                    <label className="field">
                      <span>Notas de caja</span>
                      <input
                        value={box.notes}
                        onChange={(event) => updateBox(boxIndex, { notes: event.target.value })}
                      />
                    </label>
                  </div>

                  <div className="new-import-items">
                    {box.items.map((item, itemIndex) => {
                      const prefix = `box-${boxIndex}-item-${itemIndex}`;
                      return (
                        <section className="new-import-item-card" key={item.key}>
                          <header>
                            <strong>Producto {itemIndex + 1}</strong>
                            <button
                              className="icon-button"
                              type="button"
                              aria-label="Eliminar producto"
                              onClick={() => removeItem(boxIndex, itemIndex)}
                            >
                              <Trash2 size={15} />
                            </button>
                          </header>
                          <div className="form-grid new-import-item-grid">
                            <SearchableSelect
                              label="Producto o variante"
                              required
                              value={item.variantId}
                              error={errors[`${prefix}-variant`]}
                              searchPlaceholder="Buscar por nombre, variante o SKU…"
                              options={variantOptions}
                              onChange={(value) =>
                                updateItem(boxIndex, itemIndex, { variantId: value })
                              }
                            />
                            <SearchableSelect
                              label="Almacén de destino"
                              required
                              value={item.destinationWarehouseId}
                              error={errors[`${prefix}-warehouse`]}
                              options={(support.data?.warehouses ?? []).map((warehouse) => ({
                                value: warehouse.id,
                                label: warehouse.name,
                              }))}
                              onChange={(value) =>
                                updateItem(boxIndex, itemIndex, { destinationWarehouseId: value })
                              }
                            />
                            <label
                              className={`field ${errors[`${prefix}-quantity`] ? 'field-invalid' : ''}`}
                            >
                              <span>Cantidad *</span>
                              <input
                                type="number"
                                min="1"
                                step="1"
                                value={item.expectedQuantity}
                                onChange={(event) =>
                                  updateItem(boxIndex, itemIndex, {
                                    expectedQuantity: sanitizePositiveInteger(event.target.value),
                                  })
                                }
                              />
                              {errors[`${prefix}-quantity`] ? (
                                <small className="field-error">
                                  {errors[`${prefix}-quantity`]}
                                </small>
                              ) : null}
                            </label>
                            <label
                              className={`field ${errors[`${prefix}-cost`] ? 'field-invalid' : ''}`}
                            >
                              <span>Costo unitario *</span>
                              <input
                                type="number"
                                min="0"
                                step="0.01"
                                value={item.originalUnitCost}
                                onChange={(event) =>
                                  updateItem(boxIndex, itemIndex, {
                                    originalUnitCost: sanitizeDecimal(event.target.value),
                                  })
                                }
                              />
                              {errors[`${prefix}-cost`] ? (
                                <small className="field-error">{errors[`${prefix}-cost`]}</small>
                              ) : null}
                            </label>
                            <SearchableSelect
                              label="Moneda"
                              required
                              value={item.originalCurrencyCode}
                              options={(support.data?.currencies ?? []).map((currency) => ({
                                value: currency.code,
                                label: currency.code,
                              }))}
                              onChange={(value) =>
                                updateItem(boxIndex, itemIndex, {
                                  originalCurrencyCode: value,
                                  exchangeRateToPen: value === 'PEN' ? '1' : '',
                                })
                              }
                            />
                            <label
                              className={`field ${errors[`${prefix}-rate`] ? 'field-invalid' : ''}`}
                            >
                              <span>Tipo de cambio a PEN *</span>
                              <input
                                type="number"
                                min="0.000001"
                                step="0.000001"
                                disabled={item.originalCurrencyCode === 'PEN'}
                                value={
                                  item.originalCurrencyCode === 'PEN' ? '1' : item.exchangeRateToPen
                                }
                                onChange={(event) =>
                                  updateItem(boxIndex, itemIndex, {
                                    exchangeRateToPen: sanitizeDecimal(event.target.value),
                                  })
                                }
                              />
                              {item.originalCurrencyCode === 'PEN' ? (
                                <small>En soles siempre es 1.</small>
                              ) : null}
                              {errors[`${prefix}-rate`] ? (
                                <small className="field-error">{errors[`${prefix}-rate`]}</small>
                              ) : null}
                            </label>
                            <label className="field new-import-item-notes">
                              <span>Notas</span>
                              <input
                                value={item.notes}
                                onChange={(event) =>
                                  updateItem(boxIndex, itemIndex, { notes: event.target.value })
                                }
                              />
                            </label>
                          </div>
                        </section>
                      );
                    })}
                  </div>
                  <button
                    className="button button-secondary button-full"
                    type="button"
                    onClick={() => addItem(boxIndex)}
                  >
                    <Plus size={16} /> Agregar producto a esta caja
                  </button>
                </article>
              ))}
            </div>
            <button className="button button-secondary" type="button" onClick={addBox}>
              <Plus size={17} /> Agregar otra caja
            </button>
          </Panel>
        </div>

        <aside className="new-import-summary">
          <Panel title="Resumen" subtitle="Antes de guardar, revisa cantidades, costos y destinos.">
            <div className="summary-list">
              <div className="summary-row">
                <span>Cajas</span>
                <strong>{boxes.length}</strong>
              </div>
              <div className="summary-row">
                <span>Productos</span>
                <strong>{summary.products}</strong>
              </div>
              <div className="summary-row">
                <span>Unidades esperadas</span>
                <strong>{summary.units}</strong>
              </div>
              <div className="summary-row">
                <span>Compra estimada en soles</span>
                <strong>{money(summary.estimatedPen)}</strong>
              </div>
              <div className="summary-row">
                <span>Transporte</span>
                <strong>
                  {transportMode === 'AIR'
                    ? 'Aéreo'
                    : transportMode === 'SEA'
                      ? 'Marítimo'
                      : 'Otro'}
                </strong>
              </div>
            </div>
            <ContextNote tone="info">
              Crear la importación no agrega stock. Las unidades se registran únicamente al
              confirmar físicamente cada caja.
            </ContextNote>
            <button
              className="button button-primary button-full"
              type="submit"
              disabled={createMutation.isPending}
            >
              {createMutation.isPending ? (
                <BusyLabel label="Creando…" />
              ) : (
                <>
                  <Save size={17} /> Crear importación
                </>
              )}
            </button>
          </Panel>
        </aside>
      </form>
    </main>
  );
}
