import { useMutation, useQuery } from '@tanstack/react-query';
import type { InventoryRow } from '@yukimi/shared';
import { ArrowLeft, ArrowRight, Check, Search, Trash2, UserPlus } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import { getClient, getClients } from '../features/clients/clients-api';
import { getInventory } from '../features/products/products-api';
import { createSale, getSaleSupportData } from '../features/sales/sales-api';

interface DraftLine {
  row: InventoryRow;
  quantity: number;
  finalUnitPrice: number;
  discountTypeCode: string;
  discountReason: string;
}

const steps = ['Cliente', 'Productos', 'Condiciones', 'Confirmación'];
const money = (value: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);

export function NewSalePage() {
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [clientSearch, setClientSearch] = useState('');
  const [selectedClientId, setSelectedClientId] = useState<string | null>(null);
  const [productSearch, setProductSearch] = useState('');
  const [lines, setLines] = useState<DraftLine[]>([]);
  const [salesChannelCode, setSalesChannelCode] = useState('WHATSAPP');
  const [deliveryMode, setDeliveryMode] = useState<'PENDING' | 'ACCUMULATED'>('ACCUMULATED');
  const [dueDate, setDueDate] = useState('');
  const [negotiatedMinimumDeposit, setNegotiatedMinimumDeposit] = useState('');
  const [negotiatedDepositReason, setNegotiatedDepositReason] = useState('');
  const [notes, setNotes] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);
  const idempotencyKey = useRef(crypto.randomUUID());

  const clients = useQuery({ queryKey: ['sale-client-search', clientSearch], queryFn: () => getClients({ search: clientSearch, filter: 'ACTIVE', page: 1, pageSize: 20 }) });
  const clientDetail = useQuery({ queryKey: ['client', selectedClientId], queryFn: () => getClient(selectedClientId as string), enabled: Boolean(selectedClientId) });
  const inventory = useQuery({ queryKey: ['sale-product-search', productSearch], queryFn: () => getInventory({ search: productSearch, includeVirtual: false }) });
  const support = useQuery({ queryKey: ['sale-support'], queryFn: getSaleSupportData });

  useEffect(() => {
    if (!salesChannelCode && support.data?.salesChannels[0]) setSalesChannelCode(support.data.salesChannels[0].code);
  }, [salesChannelCode, support.data]);

  const subtotal = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.row.salePrice, 0), [lines]);
  const total = useMemo(() => lines.reduce((sum, line) => sum + line.quantity * line.finalUnitPrice, 0), [lines]);
  const discount = subtotal - total;

  const save = useMutation({
    mutationFn: () => createSale({
      clientId: selectedClientId as string,
      salesChannelCode,
      currencyCode: 'PEN',
      deliveryMode,
      dueAt: dueDate ? `${dueDate}T23:59:59-05:00` : null,
      negotiatedMinimumDepositAmount: clientDetail.data?.isVip ? Number(negotiatedMinimumDeposit) : null,
      negotiatedMinimumDepositReason: clientDetail.data?.isVip ? negotiatedDepositReason.trim() : null,
      notes: notes.trim() || null,
      items: lines.map((line) => ({
        variantId: line.row.variantId,
        warehouseId: line.row.warehouseId,
        quantity: line.quantity,
        originalUnitPrice: line.row.salePrice,
        finalUnitPrice: line.finalUnitPrice,
        discountTypeCode: line.finalUnitPrice < line.row.salePrice ? line.discountTypeCode : null,
        discountReason: line.finalUnitPrice < line.row.salePrice ? line.discountReason : null,
        notes: null,
      })),
    }, idempotencyKey.current),
    onSuccess: (result) => navigate(`/ventas/${result.id}`),
  });

  function addProduct(row: InventoryRow) {
    setLocalError(null);
    if (row.availableQuantity <= 0) return;
    if (lines.some((line) => line.row.variantId === row.variantId && line.row.warehouseId === row.warehouseId)) {
      setLocalError('Esa variante ya fue agregada desde ese almacén. Modifica su cantidad en la lista.');
      return;
    }
    setLines((current) => [...current, { row, quantity: 1, finalUnitPrice: row.salePrice, discountTypeCode: 'MANUAL', discountReason: '' }]);
  }

  function updateLine(index: number, patch: Partial<Omit<DraftLine, 'row'>>) {
    setLines((current) => current.map((line, lineIndex) => lineIndex === index ? { ...line, ...patch } : line));
  }

  function validateStep(): boolean {
    setLocalError(null);
    if (step === 1 && !selectedClientId) { setLocalError('Selecciona un cliente para continuar.'); return false; }
    if (step === 2) {
      if (lines.length === 0) { setLocalError('Agrega al menos un producto.'); return false; }
      const invalid = lines.find((line) => line.quantity < 1 || line.quantity > line.row.availableQuantity);
      if (invalid) { setLocalError(`La cantidad de ${invalid.row.productName} supera el stock disponible.`); return false; }
      const badDiscount = lines.find((line) => line.finalUnitPrice < line.row.salePrice && (!line.discountTypeCode || line.discountReason.trim().length < 3));
      if (badDiscount) { setLocalError('Todo descuento requiere un tipo y un motivo de al menos 3 caracteres.'); return false; }
    }
    if (step === 3) {
      if (!salesChannelCode) { setLocalError('Selecciona el canal de venta.'); return false; }
      if (clientDetail.data?.isVip) {
        const minimum = Number(negotiatedMinimumDeposit);
        if (negotiatedMinimumDeposit === '' || !Number.isFinite(minimum) || minimum < 0) {
          setLocalError('Registra el adelanto mínimo negociado para esta venta VIP.');
          return false;
        }
        if (minimum > total) {
          setLocalError('El adelanto mínimo no puede superar el total de la venta.');
          return false;
        }
        if (negotiatedDepositReason.trim().length < 3) {
          setLocalError('Explica el acuerdo de separación de esta venta VIP.');
          return false;
        }
      }
    }
    return true;
  }

  function next() { if (validateStep()) setStep((value) => Math.min(4, value + 1)); }

  return (
    <main className="page sale-wizard-page">
      <button className="back-link" onClick={() => navigate('/ventas')}><ArrowLeft size={17} /> Volver a ventas</button>
      <PageHeader eyebrow="Registro guiado" title="Nueva venta o reserva" description="Al confirmar, el stock se mueve de disponible a reservado de forma atómica." />
      <div className="stepper">{steps.map((label, index) => { const number = index + 1; return <button key={label} className={`${number === step ? 'active' : ''} ${number < step ? 'complete' : ''}`} onClick={() => number < step && setStep(number)}><span>{number < step ? <Check size={15} /> : number}</span><b>{label}</b></button>; })}</div>
      {localError ? <div className="alert alert-error">{localError}</div> : null}
      {save.isError ? <div className="alert alert-error">{save.error instanceof Error ? save.error.message : 'No se pudo crear la venta.'}</div> : null}

      <section className="wizard-layout">
        <div className="wizard-main">
          {step === 1 ? <Panel title="Selecciona el cliente" subtitle="Solo se muestran clientes activos.">
            <div className="customer-search"><label className="search-field"><Search size={18} /><input value={clientSearch} onChange={(event) => setClientSearch(event.target.value)} placeholder="Buscar por nombre, teléfono, DNI o código…" /></label><button className="button button-secondary" onClick={() => navigate('/clientes/nuevo')}><UserPlus size={17} /> Crear cliente</button></div>
            <div className="selection-list">{clients.data?.items.map((client) => <button key={client.id} className={`selection-row ${selectedClientId === client.id ? 'selected' : ''}`} onClick={() => setSelectedClientId(client.id)}><span className="avatar">{client.fullName.slice(0, 1).toUpperCase()}</span><span><strong>{client.fullName}</strong><small>{client.code} · {client.phone ?? 'Sin celular'} · Saldo {money(client.balanceAmount)}</small></span>{client.isVip ? <StatusBadge tone="primary">VIP</StatusBadge> : <StatusBadge>{client.overdueSales ? `${client.overdueSales} vencida(s)` : 'Regular'}</StatusBadge>}</button>)}</div>
            {clientDetail.data ? <div className="info-grid"><div><span>Saldo pendiente</span><strong>{money(clientDetail.data.stats.balanceAmount)}</strong></div><div><span>Plazo</span><strong>{clientDetail.data.vipProfile?.paymentTermDays ?? support.data?.defaultPaymentTermDays ?? 14} días</strong></div><div><span>Separación VIP</span><strong>{clientDetail.data.isVip ? 'Se acuerda por venta' : 'Condición regular'}</strong></div></div> : null}
          </Panel> : null}

          {step === 2 ? <Panel title="Agrega productos" subtitle="Cada fila representa una variante y un almacén específicos.">
            <label className="search-field product-search-large"><Search size={18} /><input value={productSearch} onChange={(event) => setProductSearch(event.target.value)} placeholder="Buscar por nombre, código, SKU o franquicia…" /></label>
            <div className="sale-product-results">{inventory.data?.items.filter((row) => row.availableQuantity > 0).slice(0, 30).map((row) => <button key={`${row.variantId}:${row.warehouseId}`} onClick={() => addProduct(row)}><span><strong>{row.productName}</strong><small>{row.variantName} · {row.sku}</small></span><span><strong>{money(row.salePrice)}</strong><small>{row.warehouseName}: {row.availableQuantity} disponibles</small></span></button>)}</div>
            <div className="selected-product-list">
              {lines.map((line, index) => (
                <div className="selected-product-row sale-line-editor" key={`${line.row.variantId}:${line.row.warehouseId}`}>
                  <div className="selected-product-copy"><strong>{line.row.productName}</strong><small>{line.row.variantName} · {line.row.sku}</small><span>{line.row.warehouseName} · disponible {line.row.availableQuantity}</span></div>
                  <label>Cantidad<input type="number" min="1" max={line.row.availableQuantity} value={line.quantity} onChange={(event) => updateLine(index, { quantity: Number(event.target.value) })} /></label>
                  <label>Precio final<input type="number" min="0" max={line.row.salePrice} step="0.01" value={line.finalUnitPrice} onChange={(event) => updateLine(index, { finalUnitPrice: Number(event.target.value) })} /></label>
                  {line.finalUnitPrice < line.row.salePrice ? (
                    <>
                      <label>Tipo<select value={line.discountTypeCode} onChange={(event) => updateLine(index, { discountTypeCode: event.target.value })}>{support.data?.discountTypes.map((type) => <option key={type.code} value={type.code}>{type.name}</option>)}</select></label>
                      <label className="sale-discount-reason">Motivo<input value={line.discountReason} onChange={(event) => updateLine(index, { discountReason: event.target.value })} placeholder="Motivo obligatorio" /></label>
                    </>
                  ) : null}
                  <button className="icon-button danger-icon" aria-label={`Quitar ${line.row.productName}`} onClick={() => setLines((current) => current.filter((_, i) => i !== index))}><Trash2 size={17} /></button>
                  {line.row.currentUnitCostPen != null && line.finalUnitPrice < line.row.currentUnitCostPen ? <div className="below-cost-warning">El precio queda por debajo del costo vigente de {money(line.row.currentUnitCostPen)}. Puedes continuar, pero el motivo del descuento quedará auditado.</div> : null}
                </div>
              ))}
            </div>
          </Panel> : null}

          {step === 3 ? <Panel title="Condiciones de la reserva" subtitle="Define el vencimiento y el acuerdo comercial antes de reservar el stock.">
            <div className="form-grid"><label className="field"><span>Canal de venta</span><select value={salesChannelCode} onChange={(event) => setSalesChannelCode(event.target.value)}>{support.data?.salesChannels.map((channel) => <option key={channel.code} value={channel.code}>{channel.name}</option>)}</select></label><label className="field"><span>Fecha de vencimiento opcional</span><input type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} /><small>Vacía: se aplicará el plazo normal o VIP.</small></label></div>
            {clientDetail.data?.isVip ? <div className="vip-sale-terms"><div className="alert alert-info">Para clientes VIP, el adelanto mínimo se negocia según los productos de esta venta. Escribe 0 si acordaron separar sin adelanto.</div><div className="form-grid form-grid-2"><label className="field"><span>Adelanto mínimo acordado (S/) *</span><input type="number" min="0" max={total} step="0.01" value={negotiatedMinimumDeposit} onChange={(event) => setNegotiatedMinimumDeposit(event.target.value)} /></label><label className="field"><span>Motivo o criterio del acuerdo *</span><input value={negotiatedDepositReason} onChange={(event) => setNegotiatedDepositReason(event.target.value)} placeholder="Margen, producto, historial…" /></label></div></div> : null}
            <div className="choice-grid"><label className={`choice-card ${deliveryMode === 'ACCUMULATED' ? 'selected' : ''}`}><input type="radio" checked={deliveryMode === 'ACCUMULATED'} onChange={() => setDeliveryMode('ACCUMULATED')} /><span><strong>Acumula almacén</strong><small>La mercadería queda reservada mientras el cliente sigue comprando.</small></span></label><label className={`choice-card ${deliveryMode === 'PENDING' ? 'selected' : ''}`}><input type="radio" checked={deliveryMode === 'PENDING'} onChange={() => setDeliveryMode('PENDING')} /><span><strong>Entrega pendiente</strong><small>La agencia o el método de entrega se podrá registrar después.</small></span></label></div>
            <label className="field"><span>Notas internas</span><textarea value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="Acuerdos, referencias o información interna…" /></label>
          </Panel> : null}

          {step === 4 ? <Panel title="Revisa antes de confirmar" subtitle="La operación se ejecuta en una sola transacción: venta, líneas y reserva de stock."><div className="review-sections"><div><span>Cliente</span><strong>{clientDetail.data?.fullName ?? '—'}{clientDetail.data?.isVip ? ' · VIP' : ''}</strong></div><div><span>Productos</span><strong>{lines.reduce((sum, line) => sum + line.quantity, 0)} unidades en {new Set(lines.map((line) => line.row.warehouseId)).size} almacén(es)</strong></div><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Descuentos</span><strong>{money(discount)}</strong></div><div><span>Total</span><strong>{money(total)}</strong></div><div><span>Entrega</span><strong>{deliveryMode === 'ACCUMULATED' ? 'Acumula almacén' : 'Pendiente de definir'}</strong></div>{clientDetail.data?.isVip ? <div><span>Adelanto mínimo acordado</span><strong>{money(Number(negotiatedMinimumDeposit) || 0)}</strong></div> : null}</div><div className="alert alert-info">Después de reservar podrás registrar uno o varios medios de pago y emitir el comprobante correspondiente desde el detalle de la venta.</div></Panel> : null}
        </div>

        <aside className="sale-summary panel"><div className="panel-heading"><div><h2>Resumen</h2><p>Reserva de stock</p></div><StatusBadge tone={step === 4 ? 'primary' : 'neutral'}>{step === 4 ? 'Lista' : 'Borrador local'}</StatusBadge></div><div className="summary-lines"><div><span>Subtotal</span><strong>{money(subtotal)}</strong></div><div><span>Descuentos</span><strong>− {money(discount)}</strong></div><div><span>Unidades</span><strong>{lines.reduce((sum, line) => sum + line.quantity, 0)}</strong></div></div><div className="summary-total"><span>Total</span><strong>{money(total)}</strong></div><div className="wizard-actions"><button className="button button-secondary" disabled={step === 1 || save.isPending} onClick={() => setStep((value) => Math.max(1, value - 1))}>Anterior</button>{step < 4 ? <button className="button button-primary" onClick={next}>Continuar <ArrowRight size={17} /></button> : <button className="button button-primary" disabled={save.isPending} onClick={() => { if (validateStep()) save.mutate(); }}>{save.isPending ? 'Confirmando…' : <><Check size={17} /> Confirmar y reservar</>}</button>}</div></aside>
      </section>
    </main>
  );
}
