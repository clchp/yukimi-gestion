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

    .sale-financial-stack .panel[data-vip-deposit-summary] .panel-body::before {
      content: attr(data-vip-deposit-summary);
      display: block;
      margin-bottom: 12px;
      border: 1px solid var(--border);
      border-radius: 12px;
      padding: 10px 12px;
      background: var(--surface-soft);
      color: var(--muted);
      font-size: 0.76rem;
      line-height: 1.45;
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

function paymentPanel() {
  return [...document.querySelectorAll<HTMLElement>('.sale-financial-stack .panel')].find((panel) => {
    const heading = panel.querySelector<HTMLElement>('.panel-header h2, .panel-header h3, h2, h3');
    return heading?.textContent?.trim() === 'Pagos';
  });
}

function clearVipAttributes() {
  document.querySelectorAll<HTMLElement>('.payment-card[data-vip-deposit-amount]').forEach((card) => {
    delete card.dataset.vipDepositAmount;
  });
  paymentPanel()?.removeAttribute('data-vip-deposit-summary');
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

    let remaining = depositAmount;
    const contributions = new Map<string, number>();
    const confirmed = [...financials.payments]
      .filter((payment) => payment.stateCode === 'CONFIRMED')
      .sort((left, right) => {
        const leftTime = new Date(left.confirmedAt ?? left.receivedAt).getTime();
        const rightTime = new Date(right.confirmedAt ?? right.receivedAt).getTime();
        return leftTime - rightTime;
      });

    for (const payment of confirmed) {
      if (remaining <= 0) break;
      const contribution = Math.min(remaining, payment.declaredAmount);
      if (contribution > 0) contributions.set(payment.code, contribution);
      remaining = Math.max(0, remaining - contribution);
    }

    for (const card of document.querySelectorAll<HTMLElement>('.payment-card')) {
      const code = card.querySelector<HTMLElement>('.payment-card-head strong')?.textContent?.trim() ?? '';
      const contribution = contributions.get(code);
      if (!contribution) continue;
      card.dataset.vipDepositAmount = money(contribution);
    }

    const panel = paymentPanel();
    if (panel) {
      panel.dataset.vipDepositSummary =
        remaining > 0
          ? `Adelanto VIP pendiente: ${money(remaining)} de ${money(depositAmount)}. Los pagos confirmados se aplican primero a este adelanto.`
          : `Adelanto VIP cubierto: ${money(depositAmount)}. Los pagos que lo completaron están identificados abajo.`;
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
