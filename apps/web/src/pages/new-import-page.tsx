import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { CreateImportInput, ImportTransportMode } from '@yukimi/shared';
import { ArrowLeft, Boxes, Plus, Search, Trash2, X } from 'lucide-react';
import { useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { createImport, createImportPartner, getImportSupportData } from '../features/imports/imports-api';

interface DraftItem {
  id: string;
  variantId: string;
  destinationWarehouseId: string;
  expectedQuantity: number;
  originalUnitCost: number;
  originalCurrencyCode: string;
  exchangeRateToPen: number;
  notes: string;
}
interface DraftBox {
  id: string;
  internationalOperatorId: string;
  localOperatorId: string;
  trackingNumber: string;
  estimatedArrivalDate: string;
  weightGrams: number;
  notes: string;
  items: DraftItem[];
}

const today = new Date().toISOString().slice(0, 10);
const makeItem = (currency = 'JPY', exchangeRate = 0.026): DraftItem => ({
  id: crypto.randomUUID(),
  variantId: '',
  destinationWarehouseId: '',
  expectedQuantity: 1,
  originalUnitCost: 0,
  originalCurrencyCode: currency,
  exchangeRateToPen: exchangeRate,
  notes: '',
});
const makeBox = (currency = 'JPY', exchangeRate = 0.026): DraftBox => ({
  id: crypto.randomUUID(),
  internationalOperatorId: '',
  localOperatorId: '',
  trackingNumber: '',
  estimatedArrivalDate: '',
  weightGrams: 0,
  notes: '',
  items: [makeItem(currency, exchangeRate)],
});
const money = (value: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);

function normalizePartnerName(value: string): string {
  return value.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toLowerCase().replace(/[^a-z0-9]+/g, '');
}

export function NewImportPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const support = useQuery({ queryKey: ['import-support'], queryFn: getImportSupportData });
  const [supplierPartnerId, setSupplierPartnerId] = useState('');
  const [transportMode, setTransportMode] = useState<ImportTransportMode>('AIR');
  const [purchaseCurrencyCode, setPurchaseCurrencyCode] = useState('JPY');
  const [sunatExchangeRate, setSunatExchangeRate] = useState(0.026);
  const [purchaseDate, setPurchaseDate] = useState(today);
  const [estimatedArrivalDate, setEstimatedArrivalDate] = useState('');
  const [masterTrackingNumber, setMasterTrackingNumber] = useState('');
  const [notes, setNotes] = useState('');
  const [boxes, setBoxes] = useState<DraftBox[]>([makeBox()]);
  const [productSearch, setProductSearch] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const [localNotice, setLocalNotice] = useState<string | null>(null);
  const [partnerOpen, setPartnerOpen] = useState(false);
  const [partnerName, setPartnerName] = useState('');
  const [partnerCountry, setPartnerCountry] = useState('JP');
  const idempotencyKey = useRef(crypto.randomUUID());

  const filteredVariants = useMemo(() => {
    const term = productSearch.trim().toLowerCase();
    const variants = support.data?.variants ?? [];
    if (!term) return variants.slice(0, 80);
    return variants.filter((item) => `${item.productName} ${item.variantName} ${item.sku} ${item.productCode}`.toLowerCase().includes(term)).slice(0, 80);
  }, [productSearch, support.data]);

  const totals = useMemo(() => {
    let units = 0;
    let purchaseValuePen = 0;
    boxes.forEach((box) => box.items.forEach((item) => {
      units += Number(item.expectedQuantity || 0);
      purchaseValuePen += Number(item.expectedQuantity || 0) * Number(item.originalUnitCost || 0) * Number(item.exchangeRateToPen || 0);
    }));
    return { units, purchaseValuePen };
  }, [boxes]);

  const createPartner = useMutation({
    mutationFn: async () => {
      setLocalError(null);
      setLocalNotice(null);
      const name = partnerName.trim();
      if (!name) throw new Error('No se ingresó el nombre del proveedor.');

      const normalizedName = normalizePartnerName(name);
      const existing = support.data?.suppliers.find((supplier) => normalizePartnerName(supplier.name) === normalizedName);
      if (existing) return { id: existing.id, code: existing.code, reused: true };

      return createImportPartner({
        partnerTypeCode: 'SUPPLIER',
        legalName: name,
        tradeName: name,
        countryCode: partnerCountry.trim().toUpperCase() || null,
        contactName: null,
        phone: null,
        email: null,
        notes: null,
      });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['import-support'] });
      setSupplierPartnerId(result.id);
      setLocalNotice(result.reused
        ? 'Ese proveedor ya existía. Lo seleccionamos sin crear un duplicado.'
        : 'Proveedor creado y seleccionado correctamente.');
      setPartnerOpen(false);
      setPartnerName('');
      setPartnerCountry('JP');
    },
    onError: (error) => setLocalError(error instanceof Error ? error.message : 'No se pudo crear el proveedor.'),
  });

  const save = useMutation({
    mutationFn: () => {
      setLocalError(null);
      const payload: CreateImportInput = {
        supplierPartnerId: supplierPartnerId || null,
        transportMode,
        purchaseCurrencyCode,
        sunatExchangeRate: Number(sunatExchangeRate),
        purchaseDate: purchaseDate || null,
        estimatedArrivalDate: estimatedArrivalDate || null,
        masterTrackingNumber: masterTrackingNumber.trim() || null,
        notes: notes.trim() || null,
        boxes: boxes.map((box) => ({
          internationalOperatorId: box.internationalOperatorId || null,
          localOperatorId: box.localOperatorId || null,
          trackingNumber: box.trackingNumber.trim() || null,
          estimatedArrivalDate: box.estimatedArrivalDate || null,
          weightGrams: box.weightGrams > 0 ? Number(box.weightGrams) : null,
          notes: box.notes.trim() || null,
          items: box.items.map((item) => ({
            variantId: item.variantId,
            destinationWarehouseId: item.destinationWarehouseId,
            expectedQuantity: Number(item.expectedQuantity),
            originalUnitCost: Number(item.originalUnitCost),
            originalCurrencyCode: item.originalCurrencyCode,
            exchangeRateToPen: Number(item.exchangeRateToPen),
            notes: item.notes.trim() || null,
          })),
        })),
      };
      return createImport(payload, idempotencyKey.current);
    },
    onSuccess: (result) => navigate(`/importaciones/${result.id}`),
    onError: (error) => setLocalError(error instanceof Error ? error.message : 'No se pudo crear la importación.'),
  });

  function updateBox(boxId: string, patch: Partial<Omit<DraftBox, 'id' | 'items'>>) {
    setBoxes((current) => current.map((box) => box.id === boxId ? { ...box, ...patch } : box));
  }
  function updateItem(boxId: string, itemId: string, patch: Partial<Omit<DraftItem, 'id'>>) {
    setBoxes((current) => current.map((box) => box.id === boxId ? { ...box, items: box.items.map((item) => item.id === itemId ? { ...item, ...patch } : item) } : box));
  }
  function addBox() { setBoxes((current) => [...current, makeBox(purchaseCurrencyCode, sunatExchangeRate)]); }
  function removeBox(boxId: string) { setBoxes((current) => current.filter((box) => box.id !== boxId)); }
  function addItem(boxId: string) {
    const defaultWarehouse = support.data?.warehouses[0]?.id ?? '';
    setBoxes((current) => current.map((box) => box.id === boxId ? { ...box, items: [...box.items, { ...makeItem(purchaseCurrencyCode, sunatExchangeRate), destinationWarehouseId: defaultWarehouse }] } : box));
  }
  function removeItem(boxId: string, itemId: string) {
    setBoxes((current) => current.map((box) => box.id === boxId ? { ...box, items: box.items.filter((item) => item.id !== itemId) } : box));
  }

  function validate(): boolean {
    setLocalError(null);
    if (!purchaseCurrencyCode || sunatExchangeRate <= 0) { setLocalError('Selecciona la moneda e ingresa un tipo de cambio válido.'); return false; }
    if (boxes.length === 0) { setLocalError('Agrega al menos una caja.'); return false; }
    for (const [boxIndex, box] of boxes.entries()) {
      if (box.items.length === 0) { setLocalError(`La caja ${boxIndex + 1} no tiene productos.`); return false; }
      for (const item of box.items) {
        if (!item.variantId || !item.destinationWarehouseId) { setLocalError(`Completa producto y almacén en la caja ${boxIndex + 1}.`); return false; }
        if (item.expectedQuantity <= 0 || item.originalUnitCost < 0 || item.exchangeRateToPen <= 0) { setLocalError(`Revisa cantidades, costos y tipo de cambio en la caja ${boxIndex + 1}.`); return false; }
      }
    }
    return true;
  }

  return (
    <main className="page import-form-page">
      <button className="back-link" onClick={() => navigate('/importaciones')}><ArrowLeft size={17} /> Volver a importaciones</button>
      <PageHeader eyebrow="Compra internacional" title="Nueva importación" description="Registra la compra, sus cajas y los productos esperados antes de avanzar el flujo logístico." />
      {localError ? <div className="alert alert-error">{localError}</div> : null}
      {localNotice ? <div className="alert alert-success">{localNotice}</div> : null}
      {support.isError ? <div className="alert alert-error">{support.error instanceof Error ? support.error.message : 'No se pudieron cargar las opciones.'}</div> : null}

      <section className="import-form-layout">
        <div className="import-form-main">
          <Panel title="Datos generales" subtitle="La importación inicia en estado Cotización.">
            <div className="form-grid">
              <label className="field"><span>Proveedor</span><div className="field-inline"><select value={supplierPartnerId} onChange={(event) => setSupplierPartnerId(event.target.value)}><option value="">Sin proveedor por ahora</option>{support.data?.suppliers.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select><button type="button" className="button button-secondary" disabled={createPartner.isPending} onClick={() => { setPartnerOpen(true); setPartnerName(''); setPartnerCountry('JP'); }}><Plus size={16} /> Crear</button></div></label>
              <label className="field"><span>Medio de transporte</span><select value={transportMode} onChange={(event) => setTransportMode(event.target.value as ImportTransportMode)}><option value="AIR">Avión</option><option value="SEA">Barco</option><option value="OTHER">Otro</option></select></label>
              <label className="field"><span>Moneda de compra</span><select value={purchaseCurrencyCode} onChange={(event) => { const code = event.target.value; setPurchaseCurrencyCode(code); setBoxes((current) => current.map((box) => ({ ...box, items: box.items.map((item) => ({ ...item, originalCurrencyCode: code })) }))); }}>{support.data?.currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code} · {currency.name}</option>)}</select></label>
              <label className="field"><span>Tipo de cambio a soles</span><input type="number" min="0.000001" step="0.000001" value={sunatExchangeRate} onChange={(event) => setSunatExchangeRate(Number(event.target.value))} /></label>
              <label className="field"><span>Fecha de compra</span><input type="date" value={purchaseDate} onChange={(event) => setPurchaseDate(event.target.value)} /></label>
              <label className="field"><span>Llegada estimada</span><input type="date" value={estimatedArrivalDate} onChange={(event) => setEstimatedArrivalDate(event.target.value)} /></label>
              <label className="field"><span>Tracking maestro</span><input value={masterTrackingNumber} onChange={(event) => setMasterTrackingNumber(event.target.value)} placeholder="Opcional" /></label>
              <label className="field field-span-2"><span>Notas</span><textarea rows={3} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Orden externa, acuerdos, observaciones…" /></label>
            </div>
          </Panel>

          <Panel title="Cajas y productos" subtitle="Una importación puede contener varias cajas y cada caja varios productos.">
            <label className="search-field product-search-large"><Search size={18} /><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Filtrar productos por nombre, SKU o código…" /></label>
            <div className="import-box-editor-list">
              {boxes.map((box, boxIndex) => <article className="import-box-editor" key={box.id}>
                <header><div><span className="box-icon"><Boxes size={18} /></span><div><strong>Caja {boxIndex + 1}</strong><small>{box.items.length} producto(s)</small></div></div>{boxes.length > 1 ? <button type="button" className="icon-button danger-icon" onClick={() => removeBox(box.id)}><Trash2 size={17} /></button> : null}</header>
                <div className="form-grid compact-grid">
                  <label className="field"><span>Operador internacional</span><select value={box.internationalOperatorId} onChange={(event) => updateBox(box.id, { internationalOperatorId: event.target.value })}><option value="">Sin asignar</option>{support.data?.internationalOperators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label className="field"><span>Operador local</span><select value={box.localOperatorId} onChange={(event) => updateBox(box.id, { localOperatorId: event.target.value })}><option value="">Sin asignar</option>{support.data?.localOperators.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                  <label className="field"><span>Tracking de caja</span><input value={box.trackingNumber} onChange={(event) => updateBox(box.id, { trackingNumber: event.target.value })} /></label>
                  <label className="field"><span>Llegada estimada</span><input type="date" value={box.estimatedArrivalDate} onChange={(event) => updateBox(box.id, { estimatedArrivalDate: event.target.value })} /></label>
                  <label className="field"><span>Peso en gramos</span><input type="number" min="0" step="1" value={box.weightGrams} onChange={(event) => updateBox(box.id, { weightGrams: Number(event.target.value) })} /></label>
                  <label className="field"><span>Notas de caja</span><input value={box.notes} onChange={(event) => updateBox(box.id, { notes: event.target.value })} /></label>
                </div>
                <div className="import-item-editor-list">
                  {box.items.map((item, itemIndex) => <div className="import-item-editor" key={item.id}>
                    <label className="field import-product-field"><span>Producto {itemIndex + 1}</span><select value={item.variantId} onChange={(event) => updateItem(box.id, item.id, { variantId: event.target.value })}><option value="">Seleccionar producto</option>{filteredVariants.map((variant) => <option key={variant.id} value={variant.id}>{variant.productName} · {variant.variantName} · {variant.sku}</option>)}</select></label>
                    <label className="field"><span>Almacén destino</span><select value={item.destinationWarehouseId} onChange={(event) => updateItem(box.id, item.id, { destinationWarehouseId: event.target.value })}><option value="">Seleccionar</option>{support.data?.warehouses.map((warehouse) => <option key={warehouse.id} value={warehouse.id}>{warehouse.name}</option>)}</select></label>
                    <label className="field"><span>Cantidad</span><input type="number" min="1" value={item.expectedQuantity} onChange={(event) => updateItem(box.id, item.id, { expectedQuantity: Number(event.target.value) })} /></label>
                    <label className="field"><span>Costo unitario</span><input type="number" min="0" step="0.0001" value={item.originalUnitCost} onChange={(event) => updateItem(box.id, item.id, { originalUnitCost: Number(event.target.value) })} /></label>
                    <label className="field"><span>Moneda</span><select value={item.originalCurrencyCode} onChange={(event) => updateItem(box.id, item.id, { originalCurrencyCode: event.target.value })}>{support.data?.currencies.map((currency) => <option key={currency.code} value={currency.code}>{currency.code}</option>)}</select></label>
                    <label className="field"><span>TC a PEN</span><input type="number" min="0.000001" step="0.000001" value={item.exchangeRateToPen} onChange={(event) => updateItem(box.id, item.id, { exchangeRateToPen: Number(event.target.value) })} /></label>
                    <button type="button" className="icon-button danger-icon import-item-remove" disabled={box.items.length === 1} onClick={() => removeItem(box.id, item.id)}><Trash2 size={17} /></button>
                  </div>)}
                </div>
                <button type="button" className="button button-secondary" onClick={() => addItem(box.id)}><Plus size={16} /> Agregar producto a esta caja</button>
              </article>)}
            </div>
            <button type="button" className="button button-secondary" onClick={addBox}><Plus size={16} /> Agregar otra caja</button>
          </Panel>
        </div>

        <aside className="import-form-summary">
          <Panel title="Resumen"><div className="summary-list"><div><span>Cajas</span><strong>{boxes.length}</strong></div><div><span>Productos</span><strong>{boxes.reduce((sum, box) => sum + box.items.length, 0)}</strong></div><div><span>Unidades esperadas</span><strong>{totals.units}</strong></div><div><span>Valor de compra estimado</span><strong>{money(totals.purchaseValuePen)}</strong></div><div><span>Transporte</span><strong>{transportMode === 'AIR' ? 'Avión' : transportMode === 'SEA' ? 'Barco' : 'Otro'}</strong></div></div><button className="button button-primary button-full" disabled={save.isPending || support.isLoading} onClick={() => { if (validate()) save.mutate(); }}>{save.isPending ? 'Creando…' : 'Crear importación'}</button></Panel>
        </aside>
      </section>
      {partnerOpen ? <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setPartnerOpen(false); }}><form className="modal-card" role="dialog" aria-modal="true" aria-labelledby="new-supplier-title" onSubmit={(event) => { event.preventDefault(); createPartner.mutate(); }}><div className="modal-header"><div><small>Catálogo de proveedores</small><h2 id="new-supplier-title">Nuevo proveedor o tienda</h2><p>Si ya existe un nombre equivalente, el sistema seleccionará el registro existente.</p></div><button className="icon-button" type="button" aria-label="Cerrar" onClick={() => setPartnerOpen(false)}><X size={18} /></button></div><label className="field"><span>Nombre comercial *</span><input value={partnerName} onChange={(event) => setPartnerName(event.target.value)} minLength={2} maxLength={180} required autoFocus /></label><label className="field"><span>País (ISO de 2 letras)</span><input value={partnerCountry} onChange={(event) => setPartnerCountry(event.target.value.replace(/[^a-z]/gi, '').toUpperCase().slice(0, 2))} pattern="[A-Z]{2}" maxLength={2} placeholder="JP" /></label>{createPartner.isError ? <div className="alert alert-error">{createPartner.error instanceof Error ? createPartner.error.message : 'No se pudo crear el proveedor.'}</div> : null}<div className="modal-actions"><button className="button button-secondary" type="button" onClick={() => setPartnerOpen(false)}>Volver</button><button className="button button-primary" type="submit" disabled={createPartner.isPending}>{createPartner.isPending ? 'Creando…' : 'Crear y seleccionar'}</button></div></form></div> : null}
    </main>
  );
}
