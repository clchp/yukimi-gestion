import type { QueryClient } from '@tanstack/react-query';
import { getSaleFinancials } from '../features/payments/payments-api';
import { getSale } from '../features/sales/sales-api';

let scheduled = false;
let vipLoading = false;
let lastVipFingerprint = '';

function money(value: number) {
  return new Intl.NumberFormat('es-PE', {
    style: 'currency',
    currency: 'PEN',
    minimumFractionDigits: 2,
  }).format(value);
}

function shortDate(value: string | null) {
  if (!value) return 'Sin fecha límite';
  return new Intl.DateTimeFormat('es-PE', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  }).format(new Date(value));
}

function currentSaleId() {
  return location.pathname.match(/^\/ventas\/([0-9a-f-]{36})$/i)?.[1] ?? null;
}

function installSafeVisualStyles() {
  if (document.getElementById('production-final-polish-styles')) return;
  const style = document.createElement('style');
  style.id = 'production-final-polish-styles';
  style.textContent = `
    .sidebar-support,
    .sidebar-user,
    .sidebar-profile-popover,
    .brand-lockup .sidebar-close {
      display: none !important;
    }

    .payment-card[data-vip-deposit-amount] .payment-card-head > div::after {
      content: 'Adelanto VIP';
      display: inline-flex;
      align-items: center;
      margin-left: 8px;
      border-radius: 999px;
      padding: 3px 8px;
      background: #e9f4ff;
      color: #1d5f94;
      font-size: 0.68rem;
      font-weight: 700;
      line-height: 1.2;
      vertical-align: middle;
    }

    .payment-card[data-vip-deposit-amount] .payment-part-summary::after {
      content: 'Aplicado al adelanto VIP: ' attr(data-vip-deposit-amount) '.';
      display: block;
      margin-top: 5px;
      color: var(--muted);
      font-size: 0.72rem;
      line-height: 1.4;
    }

    .sale-detail-main > .panel[data-vip-condition-summary]::after {
      content: attr(data-vip-condition-summary);
      display: block;
      margin-top: 14px;
      border: 1px solid color-mix(in srgb, var(--primary) 24%, var(--border));
      border-radius: 12px;
      padding: 12px 14px;
      background: color-mix(in srgb, var(--primary) 5%, var(--surface));
      color: var(--text);
      white-space: pre-line;
      font-size: 0.76rem;
      font-weight: 600;
      line-height: 1.65;
    }

    .sale-detail-main > .panel[data-vip-condition-status='Cumplido']::after {
      border-color: color-mix(in srgb, #1f9d68 32%, var(--border));
    }

    .sale-detail-main > .panel[data-vip-condition-status='Vencido']::after {
      border-color: color-mix(in srgb, #c43f4f 35%, var(--border));
    }
  `;
  document.head.append(style);
}

function paymentFingerprint() {
  const saleId = currentSaleId();
  if (!saleId) return '';
  const cards = [...document.querySelectorAll<HTMLElement>('.payment-card')];
  return `${saleId}|${cards
    .map((card) => {
      const code = card.querySelector('.payment-card-head strong')?.textContent?.trim() ?? '';
      const state = card.querySelector('.payment-card-head .status-badge')?.textContent?.trim() ?? '';
      const amount = card.querySelector('.payment-card-amount > strong')?.textContent?.trim() ?? '';
      return `${code}:${state}:${amount}`;
    })
    .join('|')}`;
}

function saleSummaryPanel() {
  return [...document.querySelectorAll<HTMLElement>('.sale-detail-main > .panel')].find(
    (panel) => panel.querySelector('h2')?.textContent?.trim() === 'Resumen de la venta',
  );
}

function clearVipAttributes() {
  document.querySelectorAll<HTMLElement>('.payment-card[data-vip-deposit-amount]').forEach((card) => {
    delete card.dataset.vipDepositAmount;
  });
  const summary = saleSummaryPanel();
  summary?.removeAttribute('data-vip-condition-summary');
  summary?.removeAttribute('data-vip-condition-status');
}

async function annotateVipPayments() {
  const saleId = currentSaleId();
  if (!saleId || vipLoading || !document.querySelector('.sale-financial-stack')) {
    lastVipFingerprint = saleId ? lastVipFingerprint : '';
    return;
  }

  const fingerprint = paymentFingerprint();
  if (fingerprint && fingerprint === lastVipFingerprint) return;
  vipLoading = true;
  try {
    const [sale, financials] = await Promise.all([getSale(saleId), getSaleFinancials(saleId)]);
    const depositAmount = sale.negotiatedMinimumDepositAmount;
    clearVipAttributes();
    if (depositAmount == null || depositAmount <= 0) {
      lastVipFingerprint = paymentFingerprint();
      return;
    }

    const snapshot = sale.negotiatedTermsSnapshot as Record<string, unknown>;
    const dueAt = typeof snapshot.depositDueAt === 'string' ? snapshot.depositDueAt : null;
    const paid = Math.min(Math.max(sale.paidTotal, 0), depositAmount);
    const remaining = Math.max(depositAmount - paid, 0);
    const overdue = remaining > 0 && dueAt != null && new Date(dueAt).getTime() < Date.now();
    const status =
      remaining === 0 ? 'Cumplido' : overdue ? 'Vencido' : paid > 0 ? 'Parcial' : 'Pendiente';

    const summary = saleSummaryPanel();
    if (summary) {
      summary.dataset.vipConditionStatus = status;
      summary.dataset.vipConditionSummary = `Condición VIP · Adelanto — ${status}\nRequerido: ${money(depositAmount)} · Fecha límite: ${shortDate(dueAt)} · Pagado: ${money(paid)} · Falta: ${money(remaining)}`;
    }

    let depositRemaining = depositAmount;
    const contributions = new Map<string, number>();
    const confirmed = [...financials.payments]
      .filter((payment) => payment.stateCode === 'CONFIRMED')
      .sort((left, right) => {
        const leftTime = new Date(left.confirmedAt ?? left.receivedAt).getTime();
        const rightTime = new Date(right.confirmedAt ?? right.receivedAt).getTime();
        return leftTime - rightTime;
      });

    for (const payment of confirmed) {
      if (depositRemaining <= 0) break;
      const contribution = Math.min(depositRemaining, payment.declaredAmount);
      if (contribution > 0) contributions.set(payment.code, contribution);
      depositRemaining = Math.max(0, depositRemaining - contribution);
    }

    for (const card of document.querySelectorAll<HTMLElement>('.payment-card')) {
      const code = card.querySelector<HTMLElement>('.payment-card-head strong')?.textContent?.trim() ?? '';
      const contribution = contributions.get(code);
      if (!contribution) continue;
      card.dataset.vipDepositAmount = money(contribution);
    }

    lastVipFingerprint = paymentFingerprint();
  } catch {
    // La pantalla React original sigue disponible si no se puede cargar este detalle visual.
  } finally {
    vipLoading = false;
  }
}

async function refreshCurrentSale(queryClient: QueryClient) {
  const saleId = currentSaleId();
  if (!saleId) return;
  lastVipFingerprint = '';
  await Promise.all([
    queryClient.refetchQueries({ queryKey: ['sale', saleId], type: 'active' }),
    queryClient.refetchQueries({ queryKey: ['sale-financials', saleId], type: 'active' }),
    queryClient.invalidateQueries({ queryKey: ['sales'] }),
    queryClient.invalidateQueries({ queryKey: ['dashboard'] }),
  ]);
  schedule();
}

function installPaymentRefresh(queryClient: QueryClient) {
  if (document.documentElement.dataset.productionPaymentRefresh === 'true') return;
  document.documentElement.dataset.productionPaymentRefresh = 'true';
  const originalFetch = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const response = await originalFetch(input, init);
    try {
      const rawUrl =
        typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
      const url = new URL(rawUrl, location.origin);
      const method = (init?.method ?? (input instanceof Request ? input.method : 'GET')).toUpperCase();
      if (response.ok && method !== 'GET' && url.pathname.includes('/payments/')) {
        window.setTimeout(() => void refreshCurrentSale(queryClient), 80);
      }
    } catch {
      // No alterar el flujo de red original si una URL no se puede interpretar.
    }
    return response;
  };
}

function run() {
  installSafeVisualStyles();
  void annotateVipPayments();
}

function schedule() {
  if (scheduled) return;
  scheduled = true;
  window.setTimeout(() => {
    scheduled = false;
    run();
  }, 120);
}

export function installProductionFinalPolish(queryClient: QueryClient) {
  if (document.documentElement.dataset.productionFinalPolish === 'true') return;
  document.documentElement.dataset.productionFinalPolish = 'true';
  installSafeVisualStyles();
  installPaymentRefresh(queryClient);
  new MutationObserver(schedule).observe(document.body, { childList: true, subtree: true });
  window.addEventListener('popstate', schedule);
  schedule();
}
