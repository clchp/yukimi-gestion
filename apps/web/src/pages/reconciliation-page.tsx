import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Check, FileSpreadsheet, Link2, RefreshCcw, Upload, X } from 'lucide-react';
import { useRef, useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import {
  confirmBankReconciliation,
  dismissBankCandidate,
  getBankReconciliation,
  ignoreBankRow,
  importBankStatement,
  reverseBankReconciliation,
} from '../features/finance/finance-api';
import { parseBankFile } from '../features/finance/parse-bank-file';

import { SearchableNativeSelect } from '../components/ui/searchable-native-select';
const money = (value: number, currency = 'PEN') =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(value);
const date = (value: string) =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(`${value}T12:00:00`));
const percent = (value: number) => `${Math.round(value * 100)}%`;

type ReconciliationReasonAction = { type: 'REVERSE' | 'DISMISS' | 'IGNORE'; id: string };

export function ReconciliationPage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [accountId, setAccountId] = useState('');
  const [batchId, setBatchId] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [reasonAction, setReasonAction] = useState<ReconciliationReasonAction | null>(null);
  const [actionReason, setActionReason] = useState('');

  const reconciliation = useQuery({
    queryKey: ['bank-reconciliation', accountId, batchId],
    queryFn: () =>
      getBankReconciliation({ accountId: accountId || undefined, batchId: batchId || undefined }),
  });

  const data = reconciliation.data;
  const selectedAccount = data?.accounts.find(
    (item) => item.id === (accountId || data.selectedAccountId),
  );

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['bank-reconciliation'] }),
      queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] }),
    ]);
  };

  const confirmMutation = useMutation({
    mutationFn: ({
      rowId,
      candidateType,
      candidateId,
    }: {
      rowId: string;
      candidateType: 'PAYMENT' | 'FINANCIAL_TRANSACTION';
      candidateId: string;
    }) => confirmBankReconciliation(rowId, { candidateType, candidateId, notes: null }),
    onSuccess: async () => {
      await refresh();
      setNotice('Coincidencia confirmada.');
    },
    onError: (value) =>
      setError(value instanceof Error ? value.message : 'No se pudo conciliar el movimiento.'),
  });
  const dismissMutation = useMutation({
    mutationFn: ({ candidateId, reason }: { candidateId: string; reason: string }) =>
      dismissBankCandidate(candidateId, reason),
    onSuccess: async () => {
      await refresh();
      setReasonAction(null);
      setActionReason('');
    },
    onError: (value) =>
      setError(value instanceof Error ? value.message : 'No se pudo descartar la coincidencia.'),
  });
  const ignoreMutation = useMutation({
    mutationFn: ({ rowId, reason }: { rowId: string; reason: string }) =>
      ignoreBankRow(rowId, reason),
    onSuccess: async () => {
      await refresh();
      setReasonAction(null);
      setActionReason('');
    },
    onError: (value) =>
      setError(value instanceof Error ? value.message : 'No se pudo ignorar el movimiento.'),
  });
  const reverseMutation = useMutation({
    mutationFn: ({ id, reason }: { id: string; reason: string }) =>
      reverseBankReconciliation(id, reason),
    onSuccess: async () => {
      await refresh();
      setNotice('Conciliación revertida.');
      setReasonAction(null);
      setActionReason('');
    },
    onError: (value) =>
      setError(value instanceof Error ? value.message : 'No se pudo revertir la conciliación.'),
  });

  async function onFile(file: File) {
    setError(null);
    setNotice(null);
    const effectiveAccountId = accountId || data?.selectedAccountId || '';
    const account = data?.accounts.find((item) => item.id === effectiveAccountId);
    if (!account) {
      setError('Selecciona una cuenta antes de importar.');
      return;
    }
    setUploading(true);
    try {
      const parsed = await parseBankFile(file, account.currencyCode);
      const result = await importBankStatement(
        {
          accountId: account.id,
          originalFilename: file.name,
          fileChecksum: parsed.checksum,
          rows: parsed.rows,
        },
        crypto.randomUUID(),
      );
      setAccountId(account.id);
      setBatchId(result.id);
      await refresh();
      setNotice(
        result.reused
          ? 'Ese archivo ya había sido importado; abrimos el lote existente.'
          : `Extracto importado: ${result.validRows} filas válidas y ${result.invalidRows} inválidas.`,
      );
    } catch (value) {
      setError(value instanceof Error ? value.message : 'No se pudo leer el archivo.');
    } finally {
      setUploading(false);
      if (fileRef.current) fileRef.current.value = '';
    }
  }

  return (
    <main className="page">
      <button className="back-link" onClick={() => navigate('/finanzas')}>
        <ArrowLeft size={17} /> Volver a finanzas
      </button>
      <PageHeader
        eyebrow="Cruce bancario"
        title="Conciliación bancaria"
        description="Importa el Excel del banco, revisa las coincidencias sugeridas y confirma manualmente."
        actions={
          <>
            <input
              ref={fileRef}
              hidden
              type="file"
              accept=".xlsx,.csv"
              onChange={(event) => {
                const file = event.target.files?.[0];
                if (file) void onFile(file);
              }}
            />
            <button
              className="button button-primary"
              disabled={uploading || reconciliation.isLoading}
              onClick={() => fileRef.current?.click()}
            >
              <Upload size={17} /> {uploading ? 'Importando…' : 'Importar Excel'}
            </button>
          </>
        }
      />
      {error ? <div className="alert alert-error">{error}</div> : null}
      {notice ? <div className="alert alert-success">{notice}</div> : null}
      <div className="alert alert-info">
        El archivo debe tener columnas de fecha, descripción y monto. También se reconocen formatos
        con columnas separadas de Cargo y Abono.
      </div>

      <section className="reconciliation-controls">
        <label className="field">
          <span>Cuenta bancaria o billetera</span>
          <SearchableNativeSelect
            value={accountId || data?.selectedAccountId || ''}
            onChange={(event) => {
              setAccountId(event.target.value);
              setBatchId('');
            }}
          >
            <option value="">Seleccionar</option>
            {data?.accounts.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name} · {money(item.currentBalance, item.currencyCode)}
              </option>
            ))}
          </SearchableNativeSelect>
        </label>
        <label className="field">
          <span>Archivo importado</span>
          <SearchableNativeSelect
            value={batchId || data?.selectedBatchId || ''}
            onChange={(event) => setBatchId(event.target.value)}
          >
            <option value="">Sin archivo</option>
            {data?.batches.map((item) => (
              <option key={item.id} value={item.id}>
                {item.code} · {item.originalFilename}
              </option>
            ))}
          </SearchableNativeSelect>
        </label>
      </section>

      <section className="reconciliation-steps">
        <div className={data?.selectedBatchId ? 'done' : 'active'}>
          <span>{data?.selectedBatchId ? <Check size={15} /> : 1}</span>
          <div>
            <strong>1. Archivo importado</strong>
            <small>
              {data?.batches.find((item) => item.id === (batchId || data.selectedBatchId))
                ?.originalFilename ?? 'Selecciona un Excel'}
            </small>
          </div>
        </div>
        <div className={data?.selectedBatchId ? 'active' : ''}>
          <span>2</span>
          <div>
            <strong>Revisar coincidencias</strong>
            <small>{data?.summary.suggested ?? 0} sugerencias pendientes</small>
          </div>
        </div>
        <div>
          <span>3</span>
          <div>
            <strong>Confirmar conciliación</strong>
            <small>Las confirmaciones se guardan una por una</small>
          </div>
        </div>
      </section>

      <section className="reconciliation-summary">
        <article>
          <FileSpreadsheet size={22} />
          <div>
            <span>Movimientos importados</span>
            <strong>{data?.summary.total ?? 0}</strong>
          </div>
        </article>
        <article>
          <Link2 size={22} />
          <div>
            <span>Coincidencias sugeridas</span>
            <strong>{data?.summary.suggested ?? 0}</strong>
          </div>
        </article>
        <article>
          <Check size={22} />
          <div>
            <span>Ya conciliados</span>
            <strong>{data?.summary.reconciled ?? 0}</strong>
          </div>
        </article>
        <article>
          <X size={22} />
          <div>
            <span>Sin coincidencia</span>
            <strong>{data?.summary.unmatched ?? 0}</strong>
          </div>
        </article>
      </section>

      <Panel
        title="Movimientos del extracto"
        subtitle={
          selectedAccount
            ? `${selectedAccount.name} · ${selectedAccount.currencyCode}`
            : 'Selecciona una cuenta'
        }
      >
        {reconciliation.isLoading ? (
          <div className="empty-state">Cargando conciliación…</div>
        ) : null}
        {!reconciliation.isLoading && (data?.rows.length ?? 0) === 0 ? (
          <div className="empty-state">
            <strong>No hay movimientos para revisar</strong>
            <p>Importa un archivo o selecciona otro lote.</p>
          </div>
        ) : null}
        <div className="bank-row-list">
          {data?.rows.map((row) => (
            <article
              className={`bank-row-card status-${row.reconciliationStatus.toLowerCase()}`}
              key={row.id}
            >
              <div className="bank-row-main">
                <div>
                  <span>{date(row.transactionDate)}</span>
                  <strong>{row.description}</strong>
                  <small>{row.reference ? `Referencia: ${row.reference}` : 'Sin referencia'}</small>
                </div>
                <b className={row.amountSigned > 0 ? 'text-success' : 'text-danger'}>
                  {row.amountSigned > 0 ? '+' : '−'}{' '}
                  {money(Math.abs(row.amountSigned), row.currencyCode)}
                </b>
                <StatusBadge
                  tone={
                    row.reconciliationStatus === 'RECONCILED'
                      ? 'success'
                      : row.reconciliationStatus === 'SUGGESTED'
                        ? 'info'
                        : row.reconciliationStatus === 'IGNORED'
                          ? 'warning'
                          : 'danger'
                  }
                >
                  {
                    (
                      {
                        RECONCILED: 'Conciliado',
                        SUGGESTED: 'Sugerido',
                        UNMATCHED: 'Sin coincidencia',
                        IGNORED: 'Ignorado',
                      } as Record<string, string>
                    )[row.reconciliationStatus]
                  }
                </StatusBadge>
              </div>
              {row.activeReconciliation ? (
                <div className="reconciled-strip">
                  <Check size={16} />
                  <span>
                    Conciliado por{' '}
                    {row.activeReconciliation.matchedType === 'PAYMENT'
                      ? 'pago'
                      : 'movimiento financiero'}
                    .
                  </span>
                  <button
                    className="text-button"
                    onClick={() => {
                      setReasonAction({ type: 'REVERSE', id: row.activeReconciliation!.id });
                      setActionReason('');
                    }}
                  >
                    <RefreshCcw size={14} /> Revertir
                  </button>
                </div>
              ) : null}
              {row.reconciliationStatus !== 'RECONCILED' ? (
                <div className="candidate-list">
                  {row.candidates.map((candidate) => (
                    <div className="candidate-row" key={candidate.id}>
                      <div>
                        <Link2 size={16} />
                        <span>
                          <strong>{candidate.label}</strong>
                          <small>
                            Coincidencia sugerida · {percent(candidate.confidenceScore)}
                          </small>
                        </span>
                      </div>
                      <div>
                        <button
                          className="icon-button reject"
                          title="Descartar"
                          onClick={() => {
                            setReasonAction({ type: 'DISMISS', id: candidate.id });
                            setActionReason('No corresponde al movimiento');
                          }}
                        >
                          <X size={17} />
                        </button>
                        <button
                          className="button button-primary button-compact"
                          disabled={confirmMutation.isPending}
                          onClick={() =>
                            confirmMutation.mutate({
                              rowId: row.id,
                              candidateType: candidate.candidateType,
                              candidateId: candidate.candidateId,
                            })
                          }
                        >
                          <Check size={15} /> Confirmar
                        </button>
                      </div>
                    </div>
                  ))}
                  {row.candidates.length === 0 && row.reconciliationStatus !== 'IGNORED' ? (
                    <div className="unmatched-row">
                      <span>No se encontró una coincidencia automática.</span>
                      <button
                        className="button button-secondary button-compact"
                        onClick={() => {
                          setReasonAction({ type: 'IGNORE', id: row.id });
                          setActionReason('');
                        }}
                      >
                        Ignorar con motivo
                      </button>
                    </div>
                  ) : null}
                </div>
              ) : null}
            </article>
          ))}
        </div>
      </Panel>
      {reasonAction ? (
        <div
          className="modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setReasonAction(null);
          }}
        >
          <form
            className="modal-card"
            role="dialog"
            aria-modal="true"
            aria-labelledby="reconciliation-reason-title"
            onSubmit={(event) => {
              event.preventDefault();
              if (reasonAction.type === 'REVERSE')
                reverseMutation.mutate({ id: reasonAction.id, reason: actionReason });
              if (reasonAction.type === 'DISMISS')
                dismissMutation.mutate({ candidateId: reasonAction.id, reason: actionReason });
              if (reasonAction.type === 'IGNORE')
                ignoreMutation.mutate({ rowId: reasonAction.id, reason: actionReason });
            }}
          >
            <div className="modal-header">
              <div>
                <small>Conciliación bancaria</small>
                <h2 id="reconciliation-reason-title">
                  {reasonAction.type === 'REVERSE'
                    ? 'Revertir conciliación'
                    : reasonAction.type === 'DISMISS'
                      ? 'Descartar coincidencia'
                      : 'Ignorar movimiento'}
                </h2>
                <p>La decisión quedará registrada para auditoría.</p>
              </div>
              <button
                className="icon-button"
                type="button"
                aria-label="Cerrar"
                onClick={() => setReasonAction(null)}
              >
                <X size={18} />
              </button>
            </div>
            <label className="field">
              <span>Motivo *</span>
              <textarea
                rows={4}
                minLength={5}
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
                onClick={() => setReasonAction(null)}
              >
                Volver
              </button>
              <button
                className={
                  reasonAction.type === 'REVERSE' ? 'button button-danger' : 'button button-primary'
                }
                type="submit"
                disabled={
                  reverseMutation.isPending || dismissMutation.isPending || ignoreMutation.isPending
                }
              >
                {reverseMutation.isPending || dismissMutation.isPending || ignoreMutation.isPending
                  ? 'Guardando…'
                  : 'Confirmar'}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}
