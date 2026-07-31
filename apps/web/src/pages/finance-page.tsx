import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import type { FinanceCategory, FinanceObligation, FinanceLoanSummary } from '@yukimi/shared';
import {
  AlertTriangle,
  ArrowDownLeft,
  ArrowRightLeft,
  ArrowUpRight,
  Banknote,
  CalendarClock,
  CheckCircle2,
  CreditCard,
  Landmark,
  Plus,
  ReceiptText,
  RotateCcw,
  WalletCards,
  X,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router';
import { PageHeader } from '../components/ui/page-header';
import { Panel } from '../components/ui/panel';
import { StatusBadge } from '../components/ui/status-badge';
import { Toolbar } from '../components/ui/toolbar';
import {
  createCashClosure,
  createFinanceCategory,
  createFinanceTransfer,
  createManualFinanceTransaction,
  createObligation,
  createReceivedLoan,
  getFinanceDashboard,
  getFinanceSupport,
  getFinanceTransactions,
  payLoanInstallment,
  payObligation,
  reverseFinanceTransaction,
} from '../features/finance/finance-api';
import { uploadFinanceProof } from '../features/finance/upload-finance-file';

import { SearchableNativeSelect } from '../components/ui/searchable-native-select';
const money = (value: number, currency = 'PEN') =>
  new Intl.NumberFormat('es-PE', { style: 'currency', currency }).format(value);
const date = (value: string) =>
  new Intl.DateTimeFormat('es-PE', { dateStyle: 'medium' }).format(new Date(value));
const dateTimeLocal = () => {
  const now = new Date();
  now.setMinutes(now.getMinutes() - now.getTimezoneOffset());
  return now.toISOString().slice(0, 16);
};
const today = () => new Date().toISOString().slice(0, 10);
const uuid = () => crypto.randomUUID();

type ModalKind =
  | 'movement'
  | 'transfer'
  | 'obligation'
  | 'loan'
  | 'cash'
  | 'pay-obligation'
  | 'pay-loan'
  | 'reverse'
  | null;

function toneForTransaction(type: string): 'success' | 'danger' | 'info' | 'warning' {
  if (['INCOME', 'LOAN_RECEIVED', 'LOAN_COLLECTION'].includes(type)) return 'success';
  if (type === 'TRANSFER') return 'info';
  if (type === 'REVERSAL' || type === 'ADJUSTMENT') return 'warning';
  return 'danger';
}

export function FinancePage() {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [search, setSearch] = useState('');
  const [type, setType] = useState('ALL');
  const [page, setPage] = useState(1);
  const [modal, setModal] = useState<ModalKind>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [selectedObligation, setSelectedObligation] = useState<FinanceObligation | null>(null);
  const [selectedLoan, setSelectedLoan] = useState<FinanceLoanSummary | null>(null);
  const [selectedTransactionId, setSelectedTransactionId] = useState<string | null>(null);

  const [movementType, setMovementType] = useState<'INCOME' | 'EXPENSE'>('EXPENSE');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [categoryDraftOpen, setCategoryDraftOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [amount, setAmount] = useState('');
  const [occurredAt, setOccurredAt] = useState(dateTimeLocal());
  const [description, setDescription] = useState('');
  const [reference, setReference] = useState('');
  const [notes, setNotes] = useState('');
  const [sourceAccountId, setSourceAccountId] = useState('');
  const [destinationAccountId, setDestinationAccountId] = useState('');
  const [obligationType, setObligationType] = useState('CREDIT_CARD');
  const [dueDate, setDueDate] = useState(today());
  const [obligationCurrency, setObligationCurrency] = useState('PEN');
  const [obligationAlertDays, setObligationAlertDays] = useState('15');
  const [cardBankName, setCardBankName] = useState('');
  const [cardAlias, setCardAlias] = useState('');
  const [cardLastFour, setCardLastFour] = useState('');
  const [statementClosingDate, setStatementClosingDate] = useState(today());
  const [cardInstallmentCount, setCardInstallmentCount] = useState('1');
  const [cardInstallmentNumber, setCardInstallmentNumber] = useState('1');
  const [cardPaymentAccountId, setCardPaymentAccountId] = useState('');
  const [lenderName, setLenderName] = useState('');
  const [interestRate, setInterestRate] = useState('0');
  const [installmentCount, setInstallmentCount] = useState('1');
  const [firstDueDate, setFirstDueDate] = useState(today());
  const [closureDate, setClosureDate] = useState(today());
  const [countedAmount, setCountedAmount] = useState('');
  const [reason, setReason] = useState('');
  const [formKey, setFormKey] = useState(uuid());
  const [proofFile, setProofFile] = useState<File | null>(null);

  const support = useQuery({ queryKey: ['finance-support'], queryFn: getFinanceSupport });
  const dashboard = useQuery({ queryKey: ['finance-dashboard'], queryFn: getFinanceDashboard });
  const transactions = useQuery({
    queryKey: ['finance-transactions', search, type, page],
    queryFn: () => getFinanceTransactions({ search, type, page, pageSize: 20 }),
    placeholderData: (previous) => previous,
  });

  const refresh = async () => {
    await Promise.all([
      queryClient.invalidateQueries({ queryKey: ['finance-dashboard'] }),
      queryClient.invalidateQueries({ queryKey: ['finance-transactions'] }),
      queryClient.invalidateQueries({ queryKey: ['finance-support'] }),
    ]);
  };

  const closeModal = () => {
    setModal(null);
    setError(null);
    setReason('');
    setSelectedObligation(null);
    setSelectedLoan(null);
    setSelectedTransactionId(null);
    setProofFile(null);
    setFormKey(uuid());
  };

  const categoryMutation = useMutation({
    mutationFn: async () => {
      const name = newCategoryName.trim();
      if (!name) throw new Error('Escribe un nombre para la categoría.');
      return createFinanceCategory({ name, nature: movementType, description: null });
    },
    onSuccess: async (result) => {
      await queryClient.invalidateQueries({ queryKey: ['finance-support'] });
      setCategoryId(result.id);
      setNotice(
        result.reused ? 'La categoría ya existía y fue seleccionada.' : 'Categoría creada.',
      );
      setCategoryDraftOpen(false);
      setNewCategoryName('');
    },
    onError: (value) =>
      setError(value instanceof Error ? value.message : 'No se pudo crear la categoría.'),
  });

  const movementMutation = useMutation({
    mutationFn: async () => {
      const result = await createManualFinanceTransaction(
        {
          transactionTypeCode: movementType,
          accountId,
          categoryId,
          amount: Number(amount),
          occurredAt: new Date(occurredAt).toISOString(),
          description,
          reference: reference.trim() || null,
          notes: notes.trim() || null,
          reason: reason.trim() || null,
        },
        formKey,
      );
      if (proofFile) await uploadFinanceProof(result.id, proofFile);
      return result;
    },
    onSuccess: async (result) => {
      await refresh();
      setNotice(`Movimiento ${result.code ?? ''} registrado.`);
      closeModal();
    },
    onError: (value) =>
      setError(value instanceof Error ? value.message : 'No se pudo registrar el movimiento.'),
  });

  const transferMutation = useMutation({
    mutationFn: () =>
      createFinanceTransfer(
        {
          sourceAccountId,
          destinationAccountId,
          amount: Number(amount),
          occurredAt: new Date(occurredAt).toISOString(),
          description: description.trim() || null,
          reference: reference.trim() || null,
          reason: reason.trim() || null,
        },
        formKey,
      ),
    onSuccess: async (result) => {
      await refresh();
      setNotice(`Transferencia ${result.code ?? ''} registrada.`);
      closeModal();
    },
    onError: (value) =>
      setError(value instanceof Error ? value.message : 'No se pudo registrar la transferencia.'),
  });

  const obligationMutation = useMutation({
    mutationFn: () =>
      createObligation(
        {
          obligationType: obligationType as
            'CREDIT_CARD' | 'SUNAT' | 'CUSTOMS' | 'SERVICE' | 'OTHER',
          title: description,
          description: notes.trim() || null,
          amount: Number(amount),
          currencyCode: obligationCurrency,
          dueDate,
          alertDaysBefore: obligationType === 'CREDIT_CARD' ? 15 : Number(obligationAlertDays),
          recurrenceRule: null,
          cardBankName: obligationType === 'CREDIT_CARD' ? cardBankName.trim() : null,
          cardAlias: obligationType === 'CREDIT_CARD' ? cardAlias.trim() : null,
          cardLastFour: obligationType === 'CREDIT_CARD' ? cardLastFour : null,
          statementClosingDate: obligationType === 'CREDIT_CARD' ? statementClosingDate : null,
          installmentCount: obligationType === 'CREDIT_CARD' ? Number(cardInstallmentCount) : null,
          installmentNumber:
            obligationType === 'CREDIT_CARD' ? Number(cardInstallmentNumber) : null,
          defaultPaymentAccountId:
            obligationType === 'CREDIT_CARD' ? cardPaymentAccountId || null : null,
        },
        formKey,
      ),
    onSuccess: async () => {
      await refresh();
      setNotice('Obligación registrada.');
      closeModal();
    },
    onError: (value) =>
      setError(value instanceof Error ? value.message : 'No se pudo registrar la obligación.'),
  });

  const payObligationMutation = useMutation({
    mutationFn: () => {
      if (!selectedObligation) throw new Error('No se seleccionó una obligación.');
      return payObligation(
        selectedObligation.id,
        {
          accountId,
          categoryId: null,
          amount: Number(amount),
          occurredAt: new Date(occurredAt).toISOString(),
          reference: reference.trim() || null,
          notes: notes.trim() || null,
        },
        formKey,
      );
    },
    onSuccess: async () => {
      await refresh();
      setNotice('Obligación pagada y gasto registrado.');
      closeModal();
    },
    onError: (value) =>
      setError(value instanceof Error ? value.message : 'No se pudo pagar la obligación.'),
  });

  const loanMutation = useMutation({
    mutationFn: () =>
      createReceivedLoan(
        {
          lenderName,
          principalAmount: Number(amount),
          accountId,
          interestRate: Number(interestRate),
          installmentCount: Number(installmentCount),
          receivedAt: new Date(occurredAt).toISOString(),
          firstDueDate,
          notes: notes.trim() || null,
        },
        formKey,
      ),
    onSuccess: async () => {
      await refresh();
      setNotice('Préstamo registrado y saldo actualizado.');
      closeModal();
    },
    onError: (value) =>
      setError(value instanceof Error ? value.message : 'No se pudo registrar el préstamo.'),
  });

  const payLoanMutation = useMutation({
    mutationFn: () => {
      if (!selectedLoan?.nextInstallmentId) throw new Error('No existe una cuota pendiente.');
      return payLoanInstallment(
        selectedLoan.nextInstallmentId,
        {
          accountId,
          amount: Number(amount),
          occurredAt: new Date(occurredAt).toISOString(),
          reference: reference.trim() || null,
        },
        formKey,
      );
    },
    onSuccess: async () => {
      await refresh();
      setNotice('Cuota del préstamo pagada.');
      closeModal();
    },
    onError: (value) =>
      setError(value instanceof Error ? value.message : 'No se pudo pagar la cuota.'),
  });

  const cashMutation = useMutation({
    mutationFn: () =>
      createCashClosure(
        {
          accountId,
          closureDate,
          countedAmount: Number(countedAmount),
          notes: notes.trim() || null,
          reason: reason.trim() || null,
        },
        formKey,
      ),
    onSuccess: async (result) => {
      await refresh();
      setNotice(`Cierre ${result.code ?? ''}: diferencia ${money(result.differenceAmount)}.`);
      closeModal();
    },
    onError: (value) =>
      setError(value instanceof Error ? value.message : 'No se pudo cerrar la caja.'),
  });

  const reverseMutation = useMutation({
    mutationFn: () => {
      if (!selectedTransactionId) throw new Error('No se seleccionó un movimiento.');
      return reverseFinanceTransaction(selectedTransactionId, reason, formKey);
    },
    onSuccess: async () => {
      await refresh();
      setNotice('Movimiento revertido mediante una operación compensatoria.');
      closeModal();
    },
    onError: (value) =>
      setError(value instanceof Error ? value.message : 'No se pudo revertir el movimiento.'),
  });

  const accounts = support.data?.accounts ?? [];
  const categories = useMemo(
    () =>
      (support.data?.categories ?? []).filter(
        (item) => item.nature === movementType || item.nature === 'BOTH',
      ),
    [support.data, movementType],
  );
  const cashAccounts = accounts.filter((item) => item.accountTypeCode === 'CASH');
  const totalPen = (dashboard.data?.accounts ?? [])
    .filter((item) => item.currencyCode === 'PEN')
    .reduce((sum, item) => sum + item.currentBalance, 0);
  const maxChart = Math.max(
    1,
    ...(dashboard.data?.monthlySummary.flatMap((item) => [item.income, item.expense]) ?? [1]),
  );
  const totalPages = Math.max(
    1,
    Math.ceil((transactions.data?.total ?? 0) / (transactions.data?.pageSize ?? 20)),
  );

  function prepareMovement(kind: 'INCOME' | 'EXPENSE') {
    setMovementType(kind);
    setAccountId(accounts[0]?.id ?? '');
    const available = (support.data?.categories ?? []).filter(
      (item) => item.nature === kind || item.nature === 'BOTH',
    );
    setCategoryId(available[0]?.id ?? '');
    setAmount('');
    setDescription('');
    setReference('');
    setNotes('');
    setOccurredAt(dateTimeLocal());
    setModal('movement');
  }

  function prepareObligation() {
    setObligationType('CREDIT_CARD');
    setDescription('');
    setNotes('');
    setAmount('');
    setDueDate(today());
    setObligationCurrency('PEN');
    setObligationAlertDays('15');
    setCardBankName('');
    setCardAlias('');
    setCardLastFour('');
    setStatementClosingDate(today());
    setCardInstallmentCount('1');
    setCardInstallmentNumber('1');
    setCardPaymentAccountId('');
    setModal('obligation');
  }

  return (
    <main className="page">
      <PageHeader
        eyebrow="Flujo de dinero"
        title="Finanzas y bancos"
        description="Saldos reales, ingresos, gastos, transferencias, obligaciones, préstamos y caja en una sola vista."
        actions={
          <>
            <button
              className="button button-secondary"
              onClick={() => {
                setSourceAccountId(accounts[0]?.id ?? '');
                setDestinationAccountId(accounts[1]?.id ?? '');
                setAmount('');
                setDescription('');
                setOccurredAt(dateTimeLocal());
                setModal('transfer');
              }}
            >
              <ArrowRightLeft size={17} /> Transferir
            </button>
            <button className="button button-primary" onClick={() => prepareMovement('EXPENSE')}>
              <Plus size={17} /> Registrar movimiento
            </button>
          </>
        }
      />
      {notice ? (
        <div className="alert alert-success">
          <CheckCircle2 size={17} /> {notice}
        </div>
      ) : null}
      {dashboard.isError || support.isError ? (
        <div className="alert alert-error">
          {dashboard.error instanceof Error
            ? dashboard.error.message
            : support.error instanceof Error
              ? support.error.message
              : 'No se pudo cargar el módulo financiero.'}
        </div>
      ) : null}

      <section className="account-cards">
        <article className="account-balance-card account-featured">
          <div>
            <span>Saldo total en soles</span>
            <strong>{money(totalPen)}</strong>
            <small>Actualizado con movimientos confirmados</small>
          </div>
          <WalletCards size={30} />
        </article>
        {(dashboard.data?.accounts ?? []).map((item) => (
          <article className="account-balance-card" key={item.id}>
            <span>{item.name}</span>
            <strong>{money(item.currentBalance, item.currencyCode)}</strong>
            <small>{item.accountTypeCode === 'CASH' ? 'Caja física' : item.currencyCode}</small>
          </article>
        ))}
      </section>

      <section className="finance-quick-actions">
        <button onClick={() => prepareMovement('INCOME')}>
          <ArrowDownLeft size={18} />
          <span>
            <strong>Registrar ingreso</strong>
            <small>Ingreso no asociado a una venta</small>
          </span>
        </button>
        <button onClick={() => prepareMovement('EXPENSE')}>
          <ArrowUpRight size={18} />
          <span>
            <strong>Registrar gasto</strong>
            <small>Compra, servicio u otro egreso</small>
          </span>
        </button>
        <button onClick={prepareObligation}>
          <CalendarClock size={18} />
          <span>
            <strong>Nueva obligación</strong>
            <small>Tarjeta, SUNAT, aduana o servicio</small>
          </span>
        </button>
        <button
          onClick={() => {
            setLenderName('');
            setAmount('');
            setAccountId(accounts[0]?.id ?? '');
            setModal('loan');
          }}
        >
          <Landmark size={18} />
          <span>
            <strong>Registrar préstamo</strong>
            <small>Ingreso y cronograma de cuotas</small>
          </span>
        </button>
        <button
          onClick={() => {
            setAccountId(cashAccounts[0]?.id ?? '');
            setCountedAmount(String(cashAccounts[0]?.currentBalance ?? 0));
            setClosureDate(today());
            setModal('cash');
          }}
        >
          <Banknote size={18} />
          <span>
            <strong>Cerrar caja</strong>
            <small>Compara esperado contra contado</small>
          </span>
        </button>
        <button onClick={() => navigate('/bancos/conciliacion')}>
          <ReceiptText size={18} />
          <span>
            <strong>Conciliación bancaria</strong>
            <small>Importa Excel y confirma coincidencias</small>
          </span>
        </button>
      </section>

      <section className="dashboard-grid dashboard-grid-primary">
        <Panel title="Ingresos y gastos" subtitle="Últimos seis meses">
          <div className="chart-summary">
            <div>
              <span>Ingresos del mes</span>
              <strong>{money(dashboard.data?.monthIncome ?? 0)}</strong>
            </div>
            <div>
              <span>Gastos del mes</span>
              <strong>{money(dashboard.data?.monthExpense ?? 0)}</strong>
            </div>
            <div>
              <span>Resultado del mes</span>
              <strong>
                {money((dashboard.data?.monthIncome ?? 0) - (dashboard.data?.monthExpense ?? 0))}
              </strong>
            </div>
          </div>
          <div className="dual-bar-chart">
            {dashboard.data?.monthlySummary.map((item) => (
              <div className="dual-column" key={item.month}>
                <div>
                  <span
                    className="income-bar"
                    style={{ height: `${Math.max(3, (item.income / maxChart) * 100)}%` }}
                  />
                  <span
                    className="expense-bar"
                    style={{ height: `${Math.max(3, (item.expense / maxChart) * 100)}%` }}
                  />
                </div>
                <small>{item.label}</small>
              </div>
            ))}
          </div>
        </Panel>
        <Panel
          title="Obligaciones próximas"
          subtitle="Pagos que no deben pasar desapercibidos"
          action={
            <button className="text-button" onClick={prepareObligation}>
              Agregar
            </button>
          }
        >
          <div className="obligation-list">
            {dashboard.data?.obligations.length === 0 ? (
              <div className="empty-state">No hay obligaciones pendientes.</div>
            ) : null}
            {dashboard.data?.obligations.map((item) => (
              <article key={item.id}>
                <span
                  className={`priority-icon ${item.daysRemaining < 0 ? 'danger' : item.daysRemaining <= 5 ? 'warning' : 'info'}`}
                >
                  <CreditCard size={18} />
                </span>
                <div>
                  <strong>{item.title}</strong>
                  <small>Vence {date(`${item.dueDate}T12:00:00`)}</small>
                </div>
                <b>{money(item.amount ?? 0, item.currencyCode ?? 'PEN')}</b>
                <button
                  className="button button-secondary button-compact"
                  onClick={() => {
                    setSelectedObligation(item);
                    setAccountId(accounts[0]?.id ?? '');
                    setAmount(String(item.amount ?? 0));
                    setOccurredAt(dateTimeLocal());
                    setModal('pay-obligation');
                  }}
                >
                  Pagar
                </button>
              </article>
            ))}
          </div>
        </Panel>
      </section>

      <Panel title="Préstamos activos" subtitle="Saldo de capital y próxima cuota">
        <div className="loan-grid">
          {dashboard.data?.loans.length === 0 ? (
            <div className="empty-state">No hay préstamos activos.</div>
          ) : null}
          {dashboard.data?.loans.map((loan) => (
            <article className="loan-card" key={loan.id}>
              <div>
                <small>{loan.code}</small>
                <strong>{loan.lenderName}</strong>
                <span>
                  Capital pendiente: {money(loan.outstandingPrincipal, loan.currencyCode)}
                </span>
              </div>
              <div>
                <small>Próxima cuota</small>
                <strong>
                  {loan.nextInstallmentAmount === null
                    ? 'Sin cuotas'
                    : money(loan.nextInstallmentAmount, loan.currencyCode)}
                </strong>
                <span>{loan.nextDueDate ? date(`${loan.nextDueDate}T12:00:00`) : '—'}</span>
              </div>
              {loan.nextInstallmentId ? (
                <button
                  className="button button-secondary button-compact"
                  onClick={() => {
                    setSelectedLoan(loan);
                    setAccountId(accounts[0]?.id ?? '');
                    setAmount(String(loan.nextInstallmentAmount ?? 0));
                    setOccurredAt(dateTimeLocal());
                    setModal('pay-loan');
                  }}
                >
                  Pagar cuota
                </button>
              ) : null}
            </article>
          ))}
        </div>
      </Panel>

      <Panel
        className="table-panel mobile-scroll-panel"
        title="Movimientos financieros"
        subtitle="Los pagos de ventas aparecen automáticamente cuando se confirman."
      >
        <Toolbar
          placeholder="Buscar movimiento, cuenta o categoría…"
          value={search}
          onChange={(value) => {
            setSearch(value);
            setPage(1);
          }}
          showFilterButton={false}
        />
        <div className="filter-chips">
          {[
            'ALL',
            'INCOME',
            'EXPENSE',
            'TRANSFER',
            'LOAN_RECEIVED',
            'LOAN_PAYMENT',
            'REVERSAL',
          ].map((code) => (
            <button
              key={code}
              className={`filter-chip ${type === code ? 'active' : ''}`}
              onClick={() => {
                setType(code);
                setPage(1);
              }}
            >
              {
                (
                  {
                    ALL: 'Todos',
                    INCOME: 'Ingresos',
                    EXPENSE: 'Gastos',
                    TRANSFER: 'Transferencias',
                    LOAN_RECEIVED: 'Préstamos',
                    LOAN_PAYMENT: 'Cuotas',
                    REVERSAL: 'Reversiones',
                  } as Record<string, string>
                )[code]
              }
            </button>
          ))}
        </div>
        <div className="responsive-table-wrap">
          <table className="data-table">
            <thead>
              <tr>
                <th>Fecha</th>
                <th>Movimiento</th>
                <th>Categoría</th>
                <th>Cuenta</th>
                <th>Importe</th>
                <th>Estado</th>
                <th>Registrado por</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {transactions.isLoading ? (
                <tr>
                  <td colSpan={8}>
                    <div className="empty-state">Cargando movimientos…</div>
                  </td>
                </tr>
              ) : null}
              {transactions.data?.items.map((item) => {
                const tone = toneForTransaction(item.transactionTypeCode);
                const incoming = ['INCOME', 'LOAN_RECEIVED', 'LOAN_COLLECTION'].includes(
                  item.transactionTypeCode,
                );
                return (
                  <tr key={item.id}>
                    <td>{date(item.occurredAt)}</td>
                    <td>
                      <div className="movement-cell">
                        <span
                          className={`movement-icon ${incoming ? 'income' : tone === 'info' ? 'transfer' : 'expense'}`}
                        >
                          {incoming ? (
                            <ArrowDownLeft size={16} />
                          ) : item.transactionTypeCode === 'TRANSFER' ? (
                            <ArrowRightLeft size={16} />
                          ) : (
                            <ArrowUpRight size={16} />
                          )}
                        </span>
                        <div>
                          <strong>{item.description}</strong>
                          <small>{item.code}</small>
                        </div>
                      </div>
                    </td>
                    <td>{item.categoryName ?? '—'}</td>
                    <td>{item.accountNames}</td>
                    <td
                      className={`numeric-cell ${incoming ? 'text-success' : item.transactionTypeCode === 'TRANSFER' ? '' : 'text-danger'}`}
                    >
                      <strong>
                        {incoming ? '+' : item.transactionTypeCode === 'TRANSFER' ? '' : '−'}{' '}
                        {money(item.totalAmount, item.currencyCode)}
                      </strong>
                    </td>
                    <td>
                      <StatusBadge tone={item.stateCode === 'REVERSED' ? 'warning' : tone}>
                        {item.stateCode === 'POSTED' ? 'Confirmado' : item.stateCode}
                      </StatusBadge>
                    </td>
                    <td>{item.createdByName ?? 'Sistema'}</td>
                    <td>
                      {!item.isSystemGenerated &&
                      item.sourceType === null &&
                      item.stateCode === 'POSTED' &&
                      item.transactionTypeCode !== 'REVERSAL' ? (
                        <button
                          className="icon-button"
                          title="Revertir"
                          onClick={() => {
                            setSelectedTransactionId(item.id);
                            setReason('');
                            setModal('reverse');
                          }}
                        >
                          <RotateCcw size={16} />
                        </button>
                      ) : null}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <div className="pagination">
          <button disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>
            Anterior
          </button>
          <span>
            Página {page} de {totalPages}
          </span>
          <button disabled={page >= totalPages} onClick={() => setPage((value) => value + 1)}>
            Siguiente
          </button>
        </div>
      </Panel>

      {modal ? (
        <div className="modal-backdrop">
          <form
            className="modal-card modal-card-wide"
            onSubmit={(event) => {
              event.preventDefault();
              setError(null);
              if (modal === 'movement') movementMutation.mutate();
              if (modal === 'transfer') transferMutation.mutate();
              if (modal === 'obligation') obligationMutation.mutate();
              if (modal === 'pay-obligation') payObligationMutation.mutate();
              if (modal === 'loan') loanMutation.mutate();
              if (modal === 'pay-loan') payLoanMutation.mutate();
              if (modal === 'cash') cashMutation.mutate();
              if (modal === 'reverse') reverseMutation.mutate();
            }}
          >
            <div className="modal-header">
              <div>
                <small>Finanzas</small>
                <h2>
                  {modal === 'movement'
                    ? `Registrar ${movementType === 'INCOME' ? 'ingreso' : 'gasto'}`
                    : modal === 'transfer'
                      ? 'Transferencia entre cuentas'
                      : modal === 'obligation'
                        ? 'Nueva obligación'
                        : modal === 'pay-obligation'
                          ? `Pagar ${selectedObligation?.title ?? 'obligación'}`
                          : modal === 'loan'
                            ? 'Registrar préstamo recibido'
                            : modal === 'pay-loan'
                              ? `Pagar cuota ${selectedLoan?.code ?? ''}`
                              : modal === 'cash'
                                ? 'Cierre de caja'
                                : 'Revertir movimiento'}
                </h2>
              </div>
              <button type="button" className="icon-button" onClick={closeModal}>
                <X />
              </button>
            </div>
            {error ? <div className="alert alert-error">{error}</div> : null}
            {modal === 'reverse' ? (
              <>
                <div className="alert alert-warning">
                  <AlertTriangle size={17} /> Se creará un movimiento compensatorio; el original no
                  se eliminará.
                </div>
                <label className="field">
                  <span>Motivo *</span>
                  <textarea
                    rows={4}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                  />
                </label>
              </>
            ) : null}
            {modal === 'movement' ? (
              <div className="form-grid form-grid-2">
                <label className="field">
                  <span>Tipo</span>
                  <SearchableNativeSelect
                    value={movementType}
                    onChange={(event) => {
                      const value = event.target.value as 'INCOME' | 'EXPENSE';
                      setMovementType(value);
                      const list = (support.data?.categories ?? []).filter(
                        (item) => item.nature === value || item.nature === 'BOTH',
                      );
                      setCategoryId(list[0]?.id ?? '');
                    }}
                  >
                    <option value="INCOME">Ingreso</option>
                    <option value="EXPENSE">Gasto</option>
                  </SearchableNativeSelect>
                </label>
                <AccountField accounts={accounts} value={accountId} onChange={setAccountId} />
                <div className="field-with-action">
                  <CategoryField
                    categories={categories}
                    value={categoryId}
                    onChange={setCategoryId}
                  />
                  <button
                    type="button"
                    className="text-button"
                    disabled={categoryMutation.isPending}
                    onClick={() => {
                      setCategoryDraftOpen((value) => !value);
                      setNewCategoryName('');
                    }}
                  >
                    + Nueva categoría
                  </button>
                </div>
                {categoryDraftOpen ? (
                  <div className="inline-create-field">
                    <label className="field">
                      <span>Nombre de la categoría *</span>
                      <input
                        value={newCategoryName}
                        onChange={(event) => setNewCategoryName(event.target.value)}
                        minLength={2}
                        maxLength={120}
                        autoFocus
                      />
                    </label>
                    <button
                      type="button"
                      className="button button-secondary button-compact"
                      disabled={categoryMutation.isPending || newCategoryName.trim().length < 2}
                      onClick={() => categoryMutation.mutate()}
                    >
                      {categoryMutation.isPending ? 'Creando…' : 'Agregar'}
                    </button>
                  </div>
                ) : (
                  <MoneyField value={amount} onChange={setAmount} />
                )}
                {categoryDraftOpen ? <MoneyField value={amount} onChange={setAmount} /> : null}
                <DateTimeField value={occurredAt} onChange={setOccurredAt} />
                <label className="field field-span-2">
                  <span>Descripción *</span>
                  <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>N.º de operación o referencia</span>
                  <input value={reference} onChange={(event) => setReference(event.target.value)} />
                </label>
                <label className="field">
                  <span>Comprobante (opcional)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
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
            ) : null}
            {modal === 'transfer' ? (
              <div className="form-grid form-grid-2">
                <AccountField
                  label="Cuenta de origen"
                  accounts={accounts}
                  value={sourceAccountId}
                  onChange={setSourceAccountId}
                />
                <AccountField
                  label="Cuenta de destino"
                  accounts={accounts}
                  value={destinationAccountId}
                  onChange={setDestinationAccountId}
                />
                <MoneyField value={amount} onChange={setAmount} />
                <DateTimeField value={occurredAt} onChange={setOccurredAt} />
                <label className="field field-span-2">
                  <span>Descripción</span>
                  <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Referencia</span>
                  <input value={reference} onChange={(event) => setReference(event.target.value)} />
                </label>
              </div>
            ) : null}
            {modal === 'obligation' ? (
              <div className="form-grid form-grid-2">
                <label className="field">
                  <span>Tipo</span>
                  <SearchableNativeSelect
                    value={obligationType}
                    onChange={(event) => {
                      const value = event.target.value;
                      setObligationType(value);
                      setObligationAlertDays(value === 'CREDIT_CARD' ? '15' : '3');
                    }}
                  >
                    {support.data?.obligationTypes.map((item) => (
                      <option key={item.code} value={item.code}>
                        {item.name}
                      </option>
                    ))}
                  </SearchableNativeSelect>
                </label>
                <label className="field">
                  <span>Vencimiento</span>
                  <input
                    type="date"
                    value={dueDate}
                    onChange={(event) => setDueDate(event.target.value)}
                  />
                </label>
                <label className="field field-span-2">
                  <span>Título *</span>
                  <input
                    value={description}
                    onChange={(event) => setDescription(event.target.value)}
                    placeholder={
                      obligationType === 'CREDIT_CARD'
                        ? 'Estado de cuenta o compra de mercadería'
                        : 'Nombre de la obligación'
                    }
                  />
                </label>
                <MoneyField value={amount} onChange={setAmount} />
                <label className="field">
                  <span>Moneda</span>
                  <SearchableNativeSelect
                    value={obligationCurrency}
                    onChange={(event) => setObligationCurrency(event.target.value)}
                  >
                    {support.data?.currencies.map((currency) => (
                      <option key={currency.code} value={currency.code}>
                        {currency.code} · {currency.name}
                      </option>
                    ))}
                  </SearchableNativeSelect>
                </label>
                {obligationType === 'CREDIT_CARD' ? (
                  <>
                    <div className="alert alert-info field-span-2">
                      La alerta se programará automáticamente 15 días antes del vencimiento.
                    </div>
                    <label className="field">
                      <span>Banco *</span>
                      <input
                        value={cardBankName}
                        onChange={(event) => setCardBankName(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Alias de la tarjeta *</span>
                      <input
                        value={cardAlias}
                        onChange={(event) => setCardAlias(event.target.value)}
                        placeholder="Tarjeta importaciones"
                      />
                    </label>
                    <label className="field">
                      <span>Últimos 4 dígitos *</span>
                      <input
                        inputMode="numeric"
                        pattern="[0-9]{4}"
                        maxLength={4}
                        value={cardLastFour}
                        onChange={(event) =>
                          setCardLastFour(event.target.value.replace(/\D/g, '').slice(0, 4))
                        }
                      />
                    </label>
                    <label className="field">
                      <span>Fecha de cierre *</span>
                      <input
                        type="date"
                        value={statementClosingDate}
                        onChange={(event) => setStatementClosingDate(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Cuota actual *</span>
                      <input
                        type="number"
                        min="1"
                        max={cardInstallmentCount || undefined}
                        value={cardInstallmentNumber}
                        onChange={(event) => setCardInstallmentNumber(event.target.value)}
                      />
                    </label>
                    <label className="field">
                      <span>Total de cuotas *</span>
                      <input
                        type="number"
                        min="1"
                        max="240"
                        value={cardInstallmentCount}
                        onChange={(event) => setCardInstallmentCount(event.target.value)}
                      />
                    </label>
                    <AccountField
                      label="Cuenta prevista para pagar (opcional)"
                      accounts={accounts}
                      value={cardPaymentAccountId}
                      onChange={setCardPaymentAccountId}
                    />
                  </>
                ) : (
                  <label className="field">
                    <span>Alertar con anticipación (días)</span>
                    <input
                      type="number"
                      min="0"
                      max="90"
                      value={obligationAlertDays}
                      onChange={(event) => setObligationAlertDays(event.target.value)}
                    />
                  </label>
                )}
                <label className="field field-span-2">
                  <span>Descripción</span>
                  <textarea
                    rows={3}
                    value={notes}
                    onChange={(event) => setNotes(event.target.value)}
                  />
                </label>
              </div>
            ) : null}
            {modal === 'pay-obligation' ? (
              <div className="form-grid form-grid-2">
                <AccountField accounts={accounts} value={accountId} onChange={setAccountId} />
                <MoneyField value={amount} onChange={setAmount} />
                <DateTimeField value={occurredAt} onChange={setOccurredAt} />
                <label className="field">
                  <span>Referencia</span>
                  <input value={reference} onChange={(event) => setReference(event.target.value)} />
                </label>
              </div>
            ) : null}
            {modal === 'loan' ? (
              <div className="form-grid form-grid-2">
                <label className="field field-span-2">
                  <span>Prestamista *</span>
                  <input
                    value={lenderName}
                    onChange={(event) => setLenderName(event.target.value)}
                  />
                </label>
                <AccountField
                  label="Cuenta que recibe"
                  accounts={accounts}
                  value={accountId}
                  onChange={setAccountId}
                />
                <MoneyField value={amount} onChange={setAmount} />
                <label className="field">
                  <span>Interés total (%)</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={interestRate}
                    onChange={(event) => setInterestRate(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Número de cuotas</span>
                  <input
                    type="number"
                    min="1"
                    max="120"
                    value={installmentCount}
                    onChange={(event) => setInstallmentCount(event.target.value)}
                  />
                </label>
                <DateTimeField label="Fecha recibida" value={occurredAt} onChange={setOccurredAt} />
                <label className="field">
                  <span>Primera cuota</span>
                  <input
                    type="date"
                    value={firstDueDate}
                    onChange={(event) => setFirstDueDate(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Comprobante (opcional)</span>
                  <input
                    type="file"
                    accept="image/jpeg,image/png,image/webp,application/pdf"
                    onChange={(event) => setProofFile(event.target.files?.[0] ?? null)}
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
            ) : null}
            {modal === 'pay-loan' ? (
              <div className="form-grid form-grid-2">
                <AccountField accounts={accounts} value={accountId} onChange={setAccountId} />
                <MoneyField value={amount} onChange={setAmount} />
                <DateTimeField value={occurredAt} onChange={setOccurredAt} />
                <label className="field">
                  <span>Referencia</span>
                  <input value={reference} onChange={(event) => setReference(event.target.value)} />
                </label>
              </div>
            ) : null}
            {modal === 'cash' ? (
              <div className="form-grid form-grid-2">
                <AccountField accounts={cashAccounts} value={accountId} onChange={setAccountId} />
                <label className="field">
                  <span>Fecha de cierre</span>
                  <input
                    type="date"
                    value={closureDate}
                    onChange={(event) => setClosureDate(event.target.value)}
                  />
                </label>
                <label className="field">
                  <span>Importe contado</span>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={countedAmount}
                    onChange={(event) => setCountedAmount(event.target.value)}
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
                <label className="field field-span-2">
                  <span>Motivo de diferencia</span>
                  <textarea
                    rows={3}
                    value={reason}
                    onChange={(event) => setReason(event.target.value)}
                    placeholder="Obligatorio solo si el contado es diferente al saldo esperado."
                  />
                </label>
              </div>
            ) : null}
            <div className="modal-actions">
              <button type="button" className="button button-secondary" onClick={closeModal}>
                Cancelar
              </button>
              <button
                className="button button-primary"
                disabled={
                  movementMutation.isPending ||
                  transferMutation.isPending ||
                  obligationMutation.isPending ||
                  payObligationMutation.isPending ||
                  loanMutation.isPending ||
                  payLoanMutation.isPending ||
                  cashMutation.isPending ||
                  reverseMutation.isPending
                }
              >
                Confirmar
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </main>
  );
}

function AccountField({
  accounts,
  value,
  onChange,
  label = 'Cuenta',
}: {
  accounts: Array<{ id: string; name: string; currentBalance: number; currencyCode: string }>;
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <SearchableNativeSelect value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Seleccionar</option>
        {accounts.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name} · {money(item.currentBalance, item.currencyCode)}
          </option>
        ))}
      </SearchableNativeSelect>
    </label>
  );
}
function CategoryField({
  categories,
  value,
  onChange,
}: {
  categories: FinanceCategory[];
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <label className="field">
      <span>Categoría</span>
      <SearchableNativeSelect value={value} onChange={(event) => onChange(event.target.value)}>
        <option value="">Seleccionar</option>
        {categories.map((item) => (
          <option key={item.id} value={item.id}>
            {item.name}
          </option>
        ))}
      </SearchableNativeSelect>
    </label>
  );
}
function MoneyField({ value, onChange }: { value: string; onChange: (value: string) => void }) {
  return (
    <label className="field">
      <span>Importe</span>
      <input
        type="number"
        min="0.01"
        step="0.01"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
function DateTimeField({
  value,
  onChange,
  label = 'Fecha y hora',
}: {
  value: string;
  onChange: (value: string) => void;
  label?: string;
}) {
  return (
    <label className="field">
      <span>{label}</span>
      <input
        type="datetime-local"
        value={value}
        onChange={(event) => onChange(event.target.value)}
      />
    </label>
  );
}
