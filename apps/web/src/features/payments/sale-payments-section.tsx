import { useMemo, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import {
  Ban,
  Check,
  CreditCard,
  FileText,
  Plus,
  ReceiptText,
  RotateCcw,
  ShieldAlert,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
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

const money = (value: number) =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency: 'PEN' }).format(value);
const dateTime = (value: string | null) =>
  value
    ? new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium', timeStyle: 'short' }).format(
        new Date(value),
      )
    : 'Sin fecha';
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

type SensitiveActionType = 'REJECT' | 'REVERSE' | 'WAIVE' | 'ANNUL';

export function SalePaymentsSection({ saleId, closed }: { saleId: string; closed: boolean }) {
  const queryClient = useQueryClient();
  const [showPaymentForm, setShowPaymentForm] = useState(false);
  const [showReceiptForm, setShowReceiptForm] = useState(false);
  const [receivedAt, setReceivedAt] = useState(nowLocalInput());
  const [paymentNotes, setPaymentNotes] = useState('');
  const [proof, setProof] = useState<File | null>(null);
  const [paymentKey, setPaymentKey] = useState(() => crypto.randomUUID());
  const [parts, setParts] = useState<PaymentPartForm[]>([
    { paymentMethodCode: '', financialAccountId: '', amount: '', referenceNumber: '' },
  ]);
  const [receiptSeries, setReceiptSeries] = useState('B001');
  const [receiptNumber, setReceiptNumber] = useState('');
  const [receiptDate, setReceiptDate] = useState(today());
  const [receiptPaymentId, setReceiptPaymentId] = useState('');
  const [receiptAmount, setReceiptAmount] = useState('');
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const [receiptKey, setReceiptKey] = useState(() => crypto.randomUUID());
  const [localWarning, setLocalWarning] = useState<string | null>(null);
  const [sensitiveAction, setSensitiveAction] = useState<{
    type: SensitiveActionType;
    id: string;
  } | null>(null);
  const [actionReason, setActionReason] = useState('');
  const [creditNoteTarget, setCreditNoteTarget] = useState<{
    receiptId: string;
    maxAmount: number;
  } | null>(null);
  const [creditNoteSeries, setCreditNoteSeries] = useState('BC01');
  const [creditNoteNumber, setCreditNoteNumber] = useState('');
  const [creditNoteAmount, setCreditNoteAmount] = useState('');
  const [creditNoteReason, setCreditNoteReason] = useState('');
  const [proofTargetId, setProofTargetId] = useState<string | null>(null);
  const [proofEditFile, setProofEditFile] = useState<File | null>(null);
  const [paymentActionError, setPaymentActionError] = useState<{
    id: string;
    message: string;
  } | null>(null);

  const financials = useQuery({
    queryKey: ['sale-financials', saleId],
    queryFn: () => getSaleFinancials(saleId),
  });
  const support = useQuery({ queryKey: ['payment-support'], queryFn: getPaymentSupportData });
  const invalidate = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['sale-financials', saleId] }),
      queryClient.invalidateQueries({ queryKey: ['sale', saleId] }),
      queryClient.invalidateQueries({ queryKey: ['sales'] }),
    ]);
  };

  const confirmedUnreceipted = useMemo(
    () =>
      financials.data?.payments.filter(
        (payment) => payment.stateCode === 'CONFIRMED' && payment.unreceiptedAmount > 0,
      ) ?? [],
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
      const result = await createPayment(
        saleId,
        {
          receivedAt: new Date(receivedAt).toISOString(),
          notes: paymentNotes.trim() || null,
          parts: normalizedParts,
        },
        paymentKey,
      );
      if (proof) {
        try {
          await uploadPaymentProof(result.id, proof);
        } catch (error) {
          setLocalWarning(
            `El pago ${result.code} quedó pendiente, pero la constancia no pudo subirse: ${error instanceof Error ? error.message : 'error desconocido'}`,
          );
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
      setParts([
        { paymentMethodCode: '', financialAccountId: '', amount: '', referenceNumber: '' },
      ]);
      setPaymentKey(crypto.randomUUID());
    },
  });

  const actionMutation = useMutation({
    mutationFn: async ({
      type,
      id,
      reason,
    }: {
      type: 'CONFIRM' | SensitiveActionType;
      id: string;
      reason?: string;
    }) => {
      if (type === 'CONFIRM') {
        const payment = financials.data?.payments.find((item) => item.id === id);
        const requiresProof = payment?.parts.some((part) => part.requiresProof) ?? false;
        if (requiresProof && payment?.proofs.length === 0) {
          setProofTargetId(id);
          throw new Error(
            'Este pago requiere constancia. Usa Editar para adjuntarla antes de confirmar.',
          );
        }
        return confirmPayment(id);
      }
      const normalizedReason = reason?.trim();
      if (!normalizedReason) throw new Error('El motivo es obligatorio.');
      if (type === 'REJECT') return rejectPayment(id, normalizedReason);
      if (type === 'REVERSE') return reversePayment(id, normalizedReason);
      if (type === 'WAIVE') return waivePenalty(id, normalizedReason);
      return annulReceipt(id, normalizedReason);
    },
    onSuccess: async () => {
      await invalidate();
      setSensitiveAction(null);
      setActionReason('');
      setPaymentActionError(null);
    },
    onError: (error, variables) => {
      if (variables.type === 'CONFIRM') {
        setPaymentActionError({
          id: variables.id,
          message: error instanceof Error ? error.message : 'No se pudo confirmar el pago.',
        });
      }
    },
  });

  const proofUploadMutation = useMutation({
    mutationFn: async () => {
      if (!proofTargetId || !proofEditFile) throw new Error('Selecciona una constancia.');
      await uploadPaymentProof(proofTargetId, proofEditFile);
    },
    onSuccess: async () => {
      await invalidate();
      setProofTargetId(null);
      setProofEditFile(null);
      setPaymentActionError(null);
    },
    onError: (error) => {
      if (proofTargetId) {
        setPaymentActionError({
          id: proofTargetId,
          message: error instanceof Error ? error.message : 'No se pudo adjuntar la constancia.',
        });
      }
    },
  });

  const penaltyMutation = useMutation({
    mutationFn: () => calculateLatePenalty(saleId),
    onSuccess: invalidate,
  });

  const receiptMutation = useMutation({
    mutationFn: async () => {
      const payment = confirmedUnreceipted.find((item) => item.id === receiptPaymentId);
      if (!payment)
        throw new Error('Selecciona un pago confirmado con importe pendiente de boleta.');
      const amount = Number(receiptAmount);
      const result = await createReceipt(
        saleId,
        {
          receiptType: 'BOLETA',
          series: receiptSeries,
          receiptNumber,
          issueDate: receiptDate,
          notes: null,
          allocations: [{ paymentId: payment.id, amount }],
        },
        receiptKey,
      );
      if (receiptFile) {
        try {
          await uploadReceiptFile(result.id, receiptFile);
        } catch (error) {
          setLocalWarning(
            `La boleta quedó registrada, pero el archivo no pudo subirse: ${error instanceof Error ? error.message : 'error desconocido'}`,
          );
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
    mutationFn: async () => {
      if (!creditNoteTarget) throw new Error('No se seleccionó un comprobante.');
      return createCreditNote(creditNoteTarget.receiptId, {
        series: creditNoteSeries.trim(),
        noteNumber: creditNoteNumber.trim(),
        issueDate: today(),
        amount: Number(creditNoteAmount),
        reason: creditNoteReason.trim(),
      });
    },
    onSuccess: async () => {
      await invalidate();
      setCreditNoteTarget(null);
      setCreditNoteSeries('BC01');
      setCreditNoteNumber('');
      setCreditNoteAmount('');
      setCreditNoteReason('');
    },
  });

  const mutationError =
    paymentMutation.error ??
    penaltyMutation.error ??
    receiptMutation.error ??
    creditNoteMutation.error;

  if (financials.isLoading || support.isLoading)
    return (
      <Panel title="Pagos y boletas">
        <div className="empty-state">Cargando información financiera…</div>
      </Panel>
    );
  if (financials.isError || support.isError || !financials.data || !support.data) {
    const error = financials.error ?? support.error;
    return (
      <Panel title="Pagos y boletas">
        <div className="alert alert-error">
          {error instanceof Error ? error.message : 'No se pudo cargar la información financiera.'}
        </div>
      </Panel>
    );
  }

  const data = financials.data;
  const options = support.data;
  const activePenalty = data.penalties.find((penalty) => penalty.status === 'ACTIVE');

  return (
    <div className="sale-financial-stack">
      {localWarning ? <div className="alert alert-warning">{localWarning}</div> : null}
      {mutationError ? (
        <div className="alert alert-error">
          {mutationError instanceof Error
            ? mutationError.message
            : 'No se pudo completar la operación.'}
        </div>
      ) : null}

      <Panel
        title="Pagos"
        subtitle="Los pagos se registran pendientes y recién afectan el saldo cuando se confirman."
        action={
          !closed ? (
            <button
              className="button button-primary button-compact"
              onClick={() => setShowPaymentForm((value) => !value)}
            >
              <Plus size={16} /> Registrar pago
            </button>
          ) : undefined
        }
      >
        {showPaymentForm ? (
          <form
            className="payment-form"
            onSubmit={(event) => {
              event.preventDefault();
              paymentMutation.mutate();
            }}
          >
            <div className="form-grid form-grid-2">
              <label className="field">
                <span>Fecha y hora recibida</span>
                <input
                  type="datetime-local"
                  value={receivedAt}
                  onChange={(event) => setReceivedAt(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Constancia</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp,application/pdf"
                  onChange={(event) => setProof(event.target.files?.[0] ?? null)}
                />
              </label>
            </div>
            <div className="payment-parts">
              {parts.map((part, index) => (
                <div className="payment-part-row" key={index}>
                  <label className="field">
                    <span>Medio</span>
                    <select
                      value={part.paymentMethodCode}
                      onChange={(event) =>
                        setParts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, paymentMethodCode: event.target.value }
                              : item,
                          ),
                        )
                      }
                      required
                    >
                      <option value="">Selecciona</option>
                      {options.paymentMethods.map((method) => (
                        <option key={method.code} value={method.code}>
                          {method.name}
                          {method.requiresProof ? ' · constancia' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Cuenta de ingreso</span>
                    <select
                      value={part.financialAccountId}
                      onChange={(event) =>
                        setParts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, financialAccountId: event.target.value }
                              : item,
                          ),
                        )
                      }
                      required
                    >
                      <option value="">Selecciona</option>
                      {options.financialAccounts.map((account) => (
                        <option key={account.id} value={account.id}>
                          {account.name}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="field">
                    <span>Importe</span>
                    <input
                      type="number"
                      min="0.01"
                      step="0.01"
                      value={part.amount}
                      onChange={(event) =>
                        setParts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index ? { ...item, amount: event.target.value } : item,
                          ),
                        )
                      }
                      required
                    />
                  </label>
                  <label className="field">
                    <span>Operación o referencia</span>
                    <input
                      value={part.referenceNumber}
                      onChange={(event) =>
                        setParts((current) =>
                          current.map((item, itemIndex) =>
                            itemIndex === index
                              ? { ...item, referenceNumber: event.target.value }
                              : item,
                          ),
                        )
                      }
                    />
                  </label>
                  {parts.length > 1 ? (
                    <button
                      type="button"
                      className="icon-button danger"
                      aria-label="Quitar medio"
                      onClick={() =>
                        setParts((current) => current.filter((_, itemIndex) => itemIndex !== index))
                      }
                    >
                      <Trash2 size={16} />
                    </button>
                  ) : null}
                </div>
              ))}
            </div>
            <div className="inline-actions">
              <button
                type="button"
                className="button button-secondary button-compact"
                onClick={() =>
                  setParts((current) => [
                    ...current,
                    {
                      paymentMethodCode: '',
                      financialAccountId: '',
                      amount: '',
                      referenceNumber: '',
                    },
                  ])
                }
              >
                <CreditCard size={16} /> Agregar medio
              </button>
            </div>
            <label className="field">
              <span>Notas</span>
              <textarea
                rows={2}
                value={paymentNotes}
                onChange={(event) => setPaymentNotes(event.target.value)}
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowPaymentForm(false)}
              >
                Cancelar
              </button>
              <button className="button button-primary" disabled={paymentMutation.isPending}>
                {paymentMutation.isPending ? 'Registrando…' : 'Guardar pago pendiente'}
              </button>
            </div>
          </form>
        ) : null}

        {data.payments.length === 0 ? (
          <div className="empty-state">
            <strong>Sin pagos registrados</strong>
            <p>El saldo pendiente es {money(data.balanceAmount)}.</p>
          </div>
        ) : (
          <div className="payment-card-list">
            {data.payments.map((payment) => (
              <article className="payment-card" key={payment.id}>
                <div className="payment-card-main">
                  <div className="payment-card-head">
                    <div>
                      <strong>{payment.code}</strong>
                      <small>
                        {dateTime(payment.receivedAt)} · {payment.createdByName ?? 'Administradora'}
                      </small>
                    </div>
                    <StatusBadge
                      tone={
                        payment.stateCode === 'CONFIRMED'
                          ? 'success'
                          : payment.stateCode === 'PENDING'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {payment.stateCode}
                    </StatusBadge>
                  </div>
                  <div className="payment-part-summary">
                    {payment.parts.map((part) => (
                      <span key={part.id}>
                        {part.paymentMethodName} → {part.financialAccountName}:{' '}
                        <b>{money(part.amount)}</b>
                        {part.referenceNumber ? ` · ${part.referenceNumber}` : ''}
                      </span>
                    ))}
                  </div>
                  {payment.proofs.map((file) => (
                    <a
                      className="file-link"
                      key={file.id}
                      href={file.signedUrl ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                    >
                      <Upload size={14} /> {file.originalFilename}
                    </a>
                  ))}
                  {payment.stateCode === 'PENDING' &&
                  payment.parts.some((part) => part.requiresProof) &&
                  payment.proofs.length === 0 ? (
                    <div className="payment-proof-warning">
                      <span>Este pago requiere una constancia antes de confirmarse.</span>
                      <button
                        type="button"
                        className="button button-secondary button-compact"
                        onClick={() => {
                          setProofTargetId(payment.id);
                          setPaymentActionError(null);
                        }}
                      >
                        <Upload size={14} /> Editar / adjuntar constancia
                      </button>
                    </div>
                  ) : null}
                  {proofTargetId === payment.id ? (
                    <div className="payment-proof-editor">
                      <input
                        type="file"
                        accept="image/jpeg,image/png,image/webp,application/pdf"
                        onChange={(event) => setProofEditFile(event.target.files?.[0] ?? null)}
                      />
                      <div className="inline-actions">
                        <button
                          type="button"
                          className="button button-secondary button-compact"
                          onClick={() => {
                            setProofTargetId(null);
                            setProofEditFile(null);
                          }}
                        >
                          Cancelar
                        </button>
                        <button
                          type="button"
                          className="button button-primary button-compact"
                          disabled={!proofEditFile || proofUploadMutation.isPending}
                          onClick={() => proofUploadMutation.mutate()}
                        >
                          {proofUploadMutation.isPending ? 'Subiendo…' : 'Guardar constancia'}
                        </button>
                      </div>
                    </div>
                  ) : null}
                  {paymentActionError?.id === payment.id ? (
                    <p className="field-error">{paymentActionError.message}</p>
                  ) : null}
                  {payment.rejectionReason ? (
                    <p className="text-danger">Rechazo: {payment.rejectionReason}</p>
                  ) : null}
                  {payment.reversalReason ? (
                    <p className="text-danger">Reversión: {payment.reversalReason}</p>
                  ) : null}
                </div>
                <div className="payment-card-amount">
                  <strong>{money(payment.declaredAmount)}</strong>
                  <small>Sin boleta: {money(payment.unreceiptedAmount)}</small>
                  {payment.stateCode === 'PENDING' ? (
                    <div className="inline-actions">
                      <button
                        className="icon-button success"
                        title="Confirmar"
                        disabled={actionMutation.isPending}
                        onClick={() => actionMutation.mutate({ type: 'CONFIRM', id: payment.id })}
                      >
                        <Check size={16} />
                      </button>
                      <button
                        className="icon-button danger"
                        title="Rechazar"
                        disabled={actionMutation.isPending}
                        onClick={() => {
                          setSensitiveAction({ type: 'REJECT', id: payment.id });
                          setActionReason('');
                        }}
                      >
                        <X size={16} />
                      </button>
                    </div>
                  ) : payment.stateCode === 'CONFIRMED' ? (
                    <button
                      className="button button-secondary button-compact"
                      disabled={actionMutation.isPending}
                      onClick={() => {
                        setSensitiveAction({ type: 'REVERSE', id: payment.id });
                        setActionReason('');
                      }}
                    >
                      <RotateCcw size={15} /> Revertir
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Boletas y notas de crédito"
        subtitle="La emisión se realiza manualmente en SUNAT y aquí se registra el número y archivo."
        action={
          confirmedUnreceipted.length > 0 ? (
            <button
              className="button button-primary button-compact"
              onClick={() => setShowReceiptForm((value) => !value)}
            >
              <ReceiptText size={16} /> Registrar boleta
            </button>
          ) : undefined
        }
      >
        {showReceiptForm ? (
          <form
            className="receipt-form"
            onSubmit={(event) => {
              event.preventDefault();
              receiptMutation.mutate();
            }}
          >
            <div className="form-grid form-grid-3">
              <label className="field">
                <span>Serie</span>
                <input
                  value={receiptSeries}
                  onChange={(event) => setReceiptSeries(event.target.value.toUpperCase())}
                  required
                />
              </label>
              <label className="field">
                <span>Número</span>
                <input
                  value={receiptNumber}
                  onChange={(event) => setReceiptNumber(event.target.value)}
                  required
                />
              </label>
              <label className="field">
                <span>Fecha de emisión</span>
                <input
                  type="date"
                  value={receiptDate}
                  onChange={(event) => setReceiptDate(event.target.value)}
                  required
                />
              </label>
            </div>
            <div className="form-grid form-grid-2">
              <label className="field">
                <span>Pago confirmado</span>
                <select
                  value={receiptPaymentId}
                  onChange={(event) => {
                    const id = event.target.value;
                    setReceiptPaymentId(id);
                    const selected = confirmedUnreceipted.find((payment) => payment.id === id);
                    setReceiptAmount(selected ? String(selected.unreceiptedAmount) : '');
                  }}
                  required
                >
                  <option value="">Selecciona</option>
                  {confirmedUnreceipted.map((payment) => (
                    <option key={payment.id} value={payment.id}>
                      {payment.code} · disponible {money(payment.unreceiptedAmount)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="field">
                <span>Importe asignado</span>
                <input
                  type="number"
                  min="0.01"
                  step="0.01"
                  value={receiptAmount}
                  onChange={(event) => setReceiptAmount(event.target.value)}
                  required
                />
              </label>
            </div>
            <label className="field">
              <span>Archivo de la boleta</span>
              <input
                type="file"
                accept="image/jpeg,image/png,image/webp,application/pdf"
                onChange={(event) => setReceiptFile(event.target.files?.[0] ?? null)}
              />
            </label>
            <div className="form-actions">
              <button
                type="button"
                className="button button-secondary"
                onClick={() => setShowReceiptForm(false)}
              >
                Cancelar
              </button>
              <button className="button button-primary" disabled={receiptMutation.isPending}>
                {receiptMutation.isPending ? 'Registrando…' : 'Registrar boleta'}
              </button>
            </div>
          </form>
        ) : null}
        {data.receipts.length === 0 ? (
          <div className="empty-state">
            <strong>Sin boletas registradas</strong>
            <p>Cuando confirmes un pago aparecerá disponible para emitir su boleta.</p>
          </div>
        ) : (
          <div className="receipt-list">
            {data.receipts.map((receipt) => (
              <article className="receipt-card" key={receipt.id}>
                <div>
                  <div className="receipt-title">
                    <FileText size={17} />
                    <strong>{receipt.fullNumber ?? receipt.code}</strong>
                    <StatusBadge
                      tone={
                        receipt.stateCode === 'ISSUED'
                          ? 'success'
                          : receipt.stateCode === 'CREDIT_NOTE'
                            ? 'warning'
                            : 'danger'
                      }
                    >
                      {receipt.stateCode}
                    </StatusBadge>
                  </div>
                  <small>
                    {receipt.issueDate ?? 'Sin fecha'} · {money(receipt.amount)}
                  </small>
                  {receipt.allocations.map((allocation) => (
                    <span key={allocation.paymentId}>
                      {allocation.paymentCode}: {money(allocation.allocatedAmount)}
                    </span>
                  ))}
                  {receipt.files.map((file) => (
                    <a
                      className="file-link"
                      href={file.signedUrl ?? '#'}
                      target="_blank"
                      rel="noreferrer"
                      key={file.id}
                    >
                      {file.originalFilename}
                    </a>
                  ))}
                  {receipt.annulmentReason ? <p>Anulación: {receipt.annulmentReason}</p> : null}
                  {receipt.creditNotes.map((note) => (
                    <p className="credit-note-line" key={note.id}>
                      Nota {note.fullNumber ?? note.code}: {money(note.amount)} · {note.reason}
                    </p>
                  ))}
                </div>
                <div className="inline-actions">
                  {receipt.stateCode === 'ISSUED' ? (
                    <button
                      className="button button-secondary button-compact"
                      onClick={() => {
                        setSensitiveAction({ type: 'ANNUL', id: receipt.id });
                        setActionReason('');
                      }}
                    >
                      <Ban size={15} /> Anular
                    </button>
                  ) : null}
                  {receipt.stateCode === 'ANNULLED' ? (
                    <button
                      className="button button-primary button-compact"
                      onClick={() => {
                        setCreditNoteTarget({ receiptId: receipt.id, maxAmount: receipt.amount });
                        setCreditNoteAmount(String(receipt.amount));
                      }}
                    >
                      <FileText size={15} /> Nota de crédito
                    </button>
                  ) : null}
                </div>
              </article>
            ))}
          </div>
        )}
      </Panel>

      <Panel
        title="Penalidad por atraso"
        subtitle={`Regla vigente: ${money(options.latePenalty.amountPerDay)} por cada día posterior al vencimiento.`}
        action={
          !closed && data.balanceAmount > 0 ? (
            <button
              className="button button-secondary button-compact"
              disabled={penaltyMutation.isPending}
              onClick={() => penaltyMutation.mutate()}
            >
              <ShieldAlert size={16} /> Calcular o actualizar
            </button>
          ) : undefined
        }
      >
        {!activePenalty ? (
          <div className="empty-state">
            <strong>Sin penalidad activa</strong>
            <p>Solo corresponde cuando la venta tiene saldo y ya venció.</p>
          </div>
        ) : (
          <article className="penalty-card">
            <div>
              <StatusBadge tone="danger">{activePenalty.status}</StatusBadge>
              <strong>{activePenalty.reason}</strong>
              <small>
                {activePenalty.daysLate ?? 0} día(s) · {money(activePenalty.unitAmount ?? 0)}{' '}
                diarios
              </small>
            </div>
            <div>
              <strong>{money(activePenalty.amount)}</strong>
              <button
                className="button button-secondary button-compact"
                onClick={() => {
                  setSensitiveAction({ type: 'WAIVE', id: activePenalty.id });
                  setActionReason('');
                }}
              >
                Exonerar
              </button>
            </div>
          </article>
        )}
      </Panel>

      {sensitiveAction ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSensitiveAction(null);
          }}
        >
          <form
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="payment-action-title"
            onSubmit={(event) => {
              event.preventDefault();
              actionMutation.mutate({ ...sensitiveAction, reason: actionReason });
            }}
          >
            <div className="modal-header">
              <div>
                <small>Operación sensible</small>
                <h2 id="payment-action-title">
                  {sensitiveAction.type === 'REJECT'
                    ? 'Rechazar pago'
                    : sensitiveAction.type === 'REVERSE'
                      ? 'Revertir pago'
                      : sensitiveAction.type === 'WAIVE'
                        ? 'Exonerar penalidad'
                        : 'Anular boleta'}
                </h2>
                <p>La operación conservará su historial y no eliminará registros.</p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Cerrar"
                onClick={() => setSensitiveAction(null)}
              >
                <X size={18} />
              </button>
            </div>
            <label className="field">
              <span>Motivo *</span>
              <textarea
                rows={4}
                minLength={3}
                maxLength={1000}
                value={actionReason}
                onChange={(event) => setActionReason(event.target.value)}
                required
                autoFocus
              />
            </label>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setSensitiveAction(null)}
              >
                Volver
              </button>
              <button
                className="button button-danger"
                type="submit"
                disabled={actionMutation.isPending}
              >
                {actionMutation.isPending ? 'Procesando…' : 'Confirmar operación'}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      {creditNoteTarget ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setCreditNoteTarget(null);
          }}
        >
          <form
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="credit-note-title"
            onSubmit={(event) => {
              event.preventDefault();
              creditNoteMutation.mutate();
            }}
          >
            <div className="modal-header">
              <div>
                <small>Comprobante compensatorio</small>
                <h2 id="credit-note-title">Registrar nota de crédito</h2>
                <p>Importe máximo disponible: {money(creditNoteTarget.maxAmount)}.</p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Cerrar"
                onClick={() => setCreditNoteTarget(null)}
              >
                <X size={18} />
              </button>
            </div>
            <div className="form-grid form-grid-2">
              <label className="field">
                <span>Serie *</span>
                <input
                  value={creditNoteSeries}
                  onChange={(event) => setCreditNoteSeries(event.target.value.toUpperCase())}
                  required
                />
              </label>
              <label className="field">
                <span>Número *</span>
                <input
                  value={creditNoteNumber}
                  onChange={(event) => setCreditNoteNumber(event.target.value)}
                  required
                />
              </label>
              <label className="field field-span-2">
                <span>Importe *</span>
                <input
                  type="number"
                  min="0.01"
                  max={creditNoteTarget.maxAmount}
                  step="0.01"
                  value={creditNoteAmount}
                  onChange={(event) => setCreditNoteAmount(event.target.value)}
                  required
                />
              </label>
            </div>
            <label className="field">
              <span>Motivo *</span>
              <textarea
                rows={4}
                minLength={3}
                maxLength={1000}
                value={creditNoteReason}
                onChange={(event) => setCreditNoteReason(event.target.value)}
                required
              />
            </label>
            <div className="modal-actions">
              <button
                className="button button-secondary"
                type="button"
                onClick={() => setCreditNoteTarget(null)}
              >
                Volver
              </button>
              <button
                className="button button-primary"
                type="submit"
                disabled={creditNoteMutation.isPending}
              >
                {creditNoteMutation.isPending ? 'Registrando…' : 'Guardar nota'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </div>
  );
}
