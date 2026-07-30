import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Ban, Check, CreditCard, FileText, Plus, ReceiptText, RotateCcw, ShieldAlert, Trash2, Upload, X } from 'lucide-react';
import { Panel } from '../../components/ui/panel';
import { StatusBadge } from '../../components/ui/status-badge';
import {
  annulReceipt,
  calculateLatePenalty,
  confirmPayment,
  createCreditNote,
  createPayment,
  createReceipt,
  getPaymentSupportData,
  getSaleFinancials,
  rejectPayment,
  reversePayment,
  waivePenalty,
} from './payments-api';
import { uploadPaymentProof, uploadReceiptFile } from './upload-payment-files';

const money = (value: number) => new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
const dateTime = (value: string | null) => value ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : 'Sin fecha';
const today = () => new Date().toISOString().slice(0, 10);
const nowLocalInput = () => {
  const date = new Date();
  date.setMinutes(date.getMinutes() - date.getTimezoneOffset());
  return date.toISOString().slice(0, 16);
};

interface PaymentPartForm {
  paymentMethodCode: string;
  financialAccountId: string;
  amount: string;
  referenceNumber: string;
}

export function SalePaymentsSection({ saleId, closed }: { saleId: string; closed: boolean }) {
  const queryClient = useQueryClient();
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receivedAt, setReceivedAt] = useState(nowLocalInput());
  const [paymentNotes, setPaymentNotes] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  const [parts, setParts] = useState<PaymentPartForm[]>([{ paymentMethodCode: '', financialAccountId: '', amount: '', referenceNumber: '' }]);
  const [receiptSeries, setReceiptSeries] = useState('B001');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptDate, setReceiptDate] = useState(today());
  const [receiptPaymentId, setReceiptPaymentId] = useState('');
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptKey, setReceiptKey] = useState(() => crypto.randomUUID());
  const [localWarning, setLocalWarning] = useState<string | null>(null);

  const financials = useQuery({ queryKey: ['sale-financials', saleId], queryFn: () => getSaleFinancials(saleId) });
  const support = useQuery({ queryKey: ['payment-support'], queryFn: getPaymentSupportData });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sale-financials', saleId] }),
      queryClient.invalidateQueries({ queryKey: ['sale', saleId] }),
      queryClient.invalidateQueries({ queryKey: ['sales'] }),
    ]);
  };

  const confirmedUnreceipted = useMemo(
    () => financials.data?.payments.filter((payment) => payment.stateCode === 'CONFIRMED' && payment.unreceiptedAmount > 0) ?? [],
    [financials.data],
  );

  const paymentMutation = useMutation({
    mutationFn: async () => {
      setLocalWarning(null);
      const normalizedParts = parts.map((part) => ({
        paymentMethodCode: part.paymentMethodCode,
        financialAccountId: part.financialAccountId,
        amount: Number(part.amount),
        referenceNumber: part.referenceNumber.trim() || null,
      }));
      const result = await createPayment(saleId, {
        receivedAt: new Date(receivedAt).toISOString(),
        notes: paymentNotes.trim() || null,
        parts: normalizedParts,
      }, paymentKey);
      if (proof) {
        try { await uploadPaymentProof(result.id, proof); }
        catch (error) {
          setLocalWarning(`El pago ${result.code} quedó pendiente, pero la constancia no pudo subirse: ${error instanceof Error ? error.message : 'error desconocido'}`);
        }
      }
      return result;
    },
    onSuccess: async () => {
      await invalidate();
      setShowPaymentForm(false);
      setReceivedAt(nowLocalInput());
      setPaymentNotes('');
      setProof(null);
      setParts([{ paymentMethodCode: '', financialAccountId: '', amount: '', referenceNumber: '' }]);
      setPaymentKey(crypto.randomUUID());
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({ type, id }: { type: 'CONFIRM' | 'REJECT' | 'REVERSE' | 'WAIVE' | 'ANNUL'; id: string }) => {
      if (type === 'CONFIRM') return confirmPayment(id);
      const promptMessage = type === 'REJECT' ? 'Motivo del rechazo:' : type === 'REVERSE' ? 'Motivo de la reversión:' : type === 'WAIVE' ? 'Motivo de la exoneración:' : 'Motivo de la anulación:';
      const reason = window.prompt(promptMessage)?.trim();
      if (!reason) throw new Error('La operación fue cancelada.');
      if (type === 'REJECT') return rejectPayment(id, reason);
      if (type === 'REVERSE') return reversePayment(id, reason);
      if (type === 'WAIVE') return waivePenalty(id, reason);
      return annulReceipt(id, reason);
    },
    onSuccess: invalidate,
  });

  const penaltyMutation = useMutation({ mutationFn: () => calculateLatePenalty(saleId), onSuccess: invalidate });

  const receiptMutation = useMutation({
    mutationFn: async () => {
      const payment = confirmedUnreceipted.find((item) => item.id === receiptPaymentId);
      if (!payment) throw new Error('Selecciona un pago confirmado con importe pendiente de boleta.');
      const amount = Number(receiptAmount);
      const result = await createReceipt(saleId, {
        receiptType: 'BOLETA', series: receiptSeries, receiptNumber,
        issueDate: receiptDate, notes: null,
        allocations: [{ paymentId: payment.id, amount }],
      }, receiptKey);
      if (receiptFile) {
        try { await uploadReceiptFile(result.id, receiptFile); }
        catch (error) {
          setLocalWarning(`La boleta quedó registrada, pero el archivo no pudo subirse: ${error instanceof Error ? error.message : 'error desconocido'}`);
        }
      }
      return result;
    },
    onSuccess: async () => {
      await invalidate();
      setShowReceiptForm(false);
      setReceiptNumber('');
      setReceiptPaymentId('');
      setReceiptAmount('');
      setReceiptFile(null);
      setReceiptKey(crypto.randomUUID());
    },
  });

  const creditNoteMutation = useMutation({
    mutationFn: async ({ receiptId, maxAmount }: { receiptId: string; maxAmount: number }) => {
      const series = window.prompt('Serie de la nota de crédito:', 'BC01')?.trim();
      const noteNumber = window.prompt('Número de la nota de crédito:')?.trim();
      const amountText = window.prompt('Importe de la nota de crédito:', String(maxAmount));
      const reason = window.prompt('Motivo de la nota de crédito:')?.trim();
      if (!series || !noteNumber || !amountText || !reason) throw new Error('La nota de crédito fue cancelada.');
      return createCreditNote(receiptId, { series, noteNumber, issueDate: today(), amount: Number(amountText), reason });
    },
    onSuccess: invalidate,
  });

  const mutationError = paymentMutation.error ?? actionMutation.error ?? penaltyMutation.error ?? receiptMutation.error ?? creditNoteMutation.error;

  if (financials.isLoading || support.isLoading) return <Panel title="Pagos y boletas"><div className="empty-state">Cargando información financiera…</div></Panel>;
  if (financials.isError || support.isError || !financials.data || !support.data) {
    const error = financials.error ?? support.error;
    return <Panel title="Pagos y boletas"><div className="alert alert-error">{error instanceof Error ? error.message : 'No se pudo cargar la información financiera.'}</div></Panel>;
  }

  const data = financials.data;
  const options = support.data;
  const activePenalty = data.penalties.find((penalty) => penalty.status === 'ACTIVE');

  return (
    <div className="sale-financial-stack">
      {localWarning ? <div className="alert alert-warning">{localWarning}</div> : null}
      {mutationError ? <div className="alert alert-error">{mutationError instanceof Error ? mutationError.message : 'No se pudo completar la operación.'}</div> : null}

      <Panel title="Pagos" subtitle="Los pagos se registran pendientes y recién afectan el saldo cuando se confirman." action={!closed ? <button className="button button-primary button-compact" onClick={() => setShowPaymentForm((value) => !value)}><Plus size={16} /> Registrar pago</button> : undefined}>
        {showPaymentForm ? (
          <form className="payment-form" onSubmit={(event) => { event.preventDefault(); paymentMutation.mutate(); }}>
            <div className="form-grid form-grid-2">
              <label className="field"><span>Fecha y hora recibida</span><input type="datetime-local" value={receivedAt} onChange={(event) => setReceivedAt(event.target.value)} required /></label>
              <label className="field"><span>Constancia</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setProof(event.target.files?.[0] ?? null)} /></label>
            </div>
            <div className="payment-parts">
              {parts.map((part, index) => (
                <div className="payment-part-row" key={index}>
                  <label className="field"><span>Medio</span><select value={part.paymentMethodCode} onChange={(event) => setParts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, paymentMethodCode: event.target.value } : item))} required><option value="">Selecciona</option>{options.paymentMethods.map((method) => <option key={method.code} value={method.code}>{method.name}{method.requiresProof ? ' · constancia' : ''}</option>)}</select></label>
                  <label className="field"><span>Cuenta de ingreso</span><select value={part.financialAccountId} onChange={(event) => setParts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, financialAccountId: event.target.value } : item))} required><option value="">Selecciona</option>{options.financialAccounts.map((account) => <option key={account.id} value={account.id}>{account.name}</option>)}</select></label>
                  <label className="field"><span>Importe</span><input type="number" min="0.01" step="0.01" value={part.amount} onChange={(event) => setParts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, amount: event.target.value } : item))} required /></label>
                  <label className="field"><span>Operación o referencia</span><input value={part.referenceNumber} onChange={(event) => setParts((current) => current.map((item, itemIndex) => itemIndex === index ? { ...item, referenceNumber: event.target.value } : item))} /></label>
                  {parts.length > 1 ? <button type="button" className="icon-button danger" aria-label="Quitar medio" onClick={() => setParts((current) => current.filter((_, itemIndex) => itemIndex !== index))}><Trash2 size={16} /></button> : null}
                </div>
              ))}
            </div>
            <div className="inline-actions"><button type="button" className="button button-secondary button-compact" onClick={() => setParts((current) => [...current, { paymentMethodCode: '', financialAccountId: '', amount: '', referenceNumber: '' }])}><CreditCard size={16} /> Agregar medio</button></div>
            <label className="field"><span>Notas</span><textarea rows={2} value={paymentNotes} onChange={(event) => setPaymentNotes(event.target.value)} /></label>
            <div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setShowPaymentForm(false)}>Cancelar</button><button className="button button-primary" disabled={paymentMutation.isPending}>{paymentMutation.isPending ? 'Registrando…' : 'Guardar pago pendiente'}</button></div>
          </form>
        ) : null}

        {data.payments.length === 0 ? <div className="empty-state"><strong>Sin pagos registrados</strong><p>El saldo pendiente es {money(data.balanceAmount)}.</p></div> : <div className="payment-card-list">{data.payments.map((payment) => (
          <article className="payment-card" key={payment.id}>
            <div className="payment-card-main"><div className="payment-card-head"><div><strong>{payment.code}</strong><small>{dateTime(payment.receivedAt)} · {payment.createdByName ?? 'Administradora'}</small></div><StatusBadge tone={payment.stateCode === 'CONFIRMED' ? 'success' : payment.stateCode === 'PENDING' ? 'warning' : 'danger'}>{payment.stateCode}</StatusBadge></div><div className="payment-part-summary">{payment.parts.map((part) => <span key={part.id}>{part.paymentMethodName} → {part.financialAccountName}: <b>{money(part.amount)}</b>{part.referenceNumber ? ` · ${part.referenceNumber}` : ''}</span>)}</div>{payment.proofs.map((file) => <a className="file-link" key={file.id} href={file.signedUrl ?? '#'} target="_blank" rel="noreferrer"><Upload size={14} /> {file.originalFilename}</a>)}{payment.rejectionReason ? <p className="text-danger">Rechazo: {payment.rejectionReason}</p> : null}{payment.reversalReason ? <p className="text-danger">Reversión: {payment.reversalReason}</p> : null}</div>
            <div className="payment-card-amount"><strong>{money(payment.declaredAmount)}</strong><small>Sin boleta: {money(payment.unreceiptedAmount)}</small>{payment.stateCode === 'PENDING' ? <div className="inline-actions"><button className="icon-button success" title="Confirmar" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ type: 'CONFIRM', id: payment.id })}><Check size={16} /></button><button className="icon-button danger" title="Rechazar" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ type: 'REJECT', id: payment.id })}><X size={16} /></button></div> : payment.stateCode === 'CONFIRMED' ? <button className="button button-secondary button-compact" disabled={actionMutation.isPending} onClick={() => actionMutation.mutate({ type: 'REVERSE', id: payment.id })}><RotateCcw size={15} /> Revertir</button> : null}</div>
          </article>
        ))}</div>}
      </Panel>

      <Panel title="Boletas y notas de crédito" subtitle="La emisión se realiza manualmente en SUNAT y aquí se registra el número y archivo." action={confirmedUnreceipted.length > 0 ? <button className="button button-primary button-compact" onClick={() => setShowReceiptForm((value) => !value)}><ReceiptText size={16} /> Registrar boleta</button> : undefined}>
        {showReceiptForm ? <form className="receipt-form" onSubmit={(event) => { event.preventDefault(); receiptMutation.mutate(); }}><div className="form-grid form-grid-3"><label className="field"><span>Serie</span><input value={receiptSeries} onChange={(event) => setReceiptSeries(event.target.value.toUpperCase())} required /></label><label className="field"><span>Número</span><input value={receiptNumber} onChange={(event) => setReceiptNumber(event.target.value)} required /></label><label className="field"><span>Fecha de emisión</span><input type="date" value={receiptDate} onChange={(event) => setReceiptDate(event.target.value)} required /></label></div><div className="form-grid form-grid-2"><label className="field"><span>Pago confirmado</span><select value={receiptPaymentId} onChange={(event) => { const id = event.target.value; setReceiptPaymentId(id); const selected = confirmedUnreceipted.find((payment) => payment.id === id); setReceiptAmount(selected ? String(selected.unreceiptedAmount) : ''); }} required><option value="">Selecciona</option>{confirmedUnreceipted.map((payment) => <option key={payment.id} value={payment.id}>{payment.code} · disponible {money(payment.unreceiptedAmount)}</option>)}</select></label><label className="field"><span>Importe asignado</span><input type="number" min="0.01" step="0.01" value={receiptAmount} onChange={(event) => setReceiptAmount(event.target.value)} required /></label></div><label className="field"><span>Archivo de la boleta</span><input type="file" accept="image/jpeg,image/png,image/webp,application/pdf" onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)} /></label><div className="form-actions"><button type="button" className="button button-secondary" onClick={() => setShowReceiptForm(false)}>Cancelar</button><button className="button button-primary" disabled={receiptMutation.isPending}>{receiptMutation.isPending ? 'Registrando…' : 'Registrar boleta'}</button></div></form> : null}
        {data.receipts.length === 0 ? <div className="empty-state"><strong>Sin boletas registradas</strong><p>Cuando confirmes un pago aparecerá disponible para emitir su boleta.</p></div> : <div className="receipt-list">{data.receipts.map((receipt) => <article className="receipt-card" key={receipt.id}><div><div className="receipt-title"><FileText size={17} /><strong>{receipt.fullNumber ?? receipt.code}</strong><StatusBadge tone={receipt.stateCode === 'ISSUED' ? 'success' : receipt.stateCode === 'CREDIT_NOTE' ? 'warning' : 'danger'}>{receipt.stateCode}</StatusBadge></div><small>{receipt.issueDate ?? 'Sin fecha'} · {money(receipt.amount)}</small>{receipt.allocations.map((allocation) => <span key={allocation.paymentId}>{allocation.paymentCode}: {money(allocation.allocatedAmount)}</span>)}{receipt.files.map((file) => <a className="file-link" href={file.signedUrl ?? '#'} target="_blank" rel="noreferrer" key={file.id}>{file.originalFilename}</a>)}{receipt.annulmentReason ? <p>Anulación: {receipt.annulmentReason}</p> : null}{receipt.creditNotes.map((note) => <p className="credit-note-line" key={note.id}>Nota {note.fullNumber ?? note.code}: {money(note.amount)} · {note.reason}</p>)}</div><div className="inline-actions">{receipt.stateCode === 'ISSUED' ? <button className="button button-secondary button-compact" onClick={() => actionMutation.mutate({ type: 'ANNUL', id: receipt.id })}><Ban size={15} /> Anular</button> : null}{receipt.stateCode === 'ANNULLED' ? <button className="button button-primary button-compact" onClick={() => creditNoteMutation.mutate({ receiptId: receipt.id, maxAmount: receipt.amount })}><FileText size={15} /> Nota de crédito</button> : null}</div></article>)}</div>}
      </Panel>

      <Panel title="Penalidad por atraso" subtitle={`Regla vigente: ${money(options.latePenalty.amountPerDay)} por cada día posterior al vencimiento.`} action={!closed && data.balanceAmount > 0 ? <button className="button button-secondary button-compact" disabled={penaltyMutation.isPending} onClick={() => penaltyMutation.mutate()}><ShieldAlert size={16} /> Calcular o actualizar</button> : undefined}>
        {!activePenalty ? <div className="empty-state"><strong>Sin penalidad activa</strong><p>Solo corresponde cuando la venta tiene saldo y ya venció.</p></div> : <article className="penalty-card"><div><StatusBadge tone="danger">{activePenalty.status}</StatusBadge><strong>{activePenalty.reason}</strong><small>{activePenalty.daysLate ?? 0} día(s) · {money(activePenalty.unitAmount ?? 0)} diarios</small></div><div><strong>{money(activePenalty.amount)}</strong><button className="button button-secondary button-compact" onClick={() => actionMutation.mutate({ type: 'WAIVE', id: activePenalty.id })}>Exonerar</button></div></article>}
      </Panel>
    </div>
  );
}
